"use client";
import { useEffect, useRef, useState } from "react";
import { Users, Square, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { createSupabaseBrowser } from "@/lib/supabase/client";
import { useFeature } from "@/lib/features";
import type { Meeting, Organization, Task } from "@/lib/types";

type Phase = "idle" | "recording" | "uploading" | "processing" | "done" | "error";

function detectLocale(): "en" | "es" {
  if (typeof navigator === "undefined") return "en";
  return navigator.language?.toLowerCase().startsWith("es") ? "es" : "en";
}

const COPY = {
  en: {
    title:       "Meeting",
    sub:         "Record a meeting — we'll transcribe, summarize, and turn action items into tasks.",
    start:       "Start meeting",
    stop:        "End meeting",
    uploading:   "Uploading audio…",
    processing:  "Transcribing & extracting tasks…",
    keepOpen:    "Keep this tab open while recording.",
    tasksMade:   (n: number) => n === 1 ? "1 task created" : `${n} tasks created`,
    decisions:   "Decisions",
    actions:     "Action items",
    noActions:   "No specific action items captured.",
    summaryHead: "Summary",
    again:       "Record another",
    micDenied:   "Microphone access denied",
    failed:      "Couldn't process the meeting. Try again.",
  },
  es: {
    title:       "Reunión",
    sub:         "Graba una reunión — transcribimos, resumimos y creamos tareas con los pendientes.",
    start:       "Empezar reunión",
    stop:        "Terminar reunión",
    uploading:   "Subiendo audio…",
    processing:  "Transcribiendo y extrayendo tareas…",
    keepOpen:    "Mantén esta pestaña abierta mientras grabas.",
    tasksMade:   (n: number) => n === 1 ? "1 tarea creada" : `${n} tareas creadas`,
    decisions:   "Decisiones",
    actions:     "Pendientes",
    noActions:   "No se identificaron pendientes específicos.",
    summaryHead: "Resumen",
    again:       "Grabar otra",
    micDenied:   "Acceso al micrófono denegado",
    failed:      "No se pudo procesar la reunión. Intenta de nuevo.",
  },
} as const;

function formatElapsed(ms: number): string {
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

type Props = {
  userId: string;
  orgs?: Organization[];
  onTasksCreated?: (tasks: Task[]) => void;
};

export default function MeetingCard({ userId, orgs = [], onTasksCreated }: Props) {
  const enabled = useFeature("meetings");
  const [phase, setPhase] = useState<Phase>("idle");
  const [elapsed, setElapsed] = useState(0);
  const [lastMeeting, setLastMeeting] = useState<Meeting | null>(null);
  const [lastTaskCount, setLastTaskCount] = useState(0);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startTsRef = useRef<number>(0);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // WakeLock is unsupported on Safari and unsupported in old TS lib types — keep loose typing.
  const wakeLockRef = useRef<any>(null);

  useEffect(() => () => cleanup(), []);

  function cleanup() {
    if (tickRef.current) clearInterval(tickRef.current);
    tickRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (wakeLockRef.current) {
      try { wakeLockRef.current.release(); } catch {}
      wakeLockRef.current = null;
    }
  }

  async function startRecording() {
    if (phase !== "idle" && phase !== "done" && phase !== "error") return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      streamRef.current = stream;
      // Pick the smallest viable opus mime — keeps a 1h meeting well under Whisper's 25MB cap.
      const mime = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus", ""]
        .find((m) => m === "" || MediaRecorder.isTypeSupported(m)) ?? "";
      const rec = new MediaRecorder(stream, { ...(mime ? { mimeType: mime } : {}), audioBitsPerSecond: 24_000 });
      chunksRef.current = [];
      rec.ondataavailable = (e) => { if (e.data.size) chunksRef.current.push(e.data); };
      rec.onstop = () => { void handleStop(rec.mimeType || mime); };
      // 5-second timeslice so a tab crash mid-meeting still gives us partial data.
      rec.start(5_000);
      recorderRef.current = rec;
      startTsRef.current = Date.now();
      setElapsed(0);
      tickRef.current = setInterval(() => setElapsed(Date.now() - startTsRef.current), 1000);
      setPhase("recording");

      // Keep screen awake while recording (best-effort; iOS Safari ignores).
      try {
        const wl = (navigator as any).wakeLock;
        if (wl?.request) wakeLockRef.current = await wl.request("screen");
      } catch {}
    } catch (e: any) {
      toast.error(e?.message || COPY[detectLocale()].micDenied);
      setPhase("idle");
    }
  }

  function stopRecording() {
    if (phase !== "recording") return;
    recorderRef.current?.stop();
    if (tickRef.current) { clearInterval(tickRef.current); tickRef.current = null; }
  }

  async function handleStop(mime: string) {
    const blob = new Blob(chunksRef.current, { type: mime || "audio/webm" });
    const seconds = Math.round((Date.now() - startTsRef.current) / 1000);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (wakeLockRef.current) { try { wakeLockRef.current.release(); } catch {} wakeLockRef.current = null; }

    if (blob.size < 1024) {
      toast.error("Recording too short.");
      setPhase("idle");
      return;
    }

    setPhase("uploading");
    try {
      const supabase = createSupabaseBrowser();
      const ext = mime.includes("mp4") ? "mp4" : mime.includes("ogg") ? "ogg" : "webm";
      const path = `${userId}/meetings/${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("captures")
        .upload(path, blob, { contentType: blob.type || "audio/webm", upsert: false });
      if (upErr) throw upErr;

      setPhase("processing");
      const orgId = orgs[0]?.id ?? null;
      const res = await fetch("/api/meetings/finish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          path,
          duration_seconds: seconds,
          org_id: orgId,
          project_id: null,
          utcOffset: -new Date().getTimezoneOffset(),
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed");

      setLastMeeting(json.meeting as Meeting);
      const tasks: Task[] = json.tasks ?? [];
      setLastTaskCount(tasks.length);
      onTasksCreated?.(tasks);
      setPhase("done");
      if (tasks.length) toast.success(COPY[detectLocale()].tasksMade(tasks.length));
      else toast.success(COPY[detectLocale()].title);
    } catch (e: any) {
      console.error("[MeetingCard] finish failed:", e);
      toast.error(e?.message || COPY[detectLocale()].failed);
      setPhase("error");
    }
  }

  if (!enabled) return null;
  const c = COPY[detectLocale()];

  return (
    <div className="relative mb-3 rounded-xl border border-border bg-foreground/[0.02] px-3 py-3 animate-rise">
      <div className="flex items-center gap-2 mb-1">
        <Users className="w-3.5 h-3.5 text-foreground/60" />
        <p className="text-xs font-semibold text-foreground">{c.title}</p>
        {phase === "recording" && (
          <span className="ml-auto flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-red-500" style={{ animation: "micBreathe 1.6s ease-in-out infinite" }} />
            <span className="text-[11px] tabular-nums text-red-500 font-medium">{formatElapsed(elapsed)}</span>
          </span>
        )}
      </div>

      {/* Idle / first-run blurb */}
      {phase === "idle" && !lastMeeting && (
        <p className="text-[11px] text-muted-foreground leading-snug mb-2.5">{c.sub}</p>
      )}

      {/* Processing states — show a hint about keeping the tab open while recording */}
      {phase === "recording" && (
        <p className="text-[11px] text-muted-foreground leading-snug mb-2.5">{c.keepOpen}</p>
      )}
      {(phase === "uploading" || phase === "processing") && (
        <div className="flex items-center gap-2 text-[11px] text-muted-foreground py-1.5">
          <Loader2 className="w-3 h-3 animate-spin" />
          <span>{phase === "uploading" ? c.uploading : c.processing}</span>
        </div>
      )}

      {/* Summary card after a finished meeting */}
      {phase === "done" && lastMeeting && (
        <div className="mb-2.5">
          <p className="text-[12px] font-semibold text-foreground leading-snug mb-1">{lastMeeting.title}</p>
          {lastMeeting.summary && (
            <p className="text-[11px] text-muted-foreground leading-snug mb-2">{lastMeeting.summary}</p>
          )}
          {Array.isArray(lastMeeting.decisions) && lastMeeting.decisions.length > 0 && (
            <div className="mb-2">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground/70 mb-0.5">{c.decisions}</p>
              <ul className="space-y-0.5">
                {lastMeeting.decisions.map((d, i) => (
                  <li key={i} className="text-[11px] text-foreground/80 leading-snug">• {d}</li>
                ))}
              </ul>
            </div>
          )}
          <p className="text-[10px] text-muted-foreground/70">
            {lastTaskCount > 0 ? c.tasksMade(lastTaskCount) : c.noActions}
          </p>
        </div>
      )}

      {/* Action button */}
      {phase === "recording" ? (
        <button
          onClick={stopRecording}
          className="w-full text-[11px] font-medium px-3 py-1.5 rounded-lg bg-red-500 hover:bg-red-600 text-white transition flex items-center justify-center gap-1.5"
        >
          <Square className="w-3 h-3" fill="currentColor" />
          {c.stop}
        </button>
      ) : phase === "uploading" || phase === "processing" ? (
        <button
          disabled
          className="w-full text-[11px] font-medium px-3 py-1.5 rounded-lg bg-foreground/30 text-background cursor-not-allowed"
        >
          {phase === "uploading" ? c.uploading : c.processing}
        </button>
      ) : (
        <button
          onClick={startRecording}
          className="w-full text-[11px] font-medium px-3 py-1.5 rounded-lg bg-foreground text-background hover:opacity-90 transition"
        >
          {phase === "done" ? c.again : c.start}
        </button>
      )}
    </div>
  );
}
