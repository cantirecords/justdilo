import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";

const ADMIN_EMAIL = "yorohn@duck.com";

async function requireAdmin() {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.email !== ADMIN_EMAIL) return { user: null };
  return { user };
}

export async function POST(req: Request) {
  const { user } = await requireAdmin();
  if (!user) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const { email, enabled } = await req.json();
  if (!email?.trim() || typeof enabled !== "boolean") {
    return NextResponse.json({ error: "invalid input" }, { status: 400 });
  }

  // Use service role to bypass RLS — admin-only route
  const admin = createSupabaseAdmin();
  const { data, error } = await admin
    .from("profiles")
    .update({ is_beta_tester: enabled })
    .eq("email", email.trim().toLowerCase())
    .select("id, email, nickname")
    .single();

  if (error) {
    const msg = error.code === "PGRST116"
      ? "No account found with that email — they need to sign up first"
      : error.message;
    return NextResponse.json({ error: msg }, { status: error.code === "PGRST116" ? 404 : 500 });
  }
  return NextResponse.json(data);
}
