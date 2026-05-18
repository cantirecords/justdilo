import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ features: {} });

  const { data, error } = await supabase.rpc("get_enabled_features", { p_user_id: user.id });
  if (error) return NextResponse.json({ features: {} });

  const features: Record<string, boolean> = {};
  for (const row of data ?? []) features[row.key] = row.enabled;
  return NextResponse.json({ features });
}
