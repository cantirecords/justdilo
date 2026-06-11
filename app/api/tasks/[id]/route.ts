import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase/server";
import { buildNextOccurrence } from "@/lib/recurrence";

const PATCHABLE = new Set([
  "title", "group_name", "summary", "due_date", "priority", "completed",
  "recurring_type", "recurring_interval", "recurring_day_of_week",
  "recurring_day_of_month", "recurring_next_due", "category",
  "reminder_minutes", "reminded_at", "assigned_to_id", "org_id", "project_id",
]);

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const raw = await req.json();
  // assignee_ids and assignees are handled separately — strip before task update
  const { assignee_ids, assignees: _assignees, ...rest } = raw as any;
  const body: Record<string, any> = Object.fromEntries(
    Object.entries(rest).filter(([k]) => PATCHABLE.has(k)),
  );

  // Reschedule resets the reminder so a fresh notification fires for the new date.
  // Without this, postponing a task with a one-hour custom reminder would never
  // notify again because reminded_at is still set from the old due_date.
  if ("due_date" in body && !("reminded_at" in body)) {
    body.reminded_at = null;
  }

  const supabase = await createSupabaseServer();

  // Handle multi-assignee update (replace all assignees for this task)
  if (Array.isArray(assignee_ids)) {
    await supabase.from("task_assignees").delete().eq("task_id", id);
    if (assignee_ids.length > 0) {
      await supabase.from("task_assignees").insert(
        assignee_ids.map((uid: string) => ({ task_id: id, user_id: uid }))
      );
    }
  }

  // If no task fields to update (only assignees changed), return early
  if (Object.keys(body).length === 0) {
    return NextResponse.json({ task: null });
  }

  // Snapshot completion state before updating — the next occurrence must only
  // spawn on the open → complete transition. Re-completing an already-done task
  // (double-tap, retry, batch update) would otherwise insert duplicate
  // occurrences, each one generating its own notifications.
  let wasCompleted = false;
  if (body.completed === true) {
    const { data: prev } = await supabase.from("tasks").select("completed").eq("id", id).single();
    wasCompleted = prev?.completed === true;
  }

  let { data, error } = await supabase.from("tasks").update(body).eq("id", id).select().single();
  if (error?.message?.includes("schema cache")) {
    const safe = Object.fromEntries(Object.entries(body).filter(([k]) => k !== "category" && k !== "project_id"));
    ({ data, error } = await supabase.from("tasks").update(safe).eq("id", id).select().single());
  }
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // When marking a recurring task complete, spawn the next occurrence
  if (body.completed === true && !wasCompleted && data) {
    const nextTask = buildNextOccurrence(data);
    if (nextTask) await supabase.from("tasks").insert(nextTask);
  }

  return NextResponse.json({ task: data });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createSupabaseServer();
  const { error } = await supabase.from("tasks").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
