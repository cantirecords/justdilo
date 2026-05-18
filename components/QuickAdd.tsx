"use client";
import { useEffect, useRef, useState } from "react";
import { Plus, X, Send, Loader2, Users } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useFeature } from "@/lib/features";
import type { Task } from "@/lib/types";

type AbandonmentHint = { rate: number; sample: number } | null;
type Mode = "picker" | "task";

type Props = {
  onNewTasks: (tasks: Task[], summary: string, groupCount: number) => void;
  onVoiceResult?: (json: any) => void;
  onStartMeeting?: () => void;
};

export default function QuickAdd({ onNewTasks, onVoiceResult, onStartMeeting }: Props) {
  const abandonHintEnabled = useFeature("abandonment_hint");
  const meetingsEnabled = useFeature("meetings");
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<Mode>("task");
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [abandonHint, setAbandonHint] = useState<AbandonmentHint>(null);
  const hintFetchedRef = useRef(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (open && mode === "task") {
      setTimeout(() => textareaRef.current?.focus(), 100);
      if (abandonHintEnabled && !hintFetchedRef.current) {
        hintFetchedRef.current = true;
        fetch("/api/insights")
          .then((r) => r.json())
          .then(({ abandonment }) => {
            if (abandonment?.no_due_date_rate >= 50 && abandonment?.no_due_date_sample >= 5) {
              setAbandonHint({ rate: abandonment.no_due_date_rate, sample: abandonment.no_due_date_sample });
            }
          })
          .catch(() => {});
      }
    }
  }, [open, abandonHintEnabled]);

  // Cmd+K to open
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      }
      if (e.key === "Escape") { setOpen(false); setMode("task"); }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // External seed event — opens the sheet with text pre-filled (used by OnboardingHints)
  useEffect(() => {
    function onSeed(e: Event) {
      const text = (e as CustomEvent<{ text: string }>).detail?.text;
      if (!text) return;
      setText(text);
      setOpen(true);
    }
    window.addEventListener("justdilo:seed-quickadd", onSeed);
    return () => window.removeEventListener("justdilo:seed-quickadd", onSeed);
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
            body: JSON.stringify({ text: item, utcOffset: -new Date().getTimezoneOffset(), timezone: Intl.DateTimeFormat().resolvedOptions().timeZone }),
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
        body: JSON.stringify({ text: text.trim(), utcOffset: -new Date().getTimezoneOffset(), timezone: Intl.DateTimeFormat().resolvedOptions().timeZone }),
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

  function openAsPicker() {
    if (meetingsEnabled && onStartMeeting) {
      setMode("picker");
      setOpen(true);
    } else {
      setMode("task");
      setOpen(true);
    }
  }

  function close() {
    setOpen(false);
    setMode("task");
  }

  return (
    <>
      {/* Floating button */}
      <button
        onClick={openAsPicker}
        className="fixed bottom-8 right-5 z-40 w-14 h-14 rounded-full bg-foreground text-background shadow-lg flex items-center justify-center hover:scale-105 active:scale-95 transition-transform"
        aria-label="Add task or meeting"
      >
        <Plus className="w-6 h-6" />
      </button>

      {/* Bottom sheet overlay */}
      {open && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end">
          <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={close} />
          <div className="relative bg-background rounded-t-3xl p-5 pb-8 shadow-2xl animate-rise">

            {/* Mode picker */}
            {mode === "picker" && (
              <>
                <div className="flex items-center justify-between mb-5">
                  <h2 className="font-semibold">What do you want to add?</h2>
                  <button onClick={close} className="p-1.5 rounded-full hover:bg-muted">
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <div className="space-y-2.5">
                  <button
                    onClick={() => setMode("task")}
                    className="w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl border border-border hover:bg-muted/60 transition text-left"
                  >
                    <div className="w-8 h-8 rounded-xl bg-foreground/10 flex items-center justify-center shrink-0">
                      <Plus className="w-4 h-4" />
                    </div>
                    <div>
                      <p className="font-medium text-sm">Task</p>
                      <p className="text-xs text-muted-foreground">Type or dictate — AI organizes it</p>
                    </div>
                  </button>
                  <button
                    onClick={() => { close(); onStartMeeting?.(); }}
                    className="w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl border border-border hover:bg-muted/60 transition text-left"
                  >
                    <div className="w-8 h-8 rounded-xl bg-foreground/10 flex items-center justify-center shrink-0">
                      <Users className="w-4 h-4" />
                    </div>
                    <div>
                      <p className="font-medium text-sm">Meeting</p>
                      <p className="text-xs text-muted-foreground">Record, transcribe, auto-assign tasks</p>
                    </div>
                  </button>
                </div>
              </>
            )}

            {/* Task entry */}
            {mode === "task" && (
              <>
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h2 className="font-semibold">Add tasks</h2>
                    <p className="text-xs text-muted-foreground">Type naturally — AI will organize it</p>
                  </div>
                  <button onClick={close} className="p-1.5 rounded-full hover:bg-muted">
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

                {abandonHintEnabled && abandonHint && (
                  <p className="text-[11px] text-amber-600/70 dark:text-amber-400/60 px-1 mt-2">
                    Heads up: {abandonHint.rate}% of your undated tasks go unfinished — a deadline helps
                  </p>
                )}

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
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
