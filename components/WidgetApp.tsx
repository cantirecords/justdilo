"use client";
import { useState } from "react";
import { Mic, Check, LogIn } from "lucide-react";
import { toast, Toaster } from "sonner";
import { isToday } from "date-fns";
import { cn } from "@/lib/utils";
import { openMainApp } from "@/lib/electron-api";
import { useWidgetTasks, type WidgetTask } from "@/lib/useWidgetTasks";
import { useVoiceRecorder } from "@/lib/useVoiceRecorder";
import { isOverdue, isDueNow, parseDue, dueLabel, dueTime } from "@/lib/widget-dates";

type Mode = "mic" | "tasks";

export default function WidgetApp({ initialTasks, variant = "standard" }: { initialTasks: WidgetTask[]; variant?: "standard" | "full" }) {
  const [mode, setMode] = useState<Mode>("tasks");
  const { tasks, auth, load, complete } = useWidgetTasks({ limit: variant === "full" ? 100 : 50, initialTasks });
  const { phase, toggle } = useVoiceRecorder(
    (json) => {
      if (json.tasks?.length) toast.success(`${json.tasks.length} task${json.tasks.length > 1 ? "s" : ""} added`);
      else toast.message("Saved.");
      load();
    },
    (msg) => toast.error(msg),
  );

  const signedOut = auth === "signedOut";

  async function handleComplete(id: string) {
    if (!(await complete(id))) toast.error("Couldn't complete — try again");
  }

  const overdue = tasks.filter(t => isOverdue(t.due_date));
  const todayTasks = tasks.filter(t => t.due_date && isToday(parseDue(t.due_date)) && !isOverdue(t.due_date));
  const upcoming = tasks
    .filter(t => t.due_date && !isToday(parseDue(t.due_date)) && !isOverdue(t.due_date))
    .slice(0, variant === "full" ? 15 : 3);
  const noDate = tasks.filter(t => !t.due_date).slice(0, 5);
  const urgentCount = overdue.length + todayTasks.length;

  return (
    <div
      className="h-screen flex flex-col overflow-hidden rounded-2xl select-none
        bg-white/96 dark:bg-[#161616]/96
        border border-black/[0.06] dark:border-white/[0.08]
        shadow-[0_8px_40px_rgba(0,0,0,0.18)] dark:shadow-[0_8px_40px_rgba(0,0,0,0.6)]"
      style={{ fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', sans-serif", backdropFilter: "blur(20px)" }}
    >
      <Toaster position="top-center" richColors toastOptions={{ style: { fontSize: 12 } }} />

      {/* ── Header (drag handle) ─────────────────────────────── */}
      <div
        className="flex items-center justify-between px-3.5 py-2.5 shrink-0"
        style={{ WebkitAppRegion: "drag" } as React.CSSProperties}
      >
        <button
          onClick={openMainApp}
          title="Open JustDilo"
          className="flex items-center gap-1.5 hover:opacity-70 transition-opacity"
          style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icons/icon-32.png" alt="" className="w-4 h-4 rounded-[5px] opacity-80" />
          <span className="text-[12px] font-semibold text-black/70 dark:text-white/70 tracking-tight">
            JustDilo
          </span>
          {!signedOut && urgentCount > 0 && (
            <span className={cn(
              "text-[9px] font-bold px-1.5 py-0.5 rounded-full leading-none",
              overdue.length > 0
                ? "bg-red-500/15 text-red-500"
                : "bg-black/8 text-black/40 dark:bg-white/10 dark:text-white/40",
            )}>
              {urgentCount}
            </span>
          )}
        </button>

        {/* Mode pill */}
        <div
          className="flex items-center bg-black/5 dark:bg-white/8 rounded-lg p-0.5 gap-0.5"
          style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
        >
          {(["mic", "tasks"] as Mode[]).map(m => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={cn(
                "px-2.5 py-1 rounded-md text-[10px] font-medium transition-all capitalize",
                mode === m
                  ? "bg-white dark:bg-white/15 text-black dark:text-white shadow-sm"
                  : "text-black/35 dark:text-white/35 hover:text-black/60 dark:hover:text-white/60",
              )}
            >
              {m}
            </button>
          ))}
        </div>
      </div>

      {signedOut ? (
        /* ── Signed out ──────────────────────────────────────── */
        <div className="flex-1 flex flex-col items-center justify-center gap-3 px-6 pb-6">
          <p className="text-[12px] text-black/40 dark:text-white/40 text-center leading-relaxed">
            Sign in to JustDilo to see your tasks here
          </p>
          <button
            onClick={openMainApp}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-[12px] font-medium
              bg-black dark:bg-white text-white dark:text-black hover:scale-105 active:scale-95 transition-transform"
          >
            <LogIn className="w-3.5 h-3.5" />
            Open JustDilo
          </button>
        </div>
      ) : (
        <>
          {/* ── Mic section ──────────────────────────────────── */}
          <div className={cn(
            "flex flex-col items-center justify-center shrink-0 transition-all",
            mode === "mic" ? "flex-1 gap-4" : "py-4 gap-2",
          )}>
            <button
              onClick={toggle}
              disabled={phase === "processing"}
              className={cn(
                "rounded-full flex items-center justify-center relative transition-all",
                mode === "mic" ? "w-[72px] h-[72px]" : "w-[52px] h-[52px]",
                phase === "listening"
                  ? "bg-red-500 shadow-[0_0_24px_rgba(239,68,68,0.4)]"
                  : "bg-black dark:bg-white shadow-[0_4px_16px_rgba(0,0,0,0.2)] dark:shadow-[0_4px_16px_rgba(255,255,255,0.1)] hover:scale-105 active:scale-95",
                phase === "processing" && "opacity-50 cursor-default scale-100",
              )}
            >
              {phase === "listening" && (
                <span className="absolute inset-0 rounded-full bg-red-500 animate-ping opacity-25" />
              )}
              {phase === "processing" ? (
                <div className={cn(
                  "border-[2.5px] border-white/40 dark:border-black/40 border-t-white dark:border-t-black rounded-full animate-spin",
                  mode === "mic" ? "w-6 h-6" : "w-5 h-5",
                )} />
              ) : (
                <Mic className={cn(
                  "transition-all",
                  mode === "mic" ? "w-7 h-7" : "w-[22px] h-[22px]",
                  phase === "listening" ? "text-white" : "text-white dark:text-black",
                )} />
              )}
            </button>

            <p className={cn(
              "transition-all tracking-tight",
              mode === "mic" ? "text-[12px]" : "text-[10px]",
              phase === "listening"
                ? "text-red-500 font-medium"
                : "text-black/25 dark:text-white/25",
            )}>
              {phase === "listening" ? "Listening — click to stop"
                : phase === "processing" ? "Processing…"
                : phase === "error" ? "Try again"
                : mode === "mic" ? "Click to speak a task"
                : "Speak"}
            </p>
          </div>

          {/* ── Task list (tasks mode only) ──────────────────── */}
          {mode === "tasks" && (
            <div className="flex-1 overflow-y-auto px-2.5 pb-3 min-h-0">
              {overdue.length > 0 && (
                <Section label="⚠ Overdue" labelClass="text-red-500">
                  {overdue.map(t => <TaskRow key={t.id} task={t} onComplete={handleComplete} tone="overdue" />)}
                </Section>
              )}
              {todayTasks.length > 0 && (
                <Section label="Today">
                  {todayTasks.map(t => <TaskRow key={t.id} task={t} onComplete={handleComplete} tone={isDueNow(t.due_date) ? "now" : "normal"} />)}
                </Section>
              )}
              {upcoming.length > 0 && (
                <Section label="Upcoming">
                  {upcoming.map(t => <TaskRow key={t.id} task={t} onComplete={handleComplete} tone="upcoming" />)}
                </Section>
              )}
              {noDate.length > 0 && (
                <Section label="Pending">
                  {noDate.map(t => <TaskRow key={t.id} task={t} onComplete={handleComplete} tone="normal" />)}
                </Section>
              )}
              {tasks.length === 0 && (
                <div className="flex flex-col items-center justify-center h-24 gap-1.5 text-black/20 dark:text-white/20">
                  <Check className="w-5 h-5" strokeWidth={1.5} />
                  <p className="text-[11px]">All clear</p>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function Section({ label, labelClass, children }: { label: string; labelClass?: string; children: React.ReactNode }) {
  return (
    <div className="mb-2">
      <p className={cn("text-[9px] font-bold uppercase tracking-[0.1em] px-2 mb-1 mt-2", labelClass ?? "text-black/25 dark:text-white/25")}>
        {label}
      </p>
      <div className="space-y-0.5">{children}</div>
    </div>
  );
}

type Tone = "overdue" | "now" | "upcoming" | "normal";

function TaskRow({ task, onComplete, tone }: { task: WidgetTask; onComplete: (id: string) => void; tone: Tone }) {
  const [animOut, setAnimOut] = useState(false);
  const overdue = tone === "overdue";

  function handleComplete() {
    setAnimOut(true);
    setTimeout(() => { onComplete(task.id); setAnimOut(false); }, 250);
  }

  // Right-aligned hint: time for today's timed tasks, day label for upcoming,
  // original date for overdue. Date-only tasks show no sentinel time.
  const hint = !task.due_date ? null
    : overdue ? dueLabel(task.due_date).replace("Overdue · ", "")
    : tone === "upcoming" ? dueLabel(task.due_date)
    : dueTime(task.due_date);

  return (
    <div className={cn(
      "flex items-center gap-2 px-2 py-[7px] rounded-xl group transition-all duration-200",
      animOut ? "opacity-0 scale-95 -translate-y-1" : "opacity-100",
      overdue ? "bg-red-50 dark:bg-red-500/10" : "hover:bg-black/4 dark:hover:bg-white/5",
    )}>
      <button
        onClick={handleComplete}
        className={cn(
          "w-[15px] h-[15px] rounded-full border shrink-0 flex items-center justify-center transition-all",
          overdue
            ? "border-red-300 dark:border-red-500/60 hover:bg-red-100 dark:hover:bg-red-500/20"
            : "border-black/15 dark:border-white/15 hover:border-green-500 hover:bg-green-50 dark:hover:bg-green-500/10",
        )}
      >
        <Check className={cn(
          "w-2 h-2 transition-opacity",
          overdue ? "text-red-400 opacity-0 group-hover:opacity-100" : "text-green-500 opacity-0 group-hover:opacity-100",
        )} />
      </button>
      <span className={cn(
        "text-[11px] leading-snug line-clamp-1 flex-1 font-[450]",
        overdue ? "text-red-600/90 dark:text-red-400" :
        tone === "now" ? "text-orange-500 dark:text-orange-400" :
        tone === "upcoming" ? "text-black/55 dark:text-white/55" :
        "text-black/70 dark:text-white/70",
      )}>
        {task.title}
      </span>
      {hint && (
        <span className={cn(
          "text-[9.5px] shrink-0 tabular-nums",
          overdue ? "text-red-400/80" :
          tone === "now" ? "text-orange-400" :
          "text-black/30 dark:text-white/30",
        )}>
          {hint}
        </span>
      )}
      {task.priority === "high" && !overdue && (
        <span className="w-1.5 h-1.5 rounded-full bg-red-400 shrink-0" />
      )}
    </div>
  );
}
