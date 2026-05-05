"use client";
import { useEffect, useRef, useState } from "react";
import { Mic, Check } from "lucide-react";
import { toast, Toaster } from "sonner";
import { createSupabaseBrowser } from "@/lib/supabase/client";

type Phase = "idle" | "listening" | "processing";
type SlimTask = { id: string; title: string; due_date: string | null };

export default function MiniWidget() {
  const [tasks, setTasks] = useState<SlimTask[]>([]);
  const [phase, setPhase] = useState<Phase>("idle");
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const sb = createSupabaseBrowser();

  async function load() {
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return;
    const today = new Date().toISOString().split("T")[0];
    const { data } = await sb.from("tasks")
      .select("id, title, due_date")
      .eq("user_id", user.id).eq("completed", false)
      .or(`due_date.is.null,due_date.lte.${today}`)
      .order("due_date", { ascending: true, nullsFirst: false })
      .limit(10);
    setTasks(data ?? []);
  }

  useEffect(() => {
    load();
    const ch = sb.channel("mini-rt")
      .on("postgres_changes", { event: "*", schema: "public", table: "tasks" }, () => load())
      .subscribe();
    return () => { sb.removeChannel(ch); };
  }, []);

  async function complete(id: string) {
    setTasks(t => t.filter(x => x.id !== id));
    await sb.from("tasks").update({ completed: true }).eq("id", id);
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
      try {
        const res = await fetch("/api/process-voice", { method: "POST", body: fd });
        const j = await res.json();
        if (j.tasks?.length) { toast.success(`+${j.tasks.length} added`); load(); }
      } catch { toast.error("Error"); }
      setPhase("idle");
    };
    rec.start(); recorderRef.current = rec; setPhase("listening");
  }

  function stopRecording() { recorderRef.current?.stop(); recorderRef.current = null; }

  const today = new Date().toISOString().split("T")[0];
  const overdue = tasks.filter(t => t.due_date && t.due_date < today);
  const topTask = overdue[0] ?? tasks[0];
  const isOverdue = topTask && topTask.due_date && topTask.due_date < today;

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
            onClick={phase === "listening" ? stopRecording : startRecording}
            disabled={phase === "processing"}
            style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
            className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 transition-all relative
              ${phase === "listening" ? "bg-red-500" : "bg-black dark:bg-white hover:scale-110 active:scale-95"}`}
          >
            {phase === "listening" && <span className="absolute inset-0 rounded-full bg-red-400 animate-ping opacity-30" />}
            {phase === "processing"
              ? <div className="w-3.5 h-3.5 border-2 border-white/40 dark:border-black/30 border-t-white dark:border-t-black rounded-full animate-spin" />
              : <Mic className={`w-4 h-4 ${phase === "listening" ? "text-white" : "text-white dark:text-black"}`} />}
          </button>

          <div className="flex-1 min-w-0">
            <p className="text-[11px] font-semibold text-black/50 dark:text-white/40 leading-none mb-0.5">
              {phase === "listening" ? "Listening…" : phase === "processing" ? "Processing…" : "JustDilo"}
            </p>
            {topTask && phase === "idle" && (
              <p className={`text-[12px] font-[500] leading-tight truncate ${isOverdue ? "text-red-500" : "text-black/75 dark:text-white/75"}`}>
                {isOverdue && "⚠ "}{topTask.title}
              </p>
            )}
          </div>

          {tasks.length > 1 && (
            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full shrink-0 leading-none
              ${overdue.length > 0 ? "bg-red-500/15 text-red-500" : "bg-black/7 text-black/35 dark:bg-white/8 dark:text-white/40"}`}>
              {tasks.length}
            </span>
          )}
        </div>

        {/* Next 2 tasks */}
        {tasks.length > 0 && phase === "idle" && (
          <div className="px-3 pb-2.5 space-y-0.5">
            {tasks.slice(0, 2).map(t => {
              const od = t.due_date && t.due_date < today;
              return (
                <div key={t.id} className="flex items-center gap-2 group">
                  <button
                    onClick={() => complete(t.id)}
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
