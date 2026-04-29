"use client";
import { useMemo } from "react";
import { parseISO, isAfter, startOfWeek, format } from "date-fns";
import { cn } from "@/lib/utils";
import type { Task } from "@/lib/types";

export default function StatsCard({ tasks }: { tasks: Task[] }) {
  const stats = useMemo(() => {
    const weekStart = startOfWeek(new Date(), { weekStartsOn: 1 });
    const thisWeek   = tasks.filter((t) => isAfter(parseISO(t.created_at), weekStart));
    const doneWeek   = thisWeek.filter((t) => t.completed).length;
    const rate       = thisWeek.length > 0 ? Math.round((doneWeek / thisWeek.length) * 100) : 0;
    const totalDone  = tasks.filter((t) => t.completed).length;

    const groupCounts: Record<string, number> = {};
    for (const t of tasks) {
      const g = t.group_name || "General";
      groupCounts[g] = (groupCounts[g] || 0) + 1;
    }
    const topGroup = Object.entries(groupCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "—";

    const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
    const dayDone: Record<string, number> = {};
    for (const t of tasks.filter((t) => t.completed)) {
      const d = format(parseISO(t.created_at), "EEE");
      dayDone[d] = (dayDone[d] || 0) + 1;
    }
    const maxBar = Math.max(...days.map((d) => dayDone[d] || 0), 1);
    const today  = format(new Date(), "EEE");

    return { doneWeek, rate, totalDone, topGroup, days, dayDone, maxBar, today };
  }, [tasks]);

  return (
    <div className="space-y-3 animate-rise">
      <div className="grid grid-cols-2 gap-3">
        <Tile label="Done this week" value={stats.doneWeek} />
        <Tile label="Completion rate" value={`${stats.rate}%`} highlight={stats.rate >= 80} />
        <Tile label="All-time done" value={stats.totalDone} />
        <Tile label="Top project" value={stats.topGroup} small />
      </div>

      <div className="rounded-2xl border border-border bg-muted/20 p-4">
        <p className="text-xs text-muted-foreground mb-3">Completions by day</p>
        <div className="flex items-end gap-1.5">
          {stats.days.map((day) => {
            const count  = stats.dayDone[day] || 0;
            const pct    = Math.round((count / stats.maxBar) * 100);
            const isToday = day === stats.today;
            return (
              <div key={day} className="flex-1 flex flex-col items-center gap-1.5">
                <div className="w-full flex items-end" style={{ height: 48 }}>
                  <div
                    className={cn(
                      "w-full rounded-t-md transition-all duration-500",
                      isToday ? "bg-foreground" : "bg-muted-foreground/25",
                    )}
                    style={{ height: count > 0 ? `${Math.max(pct, 12)}%` : 2 }}
                  />
                </div>
                <span className={cn(
                  "text-[9px] font-medium",
                  isToday ? "text-foreground" : "text-muted-foreground/50",
                )}>
                  {day[0]}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function Tile({
  label,
  value,
  small,
  highlight,
}: {
  label: string;
  value: string | number;
  small?: boolean;
  highlight?: boolean;
}) {
  return (
    <div className="rounded-2xl border border-border bg-muted/20 p-4">
      <p className="text-xs text-muted-foreground mb-1">{label}</p>
      <p className={cn(
        "font-semibold tracking-tight leading-none",
        small ? "text-base truncate" : "text-3xl",
        highlight && "text-emerald-500",
      )}>
        {value}
      </p>
    </div>
  );
}
