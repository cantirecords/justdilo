"use client";
import { Mic, Check, LogIn } from "lucide-react";
import { toast, Toaster } from "sonner";
import { openMainApp } from "@/lib/electron-api";
import { useWidgetTasks } from "@/lib/useWidgetTasks";
import { useVoiceRecorder } from "@/lib/useVoiceRecorder";
import { isOverdue } from "@/lib/widget-dates";

export default function MiniWidget() {
  const { tasks, auth, load, complete } = useWidgetTasks({ urgentOnly: true, limit: 10 });
  const { phase, toggle } = useVoiceRecorder(
    (j) => { if (j.tasks?.length) toast.success(`+${j.tasks.length} added`); load(); },
    (msg) => toast.error(msg),
  );

  const signedOut = auth === "signedOut";
  const overdueTasks = tasks.filter(t => isOverdue(t.due_date));
  const topTask = overdueTasks[0] ?? tasks[0];
  const topOverdue = topTask ? isOverdue(topTask.due_date) : false;

  async function handleComplete(id: string) {
    if (!(await complete(id))) toast.error("Couldn't complete — try again");
  }

  return (
    <div className="w-full h-screen flex items-center select-none px-1.5" style={{ fontFamily: "-apple-system, BlinkMacSystemFont, sans-serif" }}>
      <Toaster position="top-center" richColors toastOptions={{ style: { fontSize: 11 } }} />

      <div
        className="w-full rounded-2xl overflow-hidden
          bg-white/95 dark:bg-[#1c1c1c]/95
          border border-black/8 dark:border-white/[0.07]
          shadow-[0_6px_32px_rgba(0,0,0,0.14)] dark:shadow-[0_6px_32px_rgba(0,0,0,0.55)]"
        style={{ backdropFilter: "blur(24px)" }}
      >
        {/* Top row */}
        <div className="flex items-center gap-2.5 px-3 pt-2.5 pb-2" style={{ WebkitAppRegion: "drag" } as React.CSSProperties}>
          <button
            onClick={signedOut ? openMainApp : toggle}
            disabled={phase === "processing"}
            style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
            className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 transition-all relative
              ${phase === "listening" ? "bg-red-500" : "bg-black dark:bg-white hover:scale-110 active:scale-95"}`}
          >
            {phase === "listening" && <span className="absolute inset-0 rounded-full bg-red-400 animate-ping opacity-30" />}
            {phase === "processing"
              ? <div className="w-3.5 h-3.5 border-2 border-white/40 dark:border-black/30 border-t-white dark:border-t-black rounded-full animate-spin" />
              : signedOut
              ? <LogIn className="w-4 h-4 text-white dark:text-black" />
              : <Mic className={`w-4 h-4 ${phase === "listening" ? "text-white" : "text-white dark:text-black"}`} />}
          </button>

          <div className="flex-1 min-w-0">
            <p className="text-[11px] font-semibold text-black/50 dark:text-white/40 leading-none mb-0.5">
              {signedOut ? "JustDilo" :
               phase === "listening" ? "Listening…" :
               phase === "processing" ? "Processing…" :
               phase === "error" ? "Try again" : "JustDilo"}
            </p>
            {signedOut ? (
              <p className="text-[12px] font-[500] leading-tight text-black/60 dark:text-white/60">
                Sign in to see your tasks
              </p>
            ) : topTask && phase === "idle" && (
              <p className={`text-[12px] font-[500] leading-tight truncate ${topOverdue ? "text-red-500" : "text-black/75 dark:text-white/75"}`}>
                {topOverdue && "⚠ "}{topTask.title}
              </p>
            )}
          </div>

          {!signedOut && tasks.length > 1 && (
            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full shrink-0 leading-none
              ${overdueTasks.length > 0 ? "bg-red-500/15 text-red-500" : "bg-black/7 text-black/35 dark:bg-white/8 dark:text-white/40"}`}>
              {tasks.length}
            </span>
          )}
        </div>

        {/* Next 2 tasks */}
        {!signedOut && tasks.length > 0 && phase === "idle" && (
          <div className="px-3 pb-2.5 space-y-0.5">
            {tasks.slice(0, 2).map(t => {
              const od = isOverdue(t.due_date);
              return (
                <div key={t.id} className="flex items-center gap-2 group">
                  <button
                    onClick={() => handleComplete(t.id)}
                    className={`w-3.5 h-3.5 rounded-full border shrink-0 flex items-center justify-center transition-all
                      ${od ? "border-red-400/60" : "border-black/15 dark:border-white/15"} hover:border-green-500 hover:bg-green-50/50`}
                  >
                    <Check className="w-2 h-2 text-green-500 opacity-0 group-hover:opacity-100 transition" />
                  </button>
                  <span className={`text-[10.5px] truncate flex-1 ${od ? "text-red-400" : "text-black/55 dark:text-white/55"}`}>
                    {t.title}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
