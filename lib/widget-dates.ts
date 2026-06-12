import { format, isPast, isToday, isTomorrow, parseISO } from "date-fns";

// Date helpers for the floating widget surfaces. These mirror the main app's
// semantics (TaskFeed/TaskCard): due_date is an ISO timestamp where date-only
// tasks carry a 23:59 local sentinel meaning "no specific time" — see
// resolveDue / lib/local-time.ts. parseISO treats date-only strings as local
// midnight, so legacy "YYYY-MM-DD" rows classify correctly too.

export function parseDue(due: string): Date {
  return parseISO(due);
}

export function hasSpecificTime(due: string): boolean {
  const d = parseISO(due);
  return !(d.getHours() === 23 && d.getMinutes() === 59);
}

// Overdue = due on an earlier calendar day. Tasks due today are never
// "overdue", they're "now" once their specific time passes.
export function isOverdue(due: string | null): boolean {
  if (!due) return false;
  const d = parseISO(due);
  return isPast(d) && !isToday(d);
}

// "NOW" = has a real time, that time is today, and it has already passed.
export function isDueNow(due: string | null): boolean {
  if (!due || !hasSpecificTime(due)) return false;
  const d = parseISO(due);
  return isPast(d) && isToday(d);
}

// Short time string, or null for date-only tasks (never show the sentinel).
export function dueTime(due: string): string | null {
  if (!hasSpecificTime(due)) return null;
  return format(parseISO(due), "h:mm a");
}

export function dueLabel(due: string): string {
  const d = parseISO(due);
  if (isOverdue(due)) return `Overdue · ${format(d, "MMM d")}`;
  if (isDueNow(due)) return `NOW · ${format(d, "h:mm a")}`;
  if (isToday(d)) return hasSpecificTime(due) ? format(d, "h:mm a") : "Today";
  if (isTomorrow(d)) return hasSpecificTime(due) ? `Tomorrow · ${format(d, "h:mm a")}` : "Tomorrow";
  return format(d, "MMM d");
}
