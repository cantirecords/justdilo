"use client";
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { Mic, Square, WifiOff } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import type { Task } from "@/lib/types";
import type { ProcessPhase } from "./ProcessingStatus";
import { unlockAudio } from "@/lib/useTTS";

export type MicButtonHandle = { start: () => void; stop: () => void };

type Props = {
  onProcessingChange: (b: boolean) => void;
  onPhaseChange?: (phase: ProcessPhase) => void;
  onNewTasks: (tasks: Task[], transcript: string, summary: string, groupCount: number, duplicatesSkipped: number, recurring: string[]) => void;
  onVoiceResult?: (json: any) => void;
  autoStart?: boolean;
};

const offlineQueue: Blob[] = [];

const MicButton = forwardRef<MicButtonHandle, Props>(function MicButton(
  { onProcessingChange, onPhaseChange, onNewTasks, onVoiceResult, autoStart }, ref,
) {
  const [recording, setRecording] = useState(false);
  const [busy, setBusy] = useState(false);
  const [offline, setOffline] = useState(false);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const thinkTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useImperativeHandle(ref, () => ({ start, stop }));

  const setPhase = (p: ProcessPhase) => onPhaseChange?.(p);

  // Online/offline detection + offline queue drain
  useEffect(() => {
    setOffline(!navigator.onLine);
    const goOnline = async () => {
      setOffline(false);
      if (!offlineQueue.length) return;
      toast.info(`Back online — processing ${offlineQueue.length} queued recording${offlineQueue.length > 1 ? "s" : ""}…`);
      const blobs = offlineQueue.splice(0);
      for (const blob of blobs) await upload(blob, blob.type);
    };
    const goOffline = () => setOffline(true);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => { window.removeEventListener("online", goOnline); window.removeEventListener("offline", goOffline); };
  }, []);

  // Space bar — hold to record, release to stop
  useEffect(() => {
    let held = false;
    function dn(e: KeyboardEvent) {
      if (e.code !== "Space" || held) return;
      const tag = (e.target as HTMLElement).tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      e.preventDefault(); held = true; start();
    }
    function up(e: KeyboardEvent) {
      if (e.code !== "Space" || !held) return;
      held = false; stop();
    }
    window.addEventListener("keydown", dn);
    window.addEventListener("keyup", up);
    return () => { window.removeEventListener("keydown", dn); window.removeEventListener("keyup", up); };
  }, [recording]);

  // Auto-start via ?action=capture (iOS home screen shortcut)
  useEffect(() => {
    if (autoStart) {
      const t = setTimeout(() => start(), 400);
      return () => clearTimeout(t);
    }
  }, [autoStart]);

  async function start() {
    if (recording || busy) return;
    unlockAudio();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus", ""]
        .find((m) => m === "" || MediaRecorder.isTypeSupported(m)) ?? "";
      const rec = new MediaRecorder(stream, { ...(mime ? { mimeType: mime } : {}), audioBitsPerSecond: 64_000 });
      chunksRef.current = [];
      rec.ondataavailable = (e) => e.data.size && chunksRef.current.push(e.data);
      rec.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunksRef.current, { type: rec.mimeType || mime });
        if (!navigator.onLine) {
          offlineQueue.push(blob);
          setPhase("idle");
          toast.warning("You're offline — recording saved, will process when reconnected.");
          return;
        }
        setPhase("thinking");
        thinkTimerRef.current = setTimeout(() => setPhase("organizing"), 1400);
        await upload(blob, rec.mimeType || mime);
      };
      rec.start();
      recorderRef.current = rec;
      setRecording(true);
      setPhase("listening");
    } catch (e: any) {
      toast.error(e?.message || "Microphone access denied");
    }
  }

  function stop() {
    if (!recording) return;
    recorderRef.current?.stop();
    setRecording(false);
  }

  async function upload(blob: Blob, mime: string) {
    setBusy(true);
    onProcessingChange(true);
    if (thinkTimerRef.current) clearTimeout(thinkTimerRef.current);
    const ext = mime.includes("mp4") ? "mp4" : mime.includes("ogg") ? "ogg" : "webm";
    const fd = new FormData();
    fd.append("audio", new File([blob], `rec-${Date.now()}.${ext}`, { type: blob.type }));
    fd.append("utcOffset", String(-new Date().getTimezoneOffset()));
    fd.append("timezone", Intl.DateTimeFormat().resolvedOptions().timeZone);
    try {
      const res = await fetch("/api/process-voice", { method: "POST", body: fd });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed");

      // Always pass the full result to the enhanced handler if provided
      onVoiceResult?.(json);

      const intent = json.intent ?? "CREATE_TASK";
      const tasks: Task[] = json.tasks ?? [];

      if (intent === "CREATE_TASK") {
        onNewTasks(tasks, json.transcript ?? "", json.overall_summary ?? "", json.groups?.length ?? 0, json.duplicates_skipped ?? 0, json.recurring ?? []);
        if (!tasks.length && !json.duplicates_skipped) toast.success("Note saved");
        else if (tasks.length) toast.success(`${tasks.length} task${tasks.length > 1 ? "s" : ""} captured`);
      } else if (intent === "UPDATE_TASK") {
        const n = json.updated_tasks?.length ?? 0;
        toast.success(n ? `Updated ${n} task${n > 1 ? "s" : ""}` : "Couldn't find that task to update");
      } else if (intent === "DELETE_TASK") {
        const n = json.deleted_task_ids?.length ?? 0;
        toast.success(n ? `Removed ${n} task${n > 1 ? "s" : ""}` : "Couldn't find that task");
      } else if (intent === "COMPLETE_TASK") {
        const n = json.completed_task_ids?.length ?? 0;
        toast.success(n ? `Marked ${n} task${n > 1 ? "s" : ""} done` : "Couldn't find that task");
      } else if (intent === "QUERY_TASKS") {
        // Answer handled by Dashboard via onVoiceResult
      }
      setPhase("done");
      setTimeout(() => setPhase("idle"), 1600);
    } catch (e: any) {
      toast.error(e?.message || "Something went wrong. Try again.");
      setPhase("idle");
    } finally {
      setBusy(false);
      onProcessingChange(false);
    }
  }

  const active = recording || busy;

  return (
    <div className="flex flex-col items-center gap-3">
      {/* button wrapper — rings are absolutely positioned inside and scale beyond via transform */}
      <div className="relative flex items-center justify-center w-32 h-32 sm:w-36 sm:h-36">

        {/* Idle breathing halo */}
        {!active && (
          <span
            className="absolute inset-0 rounded-full bg-foreground pointer-events-none"
            style={{ animation: "micBreathe 3s ease-in-out infinite" }}
          />
        )}

        {/* Recording sonar ripples */}
        {recording && (
          <>
            <span className="absolute inset-0 rounded-full bg-red-500/30 pointer-events-none" style={{ animation: "micRipple 1.9s ease-out infinite", animationDelay: "0s" }} />
            <span className="absolute inset-0 rounded-full bg-red-500/20 pointer-events-none" style={{ animation: "micRipple 1.9s ease-out infinite", animationDelay: "0.65s" }} />
            <span className="absolute inset-0 rounded-full bg-red-500/12 pointer-events-none" style={{ animation: "micRipple 1.9s ease-out infinite", animationDelay: "1.3s" }} />
          </>
        )}

        <button
          onClick={recording ? stop : start}
          disabled={busy && !recording}
          aria-label={recording ? "Stop recording" : "Start recording"}
          className={cn(
            "relative z-10 flex items-center justify-center w-full h-full rounded-full transition-all duration-300",
            recording
              ? "bg-red-500 text-white scale-[1.03]"
              : busy
              ? "bg-foreground/60 text-background"
              : "bg-foreground text-background active:scale-95",
          )}
        >
          {recording ? (
            <Square className="w-10 h-10" fill="currentColor" />
          ) : (
            <Mic className={cn("w-12 h-12", busy && "opacity-40")} />
          )}
        </button>
      </div>

      {offline && (
        <div className="flex items-center gap-1.5 text-xs text-amber-600 bg-amber-50 px-3 py-1.5 rounded-full">
          <WifiOff className="w-3 h-3" />
          Offline — recordings will sync when reconnected
        </div>
      )}

      {/* Hint text is rendered by the parent (Dashboard) to avoid duplication */}
    </div>
  );
});

export default MicButton;
