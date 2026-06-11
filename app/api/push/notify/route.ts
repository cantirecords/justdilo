import { NextResponse } from "next/server";
import webpush from "web-push";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { isAuthorizedCron } from "@/lib/cron-auth";
import { isTodayInTz } from "@/lib/local-time";
import { parseISO } from "date-fns";

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    webpush.setVapidDetails(
      process.env.VAPID_SUBJECT!,
      process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
      process.env.VAPID_PRIVATE_KEY!,
    );
  } catch (e: any) {
    return NextResponse.json({ error: "VAPID config error: " + e.message }, { status: 500 });
  }

  const supabaseAdmin = createSupabaseAdmin();
  // Allow Vercel cron or manual trigger with secret header
  if (!isAuthorizedCron(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // Get all push subscriptions
  const { data: subs, error: subsError } = await supabaseAdmin.from("push_subscriptions").select("*");
  if (subsError) return NextResponse.json({ error: "DB error: " + subsError.message }, { status: 500 });
  if (!subs?.length) return NextResponse.json({ sent: 0, message: "no subscriptions" });

  let sent = 0;
  const staleIds: string[] = [];

  for (const sub of subs) {
    // Get today's incomplete tasks for this user
    const { data: tasks } = await supabaseAdmin
      .from("tasks")
      .select("title, due_date, priority")
      .eq("user_id", sub.user_id)
      .eq("completed", false)
      .not("due_date", "is", null);

    const dueToday = (tasks ?? []).filter(
      (t) => t.due_date && isTodayInTz(parseISO(t.due_date), sub.timezone ?? "UTC"),
    );
    if (!dueToday.length) continue;

    const high = dueToday.filter((t) => t.priority === "high");
    const body =
      high.length > 0
        ? `${high[0].title}${dueToday.length > 1 ? ` + ${dueToday.length - 1} more` : ""}`
        : `${dueToday[0].title}${dueToday.length > 1 ? ` + ${dueToday.length - 1} more` : ""}`;

    const payload = JSON.stringify({
      title: `${dueToday.length} task${dueToday.length > 1 ? "s" : ""} due today`,
      body,
      url: "/",
    });

    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        payload,
      );
      sent++;
    } catch (err: any) {
      // 410 Gone = subscription expired, clean it up
      if (err.statusCode === 410) staleIds.push(sub.id);
    }
  }

  if (staleIds.length) {
    await supabaseAdmin.from("push_subscriptions").delete().in("id", staleIds);
  }

  return NextResponse.json({ sent, stale: staleIds.length });
}
