import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase/server";

async function getEnabledUser(supabase: Awaited<ReturnType<typeof createSupabaseServer>>) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  let { data: profile, error } = await supabase
    .from("profiles").select("orgs_enabled").eq("id", user.id).single();
  if (error || !profile) {
    const fb = await supabase.from("profiles").select("*").eq("id", user.id).single();
    profile = fb.data;
  }
  if (!profile?.orgs_enabled) return null;
  return user;
}

// GET /api/orgs/[id] — org details, members, and tasks
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createSupabaseServer();
  const user = await getEnabledUser(supabase);
  if (!user) return NextResponse.json({ error: "not available" }, { status: 403 });

  const [{ data: org, error: orgErr }, { data: tasks, error: tasksErr }] = await Promise.all([
    supabase
      .from("organizations")
      .select("*, members:organization_members(*, profile:profiles!user_id(nickname, email))")
      .eq("id", id)
      .single(),
    supabase
      .from("tasks")
      .select("*, assigned_to:profiles!assigned_to_id(nickname, email)")
      .eq("org_id", id)
      .order("created_at", { ascending: false }),
  ]);

  if (orgErr) return NextResponse.json({ error: orgErr.message }, { status: 404 });
  if (tasksErr) return NextResponse.json({ error: tasksErr.message }, { status: 500 });

  return NextResponse.json({ org, tasks: tasks ?? [] });
}

// PATCH /api/orgs/[id] — rename org (owner only)
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createSupabaseServer();
  const user = await getEnabledUser(supabase);
  if (!user) return NextResponse.json({ error: "not available" }, { status: 403 });

  const { name } = await req.json();
  if (!name?.trim()) return NextResponse.json({ error: "name required" }, { status: 400 });

  const { data, error } = await supabase
    .from("organizations")
    .update({ name: name.trim() })
    .eq("id", id)
    .eq("created_by", user.id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ org: data });
}

// DELETE /api/orgs/[id] — delete org (owner only)
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createSupabaseServer();
  const user = await getEnabledUser(supabase);
  if (!user) return NextResponse.json({ error: "not available" }, { status: 403 });

  const { error } = await supabase
    .from("organizations")
    .delete()
    .eq("id", id)
    .eq("created_by", user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
