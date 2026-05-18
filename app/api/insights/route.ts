import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const [recurring, abandonment, priority] = await Promise.all([
    supabase.rpc("get_recurring_suggestions", { p_user_id: user.id }),
    supabase.rpc("get_abandonment_stats",     { p_user_id: user.id }),
    supabase.rpc("get_priority_insights",     { p_user_id: user.id }),
  ]);

  const noDateRow   = (abandonment.data ?? []).find((r: any) => !r.has_due_date);
  const withDateRow = (abandonment.data ?? []).find((r: any) =>  r.has_due_date);

  return NextResponse.json({
    recurring: recurring.data ?? [],
    abandonment: {
      no_due_date_rate:   noDateRow?.abandon_rate   ?? null,
      no_due_date_sample: noDateRow?.total_aged      ?? 0,
      with_due_date_rate: withDateRow?.abandon_rate  ?? null,
    },
    priority: priority.data ?? [],
  });
}
