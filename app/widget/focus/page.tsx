"use client";
import { useEffect, useRef, useState } from "react";
import { Mic, Check } from "lucide-react";
import { toast, Toaster } from "sonner";
import { createSupabaseBrowser } from "@/lib/supabase/client";
import { format, isToday, isPast } from "date-fns";

type SlimTask = { id: string; title: string; due_date: string | null; priority: string | null };

function hasTime(d: string) { return d.includes("T"); }
function isNow(due_date: string | null) {
  if (!due_date || !hasTime(due_date)) return false;
  const d = new Date(due_date);
  return isPast(d) && isToday(d);
}
function isOverdueDay(due_date: string | null) {
  if (!due_date) return false;
  return isPast(new Date(due_date)) && !isToday(new Date(due_date));
}

export default function FocusWidget() {
  const [tasks, setTasks] = useState<SlimTask[]>([]);
  const [phase, setPhase] = useState<"idle" | "listening" | "processing">("idle");
  const [completing, setCompleting] = useState(false);
  const [, setTick] = useState(0);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const sb = createSupabaseBrowser();

  async function load() {
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return;
    const tomorrow = new Date(Date.now() + 86400000).toISOString().split("T")[0];
    const { data } = await sb.from("tasks")
      .select("id, title, due_date, priority")
      .eq("user_id", user.id).eq("completed", false)
      .or(`due_date.is.null,due_date.lt.${tomorrow}`)
      .order("due_date", { ascending: true, nullsFirst: false })
      .limit(20);
    setTasks(data ?? []);
  }

  useEffect(() => {
    load();
    const ch = sb.channel("focus-rt")
      .on("postgres_changes", { event: "*", schema: "public", table: "tasks" }, () => load())
      .subscribe();
    const interval = setInterval(() => setTick(t => t + 1), 60_000);
    return () => { sb.removeChannel(ch); clearInterval(interval); };
  }, []);

  const topTask = tasks[0] ?? null;
  const remaining = tasks.length - 1;
  const topNow = topTask ? isNow(topTask.due_date) : false;
  const topOver = topTask ? isOverdueDay(topTask.due_date) : false;

  async function completeTop() {
    if (!topTask) return;
    setCompleting(true);
    await new Promise(r => setTimeout(r, 300));
    setTasks(t => t.slice(1));
    setCompleting(false);
    await sb.from("tasks").update({ completed: true }).eq("id", topTask.id);
  }

  async function startRecording() {
    if (phase !== "idle") return;
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const mime = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", ""].find(m => m === "" || MediaRecorder.isTypeSupported(m)) ?? "";
    const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : {});
    chunksRef.current = [];
    rec.ondataavailable = e => e.data.size && chunksRef.current.push(e.data);
    rec.onstop = async () => {
      stream.getTracks().forEach(t => t.stop());
      setPhase("processing");
      const ext = mime.includes("mp4") ? "mp4" : "webm";
      const fd = new FormData();
      fd.append("audio", new File(chunksRef.current, `r.${ext}`, { type: mime }));
      fd.append("utcOffset", String(-new Date().getTimezoneOffset()));
      fd.append("timezone", Intl.DateTimeFormat().resolvedOptions().timeZone);
      try {
        const res = await fetch("/api/process-voice", { method: "POST", body: fd });
        const j = await res.json();
        if (j.tasks?.length) { toast.success(`+${j.tasks.length}`); load(); }
      } catch { toast.error("Error"); }
      setPhase("idle");
    };
    rec.start(); recorderRef.current = rec; setPhase("listening");
  }
  function stopRecording() { recorderRef.current?.stop(); recorderRef.current = null; }

  function dueLabel(due_date: string) {
    if (isOverdueDay(due_date)) return `Overdue · ${format(new Date(due_date), "MMM d")}`;
    if (isNow(due_date)) return `NOW · ${format(new Date(due_date), "h:mm a")}`;
    if (isToday(new Date(due_date)) && hasTime(due_date)) return format(new Date(due_date), "h:mm a");
    if (isToday(new Date(due_date))) return "Today";
    return format(new Date(due_date), "MMM d");
  }

  return (
    <div className="w-full h-screen flex items-center px-1.5 select-none" style={{ fontFamily: "-apple-system, BlinkMacSystemFont, sans-serif" }}>
      <Toaster position="top-center" richColors toastOptions={{ style: { fontSize: 11 } }} />

      <style>{`
        @keyframes nowPulse { 0%,100% { opacity: 1; } 50% { opacity: 0.2; } }
        .now-blink { animation: nowPulse 1s ease-in-out infinite; }
      `}</style>

      <div
        className="w-full rounded-[20px] overflow-hidden
          bg-white/96 dark:bg-[#181818]/96
          border border-black/[0.06] dark:border-white/[0.07]
          shadow-[0_8px_40px_rgba(0,0,0,0.16)] dark:shadow-[0_8px_40px_rgba(0,0,0,0.6)]"
        style={{ backdropFilter: "blur(24px)", WebkitAppRegion: "drag" } as React.CSSProperties}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 pt-3 pb-1">
          <span className="text-[10px] font-bold uppercase tracking-[0.1em] text-black/25 dark:text-white/25">
            {topOver ? "⚠ Overdue" : topNow ? "🔴 Now" : "Up next"}
          </span>
          <div className="flex items-center gap-2" style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}>
            {remaining > 0 && (
              <span className="text-[10px] text-black/25 dark:text-white/25">+{remaining} more</span>
            )}
            <button
              onClick={phase === "listening" ? stopRecording : startRecording}
              disabled={phase === "processing"}
              className={`w-6 h-6 rounded-full flex items-center justify-center transition-all
                ${phase === "listening" ? "bg-red-500" : "bg-black/8 dark:bg-white/10 hover:bg-black/15 dark:hover:bg-white/20"}`}
            >
              {phase === "processing"
                ? <div className="w-2.5 h-2.5 border border-black/30 dark:border-white/30 border-t-black dark:border-t-white rounded-full animate-spin" />
                : <Mic className={`w-3 h-3 ${phase === "listening" ? "text-white" : "text-black/50 dark:text-white/50"}`} />}
            </button>
          </div>
        </div>

        {/* Task */}
        <div className="px-4 py-3">
          {topTask ? (
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

        {/* Complete button */}
        {topTask && (
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
