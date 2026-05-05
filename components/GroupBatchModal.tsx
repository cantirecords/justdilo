"use client";
import { useEffect, useRef, useState } from "react";
import { X, Trash2, AlertTriangle } from "lucide-react";
import { format, parseISO } from "date-fns";
import { cn } from "@/lib/utils";
import type { Task } from "@/lib/types";
import { detectCategory } from "@/lib/detectCategory";

type Props = {
  groupName: string;
  tasks: Task[];
  onUpdateAll: (patch: Partial<Task>) => void;
  onDeleteAll: () => void;
  onClose: () => void;
};

const RECURRING: { value: Task["recurring_type"]; label: string }[] = [
  { value: null, label: "None" },
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
];

function buildDueDate(date: string, time: string): string | null {
  if (!date) return null;
  const [year, month, day] = date.split("-").map(Number);
  const [hours, minutes] = time ? time.split(":").map(Number) : [23, 59];
  return new Date(year, month - 1, day, hours, minutes).toISOString();
}

export default function GroupBatchModal({ groupName, tasks, onUpdateAll, onDeleteAll, onClose }: Props) {
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [recurring, setRecurring] = useState<Task["recurring_type"]>(undefined as any);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const saveRef = useRef<() => void>(() => {});
  saveRef.current = () => {
    const patch: Partial<Task> = {};
    if (date) patch.due_date = buildDueDate(date, time);
    if (recurring !== (undefined as any)) patch.recurring_type = recurring;
    // Auto-detect category from group name if tasks don't already have one
    const groupHasCategory = tasks.some((t) => t.category);
    if (!groupHasCategory) {
      const detected = detectCategory(groupName);
      if (detected) patch.category = detected;
    }
    if (Object.keys(patch).length > 0) onUpdateAll(patch);
    onClose();
  };

  useEffect(() => {
    function handler(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") saveRef.current();
    }
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  const pending = tasks.filter((t) => !t.completed).length;
  const sharedDue = tasks.every((t) => t.due_date === tasks[0]?.due_date) && tasks[0]?.due_date
    ? tasks[0].due_date
    : null;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />

      <div className="relative w-full sm:max-w-md bg-background rounded-t-3xl sm:rounded-2xl shadow-2xl border border-border overflow-hidden">
        <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-border/50">
          <div>
            <h2 className="text-sm font-semibold">{groupName}</h2>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              {tasks.length} task{tasks.length !== 1 ? "s" : ""} · {pending} pending
            </p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-full hover:bg-muted transition">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-5 py-4 space-y-5">
          <div>
            <label className="text-[11px] uppercase tracking-wider text-muted-foreground mb-2 block">
              Set date &amp; time for all tasks
            </label>
            {sharedDue && (
              <p className="text-[10px] text-muted-foreground/60 mb-2">
                Current: {format(parseISO(sharedDue), "MMM d · h:mma")}
              </p>
            )}
            <div className="flex gap-3">
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="flex-1 bg-muted/30 rounded-xl px-3 py-2.5 text-sm text-foreground outline-none focus:ring-1 focus:ring-foreground/20 border border-transparent focus:border-foreground/10 [color-scheme:light] dark:[color-scheme:dark]"
              />
              <input
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
                className="flex-1 bg-muted/30 rounded-xl px-3 py-2.5 text-sm text-foreground outline-none focus:ring-1 focus:ring-foreground/20 border border-transparent focus:border-foreground/10 [color-scheme:light] dark:[color-scheme:dark]"
              />
            </div>
          </div>

          <div>
            <label className="text-[11px] uppercase tracking-wider text-muted-foreground mb-2 block">
              Set recurrence for all tasks
            </label>
            <div className="flex gap-2">
              {RECURRING.map(({ value, label }) => (
                <button
                  key={label}
                  onClick={() => setRecurring(recurring === value ? (undefined as any) : value)}
                  className={cn(
                    "flex-1 py-2 rounded-xl text-xs font-medium border transition",
                    recurring === value
                      ? "bg-foreground text-background border-foreground"
                      : "bg-muted/30 border-border text-muted-foreground hover:text-foreground",
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
            {recurring !== (undefined as any) && recurring !== null && (
              <p className="text-[10px] text-muted-foreground/60 mt-1.5">
                Will apply "{label(recurring)}" to all {tasks.length} tasks
              </p>
            )}
          </div>

          <div className="border-t border-border/50 pt-4">
            {!confirmDelete ? (
              <button
                onClick={() => setConfirmDelete(true)}
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-medium text-red-500 bg-red-500/10 hover:bg-red-500/15 border border-red-200/50 dark:border-red-500/20 transition"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Delete all {tasks.length} tasks
              </button>
            ) : (
              <div className="rounded-xl border border-red-200/70 dark:border-red-500/30 bg-red-50/50 dark:bg-red-900/10 p-3 space-y-3">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-red-600 dark:text-red-400">
                    Delete all {tasks.length} tasks in "{groupName}"? This cannot be undone.
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => setConfirmDelete(false)}
                    className="flex-1 py-2 rounded-lg text-xs font-medium bg-muted/50 hover:bg-muted transition"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => { onDeleteAll(); onClose(); }}
                    className="flex-1 py-2 rounded-lg text-xs font-medium bg-red-500 text-white hover:bg-red-600 transition"
                  >
                    Yes, delete all
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="px-5 py-4 border-t border-border/50 flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 rounded-xl text-sm font-medium bg-muted/50 hover:bg-muted transition"
          >
            Cancel
          </button>
          <button
            onClick={() => saveRef.current()}
            disabled={!date && recurring === (undefined as any)}
            className="flex-1 py-2.5 rounded-xl text-sm font-medium bg-foreground text-background hover:opacity-90 transition disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Apply to all
          </button>
        </div>
      </div>
    </div>
  );
}

function label(r: Task["recurring_type"]): string {
  if (r === "daily") return "Daily";
  if (r === "weekly") return "Weekly";
  if (r === "monthly") return "Monthly";
  return "";
}
