"use client";
import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { format, parseISO } from "date-fns";
import { cn } from "@/lib/utils";
import { CATEGORY_CONFIG } from "@/lib/categories";
import type { Task } from "@/lib/types";

type Props = {
  task: Task;
  onSave: (patch: Partial<Task>) => void;
  onClose: () => void;
};

const PRIORITIES: { value: Task["priority"]; label: string }[] = [
  { value: null, label: "None" },
  { value: "low", label: "Low" },
  { value: "med", label: "Med" },
  { value: "high", label: "High" },
];

const RECURRING: { value: Task["recurring_type"]; label: string }[] = [
  { value: null, label: "None" },
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
];

function parseDate(due: string | null) {
  if (!due) return { date: "", time: "" };
  const d = parseISO(due);
  const hasTime = !(d.getHours() === 23 && d.getMinutes() === 59);
  return {
    date: format(d, "yyyy-MM-dd"),
    time: hasTime ? format(d, "HH:mm") : "",
  };
}

function buildDueDate(date: string, time: string): string | null {
  if (!date) return null;
  const [year, month, day] = date.split("-").map(Number);
  const [hours, minutes] = time ? time.split(":").map(Number) : [23, 59];
  return new Date(year, month - 1, day, hours, minutes).toISOString();
}

export default function TaskEditModal({ task, onSave, onClose }: Props) {
  const [title, setTitle] = useState(task.title);
  const [groupName, setGroupName] = useState(task.group_name ?? "");
  const [notes, setNotes] = useState(task.summary ?? "");
  const [priority, setPriority] = useState(task.priority);
  const [recurringType, setRecurringType] = useState(task.recurring_type);
  const [category, setCategory] = useState(task.category);
  const { date: initDate, time: initTime } = parseDate(task.due_date);
  const [date, setDate] = useState(initDate);
  const [time, setTime] = useState(initTime);

  const saveRef = useRef<() => void>(() => {});
  saveRef.current = () => {
    onSave({
      title: title.trim() || task.title,
      group_name: groupName.trim() || null,
      summary: notes.trim() || null,
      priority,
      recurring_type: recurringType,
      due_date: buildDueDate(date, time),
      category,
    });
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

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />

      <div className="relative w-full sm:max-w-lg bg-background rounded-t-3xl sm:rounded-2xl shadow-2xl border border-border overflow-hidden">
        <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-border/50">
          <h2 className="text-sm font-semibold">Edit Task</h2>
          <button onClick={onClose} className="p-1.5 rounded-full hover:bg-muted transition">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-5 py-4 space-y-4 max-h-[75vh] overflow-y-auto">
          <div>
            <label className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1.5 block">Task</label>
            <textarea
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              rows={2}
              className="w-full bg-muted/30 rounded-xl px-3 py-2.5 text-sm resize-none outline-none focus:ring-1 focus:ring-foreground/20 border border-transparent focus:border-foreground/10"
              placeholder="Task title"
            />
          </div>

          <div>
            <label className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1.5 block">
              Group / Project / Client
            </label>
            <input
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
              className="w-full bg-muted/30 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-1 focus:ring-foreground/20 border border-transparent focus:border-foreground/10"
              placeholder="e.g. Jaime, Client, Gym…"
            />
          </div>

          <div className="flex gap-3">
            <div className="flex-1">
              <label className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1.5 block">Date</label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full bg-muted/30 rounded-xl px-3 py-2.5 text-sm text-foreground outline-none focus:ring-1 focus:ring-foreground/20 border border-transparent focus:border-foreground/10 [color-scheme:light] dark:[color-scheme:dark]"
              />
            </div>
            <div className="flex-1">
              <label className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1.5 block">Time</label>
              <input
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
                className="w-full bg-muted/30 rounded-xl px-3 py-2.5 text-sm text-foreground outline-none focus:ring-1 focus:ring-foreground/20 border border-transparent focus:border-foreground/10 [color-scheme:light] dark:[color-scheme:dark]"
              />
            </div>
          </div>

          <div>
            <label className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1.5 block">Priority</label>
            <div className="flex gap-2">
              {PRIORITIES.map(({ value, label }) => (
                <button
                  key={label}
                  onClick={() => setPriority(value)}
                  className={cn(
                    "flex-1 py-2 rounded-xl text-xs font-medium border transition",
                    priority === value
                      ? value === "high"
                        ? "bg-red-500 text-white border-red-500"
                        : value === "med"
                        ? "bg-amber-500 text-white border-amber-500"
                        : value === "low"
                        ? "bg-blue-500 text-white border-blue-500"
                        : "bg-foreground text-background border-foreground"
                      : "bg-muted/30 border-border text-muted-foreground hover:text-foreground",
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1.5 block">Recurring</label>
            <div className="flex gap-2">
              {RECURRING.map(({ value, label }) => (
                <button
                  key={label}
                  onClick={() => setRecurringType(value)}
                  className={cn(
                    "flex-1 py-2 rounded-xl text-xs font-medium border transition",
                    recurringType === value
                      ? "bg-foreground text-background border-foreground"
                      : "bg-muted/30 border-border text-muted-foreground hover:text-foreground",
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {category && (() => {
            const cfg = CATEGORY_CONFIG[category];
            return cfg ? (
              <div className="flex items-center gap-2">
                <label className="text-[11px] uppercase tracking-wider text-muted-foreground">Category</label>
                <span className={cn("text-[10px] px-2 py-0.5 rounded-full font-medium", cfg.badge)}>
                  {cfg.icon} {cfg.label}
                </span>
              </div>
            ) : null;
          })()}

          <div>
            <label className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1.5 block">Notes</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              className="w-full bg-muted/30 rounded-xl px-3 py-2.5 text-sm resize-none outline-none focus:ring-1 focus:ring-foreground/20 border border-transparent focus:border-foreground/10"
              placeholder="Hidden detail, context, or extra info…"
            />
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
            className="flex-1 py-2.5 rounded-xl text-sm font-medium bg-foreground text-background hover:opacity-90 transition"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
