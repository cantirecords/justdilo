"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { isToday, isTomorrow, isPast, parseISO, format, differenceInDays, differenceInHours } from "date-fns";
import {
  LayoutList, Crosshair, BarChart2, Lightbulb,
  Trash2, Clock, ChevronDown, AlertTriangle, Pencil,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import CheckButton from "./CheckButton";
import StatsCard from "./StatsCard";
import IdeasFeed from "./IdeasFeed";
import { cn } from "@/lib/utils";
import { CATEGORY_CONFIG } from "@/lib/categories";
import { detectCategory } from "@/lib/detectCategory";
import TaskCard from "./TaskCard";
import TaskEditModal from "./TaskEditModal";
import ProgressRing from "./ProgressRing";
import type { Task } from "@/lib/types";

type SubView = "list" | "focus" | "ideas" | "stats";
type Bucket = "Overdue" | "Today" | "Tomorrow" | "Upcoming" | "Someday";

type Props = {
  tasks: Task[];
  onUpdate: (id: string, patch: Partial<Task>) => void;
  onDelete: (id: string) => void;
  onAddTask?: (title: string, groupName: string) => Promise<void>;
  onBatchUpdate?: (ids: string[], patch: Partial<Task>) => void;
  onBatchDelete?: (ids: string[]) => void;
};

function hasSpecificTime(due: string): boolean {
  const d = parseISO(due);
  return !(d.getHours() === 23 && d.getMinutes() === 59);
}

function SmartEmpty() {
  const h = new Date().getHours();
  const min = new Date().getMinutes();
  const time = `${h % 12 || 12}:${min.toString().padStart(2, "0")}${h < 12 ? "am" : "pm"}`;

  const messages = [
    h < 9  && `${time} — start the day right. What's on your mind?`,
    h < 12 && `${time} — morning's moving fast. Capture it before it's gone.`,
    h < 14 && `${time} — fresh start after lunch. What needs to happen today?`,
    h < 18 && `${time} — afternoon. Anything you've been putting off?`,
    h < 21 && `${time} — end of day. Brain dump everything before you close out.`,
    `${time} — still going. What's left before you sleep?`,
  ].find(Boolean) as string;

  return (
    <div className="text-center py-12 space-y-2">
      <p className="text-sm text-muted-foreground">{messages}</p>
      <p className="text-xs text-muted-foreground/50">Tap the mic above and speak naturally.</p>
    </div>
  );
}

// ── List view ────────────────────────────────────────────────────────────────

type CompletedBucket = "Completed Today" | "Completed This Week";

const LS_COLLAPSE_KEY = "justdilo:listCollapsed";
const DEFAULT_COLLAPSED: Record<Bucket | CompletedBucket, boolean> = {
  Overdue: false, Today: false, Tomorrow: false, Upcoming: false, Someday: false,
  "Completed Today": true, "Completed This Week": true,
};

function ListView({ tasks, onUpdate, onDelete, onAddTask, onBatchUpdate, onBatchDelete }: Props) {
  const [collapsed, setCollapsed] = useState<Record<Bucket | CompletedBucket, boolean>>(() => {
    if (typeof window === "undefined") return DEFAULT_COLLAPSED;
    try {
      const saved = localStorage.getItem(LS_COLLAPSE_KEY);
      return saved ? { ...DEFAULT_COLLAPSED, ...JSON.parse(saved) } : DEFAULT_COLLAPSED;
    } catch { return DEFAULT_COLLAPSED; }
  });

  const { activeBuckets, completedBuckets } = useMemo(() => {
    const active: Record<Bucket, Record<string, Task[]>> = {
      Overdue: {}, Today: {}, Tomorrow: {}, Upcoming: {}, Someday: {},
    };
    const completed: Record<CompletedBucket, Record<string, Task[]>> = {
      "Completed Today": {}, "Completed This Week": {},
    };

    for (const t of tasks) {
      const key = t.group_name || "General";
      if (t.completed) {
        // Completed tasks due today stay in the Today bucket with strikethrough
        if (t.due_date && isToday(parseISO(t.due_date))) {
          (active["Today"][key] ||= []).push(t);
        } else {
          const completedAt = parseISO(t.created_at);
          const bucket: CompletedBucket = isToday(completedAt) ? "Completed Today" : "Completed This Week";
          (completed[bucket][key] ||= []).push(t);
        }
      } else {
        let b: Bucket = "Someday";
        if (t.due_date) {
          const d = parseISO(t.due_date);
          if (isPast(d) && !isToday(d)) b = "Overdue";
          else if (isToday(d)) b = "Today";
          else if (isTomorrow(d)) b = "Tomorrow";
          else b = "Upcoming";
        }
        (active[b][key] ||= []).push(t);
      }
    }
    return { activeBuckets: active, completedBuckets: completed };
  }, [tasks]);

  const activeOrder: Bucket[] = ["Overdue", "Today", "Tomorrow", "Upcoming", "Someday"];
  const completedOrder: CompletedBucket[] = ["Completed Today", "Completed This Week"];

  const totalActive = activeOrder.reduce(
    (sum, b) => sum + Object.values(activeBuckets[b]).reduce((s, arr) => s + arr.length, 0), 0
  );

  function toggle(b: Bucket | CompletedBucket) {
    setCollapsed((prev) => {
      const next = { ...prev, [b]: !prev[b] };
      try { localStorage.setItem(LS_COLLAPSE_KEY, JSON.stringify(next)); } catch {}
      return next;
    });
  }

  function renderBucket(bucket: Bucket | CompletedBucket, groups: Record<string, Task[]>, isDone = false) {
    const groupNames = Object.keys(groups);
    if (!groupNames.length) return null;
    const totalTasks = groupNames.reduce((sum, g) => sum + groups[g].length, 0);
    const isCollapsed = collapsed[bucket as keyof typeof collapsed];
    const isOverdue = bucket === "Overdue";

    return (
      <section key={bucket}>
        <button
          onClick={() => toggle(bucket)}
          className="w-full flex items-center justify-between px-1 mb-3 group"
        >
          <h2 className={cn(
            "text-xs uppercase tracking-widest font-semibold transition",
            isOverdue ? "text-red-500" : isDone ? "text-muted-foreground/50 group-hover:text-muted-foreground" : "text-muted-foreground group-hover:text-foreground",
          )}>
            {isOverdue && "⚠ "}{bucket}
          </h2>
          <div className={cn("flex items-center gap-2", isOverdue ? "text-red-400" : "text-muted-foreground/60")}>
            <span className="text-[10px]">{totalTasks} task{totalTasks !== 1 ? "s" : ""}</span>
            <ChevronDown className={cn("w-3 h-3 transition-transform duration-150", !isCollapsed && "rotate-180")} />
          </div>
        </button>
        {!isCollapsed && (
          <div className={cn("space-y-3", isDone && "opacity-50")}>
            {groupNames.map((g) => (
              <div key={`${bucket}-${g}`} className={cn(isOverdue && "ring-1 ring-red-400/40 rounded-2xl")}>
                <TaskCard
                  groupName={g}
                  tasks={groups[g]}
                  onUpdate={onUpdate}
                  onDelete={onDelete}
                  onAddTask={isDone ? undefined : onAddTask}
                  onBatchUpdate={isDone ? undefined : onBatchUpdate}
                  onBatchDelete={isDone ? undefined : onBatchDelete}
                />
              </div>
            ))}
          </div>
        )}
      </section>
    );
  }

  return (
    <div className="space-y-8">
      {totalActive === 0 && (
        <div className="text-center py-10 space-y-1">
          <p className="text-sm text-muted-foreground">All caught up.</p>
          <p className="text-xs text-muted-foreground/40">Everything done today.</p>
        </div>
      )}
      {activeOrder.map((bucket) => renderBucket(bucket, activeBuckets[bucket]))}
      {completedOrder.map((bucket) => renderBucket(bucket, completedBuckets[bucket], true))}
    </div>
  );
}

// ── Focus view ───────────────────────────────────────────────────────────────

const PRIORITY_ORDER = { high: 0, med: 1, low: 2 } as const;

function FocusView({ tasks, onUpdate, onDelete }: Props) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);

  // today = ALL tasks due today (pending + completed), so completed ones stay visible with strikethrough
  const { overdue, today } = useMemo(() => {
    const overdue: Task[] = [];
    const today: Task[] = [];

    for (const t of tasks) {
      if (!t.due_date) continue;
      const d = parseISO(t.due_date);
      if (isToday(d)) { today.push(t); continue; }
      if (t.completed) continue;
      if (isPast(d) && !isToday(d)) overdue.push(t);
    }

    const byTime = (a: Task, b: Task) => {
      // Pending first, completed last
      if (!a.completed && b.completed) return -1;
      if (a.completed && !b.completed) return 1;
      const at = hasSpecificTime(a.due_date!);
      const bt = hasSpecificTime(b.due_date!);
      if (at && bt) return parseISO(a.due_date!).getTime() - parseISO(b.due_date!).getTime();
      if (at) return -1;
      if (bt) return 1;
      return (PRIORITY_ORDER[a.priority ?? "low"] ?? 2) - (PRIORITY_ORDER[b.priority ?? "low"] ?? 2);
    };

    return { overdue: overdue.sort(byTime), today: today.sort(byTime) };
  }, [tasks]);

  const tomorrowCount = useMemo(
    () => tasks.filter((t) => !t.completed && t.due_date && isTomorrow(parseISO(t.due_date))).length,
    [tasks],
  );

  const undatedUrgent = useMemo(
    () => tasks.filter((t) => !t.completed && !t.due_date && t.priority === "high"),
    [tasks],
  );

  type FocusItem =
    | { kind: "task"; task: Task; sortTime: number }
    | { kind: "group"; name: string; tasks: Task[]; sortTime: number };

  function buildFocusItems(source: Task[]): FocusItem[] {
    const groupMap = new Map<string, Task[]>();
    for (const t of source) {
      if (t.group_name) {
        if (!groupMap.has(t.group_name)) groupMap.set(t.group_name, []);
        groupMap.get(t.group_name)!.push(t);
      }
    }
    const seen = new Set<string>();
    const items: FocusItem[] = [];
    for (const t of source) {
      if (t.group_name) {
        if (!seen.has(t.group_name)) {
          seen.add(t.group_name);
          const gTasks = groupMap.get(t.group_name)!;
          const times = gTasks
            .filter((g) => !g.completed && g.due_date && hasSpecificTime(g.due_date))
            .map((g) => parseISO(g.due_date!).getTime());
          items.push({ kind: "group", name: t.group_name, tasks: gTasks, sortTime: times.length > 0 ? Math.min(...times) : Infinity });
        }
      } else {
        const sortTime = t.due_date && hasSpecificTime(t.due_date) ? parseISO(t.due_date).getTime() : Infinity;
        items.push({ kind: "task", task: t, sortTime });
      }
    }
    return items;
  }

  const overdueItems = useMemo(() => buildFocusItems(overdue), [overdue]);

  const todayItems = useMemo((): FocusItem[] => {
    const items = buildFocusItems(today);
    return items.sort((a, b) => {
      const aDone = a.kind === "task" ? a.task.completed : a.tasks.every((t) => t.completed);
      const bDone = b.kind === "task" ? b.task.completed : b.tasks.every((t) => t.completed);
      if (!aDone && bDone) return -1;
      if (aDone && !bDone) return 1;
      return a.sortTime - b.sortTime;
    });
  }, [today]);

  const todayDoneCount = today.filter((t) => t.completed).length;
  const todayPendingCount = today.filter((t) => !t.completed).length;
  const totalPending = overdue.length + todayPendingCount;
  const totalTasks = overdue.length + today.length;
  const completionPct = totalTasks > 0 ? Math.round((todayDoneCount / totalTasks) * 100) : 0;
  const allDoneToday = totalTasks > 0 && totalPending === 0;
  const nextTimed = today.find((t) => !t.completed && t.due_date && hasSpecificTime(t.due_date) && parseISO(t.due_date) > now);

  if (!totalTasks && !overdue.length) {
    return (
      <div className="text-center py-20 space-y-3 animate-rise">
        <p className="text-5xl">🎯</p>
        <p className="text-base font-semibold">Nothing due today.</p>
        <p className="text-sm text-muted-foreground">Clear schedule — use the time well.</p>
        {tomorrowCount > 0 && (
          <p className="text-xs text-muted-foreground/50 pt-2">
            {tomorrowCount} task{tomorrowCount !== 1 ? "s" : ""} coming tomorrow.
          </p>
        )}
      </div>
    );
  }

  const barGradient = allDoneToday
    ? "linear-gradient(90deg, #22c55e, #16a34a)"
    : completionPct >= 60
    ? "linear-gradient(90deg, #3b82f6, #6366f1)"
    : "linear-gradient(90deg, #f59e0b, #f97316)";

  return (
    <div className="space-y-5">
      {/* ── Header ── */}
      <div className="space-y-3 animate-rise">
        <div className="flex items-end justify-between px-0.5">
          <div>
            <p className="text-3xl font-black tracking-tight leading-none">
              {allDoneToday ? "All done 🎉" : `${totalPending} left`}
            </p>
            {!allDoneToday && nextTimed && (
              <p className="text-xs text-muted-foreground mt-1.5">
                Next · <span className="font-medium text-foreground">{nextTimed.title}</span>
                {" "}at {format(parseISO(nextTimed.due_date!), "h:mm a")}
              </p>
            )}
            {allDoneToday && (
              <p className="text-xs text-muted-foreground mt-1.5">
                {todayDoneCount} task{todayDoneCount !== 1 ? "s" : ""} completed today
              </p>
            )}
          </div>
          <div className="text-right pb-0.5">
            <p className="text-4xl font-black tabular-nums text-foreground">
              {completionPct}%
            </p>
          </div>
        </div>
        <div className="h-2 bg-muted rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-700 ease-out"
            style={{ width: `${Math.max(completionPct, completionPct > 0 ? 3 : 0)}%`, background: barGradient }}
          />
        </div>
        <p className="text-[10px] text-muted-foreground/50 text-right tabular-nums">
          {todayDoneCount} / {totalTasks} done
        </p>
      </div>

      {/* ── Overdue ── */}
      {overdueItems.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between px-0.5">
            <div className="flex items-center gap-1.5">
              <AlertTriangle className="w-3 h-3 text-red-500" />
              <p className="text-[10px] uppercase tracking-widest font-bold text-red-500">Overdue</p>
            </div>
            <span className="text-[10px] font-bold bg-red-500 text-white rounded-full px-1.5 py-0.5 tabular-nums">
              {overdue.length}
            </span>
          </div>
          {overdueItems.map((item, i) =>
            item.kind === "group" ? (
              <FocusGroupCard
                key={item.name}
                groupName={item.name}
                tasks={item.tasks}
                onUpdate={onUpdate}
                onDelete={onDelete}
                isOverdue
                now={now}
                index={i}
              />
            ) : (
              <FocusRow
                key={item.task.id}
                task={item.task}
                onUpdate={onUpdate}
                onDelete={onDelete}
                overdue
                now={now}
                index={i}
              />
            )
          )}
        </div>
      )}

      {/* ── Today ── */}
      {todayItems.length > 0 && (
        <div className="space-y-2.5">
          {overdue.length > 0 && todayPendingCount > 0 && (
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground/60 px-0.5">Today</p>
          )}
          {todayItems.map((item, i) =>
            item.kind === "group" ? (
              <FocusGroupCard
                key={item.name}
                groupName={item.name}
                tasks={item.tasks}
                onUpdate={onUpdate}
                onDelete={onDelete}
                now={now}
                index={overdue.length + i}
              />
            ) : (
              <FocusRow
                key={item.task.id}
                task={item.task}
                onUpdate={onUpdate}
                onDelete={onDelete}
                now={now}
                index={overdue.length + i}
              />
            )
          )}
        </div>
      )}

      {/* ── Undated urgent ── */}
      {undatedUrgent.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-1.5 px-0.5">
            <span className="text-[10px] uppercase tracking-widest font-bold text-orange-500">⚡ Needs a date</span>
            <span className="text-[10px] font-bold bg-orange-500/20 text-orange-500 rounded-full px-1.5 py-0.5 tabular-nums">
              {undatedUrgent.length}
            </span>
          </div>
          {undatedUrgent.map((t, i) => (
            <FocusRow
              key={t.id}
              task={t}
              onUpdate={onUpdate}
              onDelete={onDelete}
              now={now}
              index={overdue.length + todayItems.length + i}
            />
          ))}
        </div>
      )}

      {tomorrowCount > 0 && (
        <div className="pt-2 border-t border-border/30">
          <p className="text-[10px] uppercase tracking-widest text-muted-foreground/40 px-0.5">
            Tomorrow · {tomorrowCount} task{tomorrowCount !== 1 ? "s" : ""}
          </p>
        </div>
      )}
    </div>
  );
}

