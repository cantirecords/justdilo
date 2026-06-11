// Vercel cron sends "Authorization: Bearer ${CRON_SECRET}" automatically when
// the env var is set; external schedulers must send the same header. When
// CRON_SECRET is unset the check is skipped so local/dev calls still work.
export function isAuthorizedCron(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true;
  return req.headers.get("authorization") === `Bearer ${secret}`;
}
