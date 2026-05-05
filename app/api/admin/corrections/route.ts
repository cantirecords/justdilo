import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";

const ADMIN_EMAIL = "yorohn@duck.com";
const TABLE = "prompt_corrections";

export async function GET() {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.email !== ADMIN_EMAIL) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const admin = createSupabaseAdmin();
  try {
    const { data, error } = await admin
      .from(TABLE)
      .select("*")
      .order("created_at", { ascending: false })
      .limit(50);
    if (error?.message?.includes("does not exist")) {
      return NextResponse.json({ corrections: [], setup_needed: true });
    }
    if (error) throw error;
    return NextResponse.json({ corrections: data ?? [], setup_needed: false });
  } catch (e: any) {
    if (e?.message?.includes("does not exist")) {
      return NextResponse.json({ corrections: [], setup_needed: true });
    }
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.email !== ADMIN_EMAIL) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const body = await req.json();
  const { original_transcript, correct_intent, correct_tasks, issue_type, admin_note } = body;
  if (!original_transcript || !correct_intent) {
    return NextResponse.json({ error: "missing fields" }, { status: 400 });
  }
  const admin = createSupabaseAdmin();
  try {
    const { data, error } = await admin.from(TABLE).insert({
      original_transcript,
      correct_intent: correct_intent ?? "CREATE_TASK",
      correct_tasks: correct_tasks ?? [],
      issue_type: issue_type ?? "other",
      admin_note: admin_note ?? null,
    }).select().single();
    if (error?.message?.includes("does not exist")) {
      return NextResponse.json({ error: "setup_needed" }, { status: 503 });
    }
    if (error) throw error;
    return NextResponse.json({ correction: data });
  } catch (e: any) {
    if (e?.message?.includes("does not exist")) {
      return NextResponse.json({ error: "setup_needed" }, { status: 503 });
    }
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.email !== ADMIN_EMAIL) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const { id } = await req.json();
  if (!id) return NextResponse.json({ error: "missing id" }, { status: 400 });
  const admin = createSupabaseAdmin();
  const { error } = await admin.from(TABLE).delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
