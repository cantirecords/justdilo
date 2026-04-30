import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase/server";

export const runtime = "nodejs";

const PATCHABLE = new Set(["title", "summary", "sections", "key_insights", "action_items", "tags"]);

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json();
  const patch = Object.fromEntries(Object.entries(body).filter(([k]) => PATCHABLE.has(k)));
  if (!Object.keys(patch).length) return NextResponse.json({ error: "nothing to update" }, { status: 400 });

  const { data, error } = await supabase
    .from("ideas")
    .update(patch)
    .eq("id", id)
    .select()
    .single();

  if (error) {
    console.error("[ideas/patch] error:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ idea: data });
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { error } = await supabase.from("ideas").delete().eq("id", id).eq("user_id", user.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
