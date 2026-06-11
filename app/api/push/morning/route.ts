import { NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { sendPushToUser, pickUserTimezones } from "@/lib/push";
import { morningBrief, stuckNudge } from "@/lib/push-messages";
import { isAuthorizedCron } from "@/lib/cron-auth";
import { isTodayInTz, daysAgoInTz } from "@/lib/local-time";
import { parseISO } from "date-fns";

export const runtime = "nodejs";


export async function GET(req: Request) {
  if (!isAuthorizedCron(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const supabase = createSupabaseAdmin();

  const { data: subs } = await supabase
    .from("push_subscriptions").select("user_id, timezone");
  if (!subs?.length) return NextResponse.json({ sent: 0, subs: 0, reason: "no_subscriptions" });

  // Dedupe users, preferring a real device timezone over legacy UTC rows
  const userMap = pickUserTimezones(subs);

  // Batch-fetch nicknames for all users in one query
  const userIds = [...userMap.keys()];
  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, nickname")
    .in("id", userIds);
  const nicknameMap = new Map<string, string | null>(
    (profiles ?? []).map((p) => [p.id, p.nickname ?? null]),
  );

  let sent = 0;
  // Tasks touched (created/edited/rescheduled) within this window are excluded
  // from morning brief + stuck nudge for users who opted into smart suppression.
  const RECENT_TOUCH_MS = 12 * 60 * 60 * 1000;

  for (const [userId, timezone] of userMap) {
    // No timezone filter — cron fires at 13 UTC which is morning across all
    // US zones (6am PDT → 9am EDT). All subscribed users get the morning push.
    const name = nicknameMap.get(userId) || null; // "" (skipped) → null

    // Per-user feature check — admin/beta/all rollouts resolved server-side.
    const { data: featureRows } = await supabase.rpc("get_enabled_features", { p_user_id: userId });
    const smartSuppress = (featureRows ?? []).some(
      (r: { key: string; enabled: boolean }) => r.key === "smart_notification_suppress" && r.enabled,
    );

    type BriefTask = { title: string; priority: string | null; due_date: string | null; completed: boolean; updated_at?: string | null };
    let tasks: BriefTask[] | null = (await supabase
      .from("tasks")
      .select("title, priority, due_date, completed, updated_at")
      .eq("user_id", userId)
      .eq("completed", false)).data;
    // Schema fallback: if migration 0026 (updated_at) hasn't run yet, still send
    // briefs — without it the whole morning push would silently stop.
    if (!tasks) {
      tasks = (await supabase
        .from("tasks")
        .select("title, priority, due_date, completed")
        .eq("user_id", userId)
        .eq("completed", false)).data;
    }

    const now = new Date();
    const allOpen = (tasks ?? []).filter((t) => {
      if (!smartSuppress) return true;
      if (!t.updated_at) return true;
      return now.getTime() - parseISO(t.updated_at).getTime() > RECENT_TOUCH_MS;
    });

    // 1. MORNING BRIEF — today tasks + overdue context for mood
    // Day boundaries are drawn in the user's timezone, not server UTC — a task
    // due tonight at 8pm local must count as "today", not "tomorrow".
    const todayTasks = allOpen.filter(
      (t) => t.due_date && isTodayInTz(parseISO(t.due_date), timezone),
    );

    const overdueItems = allOpen.filter(
      (t) => t.due_date && daysAgoInTz(parseISO(t.due_date), timezone) > 0,
    );

    const maxOverdueDays = overdueItems.reduce((max, t) => {
      return Math.max(max, daysAgoInTz(parseISO(t.due_date!), timezone));
    }, 0);

    const overdueContext = {
      count: overdueItems.length,
      maxDays: maxOverdueDays,
      urgentCount: overdueItems.filter((t) => t.priority === "high").length,
      topTitle: overdueItems[0]?.title ?? null,
    };

    if (todayTasks.length > 0 || overdueItems.length > 0) {
      const msg = await morningBrief(todayTasks, overdueContext, name);
      await sendPushToUser(userId, msg);
      sent++;
    }

    // 2. STUCK TASK NUDGE — exactly 3 days overdue (nudge once, on day 3)
    const stuckTasks = allOpen.filter(
      (t) => t.due_date && daysAgoInTz(parseISO(t.due_date), timezone) === 3,
    );

    for (const task of stuckTasks.slice(0, 2)) {
      const days = daysAgoInTz(parseISO(task.due_date!), timezone);
      const msg = await stuckNudge(task.title, days, name);
      await sendPushToUser(userId, { ...msg, url: "/" });
      sent++;
    }
  }

  return NextResponse.json({ sent, subs: userMap.size });
}
