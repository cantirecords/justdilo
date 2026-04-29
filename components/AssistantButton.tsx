"use client";
import { useEffect, useRef, useState } from "react";
import { Sparkles, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTTS, unlockAudio } from "@/lib/useTTS";
import type { Task } from "@/lib/types";

type Phase = "idle" | "listening" | "thinking" | "answer";

function buildTasksContext(tasks: Task[]): string {
  const now = new Date();
  const todayStr = now.toDateString();
  const pending = tasks.filter((t) => !t.completed);

  const overdue = pending.filter(
    (t) => t.due_date && new Date(t.due_date) < now && new Date(t.due_date).toDateString() !== todayStr,
  );
  const today = pending
    .filter((t) => t.due_date && new Date(t.due_date).toDateString() === todayStr)
    .sort((a, b) => new Date(a.due_date!).getTime() - new Date(b.due_date!).getTime());
  const upcoming = pending.filter((t) => !overdue.includes(t) && !today.includes(t)).slice(0, 12);

  let ctx = "";
  if (overdue.length) {
    ctx += `OVERDUE:\n${overdue.map((t) => `- ${t.title}${t.group_name ? ` [${t.group_name}]` : ""}${t.priority === "high" ? " [URGENT]" : ""}`).join("\n")}\n\n`;
  }
  if (today.length) {
    ctx += `TODAY:\n${today.map((t) => {
      const time = t.due_date ? new Date(t.due_date).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "";
      return `- ${t.title}${t.group_name ? ` [${t.group_name}]` : ""}${time ? ` at ${time}` : ""}${t.priority === "high" ? " [URGENT]" : ""}`;
    }).join("\n")}\n\n`;
  }
  if (upcoming.length) {
    ctx += `UPCOMING:\n${upcoming.map((t) => {
      const when = t.due_date
        ? new Date(t.due_date).toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" })
        : "no date";
      return `- ${t.title}${t.group_name ? ` [${t.group_name}]` : ""} (${when})${t.priority === "high" ? " [URGENT]" : ""}`;
    }).join("\n")}`;
  }
  return ctx.trim() || "No pending tasks.";
}

function WaveBars({ className }: { className?: string }) {
  return (
    <div className={cn("flex items-end gap-[3px] h-3", className)}>
      {[0, 1, 2, 3].map((i) => (
        <span
          key={i}
          className="w-[2.5px] rounded-full bg-current"
          style={{ height: "100%", transformOrigin: "bottom", animation: "waveBar 0.9s ease-in-out infinite", animationDelay: `${i * 0.18}s` }}
        />
      ))}
    </div>
  );
}

function ThinkingDots() {
  return (
    <span className="inline-flex gap-[4px] items-center ml-1">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="w-[4px] h-[4px] rounded-full bg-muted-foreground"
          style={{ animation: "dotBounce 1.3s ease-in-out infinite", animationDelay: `${i * 0.22}s` }}
        />
      ))}
    </span>
  );
}

