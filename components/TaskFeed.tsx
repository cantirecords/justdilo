"use client";
import { useMemo, useRef, useState } from "react";
import { isToday, isTomorrow, isPast, parseISO, format } from "date-fns";
import {
  LayoutList, Crosshair, BarChart2, Lightbulb,
  Trash2, Clock, ChevronDown, AlertTriangle, Pencil,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import CheckButton from "./CheckButton";
import StatsCard from "./StatsCard";
import IdeasFeed from "./IdeasFeed";
import { cn } from "@/lib/utils";
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
  const now = new Date();

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
      {overdue.length > 0 && (
        <div className="space-y-2.5">
          <div className="flex items-center gap-1.5 px-0.5">
            <AlertTriangle className="w-3 h-3 text-red-500" />
            <p className="text-[10px] uppercase tracking-widest font-bold text-red-500">
              Overdue · {overdue.length}
            </p>
          </div>
          {overdue.map((t, i) => (
            <FocusRow key={t.id} task={t} onUpdate={onUpdate} onDelete={onDelete} overdue index={i} />
          ))}
        </div>
      )}

      {/* ── Today — completed tasks STAY HERE with strikethrough ── */}
      {today.length > 0 && (
        <div className="space-y-2.5">
          {overdue.length > 0 && todayPendingCount > 0 && (
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground/60 px-0.5">Today</p>
          )}
          {today.map((t, i) => (
            <FocusRow key={t.id} task={t} onUpdate={onUpdate} onDelete={onDelete} index={overdue.length + i} />
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

function FocusRow({
  task,
  onUpdate,
  onDelete,
  overdue = false,
  index = 0,
}: {
  task: Task;
  onUpdate: (id: string, patch: Partial<Task>) => void;
  onDelete: (id: string) => void;
  overdue?: boolean;
  index?: number;
}) {
  const [editOpen, setEditOpen] = useState(false);
  const [actionsOpen, setActionsOpen] = useState(false);
  const touchStartX = useRef(0);
  const hasTimed = task.due_date && hasSpecificTime(task.due_date);
  const dueDate = task.due_date ? parseISO(task.due_date) : null;
  const isFuture = dueDate && dueDate > new Date();

  // Direct toggle — no fade-out. Completed tasks stay visible with strikethrough.
  function handleToggleComplete() {
    onUpdate(task.id, { completed: !task.completed });
  }

  const overdueGlow = "0 0 0 1.5px rgba(239,68,68,0.7), 0 0 24px rgba(239,68,68,0.22), 0 4px 12px rgba(0,0,0,0.10)";
  const normalShadow = "0 0 0 1px rgba(120,120,180,0.10), 0 4px 16px rgba(0,0,0,0.09), 0 1px 3px rgba(0,0,0,0.05)";

  return (
    <>
      <div
        className={cn(
          "relative overflow-hidden rounded-2xl border bg-background animate-rise transition-all duration-300",
          overdue && !task.completed ? "border-red-400/50" : "border-border/60",
          task.completed && "opacity-40",
        )}
        style={{
          animationDelay: `${index * 55}ms`,
          boxShadow: overdue && !task.completed ? overdueGlow : normalShadow,
        }}
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

        {/* Sliding content */}
        <div
          className={cn(
            "flex items-center gap-3.5 px-4 py-4 transition-transform duration-200 ease-out",
            overdue && !task.completed ? "bg-red-50/60 dark:bg-red-950/40" : "bg-background",
          )}
          style={{ transform: actionsOpen ? "translateX(-88px)" : "translateX(0)" }}
          onTouchStart={(e) => { touchStartX.current = e.touches[0].clientX; }}
          onTouchEnd={(e) => {
            const delta = e.changedTouches[0].clientX - touchStartX.current;
            if (delta < -36) setActionsOpen(true);
            if (delta > 20) setActionsOpen(false);
          }}
          onClick={() => { if (actionsOpen) setActionsOpen(false); }}
        >
          <CheckButton completed={task.completed} onToggle={handleToggleComplete} size="lg" />

          <div className="flex-1 min-w-0">
            <p
              onClick={(e) => { if (!actionsOpen) { e.stopPropagation(); setEditOpen(true); } }}
              className={cn(
                "text-sm font-semibold leading-snug cursor-pointer",
                task.completed ? "line-through text-muted-foreground" : "text-foreground",
                overdue && !task.completed && "text-red-600 dark:text-red-400",
              )}
            >
              {task.title}
            </p>
            <div className="flex items-center gap-2 mt-0.5 flex-wrap">
              {task.group_name && (
                <span className="text-[10px] text-muted-foreground/60 font-medium">{task.group_name}</span>
              )}
              {hasTimed && dueDate && (
                <span className={cn(
                  "flex items-center gap-0.5 text-[10px] font-semibold",
                  overdue ? "text-red-500" : isFuture ? "text-blue-500 dark:text-blue-400" : "text-muted-foreground",
                )}>
                  <Clock className="w-3 h-3" />
                  {format(dueDate, "h:mm a")}
                  {!task.completed && (
                    <span className="text-muted-foreground/50 font-normal ml-0.5">
                      · {formatDistanceToNow(dueDate, { addSuffix: true })}
                    </span>
                  )}
                </span>
              )}
              {overdue && !hasTimed && dueDate && (
                <span className="text-[10px] text-red-500 font-semibold">
                  {formatDistanceToNow(dueDate, { addSuffix: true })}
                </span>
              )}
              {task.recurring_type && (
                <span className="text-[10px] text-muted-foreground/50">↻ {task.recurring_type}</span>
              )}
            </div>
            {task.summary && !task.completed && (
              <p className="text-[11px] text-muted-foreground/60 mt-1 leading-relaxed line-clamp-2">
                {task.summary}
              </p>
            )}
          </div>

        </div>

        {/* Red glow ring for overdue — pulsing animation */}
        {overdue && !task.completed && (
          <div
            className="absolute inset-0 rounded-2xl pointer-events-none z-10 animate-pulse"
            style={{ boxShadow: "inset 0 0 0 1.5px rgba(239,68,68,0.65)" }}
          />
        )}
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

// ── Main export ──────────────────────────────────────────────────────────────

const SUB_VIEWS: { id: SubView; label: string; icon: React.ElementType }[] = [
  { id: "list",  label: "List",  icon: LayoutList },
  { id: "focus", label: "Focus", icon: Crosshair },
  { id: "ideas", label: "Ideas", icon: Lightbulb },
  { id: "stats", label: "Stats", icon: BarChart2 },
];

export default function TaskFeed({ tasks, onUpdate, onDelete, onAddTask, onBatchUpdate, onBatchDelete }: Props) {
  const [subView, setSubView] = useState<SubView>("list");

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
