import { NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { sendPushToUser } from "@/lib/push";
import { eveningLetter } from "@/lib/push-messages";
import { isToday, parseISO } from "date-fns";

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
    // Send between 7–9pm local — wide enough to survive EST/EDT transitions
    const h = localHour(timezone);
    if (h < 19 || h > 21) continue;

    const name = nicknameMap.get(userId) || null; // "" (skipped) → null

    const { data: tasks } = await supabase
      .from("tasks")
      .select("title, priority, due_date, completed")
      .eq("user_id", userId);

    const all = tasks ?? [];

    const todayTasks = all.filter((t) => t.due_date && isToday(parseISO(t.due_date)));
    const completedToday = todayTasks.filter((t) => t.completed).length;

    const openTasks = all
      .filter((t) => !t.completed)
      .sort((a, b) => {
        const p = { high: 0, med: 1, low: 2, null: 3 };
        return (p[a.priority as keyof typeof p] ?? 3) - (p[b.priority as keyof typeof p] ?? 3);
      });

    const msg = await eveningLetter(completedToday, openTasks, name);
    await sendPushToUser(userId, msg);
    sent++;
  }

  return NextResponse.json({ sent });
}
