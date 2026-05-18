import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase/server";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json();
  const { member_ids, ...rest } = body;

  const PATCHABLE = new Set(["name", "description", "status", "phase", "due_date"]);
  const patch = Object.fromEntries(Object.entries(rest).filter(([k]) => PATCHABLE.has(k)));

  let project: any = null;
  if (Object.keys(patch).length) {
    const { data, error } = await supabase
      .from("projects").update(patch).eq("id", id).select().single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    project = data;
  }

  // Replace member list if provided
  if (Array.isArray(member_ids)) {
    await supabase.from("project_members").delete().eq("project_id", id);
    if (member_ids.length) {
      await supabase.from("project_members").insert(
        member_ids.map((uid: string) => ({ project_id: id, user_id: uid, role: uid === user.id ? "lead" : "member" }))
      );
    }
  }

  return NextResponse.json({ project });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { error } = await supabase.from("projects").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
