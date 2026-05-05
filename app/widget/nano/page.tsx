"use client";
import { useEffect, useRef, useState } from "react";
import { Mic } from "lucide-react";
import { toast, Toaster } from "sonner";
import { createSupabaseBrowser } from "@/lib/supabase/client";

type Phase = "idle" | "listening" | "processing";

export default function NanoWidget() {
  const [count, setCount] = useState(0);
  const [overdue, setOverdue] = useState(0);
  const [phase, setPhase] = useState<Phase>("idle");
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const sb = createSupabaseBrowser();

  useEffect(() => {
    async function load() {
      const { data: { user } } = await sb.auth.getUser();
      if (!user) return;
      const today = new Date().toISOString().split("T")[0];
      const { data } = await sb.from("tasks").select("id, due_date").eq("user_id", user.id).eq("completed", false);
      const all = data ?? [];
      setCount(all.length);
      setOverdue(all.filter(t => t.due_date && t.due_date < today).length);
    }
    load();

    const ch = sb.channel("nano-rt")
      .on("postgres_changes", { event: "*", schema: "public", table: "tasks" }, () => load())
      .subscribe();
    return () => { sb.removeChannel(ch); };
  }, []);

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
        if (j.tasks?.length) toast.success(`+${j.tasks.length}`);
      } catch { toast.error("Error"); }
      setPhase("idle");
    };
    rec.start();
    recorderRef.current = rec;
    setPhase("listening");
  }

  function stopRecording() {
    recorderRef.current?.stop();
    recorderRef.current = null;
  }

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
          onClick={phase === "listening" ? stopRecording : startRecording}
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
            : <Mic className={`w-3.5 h-3.5 ${phase === "listening" ? "text-white" : "text-white dark:text-black"}`} />}
        </button>

        {/* Label */}
        <span
          className="text-[12px] font-semibold tracking-tight text-black/60 dark:text-white/60 flex-1"
          style={{ WebkitAppRegion: "drag" } as React.CSSProperties}
        >
          {phase === "listening" ? "Listening…" : phase === "processing" ? "Saving…" : "JustDilo"}
        </span>

        {/* Count badge */}
        {count > 0 && phase === "idle" && (
          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full leading-none shrink-0
            ${overdue > 0 ? "bg-red-500/15 text-red-500" : "bg-black/8 text-black/40 dark:bg-white/10 dark:text-white/40"}`}>
            {count}
          </span>
        )}
      </div>
    </div>
  );
}