export default function AssistantButton({ tasks }: { tasks: Task[] }) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [answer, setAnswer] = useState("");
  const [question, setQuestion] = useState("");
  const [isSpeaking, setIsSpeaking] = useState(false);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const rafRef = useRef<number>(0);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const dismissTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dismissedRef = useRef(false);
  const { speak, stop: stopTTS } = useTTS();

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && phase !== "idle") dismiss();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phase]);

  async function startListening() {
    if (phase !== "idle") return;
    unlockAudio();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", ""]
        .find((m) => m === "" || MediaRecorder.isTypeSupported(m)) ?? "";

      const rec = new MediaRecorder(stream, { ...(mime ? { mimeType: mime } : {}), audioBitsPerSecond: 64_000 });
      chunksRef.current = [];
      rec.ondataavailable = (e) => e.data.size && chunksRef.current.push(e.data);
      rec.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        cancelAnimationFrame(rafRef.current);
        audioCtxRef.current?.close();
        await askAI(new Blob(chunksRef.current, { type: rec.mimeType || mime }), rec.mimeType || mime);
      };
      rec.start();
      recorderRef.current = rec;
      setPhase("listening");

      // Voice activity detection — auto-stop after 1.8s of silence
      const audioCtx = new AudioContext();
      audioCtxRef.current = audioCtx;
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 512;
      audioCtx.createMediaStreamSource(stream).connect(analyser);
      const buf = new Uint8Array(analyser.frequencyBinCount);
      const startedAt = Date.now();
      let silenceStart: number | null = null;

      function tick() {
        analyser.getByteFrequencyData(buf);
        const avg = buf.reduce((a, b) => a + b, 0) / buf.length;
        const elapsed = Date.now() - startedAt;

        if (elapsed > 600) {
          if (avg < 10) {
            if (!silenceStart) silenceStart = Date.now();
            else if (Date.now() - silenceStart > 1800) {
              rec.stop();
              setPhase("thinking");
              return;
            }
          } else {
            silenceStart = null;
          }
        }

        if (elapsed > 25000) { rec.stop(); setPhase("thinking"); return; }
        rafRef.current = requestAnimationFrame(tick);
      }
      rafRef.current = requestAnimationFrame(tick);
    } catch (e: any) {
      console.error("AssistantButton mic:", e);
    }
  }

  async function askAI(blob: Blob, mime: string) {
    setPhase("thinking");
    dismissedRef.current = false;
    const ext = mime.includes("mp4") ? "mp4" : mime.includes("ogg") ? "ogg" : "webm";
    const fd = new FormData();
    fd.append("audio", new File([blob], `q-${Date.now()}.${ext}`, { type: blob.type }));
    fd.append("tasks_context", buildTasksContext(tasks));

    try {
      const res = await fetch("/api/ask", { method: "POST", body: fd });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed");
      setQuestion(json.question ?? "");
      setAnswer(json.answer ?? "");
      setPhase("answer");
      setIsSpeaking(true);
      await speak(json.answer);  // waits until every sentence has been spoken
      setIsSpeaking(false);
      // Auto-dismiss 2s after TTS finishes — unless user already dismissed manually
      if (!dismissedRef.current) {
        dismissTimer.current = setTimeout(dismiss, 2000);
      }
    } catch (e: any) {
      console.error("AssistantButton ask:", e);
      setPhase("idle");
    }
  }

  function dismiss() {
    dismissedRef.current = true;
    cancelAnimationFrame(rafRef.current);
    audioCtxRef.current?.close();
    if (dismissTimer.current) clearTimeout(dismissTimer.current);
    stopTTS();
    setAnswer("");
    setQuestion("");
    setIsSpeaking(false);
    setPhase("idle");
  }

  return (
    <>
      <button
        onClick={phase === "idle" ? startListening : phase === "answer" ? dismiss : undefined}
        disabled={phase === "thinking"}
        aria-label="Ask assistant"
        className={cn(
          "p-2 rounded-full transition relative",
          phase === "listening" && "text-amber-500",
          phase === "thinking" && "opacity-40 cursor-default",
          phase === "answer" && "text-amber-500",
          phase === "idle" && "hover:bg-muted",
        )}
      >
        <Sparkles className="w-4 h-4" />
        {phase === "listening" && (
          <span className="absolute inset-0 rounded-full bg-amber-500/10 animate-ping" />
        )}
      </button>

      {phase !== "idle" && (
        <div className="fixed top-[4.5rem] inset-x-0 px-4 z-40 pointer-events-none">
          <div className="max-w-2xl mx-auto pointer-events-auto status-enter">
            <div className="bg-background/96 backdrop-blur-md border border-border rounded-2xl shadow-2xl p-4 flex gap-3 items-start">
              <div className="mt-0.5 shrink-0">
                {phase === "listening" ? (
                  <WaveBars className="text-amber-500" />
                ) : (
                  <Sparkles className={cn("w-4 h-4", phase === "answer" ? "text-amber-500" : "text-muted-foreground")} />
                )}
              </div>

              <div className="flex-1 min-w-0">
                {question && phase === "answer" && (
                  <p className="text-[11px] text-muted-foreground mb-1 truncate">"{question}"</p>
                )}
                {phase === "listening" && (
                  <p className="text-sm text-muted-foreground">Listening…</p>
                )}
                {phase === "thinking" && (
                  <p className="text-sm text-muted-foreground">Thinking<ThinkingDots /></p>
                )}
                {phase === "answer" && (
                  <>
                    <p className="text-sm leading-relaxed">{answer}</p>
                    {isSpeaking && (
                      <div className="mt-2 flex items-center gap-2 text-amber-500/70">
                        <WaveBars />
                        <span className="text-[10px]">speaking</span>
                      </div>
                    )}
                  </>
                )}
              </div>

              {phase === "answer" && (
                <button onClick={dismiss} className="p-1 rounded-full hover:bg-muted shrink-0 transition">
                  <X className="w-3.5 h-3.5 text-muted-foreground" />
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
