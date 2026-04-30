"use client";
import { useMemo } from "react";
import { parseISO, isAfter, isBefore, isToday, isPast, startOfWeek, subWeeks, format } from "date-fns";
import { AlertTriangle, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { cn } from "@/lib/utils";
import { CATEGORY_CONFIG } from "@/lib/categories";
import type { Task, TaskCategory } from "@/lib/types";

export default function StatsCard({ tasks }: { tasks: Task[] }) {
  const s = useMemo(() => {
    const now = new Date();
    const weekStart = startOfWeek(now, { weekStartsOn: 1 });
    const prevWeekStart = subWeeks(weekStart, 1);

    const active = tasks.filter((t) => !t.completed);
    const done = tasks.filter((t) => t.completed);

    // Overdue: past due and not completed
    const overdue = active.filter((t) => t.due_date && isPast(parseISO(t.due_date)) && !isToday(parseISO(t.due_date)));

    // Due today
    const dueToday = active.filter((t) => t.due_date && isToday(parseISO(t.due_date)));

    // This week vs last week completions
    const doneThisWeek = done.filter((t) => isAfter(parseISO(t.created_at), weekStart));
    const doneLastWeek = done.filter((t) =>
      isAfter(parseISO(t.created_at), prevWeekStart) && isBefore(parseISO(t.created_at), weekStart)
    );
    const createdThisWeek = tasks.filter((t) => isAfter(parseISO(t.created_at), weekStart));
    const rate = createdThisWeek.length > 0 ? Math.round((doneThisWeek.length / createdThisWeek.length) * 100) : 0;

    // Streak: consecutive days with at least one completion (going back from today)
    const doneDays = new Set(done.map((t) => format(parseISO(t.created_at), "yyyy-MM-dd")));
    let streak = 0;
    const d = new Date();
    while (doneDays.has(format(d, "yyyy-MM-dd"))) {
      streak++;
      d.setDate(d.getDate() - 1);
    }

    // Priority breakdown (active tasks)
    const highPending = active.filter((t) => t.priority === "high").length;
    const medPending = active.filter((t) => t.priority === "med").length;
    const lowPending = active.filter((t) => t.priority === "low").length;
    const noPriority = active.filter((t) => !t.priority).length;

    // Top categories by pending tasks
    const catCounts: Partial<Record<TaskCategory, number>> = {};
    for (const t of active) {
      if (t.category) catCounts[t.category] = (catCounts[t.category] ?? 0) + 1;
    }
    const topCats = Object.entries(catCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3) as [TaskCategory, number][];

    // Active projects (unique group names with pending tasks)
    const activeProjects = new Set(active.map((t) => t.group_name).filter(Boolean)).size;

    // Bar chart: completions by day of week
    const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
    const dayDone: Record<string, number> = {};
    for (const t of done) {
      const day = format(parseISO(t.created_at), "EEE");
      dayDone[day] = (dayDone[day] ?? 0) + 1;
    }
    const maxBar = Math.max(...days.map((d) => dayDone[d] ?? 0), 1);
    const today = format(now, "EEE");

    // Smart insight
    let insight = "";
    let insightType: "good" | "warn" | "neutral" = "neutral";
    if (overdue.length > 0) {
      insight = `${overdue.length} task${overdue.length > 1 ? "s" : ""} overdue — tackle these first.`;
      insightType = "warn";
    } else if (rate >= 80 && doneThisWeek.length > 0) {
      insight = `${rate}% completion rate this week. You're crushing it.`;
      insightType = "good";
    } else if (doneThisWeek.length > doneLastWeek.length) {
      insight = `${doneThisWeek.length - doneLastWeek.length} more completions than last week. Keep the pace.`;
      insightType = "good";
    } else if (doneThisWeek.length < doneLastWeek.length && doneLastWeek.length > 0) {
      insight = `Slower week than last. ${doneLastWeek.length - doneThisWeek.length} fewer tasks done.`;
      insightType = "warn";
    } else if (highPending > 0) {
      insight = `${highPending} urgent task${highPending > 1 ? "s" : ""} still pending.`;
      insightType = "warn";
    } else if (streak >= 3) {
      insight = `${streak}-day completion streak. Don't break it.`;
      insightType = "good";
    } else if (active.length === 0) {
      insight = "All tasks done. What's next?";
      insightType = "good";
    } else {
      insight = `${active.length} tasks pending across ${activeProjects} project${activeProjects !== 1 ? "s" : ""}.`;
    }

    return {
      active: active.length, overdue: overdue.length, dueToday: dueToday.length,
      doneThisWeek: doneThisWeek.length, doneLastWeek: doneLastWeek.length,
      rate, streak, highPending, medPending, lowPending, noPriority,
      topCats, activeProjects, days, dayDone, maxBar, today, insight, insightType,
      totalDone: done.length,
    };
  }, [tasks]);

  const weekTrend = s.doneThisWeek > s.doneLastWeek ? "up" : s.doneThisWeek < s.doneLastWeek ? "down" : "flat";

  return (
    <div className="space-y-3 animate-rise">
      {/* Smart insight banner */}
      <div className={cn(
        "rounded-2xl p-4 border flex items-start gap-3",
        s.insightType === "warn" ? "bg-red-50/50 border-red-200/60 dark:bg-red-950/20 dark:border-red-800/40" :
        s.insightType === "good" ? "bg-emerald-50/50 border-emerald-200/60 dark:bg-emerald-950/20 dark:border-emerald-800/40" :
        "bg-muted/20 border-border",
      )}>
        {s.insightType === "warn" && <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />}
        {s.insightType === "good" && <TrendingUp className="w-4 h-4 text-emerald-500 flex-shrink-0 mt-0.5" />}
        {s.insightType === "neutral" && <Minus className="w-4 h-4 text-muted-foreground flex-shrink-0 mt-0.5" />}
        <p className="text-sm font-medium leading-snug">{s.insight}</p>
      </div>

      {/* Key numbers */}
      <div className="grid grid-cols-2 gap-3">
        <Tile label="Pending" value={s.active} />
        <Tile label="Overdue" value={s.overdue} alert={s.overdue > 0} />
        <Tile label="Done this week" value={s.doneThisWeek} trend={weekTrend} />
        <Tile label="Completion rate" value={`${s.rate}%`} highlight={s.rate >= 80} />
      </div>

      {/* Secondary row */}
      <div className="grid grid-cols-3 gap-3">
        <Tile label="Due today" value={s.dueToday} small />
        <Tile label="Streak" value={s.streak > 0 ? `${s.streak}d` : "—"} small highlight={s.streak >= 3} />
        <Tile label="Projects" value={s.activeProjects} small />
      </div>

      {/* Priority breakdown */}
      {s.active > 0 && (
        <div className="rounded-2xl border border-border bg-muted/20 p-4">
          <p className="text-xs text-muted-foreground mb-3">Pending by priority</p>
          <div className="space-y-2">
            {s.highPending > 0 && <PriorityBar label="Urgent" count={s.highPending} total={s.active} color="bg-red-500" />}
            {s.medPending > 0 && <PriorityBar label="Medium" count={s.medPending} total={s.active} color="bg-amber-400" />}
            {s.lowPending > 0 && <PriorityBar label="Low" count={s.lowPending} total={s.active} color="bg-blue-400" />}
            {s.noPriority > 0 && <PriorityBar label="No priority" count={s.noPriority} total={s.active} color="bg-muted-foreground/30" />}
          </div>
        </div>
      )}

      {/* Top categories */}
      {s.topCats.length > 0 && (
        <div className="rounded-2xl border border-border bg-muted/20 p-4">
          <p className="text-xs text-muted-foreground mb-3">Most tasks by category</p>
          <div className="space-y-2">
            {s.topCats.map(([cat, count]) => {
              const cfg = CATEGORY_CONFIG[cat];
              return (
                <div key={cat} className="flex items-center justify-between">
                  <span className={cn("text-xs px-2 py-0.5 rounded-full font-medium", cfg.badge)}>
                    {cfg.icon} {cfg.label}
                  </span>
                  <span className="text-xs text-muted-foreground tabular-nums">{count} task{count !== 1 ? "s" : ""}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Activity bar chart */}
      <div className="rounded-2xl border border-border bg-muted/20 p-4">
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs text-muted-foreground">Completions by day</p>
          <p className="text-xs text-muted-foreground tabular-nums">{s.totalDone} total</p>
        </div>
        <div className="flex items-end gap-1.5">
          {s.days.map((day) => {
            const count = s.dayDone[day] ?? 0;
            const pct = Math.round((count / s.maxBar) * 100);
            const isToday = day === s.today;
            return (
              <div key={day} className="flex-1 flex flex-col items-center gap-1.5">
                <span className={cn("text-[9px] tabular-nums", count > 0 ? "text-foreground" : "text-transparent")}>
                  {count || ""}
                </span>
                <div className="w-full flex items-end" style={{ height: 44 }}>
                  <div
                    className={cn(
                      "w-full rounded-t-md transition-all duration-500",
                      isToday ? "bg-foreground" : "bg-muted-foreground/25",
                    )}
                    style={{ height: count > 0 ? `${Math.max(pct, 10)}%` : 2 }}
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
  label, value, small, highlight, alert, trend,
}: {
  label: string; value: string | number;
  small?: boolean; highlight?: boolean; alert?: boolean;
  trend?: "up" | "down" | "flat";
}) {
  return (
    <div className={cn(
      "rounded-2xl border p-4",
      alert ? "border-red-200/60 bg-red-50/40 dark:border-red-800/40 dark:bg-red-950/20" : "border-border bg-muted/20",
    )}>
      <p className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
        {label}
        {trend === "up" && <TrendingUp className="w-3 h-3 text-emerald-500" />}
        {trend === "down" && <TrendingDown className="w-3 h-3 text-red-400" />}
      </p>
      <p className={cn(
        "font-semibold tracking-tight leading-none",
        small ? "text-xl" : "text-3xl",
        highlight && "text-emerald-500",
        alert && value !== 0 && "text-red-500",
      )}>
        {value}
      </p>
    </div>
  );
}

function PriorityBar({ label, count, total, color }: { label: string; count: number; total: number; color: string }) {
  const pct = Math.round((count / total) * 100);
  return (
    <div className="flex items-center gap-2">
      <span className="text-[11px] text-muted-foreground w-16 flex-shrink-0">{label}</span>
      <div className="flex-1 h-1.5 rounded-full bg-muted/40 overflow-hidden">
        <div className={cn("h-full rounded-full transition-all duration-500", color)} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-[11px] text-muted-foreground tabular-nums w-5 text-right">{count}</span>
    </div>
  );
}
