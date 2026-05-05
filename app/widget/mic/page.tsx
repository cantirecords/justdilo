"use client";
import { useRef, useState } from "react";
import { Mic, Check, X } from "lucide-react";

type Phase = "idle" | "listening" | "processing" | "done" | "error";

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
    if (phase !== "idle" && phase !== "error") return;

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
          setPhase("done");
          setTimeout(() => setPhase("idle"), 1800);
        } catch {
          setPhase("error");
          setTimeout(() => setPhase("idle"), 2000);
        }
      };
      rec.start();
      recorderRef.current = rec;
      setPhase("listening");
    } catch {
      setPhase("error");
      setTimeout(() => setPhase("idle"), 2000);
    }
  }

  // Colors per phase
  const bg =
    phase === "listening"  ? "#ef4444" :
    phase === "done"       ? "#22c55e" :
    phase === "error"      ? "#f97316" :
    phase === "processing" ? "rgba(0,0,0,0.82)" :
                             "rgba(0,0,0,0.86)";

  const shadow =
    phase === "listening"  ? "0 0 0 0 rgba(239,68,68,0.4), 0 8px 48px rgba(239,68,68,0.5)" :
    phase === "done"       ? "0 8px 40px rgba(34,197,94,0.5)" :
    phase === "error"      ? "0 8px 40px rgba(249,115,22,0.4)" :
                             hovered
                               ? "0 16px 56px rgba(0,0,0,0.55)"
                               : "0 6px 36px rgba(0,0,0,0.38)";

  return (
    <>
      <style>{`
        * { margin: 0; padding: 0; box-sizing: border-box; }
        html, body { width: 100%; height: 100%; overflow: hidden; background: transparent; -webkit-user-select: none; user-select: none; }

        @keyframes ping  { 0% { transform: scale(1); opacity: 0.55; } 100% { transform: scale(1.75); opacity: 0; } }
        @keyframes ping2 { 0% { transform: scale(1); opacity: 0.35; } 100% { transform: scale(2.3);  opacity: 0; } }
        @keyframes spin  { to { transform: rotate(360deg); } }
        @keyframes pop   { 0% { transform: scale(0.7) rotate(-10deg); opacity: 0; } 60% { transform: scale(1.15) rotate(2deg); } 100% { transform: scale(1) rotate(0); opacity: 1; } }
        @keyframes shake { 0%,100% { transform: translateX(0); } 20%,60% { transform: translateX(-4px); } 40%,80% { transform: translateX(4px); } }

        .ring1 { animation: ping  1s ease-out infinite; }
        .ring2 { animation: ping2 1.5s ease-out infinite 0.25s; }
        .spin  { animation: spin  0.75s linear infinite; }
        .pop   { animation: pop   0.35s cubic-bezier(.34,1.56,.64,1) forwards; }
        .shake { animation: shake 0.4s ease; }
      `}</style>

      <div
        style={{
          width: "100vw", height: "100vh",
          display: "flex", flexDirection: "column",
          alignItems: "center", justifyContent: "center",
          gap: "clamp(4px, 2vh, 10px)",
          WebkitAppRegion: "drag",
          cursor: "grab",
        } as React.CSSProperties}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        {/* Drag handle — always rendered, visible on hover */}
        <div style={{
          display: "flex", gap: 4, alignItems: "center",
          opacity: hovered ? 0.5 : 0.18,
          transition: "opacity 0.2s ease",
          pointerEvents: "none",
        }}>
          {[0,1,2,3,4].map(i => (
            <div key={i} style={{
              width: 4, height: 4, borderRadius: "50%",
              background: "white",
            }} />
          ))}
        </div>

        {/* Circle button */}
        <button
          onClick={handleClick}
          style={{
            WebkitAppRegion: "no-drag",
            width: "min(82vw, 82vh)",
            height: "min(82vw, 82vh)",
            borderRadius: "50%",
            border: "none",
            cursor: phase === "processing" ? "wait" : "pointer",
            display: "flex", alignItems: "center", justifyContent: "center",
            position: "relative",
            background: bg,
            boxShadow: shadow,
            transition: "background 0.25s ease, box-shadow 0.25s ease, transform 0.15s ease",
            transform: hovered && phase === "idle" ? "scale(1.03)" : "scale(1)",
            outline: "none",
          } as React.CSSProperties}
          className={phase === "error" ? "shake" : ""}
        >
          {/* Pulse rings when recording */}
          {phase === "listening" && <>
            <span className="ring1" style={{ position: "absolute", inset: 0, borderRadius: "50%", background: "rgba(239,68,68,0.3)" }} />
            <span className="ring2" style={{ position: "absolute", inset: 0, borderRadius: "50%", background: "rgba(239,68,68,0.18)" }} />
          </>}

          {/* Icon */}
          {phase === "processing" && (
            <span className="spin" style={{
              width: "24%", height: "24%", borderRadius: "50%", display: "block",
              border: "3px solid rgba(255,255,255,0.18)",
              borderTopColor: "rgba(255,255,255,0.9)",
            }} />
          )}
          {phase === "done" && (
            <Check className="pop" style={{ width: "30%", height: "30%", color: "white", strokeWidth: 2.5 }} />
          )}
          {phase === "error" && (
            <X style={{ width: "28%", height: "28%", color: "white", strokeWidth: 2.5 }} />
          )}
          {(phase === "idle" || phase === "listening") && (
            <Mic style={{
              width: "30%", height: "30%",
              color: "white",
              strokeWidth: 2,
              filter: phase === "listening" ? "drop-shadow(0 0 6px rgba(255,255,255,0.6))" : "none",
              transition: "filter 0.2s",
            }} />
          )}

          {/* Inner label ring — shown only at larger sizes */}
          {phase === "listening" && (
            <span style={{
              position: "absolute",
              bottom: "14%",
              fontSize: "clamp(0px, 3vmin, 11px)",
              color: "rgba(255,255,255,0.75)",
              fontFamily: "-apple-system, BlinkMacSystemFont, sans-serif",
              fontWeight: 500,
              letterSpacing: "0.05em",
              pointerEvents: "none",
            }}>
              tap to stop
            </span>
          )}
        </button>

        {/* Phase label below — scales with widget size */}
        <div style={{
          fontSize: "clamp(0px, 2.2vmin, 10px)",
          color: "rgba(255,255,255,0.3)",
          fontFamily: "-apple-system, BlinkMacSystemFont, sans-serif",
          fontWeight: 500,
          letterSpacing: "0.06em",
          pointerEvents: "none",
          height: "clamp(0px, 3vmin, 14px)",
          display: "flex", alignItems: "center",
          transition: "color 0.2s",
        }}>
          {phase === "done"  ? "✓ saved" :
           phase === "error" ? "try again" :
           phase === "idle"  && hovered ? "click to speak" : ""}
        </div>
      </div>
    </>
  );
}
