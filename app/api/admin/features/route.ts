import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase/server";

const ADMIN_EMAIL = "yorohn@duck.com";

async function requireAdmin() {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.email !== ADMIN_EMAIL) return { supabase, user: null };
  return { supabase, user };
}

export async function GET() {
  const { supabase, user } = await requireAdmin();
  if (!user) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const { data: flags } = await supabase
    .from("feature_flags")
    .select("*")
    .order("key");

  const { data: testers } = await supabase
    .from("profiles")
    .select("id, email, nickname")
    .eq("is_beta_tester", true)
    .order("email");

  return NextResponse.json({ flags: flags ?? [], betaTesters: testers ?? [] });
}

export async function PATCH(req: Request) {
  const { supabase, user } = await requireAdmin();
  if (!user) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const { key, rollout } = await req.json();
  if (!key || !["off", "admin", "beta", "all"].includes(rollout)) {
    return NextResponse.json({ error: "invalid input" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("feature_flags")
    .update({ rollout, updated_at: new Date().toISOString(), updated_by: user.id })
    .eq("key", key)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
