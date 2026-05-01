import { NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { sendPushToUser } from "@/lib/push";
import { detectSpanish } from "@/lib/push-messages";
import { parseISO } from "date-fns";

export const runtime = "nodejs";

export async function GET() {
  const supabase = createSupabaseAdmin();

  const { data: subs } = await supabase
    .from("push_subscriptions").select("user_id");
  if (!subs?.length) return NextResponse.json({ sent: 0 });

  const now = new Date();
  const in65min = new Date(now.getTime() + 65 * 60 * 1000);
  const in55min = new Date(now.getTime() + 55 * 60 * 1000);

  // Quiet hours: skip between 11pm–7am UTC
  const utcHour = now.getUTCHours();
  if (utcHour >= 23 || utcHour < 7) {
    return NextResponse.json({ sent: 0, reason: "quiet hours" });
  }

  const userIds = [...new Set(subs.map((s) => s.user_id))];
  let sent = 0;

  for (const userId of userIds) {
    const { data: tasks } = await supabase
      .from("tasks")
      .select("id, title, due_date, priority, group_name")
      .eq("user_id", userId)
      .eq("completed", false)
      .not("due_date", "is", null);

    // Find tasks due within the next ~60 minutes (not at midnight = 23:59)
    const dueSoon = (tasks ?? []).filter((t) => {
      const due = parseISO(t.due_date);
      const isMidnight = due.getHours() === 23 && due.getMinutes() === 59;
      return !isMidnight && due >= in55min && due <= in65min;
    });

    for (const task of dueSoon) {
      const due = parseISO(task.due_date);
      const timeStr = due.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
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
