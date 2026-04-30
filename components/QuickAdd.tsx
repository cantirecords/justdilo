"use client";
import { useEffect, useRef, useState } from "react";
import { Plus, X, Send, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import type { Task } from "@/lib/types";

type Props = {
  onNewTasks: (tasks: Task[], summary: string, groupCount: number) => void;
  onVoiceResult?: (json: any) => void;
};

export default function QuickAdd({ onNewTasks, onVoiceResult }: Props) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (open) setTimeout(() => textareaRef.current?.focus(), 100);
  }, [open]);

  // Cmd+K to open
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      }
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Flush offline queue when back online
  useEffect(() => {
    const LS_KEY = "justdilo:offlineQueue";
    async function flush() {
      const raw = localStorage.getItem(LS_KEY);
      if (!raw) return;
      const queue: string[] = JSON.parse(raw);
      if (!queue.length) return;
      localStorage.removeItem(LS_KEY);
      toast("Back online — syncing saved tasks…");
      for (const item of queue) {
        try {
          const res = await fetch("/api/process-text", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ text: item, utcOffset: -new Date().getTimezoneOffset() }),
          });
          const json = await res.json();
          if (res.ok && json.tasks?.length) onNewTasks(json.tasks, json.overall_summary ?? "", json.groups?.length ?? 0);
        } catch {}
      }
      toast.success("Offline tasks synced");
    }
    window.addEventListener("online", flush);
    return () => window.removeEventListener("online", flush);
  }, [onNewTasks]);

  async function submit() {
    if (!text.trim() || loading) return;

    if (!navigator.onLine) {
      const LS_KEY = "justdilo:offlineQueue";
      const queue: string[] = JSON.parse(localStorage.getItem(LS_KEY) ?? "[]");
      queue.push(text.trim());
      localStorage.setItem(LS_KEY, JSON.stringify(queue));
      toast("You're offline — task saved, will sync when connected");
      setText("");
      setOpen(false);
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/process-text", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: text.trim(), utcOffset: -new Date().getTimezoneOffset() }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed");

      const intent = json.intent ?? "CREATE_TASK";
      onVoiceResult?.(json);

      if (intent === "CREATE_TASK") {
        const tasks = json.tasks ?? [];
        onNewTasks(tasks, json.overall_summary ?? "", json.groups?.length ?? 0);
        if (tasks.length) toast.success(`${tasks.length} task${tasks.length > 1 ? "s" : ""} added`);
        else toast.message("Saved as note");
      } else if (intent === "UPDATE_TASK") {
        const n = json.updated_tasks?.length ?? 0;
        toast.success(n ? `Updated ${n} task${n > 1 ? "s" : ""}` : "Couldn't find that task");
      } else if (intent === "DELETE_TASK") {
        const n = json.deleted_task_ids?.length ?? 0;
        toast.success(n ? `Removed ${n} task${n > 1 ? "s" : ""}` : "Couldn't find that task");
      } else if (intent === "COMPLETE_TASK") {
        const n = json.completed_task_ids?.length ?? 0;
        toast.success(n ? `Marked ${n} task${n > 1 ? "s" : ""} done` : "Couldn't find that task");
      } else if (intent === "QUERY_TASKS") {
        if (json.answer) toast(json.answer, { duration: 6000 });
      }
      setText("");
      setOpen(false);
    } catch (e: any) {
      toast.error(e?.message || "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      {/* Floating button */}
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-8 right-5 z-40 w-14 h-14 rounded-full bg-foreground text-background shadow-lg flex items-center justify-center hover:scale-105 active:scale-95 transition-transform"
        aria-label="Add task manually"
      >
        <Plus className="w-6 h-6" />
      </button>

      {/* Bottom sheet overlay */}
      {open && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end">
          <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={() => setOpen(false)} />
          <div className="relative bg-background rounded-t-3xl p-5 pb-8 shadow-2xl animate-rise">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="font-semibold">Add tasks</h2>
                <p className="text-xs text-muted-foreground">Type naturally — AI will organize it</p>
              </div>
              <button onClick={() => setOpen(false)} className="p-1.5 rounded-full hover:bg-muted">
                <X className="w-4 h-4" />
              </button>
            </div>

            <textarea
              ref={textareaRef}
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submit();
              }}
              placeholder={'e.g. "Call Marc tomorrow at 3pm about the invoice, book dentist next week"'}
              rows={4}
              className="w-full rounded-2xl border border-border bg-muted/30 px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-foreground/10 resize-none placeholder:text-muted-foreground/50"
            />

            <div className="flex items-center justify-between mt-3">
              <p className="text-xs text-muted-foreground">⌘K to open · Esc to close · ⌘↵ to submit</p>
              <button
                onClick={submit}
                disabled={!text.trim() || loading}
                className={cn(
                  "flex items-center gap-2 px-4 py-2 rounded-xl bg-foreground text-background text-sm font-medium transition",
                  "disabled:opacity-40",
                )}
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                {loading ? "Thinking…" : "Add"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
