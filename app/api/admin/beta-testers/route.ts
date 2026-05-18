import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase/server";

const ADMIN_EMAIL = "yorohn@duck.com";

async function requireAdmin() {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.email !== ADMIN_EMAIL) return { supabase, user: null };
  return { supabase, user };
}

export async function POST(req: Request) {
  const { supabase, user } = await requireAdmin();
  if (!user) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const { email, enabled } = await req.json();
  if (!email?.trim() || typeof enabled !== "boolean") {
    return NextResponse.json({ error: "invalid input" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("profiles")
    .update({ is_beta_tester: enabled })
    .eq("email", email.trim().toLowerCase())
    .select("id, email, nickname")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
