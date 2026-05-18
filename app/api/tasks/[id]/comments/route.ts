import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase/server";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data, error } = await supabase
    .from("task_comments")
    .select("*, profile:profiles!user_id(nickname, email)")
    .eq("task_id", id)
    .order("created_at", { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ comments: data ?? [] });
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { body, link_url } = await req.json();
  if (!body?.trim() && !link_url?.trim()) {
    return NextResponse.json({ error: "body or link_url required" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("task_comments")
    .insert({ task_id: id, user_id: user.id, body: body?.trim() || null, link_url: link_url?.trim() || null })
    .select("*, profile:profiles!user_id(nickname, email)")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ comment: data });
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: taskId } = await params;
  const { commentId } = await req.json();
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { error } = await supabase
    .from("task_comments")
    .delete()
    .eq("id", commentId)
    .eq("task_id", taskId)
    .eq("user_id", user.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
