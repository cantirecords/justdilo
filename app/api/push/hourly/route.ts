import { NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { sendPushToUser } from "@/lib/push";
import { detectSpanish } from "@/lib/push-messages";
import { isAuthorizedCron } from "@/lib/cron-auth";
import { isLocalMidnightSentinel } from "@/lib/local-time";
import { parseISO } from "date-fns";

export const runtime = "nodejs";

function localHour(timezone: string): number {
  return parseInt(
    new Intl.DateTimeFormat("en-US", { hour: "numeric", hour12: false, timeZone: timezone }).format(new Date()),
    10,
  );
}

export async function GET(req: Request) {
  if (!isAuthorizedCron(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const supabase = createSupabaseAdmin();

  const { data: subs } = await supabase
    .from("push_subscriptions").select("user_id, timezone");
  if (!subs?.length) return NextResponse.json({ sent: 0 });

  // Dedupe users, keeping the first timezone seen per user
  const userMap = new Map<string, string>();
  for (const s of subs) {
    if (!userMap.has(s.user_id)) userMap.set(s.user_id, s.timezone ?? "UTC");
  }

  const now = new Date();
  const in65min = new Date(now.getTime() + 65 * 60 * 1000);
  const in55min = new Date(now.getTime() + 55 * 60 * 1000);

  let sent = 0;

  for (const [userId, timezone] of userMap) {
    // Quiet hours: skip between 11pm–7am local time
    const hour = localHour(timezone);
    if (hour >= 23 || hour < 7) continue;

    const { data: tasks } = await supabase
      .from("tasks")
      .select("id, title, due_date, priority, group_name, reminder_minutes, reminded_at")
      .eq("user_id", userId)
      .eq("completed", false)
      .not("due_date", "is", null);

    // Find tasks due within the next ~60 minutes (not at midnight = 23:59).
    // The 23:59 "no specific time" sentinel is on the USER's clock, so check it
    // in their timezone — on a UTC server getHours() misses it for everyone else.
    // Skip tasks whose custom reminder already fired (reminded_at set) to avoid double-notifying
    const dueSoon = (tasks ?? []).filter((t) => {
      const due = parseISO(t.due_date);
      if (isLocalMidnightSentinel(due, timezone)) return false;
      if (t.reminder_minutes !== null && t.reminded_at !== null) return false;
      return due >= in55min && due <= in65min;
    });

    // Group tasks by (group_name + due_date) — one notification per group, not per task
    const groupMap = new Map<string, { tasks: typeof dueSoon; timeStr: string }>();
    for (const task of dueSoon) {
      const due = parseISO(task.due_date);
      const key = task.group_name ? `${task.group_name}|||${task.due_date}` : task.id;
      if (!groupMap.has(key)) {
        const timeStr = due.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: timezone });
        groupMap.set(key, { tasks: [], timeStr });
      }
      groupMap.get(key)!.tasks.push(task);
    }

    for (const [, { tasks, timeStr }] of groupMap) {
      const first = tasks[0];
      const isSingle = tasks.length === 1;
      const spanish = detectSpanish(tasks.map((t) => t.title));

      // Task/group name goes in the TITLE — visible at a glance without opening
      const displayName = isSingle ? first.title : (first.group_name ?? first.title);
      const truncName = displayName.length > 30 ? displayName.slice(0, 28) + "…" : displayName;
      const title = `${truncName} ⏰`;

      let body: string;
      if (isSingle) {
        body = spanish ? `${timeStr} — dale, en 1 hora.` : `${timeStr} — 1 hour left.`;
      } else {
        const extra = tasks.length - 1;
        const firstShort = first.title.length > 28 ? first.title.slice(0, 26) + "…" : first.title;
        body = spanish
          ? `${timeStr} — ${firstShort} +${extra} más.`
          : `${timeStr} — ${firstShort} +${extra} more.`;
      }

      await sendPushToUser(userId, { title, body, url: "/" });
      sent++;
    }
  }

  return NextResponse.json({ sent });
}
