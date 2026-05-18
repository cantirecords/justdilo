"use client";
import { useRef, useState } from "react";
import { Trash2, Clock, ChevronDown, Pencil, Plus, Check, MoreHorizontal, MessageCircle } from "lucide-react";
import { format, isToday, isTomorrow, parseISO } from "date-fns";
import { cn } from "@/lib/utils";
import { CATEGORY_CONFIG } from "@/lib/categories";
import { detectCategory } from "@/lib/detectCategory";
import ProgressRing from "./ProgressRing";
import CheckButton from "./CheckButton";
import RescheduleMenu from "./RescheduleMenu";
import TaskEditModal from "./TaskEditModal";
import TaskDetailDrawer from "./TaskDetailDrawer";
import GroupBatchModal from "./GroupBatchModal";
import type { Task, TaskAssignee } from "@/lib/types";

type Props = {
  groupName: string;
  tasks: Task[];
  onUpdate: (id: string, patch: Partial<Task> & { assignee_ids?: string[] }) => void;
  onDelete: (id: string) => void;
  onAddTask?: (title: string, groupName: string) => Promise<void>;
  onBatchUpdate?: (ids: string[], patch: Partial<Task>) => void;
  onBatchDelete?: (ids: string[]) => void;
  currentUserId?: string;
};

function formatDue(due: string): string {
  const d = parseISO(due);
  const hasTime = !(d.getHours() === 23 && d.getMinutes() === 59);
  const timeStr = hasTime ? ` · ${format(d, "h:mma").toLowerCase()}` : "";
  if (isToday(d)) return `Today${timeStr}`;
  if (isTomorrow(d)) return `Tomorrow${timeStr}`;
  return format(d, "EEE MMM d") + timeStr;
}

