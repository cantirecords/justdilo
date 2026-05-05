import webpush from "web-push";
import { createSupabaseAdmin } from "./supabase/admin";

function initVapid() {
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT!,
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
    process.env.VAPID_PRIVATE_KEY!,
  );
}

export async function sendPushToUser(
  userId: string,
  payload: { title: string; body: string; url?: string },
) {
  initVapid();
  const supabase = createSupabaseAdmin();
  const { data: subs } = await supabase
    .from("push_subscriptions").select("*").eq("user_id", userId);

  const staleIds: string[] = [];
  for (const sub of subs ?? []) {
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        JSON.stringify({ ...payload, url: payload.url ?? "/" }),
      );
    } catch (err: any) {
      if (err.statusCode === 410) staleIds.push(sub.id);
    }
  }
  if (staleIds.length) {
    await supabase.from("push_subscriptions").delete().in("id", staleIds);
  }
}


export async function sendPushToSubscribed(
  payload: { title: string; body: string; url?: string },
  userIds?: string[],
): Promise<{ sent: number; stale: number }> {
  initVapid();
  const supabase = createSupabaseAdmin();
  let query = supabase.from("push_subscriptions").select("*");
  if (userIds?.length) query = query.in("user_id", userIds);
  const { data: subs } = await query;

  let sent = 0;
  const staleIds: string[] = [];
  for (const sub of subs ?? []) {
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        JSON.stringify({ ...payload, url: payload.url ?? "/" }),
      );
      sent++;
    } catch (err: any) {
      if (err.statusCode === 410) staleIds.push(sub.id);
    }
  }
  if (staleIds.length) {
    await supabase.from("push_subscriptions").delete().in("id", staleIds);
  }
  return { sent, stale: staleIds.length };
}
