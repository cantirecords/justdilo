import { parseISO, addDays, addWeeks, addMonths } from "date-fns";

// Maps the AI's free-form recurrence string ("every Monday", "cada mes",
// "daily"…) onto the recurring_type column. Returns null when no cadence is
// recognized — better to create a one-shot task than to guess a wrong cycle.
export function normalizeRecurring(
  raw: string | null | undefined,
): "daily" | "weekly" | "monthly" | null {
  if (!raw) return null;
  const s = raw.toLowerCase();
  if (/daily|every\s*day|each\s*day|diari[oa]|cada\s*d[ií]a|todos\s*los\s*d[ií]as/.test(s)) return "daily";
  if (/weekly|every\s*week|each\s*week|semanal|cada\s*semana|todas\s*las\s*semanas|(every|each|cada)\s*(mon|tues?|wed(nes)?|thur?s?|fri|sat(ur)?|sun|lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bado|domingo)(day)?\b/.test(s)) return "weekly";
  if (/monthly|every\s*month|each\s*month|mensual|cada\s*mes|todos\s*los\s*meses/.test(s)) return "monthly";
  return null;
}

export function nextRecurringDue(dueISO: string, type: string): string {
  const advance = (d: Date) =>
    type === "daily" ? addDays(d, 1) : type === "weekly" ? addWeeks(d, 1) : addMonths(d, 1);
  // Roll forward until the occurrence lands in the future. Completing a task
  // late must never spawn an occurrence that is already overdue — born-overdue
  // tasks immediately re-trigger "unfinished" notifications for work the user
  // just did. Keeps the original anchor (same weekday / day-of-month / time).
  const now = new Date();
  let next = advance(parseISO(dueISO));
  while (next <= now) next = advance(next);
  return next.toISOString();
}

type RecurringSource = {
  user_id: string;
  title: string;
  group_name?: string | null;
  summary?: string | null;
  priority?: string | null;
  recurring_type?: string | null;
  reminder_minutes?: number | null;
  due_date?: string | null;
};

// Builds the insert row for the next occurrence of a recurring task being
// completed, or null when the task isn't recurring / has no due date.
export function buildNextOccurrence(task: RecurringSource): Record<string, unknown> | null {
  if (!task.recurring_type || !task.due_date) return null;
  return {
    user_id: task.user_id,
    title: task.title,
    group_name: task.group_name ?? null,
    summary: task.summary ?? null,
    priority: task.priority ?? null,
    recurring_type: task.recurring_type,
    reminder_minutes: task.reminder_minutes ?? null,
    due_date: nextRecurringDue(task.due_date, task.recurring_type),
    completed: false,
  };
}
