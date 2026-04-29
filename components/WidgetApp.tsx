"use client";
import { useEffect, useRef, useState } from "react";
import { Mic, Square } from "lucide-react";
import { toast, Toaster } from "sonner";
import { cn } from "@/lib/utils";
import { createSupabaseBrowser } from "@/lib/supabase/client";
import type { Task } from "@/lib/types";

type SlimTask = Pick<Task, "id" | "title" | "due_date" | "priority" | "completed" | "group_name">;

type Phase = "idle" | "listening" | "processing" | "done";

function WaveBars() {
  return (
    <div className="flex items-end gap-[3px] h-3">
      {[0, 1, 2, 3].map((i) => (
        <span
          key={i}
          className="w-[3px] rounded-full bg-current"
          style={{ height: "100%", transformOrigin: "bottom", animation: "waveBar 0.9s ease-in-out infinite", animationDelay: `${i * 0.18}s` }}
        />
      ))}
    </div>
  );
}

export default function WidgetApp({ initialTasks }: { initialTasks: SlimTask[] }) {
  const [tasks, setTasks] = useState<SlimTask[]>(initialTasks);
  const [phase, setPhase] = useState<Phase>("idle");
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  // Realtime sync — picks up tasks added from main app or this widget
  useEffect(() => {
    const sb = createSupabaseBrowser();
    const ch = sb.channel("widget-realtime")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "tasks" }, (p) => {
        setTasks((prev) => prev.some((t) => t.id === p.new.id) ? prev : [p.new as SlimTask, ...prev]);
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "tasks" }, (p) => {
        if (p.new.completed) setTasks((prev) => prev.filter((t) => t.id !== p.new.id));
        else setTasks((prev) => prev.map((t) => t.id === p.new.id ? { ...t, ...p.new as SlimTask } : t));
      })
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "tasks" }, (p) => {
        setTasks((prev) => prev.filter((t) => t.id !== p.old.id));
      })
      .subscribe();
    return () => { sb.removeChannel(ch); };
  }, []);

  async function startRecording() {
    if (phase !== "idle") return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", ""]
        .find((m) => m === "" || MediaRecorder.isTypeSupported(m)) ?? "";
      const rec = new MediaRecorder(stream, { ...(mime ? { mimeType: mime } : {}), audioBitsPerSecond: 64_000 });
      chunksRef.current = [];
      rec.ondataavailable = (e) => e.data.size && chunksRef.current.push(e.data);
      rec.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        await submit(new Blob(chunksRef.current, { type: rec.mimeType || mime }), rec.mimeType || mime);
      };
      rec.start();
      recorderRef.current = rec;
      setPhase("listening");
    } catch (e: any) {
      toast.error(e?.message || "Mic access denied");
    }
  }

  function stopRecording() {
    if (phase !== "listening") return;
    recorderRef.current?.stop();
    setPhase("processing");
  }

  async function submit(blob: Blob, mime: string) {
    setPhase("processing");
    const ext = mime.includes("mp4") ? "mp4" : mime.includes("ogg") ? "ogg" : "webm";
    const fd = new FormData();
    fd.append("audio", new File([blob], `rec-${Date.now()}.${ext}`, { type: blob.type }));
    try {
      const res = await fetch("/api/process-voice", { method: "POST", body: fd });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed");
      if (json.tasks?.length) toast.success(`${json.tasks.length} task${json.tasks.length > 1 ? "s" : ""} added`);
      else toast.message("Saved as note.");
    } catch (e: any) {
      toast.error(e?.message || "Something went wrong");
    } finally {
      setPhase("done");
      setTimeout(() => setPhase("idle"), 1200);
    }
  }

  const todayStr = new Date().toDateString();
  const todayTasks = tasks.filter((t) => t.due_date && new Date(t.due_date).toDateString() === todayStr);
  const upcoming = tasks.filter((t) => !t.due_date || new Date(t.due_date).toDateString() !== todayStr).slice(0, 6);

  return (
    <div className="flex flex-col h-screen bg-background text-foreground p-3 gap-3 select-none">
      <Toaster position="top-center" richColors />

      {/* Mic button */}
      <button
        onClick={phase === "listening" ? stopRecording : startRecording}
        disabled={phase === "processing"}
        className={cn(
          "w-full rounded-2xl flex items-center justify-center gap-2 py-3 text-sm font-medium transition-all shrink-0",
          phase === "listening" ? "bg-red-500 text-white mic-glow" : "bg-foreground text-background",
          phase === "processing" && "opacity-50 cursor-default",
        )}
      >
        {phase === "listening" && <><Square className="w-3.5 h-3.5" fill="currentColor" /> Stop</>}
        {phase === "processing" && <><WaveBars /> Processing…</>}
        {(phase === "idle" || phase === "done") && <><Mic className="w-3.5 h-3.5" /> Speak</>}
      </button>

      <div className="flex-1 overflow-y-auto space-y-3 min-h-0">
        {todayTasks.length > 0 && (
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
              Today · {todayTasks.length}
            </p>
            <ul className="space-y-1.5">
              {todayTasks.map((t) => (
                <li key={t.id} className="flex items-start gap-2 text-xs text-foreground/80 leading-snug">
                  <span className="w-2.5 h-2.5 rounded-full border border-border mt-0.5 shrink-0" />
                  {t.title}
                </li>
              ))}
            </ul>
          </div>
        )}

        {upcoming.length > 0 && (
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
              Upcoming
            </p>
            <ul className="space-y-1">
              {upcoming.map((t) => (
                <li key={t.id} className="text-xs text-muted-foreground truncate">{t.title}</li>
              ))}
            </ul>
          </div>
        )}

        {tasks.length === 0 && phase === "idle" && (
          <p className="text-xs text-muted-foreground/40 text-center pt-4">No pending tasks</p>
        )}
      </div>
    </div>
  );
}
