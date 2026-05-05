import { NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { sendPushToUser } from "@/lib/push";
import { detectSpanish } from "@/lib/push-messages";
import { parseISO } from "date-fns";

export const runtime = "nodejs";

// Runs every 5 minutes. Sends a reminder push when now is within ±2.5 min
// of (due_date - reminder_minutes). Sets reminded_at to prevent duplicates.
export async function GET() {
  const supabase = createSupabaseAdmin();
  const now = new Date();

  const { data: tasks } = await supabase
    .from("tasks")
    .select("id, user_id, title, group_name, due_date, reminder_minutes")
    .eq("completed", false)
    .not("reminder_minutes", "is", null)
    .is("reminded_at", null)
    .not("due_date", "is", null);

  if (!tasks?.length) return NextResponse.json({ sent: 0 });

  // Build a timezone map from push_subscriptions
  const { data: subs } = await supabase
    .from("push_subscriptions")
    .select("user_id, timezone");
  const tzMap = new Map<string, string>();
  for (const s of subs ?? []) {
    if (!tzMap.has(s.user_id)) tzMap.set(s.user_id, s.timezone ?? "UTC");
  }

  let sent = 0;
  const WINDOW_MS = 2.5 * 60 * 1000;

  for (const task of tasks) {
    const due = parseISO(task.due_date);
    const reminderAt = new Date(due.getTime() - task.reminder_minutes * 60 * 1000);
    const diff = Math.abs(now.getTime() - reminderAt.getTime());
    if (diff > WINDOW_MS) continue;

    const spanish = detectSpanish([task.title]);
    const rm = task.reminder_minutes;
    const h = Math.round(rm / 60);
    const label =
      rm >= 60
        ? spanish ? `En ${h} hora${h > 1 ? "s" : ""}` : `In ${h} hour${h > 1 ? "s" : ""}`
        : spanish
        ? `En ${rm} min`
        : `In ${rm} min`;

    const timezone = tzMap.get(task.user_id) ?? "UTC";
    const timeStr = due.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: timezone });

    await sendPushToUser(task.user_id, {
      title: `${label} ⏰`,
      body: `${task.title}${task.group_name ? ` · ${task.group_name}` : ""} — ${timeStr}`,
      url: "/",
    });

    await supabase
      .from("tasks")
      .update({ reminded_at: now.toISOString() })
      .eq("id", task.id);

    sent++;
  }

  return NextResponse.json({ sent });
}
