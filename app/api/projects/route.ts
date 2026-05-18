import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data: memberships } = await supabase
    .from("organization_members")
    .select("org_id")
    .eq("user_id", user.id)
    .eq("status", "active");
  const orgIds = (memberships ?? []).map((m) => m.org_id);
  if (!orgIds.length) return NextResponse.json({ projects: [] });

  const { data: projects, error } = await supabase
    .from("projects")
    .select("*, members:project_members(user_id, role, profile:profiles!user_id(nickname, email))")
    .in("org_id", orgIds)
    .neq("status", "done")
    .order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Attach task counts per project
  const projectIds = (projects ?? []).map((p) => p.id);
  if (projectIds.length) {
    const { data: taskRows } = await supabase
      .from("tasks")
      .select("project_id, completed")
      .in("project_id", projectIds);
    const countMap: Record<string, { total: number; done: number }> = {};
    for (const t of taskRows ?? []) {
      if (!countMap[t.project_id]) countMap[t.project_id] = { total: 0, done: 0 };
      countMap[t.project_id].total++;
      if (t.completed) countMap[t.project_id].done++;
    }
    return NextResponse.json({
      projects: (projects ?? []).map((p) => ({
        ...p,
        task_count: countMap[p.id]?.total ?? 0,
        done_count: countMap[p.id]?.done ?? 0,
      })),
    });
  }

  return NextResponse.json({ projects: projects ?? [] });
}

export async function POST(req: Request) {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json();
  const { name, description, phase, due_date, org_id, member_ids = [] } = body;
  if (!name?.trim()) return NextResponse.json({ error: "name required" }, { status: 400 });
  if (!org_id) return NextResponse.json({ error: "org_id required" }, { status: 400 });

  const { data: project, error } = await supabase
    .from("projects")
    .insert({ name: name.trim(), description: description || null, phase: phase || "planning", due_date: due_date || null, org_id, created_by: user.id })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Add creator as lead + any extra members
  const allMembers = [...new Set([user.id, ...(member_ids as string[])])];
  await supabase.from("project_members").insert(
    allMembers.map((uid) => ({ project_id: project.id, user_id: uid, role: uid === user.id ? "lead" : "member" }))
  );

  return NextResponse.json({ project });
}
