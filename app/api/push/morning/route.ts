import { NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { sendPushToUser } from "@/lib/push";
import { morningBrief, stuckNudge } from "@/lib/push-messages";
import { isToday, isPast, parseISO, differenceInDays } from "date-fns";

export const runtime = "nodejs";

function localHour(timezone: string): number {
  return parseInt(
    new Intl.DateTimeFormat("en-US", { hour: "numeric", hour12: false, timeZone: timezone }).format(new Date()),
    10,
  );
}

export async function GET() {
  const supabase = createSupabaseAdmin();

  const { data: subs } = await supabase
    .from("push_subscriptions").select("user_id, timezone");
  if (!subs?.length) return NextResponse.json({ sent: 0, subs: 0, reason: "no_subscriptions" });

  // Dedupe users, keeping the first timezone seen per user
  const userMap = new Map<string, string>();
  for (const s of subs) {
    if (!userMap.has(s.user_id)) userMap.set(s.user_id, s.timezone ?? "UTC");
  }

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

  for (const [userId, timezone] of userMap) {
    // Cron fires once daily at 13 UTC. That maps to 5am–9am across US zones
    // (PST/PDT through EST/EDT, both standard and daylight time). Window
    // widened to 5–10 to absorb DST shifts and edge timezones.
    const h = localHour(timezone);
    if (h < 5 || h > 10) continue;

    const name = nicknameMap.get(userId) || null; // "" (skipped) → null

    const { data: tasks } = await supabase
      .from("tasks")
      .select("title, priority, due_date, completed")
      .eq("user_id", userId)
      .eq("completed", false);

    const allOpen = tasks ?? [];

    // 1. MORNING BRIEF — tasks due today
    const todayTasks = allOpen.filter(
      (t) => t.due_date && isToday(parseISO(t.due_date)),
    );

    if (todayTasks.length > 0) {
      const msg = await morningBrief(todayTasks, name);
      await sendPushToUser(userId, msg);
      sent++;
    }

    // 2. STUCK TASK NUDGE — exactly 3 days overdue (nudge once, on day 3)
    const stuckTasks = allOpen.filter((t) => {
      if (!t.due_date) return false;
      const due = parseISO(t.due_date);
      if (!isPast(due) || isToday(due)) return false;
      const days = differenceInDays(new Date(), due);
      return days === 3;
    });

    for (const task of stuckTasks.slice(0, 2)) {
      const days = differenceInDays(new Date(), parseISO(task.due_date));
      const msg = await stuckNudge(task.title, days, name);
      await sendPushToUser(userId, { ...msg, url: "/" });
      sent++;
    }
  }

  return NextResponse.json({ sent, subs: userMap.size });
}
