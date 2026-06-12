"use client";
import { useState } from "react";
import { Mic, Check, LogIn } from "lucide-react";
import { toast, Toaster } from "sonner";
import { openMainApp } from "@/lib/electron-api";
import { useWidgetTasks } from "@/lib/useWidgetTasks";
import { useVoiceRecorder } from "@/lib/useVoiceRecorder";
import { isDueNow, isOverdue, dueLabel } from "@/lib/widget-dates";

export default function FocusWidget() {
  const [completing, setCompleting] = useState(false);
  const { tasks, auth, load, complete } = useWidgetTasks({ urgentOnly: true, limit: 20 });
  const { phase, toggle } = useVoiceRecorder(
    (j) => { if (j.tasks?.length) toast.success(`+${j.tasks.length}`); load(); },
    (msg) => toast.error(msg),
  );

  const signedOut = auth === "signedOut";
  const topTask = tasks[0] ?? null;
  const remaining = tasks.length - 1;
  const topNow = topTask ? isDueNow(topTask.due_date) : false;
  const topOver = topTask ? isOverdue(topTask.due_date) : false;

  async function completeTop() {
    if (!topTask || completing) return;
    setCompleting(true);
    await new Promise(r => setTimeout(r, 300));
    const ok = await complete(topTask.id);
    setCompleting(false);
    if (!ok) toast.error("Couldn't complete — try again");
  }

  return (
    <div className="w-full h-screen flex items-center px-1.5 select-none" style={{ fontFamily: "-apple-system, BlinkMacSystemFont, sans-serif" }}>
      <Toaster position="top-center" richColors toastOptions={{ style: { fontSize: 11 } }} />

      <style>{`
        @keyframes nowPulse { 0%,100% { opacity: 1; } 50% { opacity: 0.2; } }
        .now-blink { animation: nowPulse 1s ease-in-out infinite; }

        @keyframes overdueGlow {
          0%,100% { box-shadow: 0 8px 40px rgba(0,0,0,0.16), 0 0 0 0 rgba(239,68,68,0); border-color: rgba(239,68,68,0.35); }
          50%      { box-shadow: 0 8px 40px rgba(0,0,0,0.22), 0 0 0 5px rgba(239,68,68,0.12); border-color: rgba(239,68,68,0.65); }
        }
        @keyframes nowGlow {
          0%,100% { box-shadow: 0 8px 40px rgba(0,0,0,0.16), 0 0 0 0 rgba(249,115,22,0); border-color: rgba(249,115,22,0.35); }
          50%      { box-shadow: 0 8px 40px rgba(0,0,0,0.22), 0 0 0 5px rgba(249,115,22,0.14); border-color: rgba(249,115,22,0.65); }
        }
        .card-overdue { animation: overdueGlow 2.2s ease-in-out infinite; border: 1.5px solid rgba(239,68,68,0.35); }
        .card-now     { animation: nowGlow 2.2s ease-in-out infinite; border: 1.5px solid rgba(249,115,22,0.35); }
        .card-normal  { box-shadow: 0 8px 40px rgba(0,0,0,0.16); border: 1px solid rgba(0,0,0,0.06); }
        .dark .card-normal { box-shadow: 0 8px 40px rgba(0,0,0,0.6); border-color: rgba(255,255,255,0.07); }
      `}</style>

      <div
        className={`w-full rounded-[20px] overflow-hidden
          bg-white/96 dark:bg-[#181818]/96
          ${topOver ? "card-overdue" : topNow ? "card-now" : "card-normal"}`}
        style={{ backdropFilter: "blur(24px)", WebkitAppRegion: "drag" } as React.CSSProperties}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 pt-3 pb-1">
          <span className="text-[10px] font-bold uppercase tracking-[0.1em] text-black/25 dark:text-white/25">
            {signedOut ? "JustDilo" : topOver ? "⚠ Overdue" : topNow ? "🔴 Now" : "Up next"}
          </span>
          <div className="flex items-center gap-2" style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}>
            {!signedOut && remaining > 0 && (
              <span className="text-[10px] text-black/25 dark:text-white/25">+{remaining} more</span>
            )}
            <button
              onClick={signedOut ? openMainApp : toggle}
              disabled={phase === "processing"}
              className={`w-6 h-6 rounded-full flex items-center justify-center transition-all
                ${phase === "listening" ? "bg-red-500" : "bg-black/8 dark:bg-white/10 hover:bg-black/15 dark:hover:bg-white/20"}`}
            >
              {phase === "processing"
                ? <div className="w-2.5 h-2.5 border border-black/30 dark:border-white/30 border-t-black dark:border-t-white rounded-full animate-spin" />
                : signedOut
                ? <LogIn className="w-3 h-3 text-black/50 dark:text-white/50" />
                : <Mic className={`w-3 h-3 ${phase === "listening" ? "text-white" : "text-black/50 dark:text-white/50"}`} />}
            </button>
          </div>
        </div>

        {/* Task */}
        <div className="px-4 py-3">
          {signedOut ? (
            <p className="text-[13px] text-black/45 dark:text-white/45">Sign in to see your next task</p>
          ) : topTask ? (
            <div className={`transition-all duration-300 ${completing ? "opacity-0 -translate-y-2" : "opacity-100"}`}>
              <div className="flex items-start gap-2">
                {topNow && (
                  <span className="now-blink mt-1.5 w-2 h-2 rounded-full bg-orange-400 shrink-0" />
                )}
                <p className={`text-[15px] font-[600] leading-snug ${
                  topOver ? "text-red-600 dark:text-red-400" :
                  topNow  ? "text-orange-500 dark:text-orange-400" :
                  "text-black/85 dark:text-white/85"
                }`}>
                  {topTask.title}
                </p>
              </div>
              {topTask.due_date && (
                <p className={`text-[11px] mt-0.5 font-medium ${
                  topOver ? "text-red-400" :
                  topNow  ? "text-orange-400" :
                  "text-black/35 dark:text-white/35"
                }`}>
                  {dueLabel(topTask.due_date)}
                </p>
              )}
            </div>
          ) : (
            <p className="text-[13px] text-black/25 dark:text-white/25">All done! 🎉</p>
          )}
        </div>

        {/* Complete / Sign in button */}
        {signedOut ? (
          <div className="px-3 pb-3" style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}>
            <button
              onClick={openMainApp}
              className="w-full flex items-center justify-center gap-1.5 py-2 rounded-xl
                bg-black/5 dark:bg-white/8 hover:bg-black/10 dark:hover:bg-white/15
                text-black/50 dark:text-white/50 transition-all text-[12px] font-medium"
            >
              <LogIn className="w-3.5 h-3.5" />
              Open JustDilo
            </button>
          </div>
        ) : topTask && (
          <div className="px-3 pb-3" style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}>
            <button
              onClick={completeTop}
              className="w-full flex items-center justify-center gap-1.5 py-2 rounded-xl
                bg-black/5 dark:bg-white/8 hover:bg-green-500/10 hover:text-green-600 dark:hover:text-green-400
                text-black/40 dark:text-white/40 transition-all text-[12px] font-medium group"
            >
              <Check className="w-3.5 h-3.5 group-hover:scale-110 transition-transform" />
              Mark complete
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
