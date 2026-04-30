"use client";
import { useMemo, useRef, useState } from "react";
import { isToday, isTomorrow, isPast, parseISO, format } from "date-fns";
import {
  LayoutList, Kanban, Crosshair, BarChart2,
  Trash2, Clock, ChevronDown, Plus, Check, AlertTriangle, Pencil,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import CheckButton from "./CheckButton";
import RescheduleMenu from "./RescheduleMenu";
import StatsCard from "./StatsCard";
import { cn } from "@/lib/utils";
import { detectEnergy, energyConfig } from "@/lib/energy";
import TaskCard from "./TaskCard";
import TaskEditModal from "./TaskEditModal";
import ProgressRing from "./ProgressRing";
import type { Task } from "@/lib/types";

type SubView = "list" | "board" | "focus" | "stats";
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

function ListView({ tasks, onUpdate, onDelete, onAddTask, onBatchUpdate, onBatchDelete }: Props) {
  const [collapsed, setCollapsed] = useState<Record<Bucket | CompletedBucket, boolean>>({
    Overdue: false, Today: false, Tomorrow: false, Upcoming: false, Someday: false,
    "Completed Today": true, "Completed This Week": true,
  });

  const { activeBuckets, completedBuckets } = useMemo(() => {
    const active: Record<Bucket, Record<string, Task[]>> = {
      Overdue: {}, Today: {}, Tomorrow: {}, Upcoming: {}, Someday: {},
    };
    const completed: Record<CompletedBucket, Record<string, Task[]>> = {
      "Completed Today": {}, "Completed This Week": {},
    };

    for (const t of tasks) {
      if (t.completed) {
        const createdAt = parseISO(t.created_at);
        const bucket: CompletedBucket = isToday(createdAt) ? "Completed Today" : "Completed This Week";
        const key = t.group_name || "General";
        (completed[bucket][key] ||= []).push(t);
      } else {
        let b: Bucket = "Someday";
        if (t.due_date) {
          const d = parseISO(t.due_date);
          // Past but not today = genuinely overdue
          if (isPast(d) && !isToday(d)) b = "Overdue";
          else if (isToday(d)) b = "Today";
          else if (isTomorrow(d)) b = "Tomorrow";
          else b = "Upcoming";
        }
        const key = t.group_name || "General";
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
    setCollapsed((prev) => ({ ...prev, [b]: !prev[b] }));
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

// ── Board view ───────────────────────────────────────────────────────────────

function BoardView({ tasks, onUpdate, onDelete, onAddTask }: Props) {
  const [addingToGroup, setAddingToGroup] = useState<string | null>(null);

  const columns = useMemo(() => {
    const map: Record<string, Task[]> = {};
    for (const t of tasks) {
      const key = t.group_name || "General";
      (map[key] ||= []).push(t);
    }
    return Object.entries(map).sort((a, b) => {
      const aHigh = a[1].some((t) => t.priority === "high");
      const bHigh = b[1].some((t) => t.priority === "high");
      return Number(bHigh) - Number(aHigh);
    });
  }, [tasks]);

  if (!columns.length) return <SmartEmpty />;

  return (
    <div className="flex gap-3 overflow-x-auto pb-4 -mx-5 px-5 snap-x snap-mandatory">
      {columns.map(([group, colTasks]) => {
        const completed = colTasks.filter((t) => t.completed).length;
        const hasHigh = colTasks.some((t) => t.priority === "high" && !t.completed);
        return (
          <div
            key={group}
            className={cn(
              "flex-shrink-0 w-64 snap-start rounded-2xl border bg-muted/20 p-3 flex flex-col gap-2",
              hasHigh ? "border-red-200 dark:border-red-900/60" : "border-border",
            )}
          >
            <div className="flex items-center justify-between mb-1 px-0.5">
              <span className="text-sm font-medium leading-tight truncate">{group}</span>
              <div className="flex items-center gap-1.5 flex-shrink-0">
                {hasHigh && (
                  <span className="text-[9px] uppercase tracking-wider text-red-500 font-semibold">Urgent</span>
                )}
                <ProgressRing total={colTasks.length} completed={completed} size={28} />
                {onAddTask && (
                  <button
                    onClick={() => setAddingToGroup(addingToGroup === group ? null : group)}
                    className="p-1 rounded-full hover:bg-muted text-muted-foreground hover:text-foreground transition"
                    aria-label="Add task"
                  >
                    <Plus className="w-3 h-3" />
                  </button>
                )}
              </div>
            </div>
            <div className="space-y-1.5">
              {colTasks.map((t) => (
                <BoardCard key={t.id} task={t} onUpdate={onUpdate} onDelete={onDelete} />
              ))}
            </div>
            {addingToGroup === group && onAddTask && (
              <BoardAddInput
                groupName={group}
                onAdd={onAddTask}
                onDone={() => setAddingToGroup(null)}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

function BoardAddInput({
  groupName,
  onAdd,
  onDone,
}: {
  groupName: string;
  onAdd: (title: string, group: string) => Promise<void>;
  onDone: () => void;
}) {
  const [value, setValue] = useState("");
  const [saving, setSaving] = useState(false);
  const ref = useRef<HTMLInputElement>(null);

  async function submit() {
    if (!value.trim() || saving) return;
    setSaving(true);
    await onAdd(value.trim(), groupName);
    setValue("");
    setSaving(false);
    onDone();
  }

  return (
    <div className="flex items-center gap-1.5 border-t border-border/40 pt-2 mt-1">
      <input
        ref={ref}
        autoFocus
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="New task…"
        disabled={saving}
        onKeyDown={(e) => {
          if (e.key === "Enter") submit();
          if (e.key === "Escape") onDone();
        }}
        onBlur={() => { if (!value.trim()) onDone(); }}
        className="flex-1 text-xs bg-transparent outline-none placeholder:text-muted-foreground/40"
      />
      {value.trim() && (
        <button onClick={submit} className="text-muted-foreground hover:text-foreground transition">
          <Check className="w-3 h-3" />
        </button>
      )}
    </div>
  );
}

function BoardCard({
  task,
  onUpdate,
  onDelete,
}: {
  task: Task;
  onUpdate: (id: string, patch: Partial<Task>) => void;
  onDelete: (id: string) => void;
}) {
  const [editOpen, setEditOpen] = useState(false);
  const energy = detectEnergy(task.title);
  return (
    <>
      <div
        className={cn(
          "group flex items-start gap-2 rounded-xl bg-background border border-border/60 px-2.5 py-2 transition-opacity",
          task.completed && "opacity-50",
        )}
      >
        <CheckButton
          completed={task.completed}
          onToggle={() => onUpdate(task.id, { completed: !task.completed })}
          size="sm"
          className="mt-0.5"
        />
        <div className="flex-1 min-w-0">
          <p
            onClick={() => setEditOpen(true)}
            className={cn("text-xs leading-snug cursor-pointer hover:opacity-70 transition-opacity", task.completed && "line-through text-muted-foreground")}
          >
            {task.title}
          </p>
          <div className="flex items-center gap-1.5 mt-1 flex-wrap">
            {task.due_date && (
              <span className="flex items-center gap-0.5 text-[10px] text-muted-foreground">
                <Clock className="w-2.5 h-2.5" />
                {hasSpecificTime(task.due_date)
                  ? format(parseISO(task.due_date), "MMM d · h:mma")
                  : format(parseISO(task.due_date), "MMM d")}
              </span>
            )}
            {energy && !task.completed && (
              <span className={cn("text-[9px] px-1 py-0.5 rounded-full font-medium", energyConfig[energy].color)}>
                {energyConfig[energy].label}
              </span>
            )}
          </div>
        </div>
        <RescheduleMenu
          onReschedule={(date) => onUpdate(task.id, { due_date: date })}
          iconSize="w-3 h-3"
        />
        <button
          onClick={() => onDelete(task.id)}
          className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-red-500 transition mt-0.5"
          aria-label="Delete"
        >
          <Trash2 className="w-3 h-3" />
        </button>
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

// ── Focus view ───────────────────────────────────────────────────────────────

const PRIORITY_ORDER = { high: 0, med: 1, low: 2 } as const;

function FocusView({ tasks, onUpdate, onDelete }: Props) {
  const now = new Date();

  const { overdue, todayPending, done } = useMemo(() => {
    const overdue: Task[] = [];
    const todayPending: Task[] = [];
    const done: Task[] = [];

    for (const t of tasks) {
      if (!t.due_date) continue;
      const d = parseISO(t.due_date);
      if (t.completed && isToday(d)) { done.push(t); continue; }
      if (t.completed) continue;
      if (isPast(d) && !isToday(d)) { overdue.push(t); continue; }
      if (isToday(d)) todayPending.push(t);
    }

    const byTime = (a: Task, b: Task) => {
      const at = hasSpecificTime(a.due_date!);
      const bt = hasSpecificTime(b.due_date!);
      if (at && bt) return parseISO(a.due_date!).getTime() - parseISO(b.due_date!).getTime();
      if (at) return -1;
      if (bt) return 1;
      return (PRIORITY_ORDER[a.priority ?? "low"] ?? 2) - (PRIORITY_ORDER[b.priority ?? "low"] ?? 2);
    };

    return {
      overdue: overdue.sort(byTime),
      todayPending: todayPending.sort(byTime),
      done,
    };
  }, [tasks]);

  const tomorrowCount = useMemo(
    () => tasks.filter((t) => !t.completed && t.due_date && isTomorrow(parseISO(t.due_date))).length,
    [tasks],
  );

  const totalPending = overdue.length + todayPending.length;
  const totalTasks = totalPending + done.length;
  const completionPct = totalTasks > 0 ? Math.round((done.length / totalTasks) * 100) : 0;
  const nextTimed = todayPending.find((t) => t.due_date && hasSpecificTime(t.due_date) && parseISO(t.due_date) > now);

  if (!totalTasks && !overdue.length) {
    return (
      <div className="text-center py-16 space-y-2">
        <p className="text-2xl">✓</p>
        <p className="text-sm text-muted-foreground">Nothing due today.</p>
        {tomorrowCount > 0 && (
          <p className="text-xs text-muted-foreground/50">{tomorrowCount} task{tomorrowCount !== 1 ? "s" : ""} tomorrow.</p>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between px-1">
        <div>
          <p className="text-sm font-semibold">
            {totalPending > 0 ? `${totalPending} left` : "All done today 🎉"}
          </p>
          {nextTimed && (
            <p className="text-xs text-muted-foreground mt-0.5">
              Next at {format(parseISO(nextTimed.due_date!), "h:mm a")} · {nextTimed.title}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs tabular-nums text-muted-foreground">{completionPct}%</span>
          <ProgressRing total={totalTasks} completed={done.length} size={32} />
        </div>
      </div>

      {/* Overdue — always at top, red */}
      {overdue.length > 0 && (
        <div className="space-y-2">
          <p className="text-[10px] uppercase tracking-widest font-semibold text-red-500 px-1 flex items-center gap-1">
            <AlertTriangle className="w-3 h-3" /> Overdue
          </p>
          {overdue.map((t) => <FocusRow key={t.id} task={t} onUpdate={onUpdate} onDelete={onDelete} overdue />)}
        </div>
      )}

      {/* Today pending */}
      {todayPending.length > 0 && (
        <div className="space-y-2">
          {overdue.length > 0 && (
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground px-1">Today</p>
          )}
          {todayPending.map((t) => <FocusRow key={t.id} task={t} onUpdate={onUpdate} onDelete={onDelete} />)}
        </div>
      )}

      {/* Done */}
      {done.length > 0 && (
        <div className="space-y-2 opacity-40">
          <p className="text-[10px] uppercase tracking-widest text-muted-foreground px-1">Done</p>
          {done.map((t) => <FocusRow key={t.id} task={t} onUpdate={onUpdate} onDelete={onDelete} />)}
        </div>
      )}

      {tomorrowCount > 0 && (
        <div className="pt-2 border-t border-border/40">
          <p className="text-[10px] uppercase tracking-widest text-muted-foreground/50 px-1">
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
}: {
  task: Task;
  onUpdate: (id: string, patch: Partial<Task>) => void;
  onDelete: (id: string) => void;
  overdue?: boolean;
}) {
  const [editOpen, setEditOpen] = useState(false);
  const [actionsOpen, setActionsOpen] = useState(false);
  const touchStartX = useRef(0);
  const energy = detectEnergy(task.title);
  const hasTimed = task.due_date && hasSpecificTime(task.due_date);
  const dueDate = task.due_date ? parseISO(task.due_date) : null;
  const isFuture = dueDate && dueDate > new Date();

  return (
    <>
      <div className={cn(
        "relative overflow-hidden rounded-2xl border",
        overdue ? "border-red-400/50 bg-red-50/30 dark:bg-red-950/20" : "border-border bg-muted/20",
        task.completed && "opacity-50",
      )}>
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
            onClick={() => { onDelete(task.id); }}
            className="flex-1 flex items-center justify-center bg-red-500 text-white"
            aria-label="Delete"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>

        {/* Sliding row */}
        <div
          className={cn(
            "flex items-center gap-3 px-4 py-3 transition-transform duration-200 ease-out",
            overdue ? "bg-red-50/30 dark:bg-red-950/20" : "bg-muted/20",
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
          <CheckButton
            completed={task.completed}
            onToggle={() => onUpdate(task.id, { completed: !task.completed })}
            size="lg"
          />
          <div className="flex-1 min-w-0">
            <p
              onClick={(e) => { if (!actionsOpen) { e.stopPropagation(); setEditOpen(true); } }}
              className={cn(
                "text-sm font-medium cursor-pointer",
                task.completed && "line-through text-muted-foreground",
                overdue && !task.completed && "text-red-600 dark:text-red-400",
              )}
            >
              {task.title}
            </p>
            <div className="flex items-center gap-2 mt-0.5 flex-wrap">
              {task.group_name && (
                <span className="text-[11px] text-muted-foreground">{task.group_name}</span>
              )}
              {hasTimed && dueDate && (
                <span className={cn(
                  "flex items-center gap-0.5 text-[11px] font-medium",
                  overdue ? "text-red-500" : isFuture ? "text-foreground" : "text-muted-foreground",
                )}>
                  <Clock className="w-3 h-3" />
                  {format(dueDate, "h:mm a")}
                  {!task.completed && (
                    <span className="text-muted-foreground font-normal ml-1">
                      · {formatDistanceToNow(dueDate, { addSuffix: true })}
                    </span>
                  )}
                </span>
              )}
              {overdue && !hasTimed && dueDate && (
                <span className="text-[11px] text-red-500 font-medium">
                  {formatDistanceToNow(dueDate, { addSuffix: true })}
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1.5 flex-shrink-0">
            {task.priority === "high" && !task.completed && (
              <span className="text-[9px] uppercase tracking-wider text-red-500 font-bold">Urgent</span>
            )}
            {energy && !task.completed && (
              <span className={cn("text-[10px] px-1.5 py-0.5 rounded-full font-medium", energyConfig[energy].color)}>
                {energyConfig[energy].label}
              </span>
            )}
          </div>
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

// ── Main export ──────────────────────────────────────────────────────────────

const SUB_VIEWS: { id: SubView; label: string; icon: React.ElementType }[] = [
  { id: "list",  label: "List",  icon: LayoutList },
  { id: "board", label: "Board", icon: Kanban },
  { id: "focus", label: "Focus", icon: Crosshair },
  { id: "stats", label: "Stats", icon: BarChart2 },
];

export default function TaskFeed({ tasks, onUpdate, onDelete, onAddTask, onBatchUpdate, onBatchDelete }: Props) {
  const [subView, setSubView] = useState<SubView>("list");

  if (tasks.length === 0) return <SmartEmpty />;

  return (
    <div>
      {/* Single-row nav */}
      <div className="flex items-center gap-1 mb-5 bg-muted/40 rounded-2xl p-1">
        {SUB_VIEWS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setSubView(id)}
            className={cn(
              "flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-xl text-xs font-medium transition-all duration-150",
              subView === id
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Icon className="w-3.5 h-3.5" />
            {label}
          </button>
        ))}
      </div>

      {subView === "stats" && <StatsCard tasks={tasks} />}

      {subView === "list" && (
        <ListView
          tasks={tasks}
          onUpdate={onUpdate}
          onDelete={onDelete}
          onAddTask={onAddTask}
          onBatchUpdate={onBatchUpdate}
          onBatchDelete={onBatchDelete}
        />
      )}
      {subView === "board" && (
        <BoardView tasks={tasks.filter((t) => !t.completed)} onUpdate={onUpdate} onDelete={onDelete} onAddTask={onAddTask} />
      )}
      {subView === "focus" && (
        <FocusView tasks={tasks.filter((t) => !t.completed)} onUpdate={onUpdate} onDelete={onDelete} />
      )}
    </div>
  );
}
