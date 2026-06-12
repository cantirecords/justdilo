"use client";
import { useEffect, useRef, useState } from "react";

export type RecorderPhase = "idle" | "listening" | "processing" | "done" | "error";

// Hard cap so a forgotten recording doesn't run for hours and produce an
// upload too large to transcribe — it auto-stops and processes what it has.
const MAX_RECORDING_MS = 5 * 60 * 1000;

// Voice capture shared by all widget surfaces. Mirrors MicButton's recording
// setup (mime fallbacks, 64kbps, utcOffset + timezone fields) so widget
// captures parse dates identically to the main app.
export function useVoiceRecorder(onResult?: (json: any) => void, onError?: (message: string) => void) {
  const [phase, setPhase] = useState<RecorderPhase>("idle");
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const maxTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const resetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onResultRef = useRef(onResult);
  const onErrorRef = useRef(onError);
  onResultRef.current = onResult;
  onErrorRef.current = onError;

  useEffect(() => () => {
    if (maxTimerRef.current) clearTimeout(maxTimerRef.current);
    if (resetTimerRef.current) clearTimeout(resetTimerRef.current);
    if (recorderRef.current?.state === "recording") {
      recorderRef.current.onstop = null;
      recorderRef.current.stop();
      recorderRef.current.stream.getTracks().forEach((t) => t.stop());
    }
  }, []);

  function flash(p: "done" | "error", ms: number) {
    if (resetTimerRef.current) clearTimeout(resetTimerRef.current);
    setPhase(p);
    resetTimerRef.current = setTimeout(() => setPhase("idle"), ms);
  }

  async function start() {
    if (phase === "listening" || phase === "processing") return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus", ""]
        .find((m) => m === "" || MediaRecorder.isTypeSupported(m)) ?? "";
      const rec = new MediaRecorder(stream, { ...(mime ? { mimeType: mime } : {}), audioBitsPerSecond: 64_000 });
      chunksRef.current = [];
      rec.ondataavailable = (e) => e.data.size && chunksRef.current.push(e.data);
      rec.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        if (maxTimerRef.current) clearTimeout(maxTimerRef.current);
        setPhase("processing");
        await upload(new Blob(chunksRef.current, { type: rec.mimeType || mime }), rec.mimeType || mime);
      };
      rec.start();
      recorderRef.current = rec;
      setPhase("listening");
      maxTimerRef.current = setTimeout(stop, MAX_RECORDING_MS);
    } catch (e: any) {
      onErrorRef.current?.(e?.message || "Microphone access denied");
      flash("error", 2200);
    }
  }

  function stop() {
    if (recorderRef.current?.state === "recording") recorderRef.current.stop();
    recorderRef.current = null;
  }

  function toggle() {
    if (phase === "listening") stop();
    else start();
  }

  async function upload(blob: Blob, mime: string) {
    const ext = mime.includes("mp4") ? "mp4" : mime.includes("ogg") ? "ogg" : "webm";
    const fd = new FormData();
    fd.append("audio", new File([blob], `rec-${Date.now()}.${ext}`, { type: blob.type }));
    fd.append("utcOffset", String(-new Date().getTimezoneOffset()));
    fd.append("timezone", Intl.DateTimeFormat().resolvedOptions().timeZone);
    try {
      const res = await fetch("/api/process-voice", { method: "POST", body: fd });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed");
      onResultRef.current?.(json);
      flash("done", 1600);
    } catch (e: any) {
      onErrorRef.current?.(e?.message || "Something went wrong");
      flash("error", 2200);
    }
  }

  return { phase, start, stop, toggle };
}
