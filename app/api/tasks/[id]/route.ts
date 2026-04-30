import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase/server";

const PATCHABLE = new Set([
  "title", "group_name", "summary", "due_date", "priority", "completed",
  "recurring_type", "recurring_interval", "recurring_day_of_week",
  "recurring_day_of_month", "recurring_next_due", "category",
]);

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const raw = await req.json();
  const body = Object.fromEntries(Object.entries(raw).filter(([k]) => PATCHABLE.has(k)));
  const supabase = await createSupabaseServer();

  // Try with all fields; if schema cache rejects a column, drop it and retry
  let { data, error } = await supabase.from("tasks").update(body).eq("id", id).select().single();
  if (error?.message?.includes("schema cache")) {
    const safe = Object.fromEntries(Object.entries(body).filter(([k]) => k !== "category"));
    ({ data, error } = await supabase.from("tasks").update(safe).eq("id", id).select().single());
  }
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ task: data });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createSupabaseServer();
  const { error } = await supabase.from("tasks").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
