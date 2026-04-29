"use client";
import { useEffect, useRef, useState } from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

export type ProcessPhase = "idle" | "listening" | "thinking" | "organizing" | "done";

const LABELS: Record<Exclude<ProcessPhase, "idle">, string> = {
  listening: "Listening",
  thinking: "Thinking",
  organizing: "Aligning your thoughts",
  done: "Done",
};

function WaveformBars() {
  return (
    <div className="flex items-end gap-[3px] h-3.5">
      {[0, 1, 2, 3].map((i) => (
        <span
          key={i}
          className="w-[3px] rounded-full bg-current"
          style={{
            height: "100%",
            transformOrigin: "bottom",
            animation: "waveBar 0.9s ease-in-out infinite",
            animationDelay: `${i * 0.18}s`,
          }}
        />
      ))}
    </div>
  );
}

function BounceDots() {
  return (
    <span className="inline-flex gap-[4px] items-center">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="w-[4px] h-[4px] rounded-full bg-current"
          style={{
            animation: "dotBounce 1.3s ease-in-out infinite",
            animationDelay: `${i * 0.22}s`,
          }}
        />
      ))}
    </span>
  );
}

export default function ProcessingStatus({ phase }: { phase: ProcessPhase }) {
  const [visible, setVisible] = useState(false);
  const [exiting, setExiting] = useState(false);
  const exitTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (exitTimer.current) clearTimeout(exitTimer.current);

    if (phase === "idle") {
      setExiting(true);
      exitTimer.current = setTimeout(() => { setVisible(false); setExiting(false); }, 350);
    } else {
      setExiting(false);
      setVisible(true);
    }
  }, [phase]);

  if (!visible) return null;

  const isDone = phase === "done";

  return (
    <div
      className={cn(
        "flex items-center gap-2 text-sm font-light tracking-wide",
        exiting ? "status-exit" : "status-enter",
        isDone ? "text-emerald-500 dark:text-emerald-400" : "text-muted-foreground",
      )}
    >
      {phase === "listening" && <WaveformBars />}
      {(phase === "thinking" || phase === "organizing") && <BounceDots />}
      {isDone && <Check className="w-3.5 h-3.5" strokeWidth={2.5} />}

      <span>
        {phase !== "idle" && LABELS[phase as Exclude<ProcessPhase, "idle">]}
        {!isDone && <span className="opacity-40">...</span>}
      </span>
    </div>
  );
}
