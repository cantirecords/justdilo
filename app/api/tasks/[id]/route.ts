import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase/server";
import { parseISO, addDays, addWeeks, addMonths } from "date-fns";

const PATCHABLE = new Set([
  "title", "group_name", "summary", "due_date", "priority", "completed",
  "recurring_type", "recurring_interval", "recurring_day_of_week",
  "recurring_day_of_month", "recurring_next_due", "category",
  "reminder_minutes", "reminded_at", "assigned_to_id", "org_id", "project_id",
]);

function nextRecurringDue(dueISO: string, type: string): string {
  const base = parseISO(dueISO);
  let next: Date;
  if (type === "daily")   next = addDays(base, 1);
  else if (type === "weekly")  next = addWeeks(base, 1);
  else                         next = addMonths(base, 1);
  return next.toISOString();
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const raw = await req.json();
  // assignee_ids and assignees are handled separately — strip before task update
  const { assignee_ids, assignees: _assignees, ...rest } = raw as any;
  const body = Object.fromEntries(Object.entries(rest).filter(([k]) => PATCHABLE.has(k)));
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

  let { data, error } = await supabase.from("tasks").update(body).eq("id", id).select().single();
  if (error?.message?.includes("schema cache")) {
    const safe = Object.fromEntries(Object.entries(body).filter(([k]) => k !== "category" && k !== "project_id"));
    ({ data, error } = await supabase.from("tasks").update(safe).eq("id", id).select().single());
  }
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // When marking a recurring task complete, spawn the next occurrence
  if (body.completed === true && data?.recurring_type && data?.due_date) {
    const nextDue = nextRecurringDue(data.due_date, data.recurring_type);
    const nextTask = {
      user_id: data.user_id,
      title: data.title,
      group_name: data.group_name ?? null,
      summary: data.summary ?? null,
      priority: data.priority ?? null,
      recurring_type: data.recurring_type,
      due_date: nextDue,
      completed: false,
    };
    await supabase.from("tasks").insert(nextTask);
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
