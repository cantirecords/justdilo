"use client";
import { Mic, LogIn } from "lucide-react";
import { toast, Toaster } from "sonner";
import { openMainApp } from "@/lib/electron-api";
import { useWidgetTasks } from "@/lib/useWidgetTasks";
import { useVoiceRecorder } from "@/lib/useVoiceRecorder";
import { isOverdue } from "@/lib/widget-dates";

export default function NanoWidget() {
  const { tasks, auth, load } = useWidgetTasks({ limit: 200 });
  const { phase, toggle } = useVoiceRecorder(
    (j) => { if (j.tasks?.length) toast.success(`+${j.tasks.length}`); load(); },
    (msg) => toast.error(msg),
  );

  const signedOut = auth === "signedOut";
  const count = tasks.length;
  const overdue = tasks.filter(t => isOverdue(t.due_date)).length;

  return (
    <div className="w-full h-screen flex items-center select-none" style={{ fontFamily: "-apple-system, BlinkMacSystemFont, sans-serif" }}>
      <Toaster position="top-center" richColors toastOptions={{ style: { fontSize: 11 } }} />

      {/* Pill */}
      <div
        className="flex items-center gap-2.5 px-3.5 h-[48px] rounded-full w-full mx-1.5
          bg-white/95 dark:bg-[#1c1c1c]/95
          border border-black/8 dark:border-white/10
          shadow-[0_4px_24px_rgba(0,0,0,0.15)] dark:shadow-[0_4px_24px_rgba(0,0,0,0.5)]"
        style={{ backdropFilter: "blur(20px)", WebkitAppRegion: "drag" } as React.CSSProperties}
      >
        {/* Mic */}
        <button
          onClick={signedOut ? openMainApp : toggle}
          disabled={phase === "processing"}
          style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
          className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 transition-all relative
            ${phase === "listening"
              ? "bg-red-500 shadow-[0_0_12px_rgba(239,68,68,0.5)]"
              : "bg-black dark:bg-white hover:scale-110 active:scale-95"}`}
        >
          {phase === "listening" && <span className="absolute inset-0 rounded-full bg-red-500 animate-ping opacity-30" />}
          {phase === "processing"
            ? <div className="w-3 h-3 border-2 border-white/40 dark:border-black/40 border-t-white dark:border-t-black rounded-full animate-spin" />
            : signedOut
            ? <LogIn className="w-3.5 h-3.5 text-white dark:text-black" />
            : <Mic className={`w-3.5 h-3.5 ${phase === "listening" ? "text-white" : "text-white dark:text-black"}`} />}
        </button>

        {/* Label */}
        <span
          className="text-[12px] font-semibold tracking-tight text-black/60 dark:text-white/60 flex-1"
          style={{ WebkitAppRegion: "drag" } as React.CSSProperties}
        >
          {signedOut ? "Sign in" :
           phase === "listening" ? "Listening…" :
           phase === "processing" ? "Saving…" :
           phase === "error" ? "Try again" : "JustDilo"}
        </span>

        {/* Count badge */}
        {!signedOut && count > 0 && phase === "idle" && (
          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full leading-none shrink-0
            ${overdue > 0 ? "bg-red-500/15 text-red-500" : "bg-black/8 text-black/40 dark:bg-white/10 dark:text-white/40"}`}>
            {count}
          </span>
        )}
      </div>
    </div>
  );
}
