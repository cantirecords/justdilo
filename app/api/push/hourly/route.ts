import { NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { sendPushToUser } from "@/lib/push";
import { detectSpanish } from "@/lib/push-messages";
import { parseISO } from "date-fns";

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
      .select("id, title, due_date, priority, group_name")
      .eq("user_id", userId)
      .eq("completed", false)
      .not("due_date", "is", null)
      .is("reminder_minutes", null);

    // Find tasks due within the next ~60 minutes (not at midnight = 23:59)
    const dueSoon = (tasks ?? []).filter((t) => {
      const due = parseISO(t.due_date);
      const isMidnight = due.getHours() === 23 && due.getMinutes() === 59;
      return !isMidnight && due >= in55min && due <= in65min;
    });

    for (const task of dueSoon) {
      const due = parseISO(task.due_date);
      const timeStr = due.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: timezone });
      const spanish = detectSpanish([task.title]);

      await sendPushToUser(userId, {
        title: spanish ? `En 1 hora ⏰` : `In 1 hour ⏰`,
        body: spanish
          ? `${task.title}${task.group_name ? ` · ${task.group_name}` : ""} — ${timeStr}. ¿Listo?`
          : `${task.title}${task.group_name ? ` · ${task.group_name}` : ""} — ${timeStr}. Ready?`,
        url: "/",
      });
      sent++;
    }
  }

  return NextResponse.json({ sent });
}
