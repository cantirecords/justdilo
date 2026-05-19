import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createSupabaseServer();
  // RLS handles visibility: own tasks + org tasks the user is a member of
  // "assignees" alias matches the Task type's assignees field
  const taskSelect = `*, assignees:task_assignees(user_id, profile:profiles!user_id(nickname, email))`;
  let { data, error } = await supabase
    .from("tasks")
    .select(taskSelect)
    .order("created_at", { ascending: false });
  // Schema cache fallback
  if (error) {
    ({ data, error } = await supabase.from("tasks").select("*").order("created_at", { ascending: false }));
  }
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ tasks: data });
}

export async function POST(req: Request) {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json();
  const { title, group_name, due_date, priority, category, org_id, assigned_to_id } = body;
  if (!title?.trim()) return NextResponse.json({ error: "title required" }, { status: 400 });

  const row: Record<string, unknown> = { user_id: user.id, title: title.trim(), group_name: group_name ?? null, due_date: due_date ?? null, priority: priority ?? null, category: category ?? null, completed: false, org_id: org_id ?? null, assigned_to_id: assigned_to_id ?? null };
  let { data, error } = await supabase.from("tasks").insert(row).select().single();
  if (error?.message?.includes("schema cache")) {
    const { category: _c, ...safe } = row as any;
    ({ data, error } = await supabase.from("tasks").insert(safe).select().single());
  }
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}
