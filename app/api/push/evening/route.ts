import { NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { sendPushToUser } from "@/lib/push";
import { eveningLetter } from "@/lib/push-messages";
import { isToday, parseISO } from "date-fns";

export const runtime = "nodejs";

export async function GET() {
  const supabase = createSupabaseAdmin();

  const { data: subs } = await supabase
    .from("push_subscriptions").select("user_id");
  if (!subs?.length) return NextResponse.json({ sent: 0 });

  const userIds = [...new Set(subs.map((s) => s.user_id))];
  let sent = 0;

  for (const userId of userIds) {
    const { data: tasks } = await supabase
      .from("tasks")
      .select("title, priority, due_date, completed")
      .eq("user_id", userId);

    const all = tasks ?? [];

    // Tasks with a due date today — split into done / open
    const todayTasks = all.filter((t) => t.due_date && isToday(parseISO(t.due_date)));
    const completedToday = todayTasks.filter((t) => t.completed).length;

    // All open tasks (any date) sorted by priority for "what's next"
    const openTasks = all
      .filter((t) => !t.completed)
      .sort((a, b) => {
        const p = { high: 0, med: 1, low: 2, null: 3 };
        return (p[a.priority as keyof typeof p] ?? 3) - (p[b.priority as keyof typeof p] ?? 3);
      });

    const msg = await eveningLetter(completedToday, openTasks);
    await sendPushToUser(userId, msg);
    sent++;
  }

  return NextResponse.json({ sent });
}
