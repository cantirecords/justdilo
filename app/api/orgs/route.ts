import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase/server";

async function getEnabledUser(supabase: Awaited<ReturnType<typeof createSupabaseServer>>) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  // Try specific columns first; fall back if schema cache hasn't refreshed yet
  let { data: profile, error } = await supabase
    .from("profiles").select("orgs_enabled, email").eq("id", user.id).single();
  if (error || !profile) {
    const fb = await supabase.from("profiles").select("*").eq("id", user.id).single();
    profile = fb.data;
  }
  if (!profile?.orgs_enabled) return null;
  return { id: user.id, email: (profile.email ?? user.email) as string };
}

// GET /api/orgs — list orgs the current user is an active member of
export async function GET() {
  const supabase = await createSupabaseServer();
  const user = await getEnabledUser(supabase);
  if (!user) return NextResponse.json({ error: "not available" }, { status: 403 });

  const { data, error } = await supabase
    .from("organizations")
    .select("*, members:organization_members(*, profile:profiles!user_id(nickname, email))")
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ orgs: data ?? [] });
}

// POST /api/orgs — create a new organization (via SECURITY DEFINER RPC)
export async function POST(req: Request) {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { name } = await req.json();
  if (!name?.trim()) return NextResponse.json({ error: "name required" }, { status: 400 });

  const { data: org, error } = await supabase.rpc("create_organization", { p_name: name.trim() });

  if (error) {
    console.error("[orgs POST] create_organization rpc failed:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ org }, { status: 201 });
}
