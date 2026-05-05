"use client";
import { useEffect, useMemo, useState } from "react";
import { parseISO, isAfter, isBefore, isToday, isPast, startOfWeek, subWeeks, format } from "date-fns";
import { cn } from "@/lib/utils";
import { CATEGORY_CONFIG } from "@/lib/categories";
import type { Idea, Task, TaskCategory } from "@/lib/types";

export default function StatsCard({ tasks }: { tasks: Task[] }) {
  const [ideas, setIdeas] = useState<Idea[]>([]);

  useEffect(() => {
    fetch("/api/ideas")
      .then((r) => r.json())
      .then(({ ideas }) => setIdeas(ideas ?? []))
      .catch(() => {});
  }, []);

  const s = useMemo(() => {
    const now = new Date();
    const weekStart = startOfWeek(now, { weekStartsOn: 1 });
    const prevWeekStart = subWeeks(weekStart, 1);

    const active = tasks.filter((t) => !t.completed);
    const done = tasks.filter((t) => t.completed);
    const overdue = active.filter((t) => t.due_date && isPast(parseISO(t.due_date)) && !isToday(parseISO(t.due_date)));
    const dueToday = active.filter((t) => t.due_date && isToday(parseISO(t.due_date)));

    const doneThisWeek = done.filter((t) => isAfter(parseISO(t.created_at), weekStart));
    const doneLastWeek = done.filter((t) =>
      isAfter(parseISO(t.created_at), prevWeekStart) && isBefore(parseISO(t.created_at), weekStart),
    );
    const createdThisWeek = tasks.filter((t) => isAfter(parseISO(t.created_at), weekStart));
    const rate = createdThisWeek.length > 0 ? Math.round((doneThisWeek.length / createdThisWeek.length) * 100) : 0;

    // Streak
    const doneDays = new Set(done.map((t) => format(parseISO(t.created_at), "yyyy-MM-dd")));
    let streak = 0;
    const d = new Date();
    while (doneDays.has(format(d, "yyyy-MM-dd"))) {
      streak++;
      d.setDate(d.getDate() - 1);
    }

    // Priority
    const highPending = active.filter((t) => t.priority === "high").length;
    const medPending = active.filter((t) => t.priority === "med").length;
    const lowPending = active.filter((t) => t.priority === "low").length;

    // Top categories
    const catCounts: Partial<Record<TaskCategory, number>> = {};
    for (const t of active) {
      if (t.category) catCounts[t.category] = (catCounts[t.category] ?? 0) + 1;
    }
    const topCats = Object.entries(catCounts).sort((a, b) => b[1] - a[1]).slice(0, 3) as [TaskCategory, number][];

    // Activity bar chart
    const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
    const dayDone: Record<string, number> = {};
    for (const t of done) {
      const day = format(parseISO(t.created_at), "EEE");
      dayDone[day] = (dayDone[day] ?? 0) + 1;
    }
    const maxBar = Math.max(...days.map((d) => dayDone[d] ?? 0), 1);
    const todayLabel = format(now, "EEE");

    // Recurring tasks
    const recurringCount = active.filter((t) => t.recurring_type).length;

    return {
      active: active.length, done: done.length, overdue: overdue.length, dueToday: dueToday.length,
      doneThisWeek: doneThisWeek.length, doneLastWeek: doneLastWeek.length,
      rate, streak, highPending, medPending, lowPending, topCats,
      days, dayDone, maxBar, todayLabel, recurringCount,
      activeProjects: new Set(active.map((t) => t.group_name).filter(Boolean)).size,
    };
  }, [tasks]);

  const ideaStats = useMemo(() => {
    const totalInsights = ideas.reduce((n, i) => n + i.key_insights.length, 0);
    const totalActions = ideas.reduce((n, i) => n + i.action_items.length, 0);
    const allTags = ideas.flatMap((i) => i.tags);
    const tagCounts: Record<string, number> = {};
    for (const tag of allTags) tagCounts[tag] = (tagCounts[tag] ?? 0) + 1;
    const topTags = Object.entries(tagCounts).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([t]) => t);
    const sharedCount = ideas.filter((i) => (i.collaborators?.length ?? 0) > 0).length;
    return { total: ideas.length, totalInsights, totalActions, topTags, sharedCount };
  }, [ideas]);

  // Hero message
  const heroMsg = (() => {
    if (s.done === 0) return "Your story starts here.";
    if (s.streak >= 7) return `${s.streak} days straight. You're unstoppable. 🔥`;
    if (s.streak >= 3) return `${s.streak}-day streak. Don't stop now. 🔥`;
    if (s.rate >= 80) return "You're in the zone this week. 💫";
    if (s.doneThisWeek > s.doneLastWeek) return "Better than last week. Keep it going.";
    if (s.done >= 100) return `${s.done} things done. Seriously impressive.`;
    if (s.done >= 50) return "Over 50 things done. That's real momentum.";
    if (s.overdue > 3) return "A few things need your attention.";
    return "Every done counts. Keep moving.";
  })();

  return (
    <div className="space-y-3 animate-rise pb-6">

      {/* ── Hero ── */}
      <div className="rounded-2xl bg-gradient-to-br from-foreground/5 via-muted/30 to-muted/10 border border-border p-5">
        <p className="text-2xl font-black tracking-tight leading-tight">{heroMsg}</p>
        <div className="flex items-end gap-4 mt-4">
          <div>
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground">All time done</p>
            <p className="text-5xl font-black tabular-nums leading-none mt-0.5">{s.done}</p>
          </div>
          {ideaStats.total > 0 && (
            <div className="pb-1">
              <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Ideas captured</p>
              <p className="text-3xl font-black tabular-nums leading-none mt-0.5 text-violet-500 dark:text-violet-400">
                {ideaStats.total}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* ── Quick pulse row ── */}
      <div className="grid grid-cols-3 gap-2.5">
        <Pulse
          emoji={s.streak >= 3 ? "🔥" : "📅"}
          label="streak"
          value={s.streak > 0 ? `${s.streak}d` : "—"}
          glow={s.streak >= 3}
        />
        <Pulse
          emoji="✅"
          label="this week"
          value={s.doneThisWeek}
          up={s.doneThisWeek > s.doneLastWeek}
          down={s.doneThisWeek < s.doneLastWeek && s.doneLastWeek > 0}
        />
        <Pulse
          emoji="⚡"
          label="due today"
          value={s.dueToday}
          alert={s.dueToday > 0}
        />
      </div>

      {/* ── Ideas space ── */}
      {ideaStats.total > 0 && (
        <div className="rounded-2xl border border-violet-200/50 dark:border-violet-800/30 bg-violet-50/30 dark:bg-violet-950/10 p-4">
          <p className="text-xs font-bold text-violet-600 dark:text-violet-400 mb-3 flex items-center gap-1.5">
            💡 Your idea space
          </p>
          <div className="grid grid-cols-3 gap-3 mb-3">
            <div className="text-center">
              <p className="text-2xl font-black tabular-nums text-violet-600 dark:text-violet-400">{ideaStats.total}</p>
              <p className="text-[9px] uppercase tracking-wide text-muted-foreground mt-0.5">thoughts</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-black tabular-nums text-violet-600 dark:text-violet-400">{ideaStats.totalInsights}</p>
              <p className="text-[9px] uppercase tracking-wide text-muted-foreground mt-0.5">insights</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-black tabular-nums text-violet-600 dark:text-violet-400">{ideaStats.totalActions}</p>
              <p className="text-[9px] uppercase tracking-wide text-muted-foreground mt-0.5">actions</p>
            </div>
          </div>
          {ideaStats.topTags.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {ideaStats.topTags.map((tag) => (
                <span key={tag} className="text-[10px] px-2 py-0.5 rounded-full bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300 font-medium">
                  {tag}
                </span>
              ))}
            </div>
          )}
          {ideaStats.sharedCount > 0 && (
            <p className="text-[10px] text-muted-foreground mt-2">
              🤝 {ideaStats.sharedCount} idea{ideaStats.sharedCount !== 1 ? "s" : ""} shared with others
            </p>
          )}
        </div>
      )}

      {/* ── Win rate + on your plate ── */}
      <div className="grid grid-cols-2 gap-2.5">
        <div className="rounded-2xl border border-border bg-muted/20 p-4">
          <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">Win rate</p>
          <p className={cn(
            "text-4xl font-black tabular-nums leading-none",
            s.rate >= 80 ? "text-emerald-500" : s.rate >= 50 ? "text-foreground" : "text-muted-foreground",
          )}>
            {s.rate}%
          </p>
          <p className="text-[9px] text-muted-foreground mt-1.5">this week's tasks</p>
        </div>
        <div className={cn(
          "rounded-2xl border p-4",
          s.overdue > 0 ? "border-red-200/60 dark:border-red-800/40 bg-red-50/30 dark:bg-red-950/10" : "border-border bg-muted/20",
        )}>
          <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">On your plate</p>
          <p className={cn("text-4xl font-black tabular-nums leading-none", s.overdue > 0 && "text-red-500")}>
            {s.active}
          </p>
          {s.overdue > 0 && (
            <p className="text-[9px] text-red-500 mt-1.5">{s.overdue} need attention</p>
          )}
          {s.overdue === 0 && (
            <p className="text-[9px] text-muted-foreground mt-1.5">{s.activeProjects} project{s.activeProjects !== 1 ? "s" : ""}</p>
          )}
        </div>
      </div>

      {/* ── Priority breakdown ── */}
      {s.active > 0 && (s.highPending > 0 || s.medPending > 0 || s.lowPending > 0) && (
        <div className="rounded-2xl border border-border bg-muted/20 p-4">
          <p className="text-xs font-semibold mb-3">What's queued</p>
          <div className="space-y-2.5">
            {s.highPending > 0 && <Bar label="🔴 Urgent" count={s.highPending} total={s.active} color="bg-red-500" />}
            {s.medPending > 0 && <Bar label="🟡 Medium" count={s.medPending} total={s.active} color="bg-amber-400" />}
            {s.lowPending > 0 && <Bar label="⚪ Low" count={s.lowPending} total={s.active} color="bg-slate-400" />}
            {s.recurringCount > 0 && <Bar label="↻ Recurring" count={s.recurringCount} total={s.active} color="bg-amber-500" />}
          </div>
        </div>
      )}

      {/* ── Top categories ── */}
      {s.topCats.length > 0 && (
        <div className="rounded-2xl border border-border bg-muted/20 p-4">
          <p className="text-xs font-semibold mb-3">Where your energy goes</p>
          <div className="space-y-2">
            {s.topCats.map(([cat, count]) => {
              const cfg = CATEGORY_CONFIG[cat];
              return (
                <div key={cat} className="flex items-center justify-between">
                  <span className={cn("text-xs px-2 py-0.5 rounded-full font-medium", cfg.badge)}>
                    {cfg.icon} {cfg.label}
                  </span>
                  <span className="text-xs text-muted-foreground tabular-nums">{count} pending</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Activity chart ── */}
      <div className="rounded-2xl border border-border bg-muted/20 p-4">
        <div className="flex items-center justify-between mb-4">
          <p className="text-xs font-semibold">Activity by day</p>
          <p className="text-[10px] text-muted-foreground tabular-nums">{s.done} total closed</p>
        </div>
        <div className="flex items-end gap-1.5">
          {s.days.map((day) => {
            const count = s.dayDone[day] ?? 0;
            const pct = Math.round((count / s.maxBar) * 100);
            const isT = day === s.todayLabel;
            return (
              <div key={day} className="flex-1 flex flex-col items-center gap-1.5">
                <span className={cn("text-[9px] tabular-nums", count > 0 ? "text-foreground" : "text-transparent")}>
                  {count || ""}
                </span>
                <div className="w-full flex items-end" style={{ height: 44 }}>
                  <div
                    className={cn(
                      "w-full rounded-t-md transition-all duration-500",
                      isT ? "bg-foreground" : "bg-muted-foreground/25",
                    )}
                    style={{ height: count > 0 ? `${Math.max(pct, 10)}%` : 2 }}
                  />
                </div>
                <span className={cn("text-[9px] font-medium", isT ? "text-foreground" : "text-muted-foreground/50")}>
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

function Pulse({
  emoji, label, value, glow, up, down, alert,
}: {
  emoji: string; label: string; value: string | number;
  glow?: boolean; up?: boolean; down?: boolean; alert?: boolean;
}) {
  return (
    <div className={cn(
      "rounded-2xl border p-3 text-center",
      glow ? "border-amber-300/60 dark:border-amber-700/40 bg-amber-50/30 dark:bg-amber-950/10" :
      alert ? "border-blue-200/50 dark:border-blue-800/30 bg-blue-50/20 dark:bg-blue-950/10" :
      "border-border bg-muted/20",
    )}>
      <p className="text-lg">{emoji}</p>
      <p className={cn(
        "text-xl font-black tabular-nums leading-tight mt-0.5",
        glow ? "text-amber-500 dark:text-amber-400" :
        alert ? "text-blue-500 dark:text-blue-400" : "text-foreground",
      )}>
        {value}
        {up && <span className="text-[10px] text-emerald-500 ml-0.5">↑</span>}
        {down && <span className="text-[10px] text-red-400 ml-0.5">↓</span>}
      </p>
      <p className="text-[9px] uppercase tracking-wide text-muted-foreground mt-0.5">{label}</p>
    </div>
  );
}

function Bar({ label, count, total, color }: { label: string; count: number; total: number; color: string }) {
  const pct = Math.round((count / total) * 100);
  return (
    <div className="flex items-center gap-2">
      <span className="text-[11px] text-muted-foreground w-20 flex-shrink-0">{label}</span>
      <div className="flex-1 h-1.5 rounded-full bg-muted/40 overflow-hidden">
        <div className={cn("h-full rounded-full transition-all duration-500", color)} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-[11px] text-muted-foreground tabular-nums w-4 text-right">{count}</span>
    </div>
  );
}
