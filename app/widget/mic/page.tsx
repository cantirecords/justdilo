"use client";
import { useRef, useState } from "react";
import { Mic, Check } from "lucide-react";
import { toast, Toaster } from "sonner";

type Phase = "idle" | "listening" | "processing" | "done";

export default function MicWidget() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [hovered, setHovered] = useState(false);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  async function handleClick() {
    if (phase === "listening") {
      recorderRef.current?.stop();
      recorderRef.current = null;
      return;
    }
    if (phase !== "idle") return;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", ""]
        .find(m => m === "" || MediaRecorder.isTypeSupported(m)) ?? "";
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
          if (!res.ok) throw new Error(j.error || "Failed");
          if (j.tasks?.length) toast.success(`${j.tasks.length} task${j.tasks.length > 1 ? "s" : ""} added`, { duration: 2000 });
          else toast.message("Saved", { duration: 1500 });
          setPhase("done");
          setTimeout(() => setPhase("idle"), 1200);
        } catch (e: any) {
          toast.error(e.message || "Error");
          setPhase("idle");
        }
      };
      rec.start();
      recorderRef.current = rec;
      setPhase("listening");
    } catch {
      toast.error("Mic access denied");
    }
  }

  const isListening = phase === "listening";
  const isProcessing = phase === "processing";
  const isDone = phase === "done";

  return (
    <>
      <style>{`
        * { margin: 0; padding: 0; box-sizing: border-box; }
        html, body { width: 100%; height: 100%; overflow: hidden; background: transparent; }

        @keyframes ping { 0% { transform: scale(1); opacity: 0.6; } 100% { transform: scale(1.8); opacity: 0; } }
        @keyframes ping2 { 0% { transform: scale(1); opacity: 0.4; } 100% { transform: scale(2.4); opacity: 0; } }
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes pop { 0% { transform: scale(0.8); opacity: 0; } 60% { transform: scale(1.1); } 100% { transform: scale(1); opacity: 1; } }

        .ring1 { animation: ping 1s ease-out infinite; }
        .ring2 { animation: ping2 1.4s ease-out infinite 0.2s; }
        .spin  { animation: spin 0.8s linear infinite; }
        .pop   { animation: pop 0.3s ease-out; }
      `}</style>

      <Toaster
        position="top-center"
        richColors
        toastOptions={{ style: { fontSize: 11, maxWidth: 160 } }}
      />

      {/* Full window — transparent, draggable from edges */}
      <div
        className="w-screen h-screen flex items-center justify-center"
        style={{ WebkitAppRegion: "drag", cursor: "move" } as React.CSSProperties}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        {/* Circle mic button */}
        <button
          onClick={handleClick}
          style={{
            WebkitAppRegion: "no-drag",
            width: "min(88vw, 88vh)",
            height: "min(88vw, 88vh)",
            position: "relative",
            borderRadius: "50%",
            border: "none",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            transition: "transform 0.15s ease, box-shadow 0.2s ease",
            transform: hovered && phase === "idle" ? "scale(1.04)" : "scale(1)",
            background: isListening
              ? "#ef4444"
              : isDone
              ? "#22c55e"
              : "rgba(0,0,0,0.88)",
            boxShadow: isListening
              ? "0 0 0 0 rgba(239,68,68,0.5), 0 8px 40px rgba(239,68,68,0.35)"
              : isDone
              ? "0 8px 32px rgba(34,197,94,0.4)"
              : hovered
              ? "0 12px 48px rgba(0,0,0,0.45)"
              : "0 6px 32px rgba(0,0,0,0.3)",
          } as React.CSSProperties}
        >
          {/* Pulse rings when recording */}
          {isListening && (
            <>
              <span className="ring1" style={{
                position: "absolute", inset: 0, borderRadius: "50%",
                background: "rgba(239,68,68,0.35)",
              }} />
              <span className="ring2" style={{
                position: "absolute", inset: 0, borderRadius: "50%",
                background: "rgba(239,68,68,0.2)",
              }} />
            </>
          )}

          {/* Icon */}
          {isProcessing ? (
            <span className="spin" style={{
              width: "22%", height: "22%", borderRadius: "50%",
              border: "2.5px solid rgba(255,255,255,0.2)",
              borderTopColor: "white", display: "block",
            }} />
          ) : isDone ? (
            <Check
              className="pop"
              style={{ width: "26%", height: "26%", color: "white", strokeWidth: 3 }}
            />
          ) : (
            <Mic style={{
              width: "28%", height: "28%", color: "white",
              filter: isListening ? "drop-shadow(0 0 4px rgba(255,255,255,0.5))" : "none",
            }} />
          )}
        </button>

        {/* Resize corner indicator — only visible on hover */}
        {hovered && (
          <div style={{
            position: "fixed", bottom: 4, right: 4,
            width: 12, height: 12,
            WebkitAppRegion: "no-drag",
            cursor: "se-resize",
            opacity: 0.35,
            pointerEvents: "none",
          } as React.CSSProperties}>
            <svg viewBox="0 0 12 12" fill="currentColor" style={{ color: "white" }}>
              <path d="M12 12H8v-1h3V8h1v4zM12 7H9V4h1v2h2v1zM12 2h-2V1h3v3h-1V2z" opacity="0.8"/>
            </svg>
          </div>
        )}

        {/* Status label — only when recording or processing, fades with size */}
        {(isListening || isProcessing) && (
          <div style={{
            position: "fixed", bottom: "6%",
            left: "50%", transform: "translateX(-50%)",
            fontSize: "clamp(8px, 2.5vw, 12px)",
            color: isListening ? "#fca5a5" : "rgba(255,255,255,0.4)",
            fontFamily: "-apple-system, BlinkMacSystemFont, sans-serif",
            fontWeight: 500,
            letterSpacing: "0.04em",
            whiteSpace: "nowrap",
            pointerEvents: "none",
            WebkitAppRegion: "no-drag",
          } as React.CSSProperties}>
            {isListening ? "tap to stop" : "saving…"}
          </div>
        )}
      </div>
    </>
  );
}
