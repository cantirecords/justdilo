import { NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { sendPushToUser } from "@/lib/push";
import { morningBrief, stuckNudge } from "@/lib/push-messages";
import { isToday, isPast, parseISO, differenceInDays } from "date-fns";

export const runtime = "nodejs";

export async function GET() {
  const supabase = createSupabaseAdmin();

  // Get all users with push subscriptions
  const { data: subs } = await supabase
    .from("push_subscriptions").select("user_id");
  if (!subs?.length) return NextResponse.json({ sent: 0 });

  const userIds = [...new Set(subs.map((s) => s.user_id))];
  let sent = 0;

  for (const userId of userIds) {
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
      const msg = await morningBrief(todayTasks);
      await sendPushToUser(userId, msg);
      sent++;
    }

    // 2. STUCK TASK NUDGE — exactly 3 days overdue (nudge once, on day 3)
    const stuckTasks = allOpen.filter((t) => {
      if (!t.due_date) return false;
      const due = parseISO(t.due_date);
      if (!isPast(due) || isToday(due)) return false;
      const days = differenceInDays(new Date(), due);
      return days === 3; // Only nudge once — on day 3
    });

    for (const task of stuckTasks.slice(0, 2)) {
      const days = differenceInDays(new Date(), parseISO(task.due_date));
      const msg = await stuckNudge(task.title, days);
      await sendPushToUser(userId, { ...msg, url: "/" });
      sent++;
    }
  }

  return NextResponse.json({ sent });
}