function overdueLabelText(dueDate: Date): string {
  const now = new Date();
  const days = differenceInDays(now, dueDate);
  if (days >= 1) return `${days}d overdue`;
  const hrs = differenceInHours(now, dueDate);
  if (hrs >= 1) return `${hrs}h overdue`;
  return "overdue";
}

const RECURRING_LABEL: Record<string, string> = {
  daily: "Daily",
  weekly: "Weekly",
  monthly: "Monthly",
  custom: "Recurring",
};

function RecurringBadge({ type, compact = false }: { type: string; compact?: boolean }) {
  const label = RECURRING_LABEL[type] ?? "Recurring";
  if (compact) {
    return (
      <span className="flex items-center gap-0.5 text-[9px] font-bold text-amber-500 dark:text-amber-400 shrink-0">
        ↻ <span className="hidden">{label}</span>
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-[9px] px-1.5 py-0.5 rounded-full font-semibold uppercase tracking-wide flex-shrink-0 bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-200 border border-amber-200 dark:border-amber-500/40">
      ↻ {label}
    </span>
  );
}

function focusFormatDue(due: string): string {
  const d = parseISO(due);
  const hasTime = hasSpecificTime(due);
  const timeStr = hasTime ? ` · ${format(d, "h:mma").toLowerCase()}` : "";
  if (isToday(d)) return `Today${timeStr}`;
  if (isTomorrow(d)) return `Tomorrow${timeStr}`;
  return format(d, "EEE MMM d") + timeStr;
}

// ── Focus Row (individual / overdue tasks) ────────────────────────────────────

function FocusRow({
  task,
  onUpdate,
  onDelete,
  overdue = false,
  now,
  index = 0,
}: {
  task: Task;
  onUpdate: (id: string, patch: Partial<Task>) => void;
  onDelete: (id: string) => void;
  overdue?: boolean;
  now: Date;
  index?: number;
}) {
  const [editOpen, setEditOpen] = useState(false);
  const [actionsOpen, setActionsOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const touchStartX = useRef(0);

  const hasTimed = task.due_date && hasSpecificTime(task.due_date);
  const dueDate = task.due_date ? parseISO(task.due_date) : null;
  const isFuture = dueDate && dueDate > now;
  const isOverdueActive = overdue && !task.completed;
  const dueSoon = !task.completed && !isOverdueActive && hasTimed && dueDate && isFuture
    && (dueDate.getTime() - now.getTime()) < 60 * 60 * 1000;
  const hasNote = Boolean(task.summary?.trim());
  const effectiveCategory = task.category ?? detectCategory(task.title);
  const catConfig = effectiveCategory ? CATEGORY_CONFIG[effectiveCategory as keyof typeof CATEGORY_CONFIG] : null;
  const isHighPriority = task.priority === "high";

  return (
    <>
      {/* overflow-hidden on outer so border-radius clips the action strip reveal */}
      <div
        className={cn(
          "relative overflow-hidden rounded-2xl border animate-rise transition-opacity",
          isOverdueActive || isHighPriority
            ? "border-red-200 dark:border-red-900/60"
            : "border-border",
          task.completed && "opacity-60",
        )}
        style={{ animationDelay: `${index * 55}ms` }}
      >
        {/* Swipe action strip */}
        <div className="absolute inset-y-0 right-0 flex items-stretch" style={{ width: 88 }}>
          <button
            onClick={() => { setEditOpen(true); setActionsOpen(false); }}
            className="flex-1 flex items-center justify-center bg-muted text-foreground"
            aria-label="Edit"
          >
            <Pencil className="w-4 h-4" />
          </button>
          <button
            onClick={() => onDelete(task.id)}
            className="flex-1 flex items-center justify-center bg-red-500 text-white"
            aria-label="Delete"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>

        {/* Sliding content — bg-background is opaque, hides action strip until swiped */}
        <div
          className="bg-background px-4 py-3 transition-transform duration-200 ease-out"
          style={{ transform: actionsOpen ? "translateX(-88px)" : "translateX(0)" }}
          onTouchStart={(e) => { touchStartX.current = e.touches[0].clientX; }}
          onTouchEnd={(e) => {
            const delta = e.changedTouches[0].clientX - touchStartX.current;
            if (delta < -36) setActionsOpen(true);
            if (delta > 20) setActionsOpen(false);
          }}
          onClick={() => { if (actionsOpen) setActionsOpen(false); }}
        >
          {/* Category badge + status label row */}
          {(catConfig || isOverdueActive || isHighPriority || task.recurring_type || dueSoon || !task.due_date) && (
            <div className="flex items-center gap-2 mb-1.5 flex-wrap">
              {catConfig && (
                <span className={cn("text-[8px] px-1.5 py-0.5 rounded-full font-semibold uppercase tracking-wider flex-shrink-0", catConfig.badge)}>
                  {catConfig.icon} {catConfig.label}
                </span>
              )}
              {task.recurring_type && (
                <RecurringBadge type={task.recurring_type} />
              )}
              {dueSoon && (
                <span className="inline-flex items-center gap-1 text-[9px] px-1.5 py-0.5 rounded-full font-semibold uppercase tracking-wide flex-shrink-0 bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-200 border border-amber-200 dark:border-amber-500/40 animate-pulse">
                  ⏰ Soon
                </span>
              )}
              {isHighPriority && !isOverdueActive && (
                <span className="text-[10px] uppercase tracking-wider text-red-500 font-semibold flex-shrink-0">Urgent</span>
              )}
              {isOverdueActive && dueDate && (
                <span className="text-[10px] uppercase tracking-wider text-red-500 font-semibold flex-shrink-0">
                  {overdueLabelText(dueDate)}
                </span>
              )}
              {!task.due_date && isHighPriority && (
                <span className="text-[8px] px-1.5 py-0.5 rounded-full font-semibold uppercase tracking-wider flex-shrink-0 bg-orange-100 text-orange-800 dark:bg-orange-500/20 dark:text-orange-200 border border-orange-200 dark:border-orange-500/40">
                  No date
                </span>
              )}
            </div>
          )}

          {/* Main task row */}
          <div className="flex items-center gap-2.5">
            <CheckButton
              completed={task.completed}
              onToggle={() => onUpdate(task.id, { completed: !task.completed })}
              size="md"
            />
            <span
              onClick={(e) => { if (!actionsOpen) { e.stopPropagation(); setEditOpen(true); } }}
              className={cn(
                "flex-1 text-sm min-w-0 truncate",
                task.completed ? "line-through text-muted-foreground" : "cursor-pointer",
              )}
            >
              {task.title}
            </span>

            {/* Time — always reserve space, never competes with expand */}
            {hasTimed && dueDate && (
              <span className={cn(
                "flex items-center gap-0.5 text-xs font-semibold shrink-0",
                isOverdueActive ? "text-red-500"
                  : dueSoon ? "text-amber-500 dark:text-amber-400"
                  : isFuture ? "text-blue-500 dark:text-blue-400"
                  : "text-muted-foreground",
              )}>
                <Clock className="w-3 h-3" />
                {format(dueDate, "h:mm a")}
              </span>
            )}

            {/* Expand note */}
            {hasNote && (
              <button
                onClick={(e) => { e.stopPropagation(); setExpanded((v) => !v); }}
                className="text-muted-foreground hover:text-foreground transition flex-shrink-0"
                aria-label={expanded ? "Collapse note" : "Expand note"}
              >
                <ChevronDown className={cn("w-3.5 h-3.5 transition-transform duration-150", expanded && "rotate-180")} />
              </button>
            )}
          </div>

          {/* Due date sub-line (date-only tasks) */}
          {!hasTimed && task.due_date && (
            <div className="flex items-center gap-1 ml-8 mt-0.5">
              <Clock className="w-3 h-3 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">{focusFormatDue(task.due_date)}</span>
            </div>
          )}

          {/* Expanded note */}
          {expanded && hasNote && (
            <div className="ml-8 mt-1.5 text-xs text-muted-foreground bg-muted/40 rounded-lg px-3 py-2 leading-relaxed">
              {task.summary}
            </div>
          )}
        </div>
      </div>

      {editOpen && (
        <TaskEditModal
          task={task}
          onSave={(patch) => onUpdate(task.id, patch)}
          onClose={() => setEditOpen(false)}
        />
      )}
    </>
  );
}

// ── Focus Group Sub-row ───────────────────────────────────────────────────────

function GroupSubRow({
  task,
  isNext,
  now,
  onUpdate,
  onDelete,
}: {
  task: Task;
  isNext: boolean;
  now: Date;
  onUpdate: (id: string, patch: Partial<Task>) => void;
  onDelete: (id: string) => void;
}) {
  const [actionsOpen, setActionsOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const touchStartX = useRef(0);

  const dueDate = task.due_date ? parseISO(task.due_date) : null;
  const hasTimed = task.due_date && hasSpecificTime(task.due_date);
  const isFuture = dueDate && dueDate > now;
  const isLate = !task.completed && hasTimed && dueDate && dueDate < now;
  const dueSoon = !task.completed && hasTimed && dueDate && isFuture
    && (dueDate.getTime() - now.getTime()) < 60 * 60 * 1000;
  const hasNote = Boolean(task.summary?.trim());

  return (
    <>
      <li className="relative overflow-hidden rounded-lg">
        {/* Action strip */}
        <div className="absolute inset-y-0 right-0 flex items-stretch" style={{ width: 88 }}>
          <button
            onClick={() => { setEditOpen(true); setActionsOpen(false); }}
            className="flex-1 flex items-center justify-center bg-muted text-foreground"
            aria-label="Edit"
          >
            <Pencil className="w-4 h-4" />
          </button>
          <button
            onClick={() => onDelete(task.id)}
            className="flex-1 flex items-center justify-center bg-red-500 text-white"
            aria-label="Delete"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>

        {/* Sliding content — bg-background must be opaque to hide action strip */}
        <div
          className="relative bg-background py-0.5 transition-transform duration-200 ease-out"
          style={{ transform: actionsOpen ? "translateX(-88px)" : "translateX(0)" }}
          onTouchStart={(e) => { touchStartX.current = e.touches[0].clientX; }}
          onTouchEnd={(e) => {
            const delta = e.changedTouches[0].clientX - touchStartX.current;
            if (delta < -36) setActionsOpen(true);
            if (delta > 20) setActionsOpen(false);
          }}
          onClick={() => { if (actionsOpen) setActionsOpen(false); }}
        >
          {/* "next" highlight — painted inside the opaque bg */}
          {isNext && !task.completed && (
            <div className="absolute inset-0 rounded-lg bg-blue-500/8 pointer-events-none" />
          )}

          <div className="relative flex items-center gap-2.5">
            <CheckButton
              completed={task.completed}
              onToggle={() => onUpdate(task.id, { completed: !task.completed })}
              size="md"
            />
            <span
              onClick={(e) => { if (!actionsOpen) { e.stopPropagation(); setEditOpen(true); } }}
              className={cn(
                "flex-1 text-sm min-w-0 truncate",
                task.completed ? "line-through text-muted-foreground" : "cursor-pointer",
              )}
            >
              {task.title}
            </span>

            {/* Time — always before expand so it's never pushed off */}
            {hasTimed && dueDate && (
              <span className={cn(
                "text-xs font-semibold tabular-nums shrink-0",
                task.completed
                  ? "text-muted-foreground/50"
                  : isNext
                  ? "text-blue-500 dark:text-blue-400"
                  : dueSoon
                  ? "text-amber-500 dark:text-amber-400"
                  : isLate
                  ? "text-red-500 dark:text-red-400"
                  : isFuture
                  ? "text-muted-foreground"
                  : "text-muted-foreground/60",
              )}>
                {format(dueDate, "h:mm a")}
              </span>
            )}

            {/* Recurring indicator */}
            {task.recurring_type && (
              <span className="text-[9px] font-bold text-amber-500 dark:text-amber-400 shrink-0" title={RECURRING_LABEL[task.recurring_type]}>
                ↻
              </span>
            )}

            {/* Status badges — mutually exclusive, priority order */}
            {isNext && !task.completed && (
              <span className="text-[8px] font-bold uppercase tracking-widest text-blue-600 dark:text-blue-300 shrink-0 bg-blue-500/15 dark:bg-blue-500/25 border border-blue-400/30 dark:border-blue-400/40 rounded px-1.5 py-0.5">
                now
              </span>
            )}
            {!isNext && dueSoon && !task.completed && (
              <span className="text-[8px] font-bold uppercase tracking-widest text-amber-600 dark:text-amber-300 shrink-0 bg-amber-500/15 dark:bg-amber-500/25 border border-amber-400/30 dark:border-amber-400/40 rounded px-1.5 py-0.5 animate-pulse">
                soon
              </span>
            )}
            {!isNext && isLate && !task.completed && (
              <span className="text-[8px] font-bold uppercase tracking-widest text-red-600 dark:text-red-300 shrink-0 bg-red-500/15 dark:bg-red-500/25 border border-red-400/30 dark:border-red-400/40 rounded px-1.5 py-0.5">
                late
              </span>
            )}

            {/* Note expand */}
            {hasNote && (
              <button
                onClick={(e) => { e.stopPropagation(); setExpanded((v) => !v); }}
                className="text-muted-foreground hover:text-foreground transition flex-shrink-0"
                aria-label={expanded ? "Collapse" : "Expand"}
              >
                <ChevronDown className={cn("w-3.5 h-3.5 transition-transform duration-150", expanded && "rotate-180")} />
              </button>
            )}
          </div>

          {expanded && hasNote && (
            <div className="ml-8 mt-1.5 text-xs text-muted-foreground bg-muted/40 rounded-lg px-3 py-2 leading-relaxed">
              {task.summary}
            </div>
          )}
        </div>
      </li>

      {editOpen && (
        <TaskEditModal
          task={task}
          onSave={(patch) => onUpdate(task.id, patch)}
          onClose={() => setEditOpen(false)}
        />
      )}
    </>
  );
}

// ── Focus Group Card ──────────────────────────────────────────────────────────

function FocusGroupCard({
  groupName,
  tasks,
  onUpdate,
  onDelete,
  isOverdue = false,
  now,
  index = 0,
}: {
  groupName: string;
  tasks: Task[];
  onUpdate: (id: string, patch: Partial<Task>) => void;
  onDelete: (id: string) => void;
  isOverdue?: boolean;
  now: Date;
  index?: number;
}) {
  const doneCount = tasks.filter((t) => t.completed).length;
  const total = tasks.length;
  const allDone = doneCount === total;

  const sorted = [...tasks].sort((a, b) => {
    if (!a.completed && b.completed) return -1;
    if (a.completed && !b.completed) return 1;
    const at = a.due_date && hasSpecificTime(a.due_date) ? parseISO(a.due_date).getTime() : Infinity;
    const bt = b.due_date && hasSpecificTime(b.due_date) ? parseISO(b.due_date).getTime() : Infinity;
    return at - bt;
  });

  const nextTask = sorted.find(
    (t) => !t.completed && t.due_date && hasSpecificTime(t.due_date) && parseISO(t.due_date) > now,
  );
  const groupDueSoon = !isOverdue && nextTask?.due_date
    && (parseISO(nextTask.due_date).getTime() - now.getTime()) < 60 * 60 * 1000;

  const due = tasks.find((t) => t.due_date)?.due_date;
  const hasHighPriority = tasks.some((t) => t.priority === "high");
  const category = tasks.find((t) => t.category)?.category
    ?? detectCategory(groupName)
    ?? tasks.reduce<string | null>((found, t) => found ?? detectCategory(t.title), null);
  const catConfig = category ? CATEGORY_CONFIG[category as keyof typeof CATEGORY_CONFIG] : null;
  const showRedBorder = isOverdue || hasHighPriority;

  // Recurring: if all pending tasks share the same type, show that; otherwise "Recurring"
  const recurringTypes = [...new Set(tasks.filter((t) => t.recurring_type).map((t) => t.recurring_type!))];
  const groupRecurringType = recurringTypes.length === 1 ? recurringTypes[0] : recurringTypes.length > 1 ? "custom" : null;

  // For overdue groups, find how long overdue (use earliest due date)
  const earliestDue = tasks
    .filter((t) => t.due_date)
    .map((t) => parseISO(t.due_date!))
    .sort((a, b) => a.getTime() - b.getTime())[0];
  const overdueLabel = isOverdue && earliestDue ? overdueLabelText(earliestDue) : null;

  return (
    <div
      className={cn(
        "rounded-2xl border bg-muted/20 p-4 animate-rise transition-opacity",
        showRedBorder ? "border-red-200 dark:border-red-900/60" : "border-border",
        allDone && "opacity-60",
      )}
      style={{ animationDelay: `${index * 55}ms` }}
    >
      {/* Header — mirrors TaskCard */}
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5 flex-wrap">
            {catConfig && (
              <span className={cn("text-[8px] px-1.5 py-0.5 rounded-full font-semibold flex-shrink-0 uppercase tracking-wider", catConfig.badge)}>
                {catConfig.icon} {catConfig.label}
              </span>
            )}
            {groupRecurringType && (
              <RecurringBadge type={groupRecurringType} />
            )}
            <h3 className={cn("font-medium leading-tight", allDone && "line-through text-muted-foreground")}>
              {groupName}
            </h3>
            {isOverdue && overdueLabel && (
              <span className="text-[10px] uppercase tracking-wider text-red-500 font-semibold flex-shrink-0">{overdueLabel}</span>
            )}
            {hasHighPriority && !isOverdue && (
              <span className="text-[10px] uppercase tracking-wider text-red-500 font-semibold flex-shrink-0">Urgent</span>
            )}
            {groupDueSoon && (
              <span className="inline-flex items-center gap-1 text-[9px] px-1.5 py-0.5 rounded-full font-semibold uppercase tracking-wide flex-shrink-0 bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-200 border border-amber-200 dark:border-amber-500/40 animate-pulse">
                ⏰ Soon
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {due && (
              <span className={cn("flex items-center gap-1 text-xs", isOverdue ? "text-red-500/80" : "text-muted-foreground")}>
                <Clock className="w-3 h-3" />
                {focusFormatDue(due)}
              </span>
            )}
            {!isOverdue && nextTask?.due_date && (
              <span className="text-xs text-muted-foreground/80">
                · next {format(parseISO(nextTask.due_date), "h:mm a")}
              </span>
            )}
          </div>
        </div>
        <ProgressRing total={total} completed={doneCount} size={36} />
      </div>

      {/* Sub-rows */}
      <ul className="space-y-1.5 mt-3">
        {sorted.map((t) => (
          <GroupSubRow
            key={t.id}
            task={t}
            isNext={nextTask?.id === t.id}
            now={now}
            onUpdate={onUpdate}
            onDelete={onDelete}
          />
        ))}
      </ul>
    </div>
  );
}

// ── Main export ──────────────────────────────────────────────────────────────

const SUB_VIEWS: { id: SubView; label: string; icon: React.ElementType }[] = [
  { id: "focus", label: "Focus", icon: Crosshair },
  { id: "list",  label: "List",  icon: LayoutList },
  { id: "ideas", label: "Ideas", icon: Lightbulb },
  { id: "stats", label: "Stats", icon: BarChart2 },
];

export default function TaskFeed({ tasks, onUpdate, onDelete, onAddTask, onBatchUpdate, onBatchDelete }: Props) {
  const [subView, setSubView] = useState<SubView>("focus");

  return (
    <div>
      {/* Single-row nav */}
      <div className="flex items-center gap-0.5 mb-5 bg-muted/40 rounded-2xl p-1">
        {SUB_VIEWS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setSubView(id)}
            className={cn(
              "flex-1 flex items-center justify-center gap-1 py-1.5 rounded-xl text-[10px] font-medium transition-all duration-150",
              subView === id
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Icon className="w-3 h-3 flex-shrink-0" />
            {label}
          </button>
        ))}
      </div>

      {subView === "ideas" && <IdeasFeed />}
      {subView === "stats" && <StatsCard tasks={tasks} />}

      {subView === "list" && (
        tasks.length === 0 ? <SmartEmpty /> : (
          <ListView
            tasks={tasks}
            onUpdate={onUpdate}
            onDelete={onDelete}
            onAddTask={onAddTask}
            onBatchUpdate={onBatchUpdate}
            onBatchDelete={onBatchDelete}
          />
        )
      )}
      {subView === "focus" && (
        <FocusView tasks={tasks} onUpdate={onUpdate} onDelete={onDelete} />
      )}
    </div>
  );
}