export default function TaskCard({ groupName, tasks, onUpdate, onDelete, onAddTask, onBatchUpdate, onBatchDelete, currentUserId }: Props) {
  const [editingGroup, setEditingGroup] = useState(false);
  const [groupTitle, setGroupTitle] = useState(groupName);
  const [adding, setAdding] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [saving, setSaving] = useState(false);
  const [batchOpen, setBatchOpen] = useState(false);
  const addInputRef = useRef<HTMLInputElement>(null);

  const summary = tasks.find((t) => t.summary)?.summary;
  const due = tasks.find((t) => t.due_date)?.due_date;
  const priority = tasks.find((t) => t.priority === "high")?.priority;
  const completed = tasks.filter((t) => t.completed).length;
  const allDone = completed === tasks.length;

  // Category: use DB value, fall back to keyword detection on group name / task titles
  const category = tasks.find((t) => t.category)?.category
    ?? detectCategory(groupName)
    ?? tasks.reduce<string | null>((found, t) => found ?? detectCategory(t.title), null);
  const catConfig = category ? CATEGORY_CONFIG[category as keyof typeof CATEGORY_CONFIG] : null;
  const recurringTypes = [...new Set(tasks.filter((t) => t.recurring_type).map((t) => t.recurring_type!))];
  const recurringType = recurringTypes.length === 1 ? recurringTypes[0] : recurringTypes.length > 1 ? "custom" : null;
  const RECURRING_LABEL: Record<string, string> = { daily: "Daily", weekly: "Weekly", monthly: "Monthly", custom: "Recurring" };
  const RECURRING_COLORS: Record<string, string> = {
    daily: "text-rose-500 dark:text-rose-400",
    weekly: "text-blue-500 dark:text-blue-400",
    monthly: "text-emerald-500 dark:text-emerald-400",
    custom: "text-amber-500 dark:text-amber-400",
  };

  function commitGroupRename() {
    setEditingGroup(false);
    const trimmed = groupTitle.trim();
    if (trimmed && trimmed !== groupName) {
      tasks.forEach((t) => onUpdate(t.id, { group_name: trimmed }));
    } else {
      setGroupTitle(groupName);
    }
  }

  const taskIds = tasks.map((t) => t.id);

  return (
    <>
      <div className={cn(
        "rounded-2xl border bg-muted/20 p-4 animate-rise transition-opacity",
        priority === "high" ? "border-red-200 dark:border-red-900/60" : "border-border",
        allDone && "opacity-60",
      )}>
        <div className="flex items-start gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-0.5 flex-wrap">
              {catConfig && (
                <span className={cn("text-[9px] font-semibold flex-shrink-0 uppercase tracking-wider", catConfig.badge)}>
                  {catConfig.icon} {catConfig.label}
                </span>
              )}
              {recurringType && (
                <span className={cn("text-[10px] font-bold flex-shrink-0", RECURRING_COLORS[recurringType] ?? "text-amber-500")} title={RECURRING_LABEL[recurringType]}>
                  ↻
                </span>
              )}
              {editingGroup ? (
                <input
                  autoFocus
                  value={groupTitle}
                  onChange={(e) => setGroupTitle(e.target.value)}
                  onBlur={commitGroupRename}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") commitGroupRename();
                    if (e.key === "Escape") { setGroupTitle(groupName); setEditingGroup(false); }
                  }}
                  className="flex-1 bg-transparent outline-none text-sm font-medium border-b border-foreground/30 leading-tight"
                />
              ) : (
                <h3
                  onClick={() => setEditingGroup(true)}
                  className={cn(
                    "font-medium leading-tight cursor-text hover:opacity-70 transition-opacity",
                    allDone && "line-through text-muted-foreground",
                  )}
                >
                  {groupTitle}
                </h3>
              )}
              {priority === "high" && (
                <span className="text-[10px] uppercase tracking-wider text-red-500 font-semibold flex-shrink-0">Urgent</span>
              )}
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {due && (
                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Clock className="w-3 h-3" />
                  {formatDue(due)}
                </span>
              )}
              {summary && !due && (
                <span className="text-xs text-muted-foreground truncate">{summary}</span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1 flex-shrink-0">
            <ProgressRing total={tasks.length} completed={completed} size={36} />
            {onAddTask && (
              <button
                onClick={() => { setAdding(true); setTimeout(() => addInputRef.current?.focus(), 60); }}
                className="p-1 rounded-full hover:bg-muted text-muted-foreground hover:text-foreground transition"
                aria-label="Add task to group"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
            )}
            {(onBatchUpdate || onBatchDelete) && (
              <button
                onClick={() => setBatchOpen(true)}
                className="p-1 rounded-full hover:bg-muted text-muted-foreground hover:text-foreground transition"
                aria-label="Group actions"
              >
                <MoreHorizontal className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        <ul className="space-y-1.5 mt-3">
          {tasks.map((t) => (
            <Row key={t.id} task={t} onUpdate={onUpdate} onDelete={onDelete} currentUserId={currentUserId} />
          ))}
        </ul>

        {adding && (
          <div className="mt-2 flex items-center gap-2">
            <span className="w-4 h-4 rounded-full border border-border/60 shrink-0" />
            <input
              ref={addInputRef}
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder="Add task…"
              disabled={saving}
              onKeyDown={async (e) => {
                if (e.key === "Enter" && newTitle.trim() && onAddTask) {
                  setSaving(true);
                  await onAddTask(newTitle.trim(), groupTitle);
                  setNewTitle("");
                  setSaving(false);
                  setAdding(false);
                }
                if (e.key === "Escape") { setNewTitle(""); setAdding(false); }
              }}
              onBlur={() => { if (!newTitle.trim()) setAdding(false); }}
              className="flex-1 text-sm bg-transparent outline-none placeholder:text-muted-foreground/40 border-b border-border/40 pb-0.5"
            />
            {newTitle.trim() && !saving && (
              <button
                onClick={async () => {
                  if (!onAddTask) return;
                  setSaving(true);
                  await onAddTask(newTitle.trim(), groupTitle);
                  setNewTitle("");
                  setSaving(false);
                  setAdding(false);
                }}
                className="p-1 rounded-full hover:bg-muted text-muted-foreground hover:text-foreground transition"
              >
                <Check className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        )}
      </div>

      {batchOpen && (
        <GroupBatchModal
          groupName={groupTitle}
          tasks={tasks}
          onUpdateAll={(patch) => onBatchUpdate?.(taskIds, patch)}
          onDeleteAll={() => onBatchDelete?.(taskIds)}
          onClose={() => setBatchOpen(false)}
        />
      )}
    </>
  );
}

const SWIPE_REVEAL = 88; // px — 2 action buttons × 44px each

function Row({ task, onUpdate, onDelete, currentUserId }: { task: Task } & Omit<Props, "tasks" | "groupName" | "onAddTask" | "onBatchUpdate" | "onBatchDelete">) {
  const [actionsOpen, setActionsOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const touchStartX = useRef(0);
  const hasNote = Boolean(task.summary?.trim());

  // Resolve assignees: prefer task_assignees array, fall back to legacy assigned_to
  const assignees: TaskAssignee[] = task.assignees?.length
    ? task.assignees
    : task.assigned_to
    ? [{ user_id: task.assigned_to_id ?? "", profile: task.assigned_to }]
    : [];

  function handleTouchStart(e: React.TouchEvent) {
    touchStartX.current = e.touches[0].clientX;
  }
  function handleTouchEnd(e: React.TouchEvent) {
    const delta = e.changedTouches[0].clientX - touchStartX.current;
    if (delta < -36) setActionsOpen(true);
    if (delta > 20) setActionsOpen(false);
  }

  return (
    <>
      {/* overflow-hidden clips the action strip until content slides */}
      <li className="relative overflow-hidden rounded-lg">
        {/* Action strip — absolutely pinned to right edge */}
        <div
          className="absolute inset-y-0 right-0 flex items-stretch"
          style={{ width: SWIPE_REVEAL }}
        >
          <button
            onTouchEnd={(e) => { e.stopPropagation(); setEditOpen(true); setActionsOpen(false); }}
            onClick={() => { setEditOpen(true); setActionsOpen(false); }}
            className="flex-1 flex items-center justify-center bg-muted hover:bg-muted/80 text-foreground transition"
            aria-label="Edit task"
          >
            <Pencil className="w-4 h-4" />
          </button>
          <button
            onTouchEnd={(e) => { e.stopPropagation(); onDelete(task.id); }}
            onClick={() => onDelete(task.id)}
            className="flex-1 flex items-center justify-center bg-red-500 hover:bg-red-600 text-white transition"
            aria-label="Delete task"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>

        {/* Sliding content */}
        <div
          className="relative bg-background py-0.5 transition-transform duration-200 ease-out"
          style={{ transform: actionsOpen ? `translateX(-${SWIPE_REVEAL}px)` : "translateX(0)" }}
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
          onClick={() => { if (actionsOpen) setActionsOpen(false); }}
        >
          <div className="flex items-center gap-2.5">
            <CheckButton
              completed={task.completed}
              onToggle={() => onUpdate(task.id, { completed: !task.completed })}
              size="md"
            />

            <span
              onClick={(e) => { if (!actionsOpen) { e.stopPropagation(); onUpdate(task.id, { completed: !task.completed }); } }}
              className={cn(
                "flex-1 text-sm min-w-0",
                task.completed ? "line-through text-muted-foreground" : "cursor-pointer",
              )}
            >
              {task.title}
            </span>

            {task.org_id && assignees.length === 0 && (
              <span className="shrink-0 text-[10px] px-1.5 py-0.5 rounded-md font-medium bg-muted text-muted-foreground/60">
                @?
              </span>
            )}
            {assignees.slice(0, 2).map((a) => {
              const name = a.profile?.nickname || a.profile?.email?.split("@")[0] || "?";
              return (
                <span key={a.user_id} className="shrink-0 text-[10px] px-1.5 py-0.5 rounded-md font-medium bg-blue-500/10 text-blue-600 dark:text-blue-400">
                  @{name}
                </span>
              );
            })}
            {assignees.length > 2 && (
              <span className="shrink-0 text-[10px] px-1.5 py-0.5 rounded-md font-medium bg-muted text-muted-foreground">
                +{assignees.length - 2}
              </span>
            )}
            {task.org_id && (
              <button
                onClick={(e) => { e.stopPropagation(); setDetailOpen(true); }}
                className="shrink-0 text-muted-foreground/40 hover:text-foreground transition"
                aria-label="Comments"
              >
                <MessageCircle className="w-3.5 h-3.5" />
              </button>
            )}

            {task.recurring_type && (
              <span className={cn("text-[9px] font-bold shrink-0", {
                "text-rose-500 dark:text-rose-400": task.recurring_type === "daily",
                "text-blue-500 dark:text-blue-400": task.recurring_type === "weekly",
                "text-emerald-500 dark:text-emerald-400": task.recurring_type === "monthly",
                "text-amber-500 dark:text-amber-400": task.recurring_type === "custom",
              })} title={task.recurring_type}>
                ↻
              </span>
            )}

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
      {detailOpen && (
        <TaskDetailDrawer
          task={task}
          onClose={() => setDetailOpen(false)}
          onUpdate={onUpdate}
          currentUserId={currentUserId ?? ""}
        />
      )}
    </>
  );
}
