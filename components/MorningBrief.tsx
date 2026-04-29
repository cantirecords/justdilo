"use client";
import { useMemo } from "react";
import { isToday, isPast, parseISO, formatDistanceToNow } from "date-fns";
import { Zap, Clock, AlertCircle } from "lucide-react";
import type { Task } from "@/lib/types";

export default function MorningBrief({ tasks }: { tasks: Task[] }) {
  const stats = useMemo(() => {
    const open = tasks.filter((t) => !t.completed);
    const todayTasks = open.filter((t) => t.due_date && isToday(parseISO(t.due_date)));
    const urgent = open.filter((t) => t.priority === "high");
    const overdue = open.filter((t) => t.due_date && isPast(parseISO(t.due_date)) && !isToday(parseISO(t.due_date)));
    const oldest = open.find((t) => t.due_date && isPast(parseISO(t.due_date)));
    return { open: open.length, today: todayTasks.length, urgent: urgent.length, overdue: overdue.length, oldest };
  }, [tasks]);

  if (stats.open === 0) return null;

  const h = new Date().getHours();
  const greeting = h < 12 ? "Morning brief" : h < 18 ? "Afternoon check-in" : "Evening wrap-up";

  return (
    <div className="rounded-2xl border border-border bg-muted/30 p-4 space-y-3">
      <p className="text-xs uppercase tracking-widest text-muted-foreground">{greeting}</p>

      <div className="grid grid-cols-3 gap-2">
        <Stat icon={<Clock className="w-3.5 h-3.5" />} value={stats.today} label="Today" />
        <Stat icon={<AlertCircle className="w-3.5 h-3.5" />} value={stats.urgent} label="Urgent" color={stats.urgent > 0 ? "text-red-500" : undefined} />
        <Stat icon={<Zap className="w-3.5 h-3.5" />} value={stats.open} label="Open" />
      </div>

      {stats.oldest && (
        <p className="text-xs text-muted-foreground border-t border-border pt-3">
          Oldest open:{" "}
          <span className="text-foreground font-medium">{stats.oldest.title}</span>
          {stats.oldest.due_date && (
            <span className="text-red-400 ml-1">
              · {formatDistanceToNow(parseISO(stats.oldest.due_date), { addSuffix: true })}
            </span>
          )}
        </p>
      )}

      {stats.overdue > 0 && (
        <p className="text-xs text-red-500 font-medium">
          ⚠ {stats.overdue} task{stats.overdue !== 1 ? "s" : ""} overdue
        </p>
      )}
    </div>
  );
}

function Stat({ icon, value, label, color }: { icon: React.ReactNode; value: number; label: string; color?: string }) {
  return (
    <div className="flex flex-col items-center gap-1 py-2 px-1 rounded-xl bg-background/60">
      <div className={color ?? "text-muted-foreground"}>{icon}</div>
      <span className={`text-lg font-semibold leading-none ${color ?? ""}`}>{value}</span>
      <span className="text-[10px] text-muted-foreground">{label}</span>
    </div>
  );
}
