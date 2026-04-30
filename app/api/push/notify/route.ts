import { NextResponse } from "next/server";
import webpush from "web-push";
import { createClient } from "@supabase/supabase-js";
import { isToday, parseISO } from "date-fns";

export const runtime = "nodejs";

export async function GET(req: Request) {
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT!,
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
    process.env.VAPID_PRIVATE_KEY!,
  );

  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
  // Allow Vercel cron or manual trigger with secret header
  const auth = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && auth !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // Get all push subscriptions
  const { data: subs } = await supabaseAdmin.from("push_subscriptions").select("*");
  if (!subs?.length) return NextResponse.json({ sent: 0 });

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
      (t) => t.due_date && isToday(parseISO(t.due_date)),
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
