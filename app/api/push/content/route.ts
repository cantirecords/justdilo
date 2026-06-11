import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { morningBrief, eveningLetter, stuckNudge } from "@/lib/push-messages";
import { isTodayInTz, daysAgoInTz } from "@/lib/local-time";
import { parseISO } from "date-fns";

export const runtime = "nodejs";

// Returns notification content for the logged-in user WITHOUT sending a push.
// Used by the Electron desktop app to show native OS notifications
// without triggering a duplicate web push to the user's mobile device.
export async function GET(req: Request) {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const type = searchParams.get("type") ?? "morning";

  const admin = createSupabaseAdmin();
  const [{ data: tasks }, { data: profile }, { data: subRows }] = await Promise.all([
    admin.from("tasks").select("title, priority, due_date, completed").eq("user_id", user.id),
    admin.from("profiles").select("nickname").eq("id", user.id).single(),
    admin.from("push_subscriptions").select("timezone").eq("user_id", user.id).limit(1),
  ]);

  // Day boundaries must use the user's clock, not server UTC. The Electron
  // client passes its own timezone; fall back to the push subscription's.
  const tz = searchParams.get("tz") || subRows?.[0]?.timezone || "UTC";

  const name = profile?.nickname ?? null;
  const all = tasks ?? [];
  const open = all.filter((t) => !t.completed);

  let msg: { title: string; body: string };

  if (type === "evening") {
    const todayCompleted = all.filter(
      (t) => t.completed && t.due_date && isTodayInTz(parseISO(t.due_date), tz)
    ).length;
    const openSorted = open.sort((a, b) => {
      const p: Record<string, number> = { high: 0, med: 1, low: 2 };
      return (p[a.priority ?? ""] ?? 3) - (p[b.priority ?? ""] ?? 3);
    });
    msg = await eveningLetter(todayCompleted, openSorted, name);
  } else if (type === "stuck") {
    const stuck = open.find(
      (t) => t.due_date && daysAgoInTz(parseISO(t.due_date), tz) >= 1,
    );
    if (!stuck) return NextResponse.json({ title: null, body: null });
    const days = daysAgoInTz(parseISO(stuck.due_date), tz);
    msg = await stuckNudge(stuck.title, days, name);
  } else {
    const todayTasks = open.filter((t) => t.due_date && isTodayInTz(parseISO(t.due_date), tz));
    const targets = todayTasks.length > 0 ? todayTasks : open.slice(0, 3);
    msg = await morningBrief(targets, name);
  }

  return NextResponse.json(msg);
}
