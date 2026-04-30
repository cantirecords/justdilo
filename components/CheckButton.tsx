"use client";
import { useState } from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

type Size = "sm" | "md" | "lg";

const PARTICLES = [
  { angle:   0, color: "bg-violet-400" },
  { angle:  60, color: "bg-pink-400"   },
  { angle: 120, color: "bg-amber-400"  },
  { angle: 180, color: "bg-emerald-400"},
  { angle: 240, color: "bg-sky-400"    },
  { angle: 300, color: "bg-rose-400"   },
];

const sizes: Record<Size, { btn: string; icon: string; dot: string }> = {
  sm: { btn: "w-4 h-4 border-2", icon: "w-2.5 h-2.5",  dot: "w-1   h-1"   },
  md: { btn: "w-5 h-5 border-2", icon: "w-3   h-3",    dot: "w-1.5 h-1.5" },
  lg: { btn: "w-6 h-6 border-2", icon: "w-3.5 h-3.5",  dot: "w-2   h-2"   },
};

type Props = {
  completed: boolean;
  onToggle: () => void;
  size?: Size;
  className?: string;
};

export default function CheckButton({ completed, onToggle, size = "md", className }: Props) {
  const [bursting, setBursting] = useState(false);
  const s = sizes[size];

  function handleClick() {
    if (typeof navigator !== "undefined" && "vibrate" in navigator) {
      navigator.vibrate(!completed ? [12] : [6]);
    }
    if (!completed) {
      setBursting(true);
      setTimeout(() => setBursting(false), 650);
    }
    onToggle();
  }

  return (
    <div className={cn("relative flex-shrink-0 flex items-center justify-center", className)}>
      {bursting && (
        <>
          <span
            className="absolute rounded-full border-2 border-violet-300 pointer-events-none"
            style={{
              inset: "-4px",
              animation: "burst-ring 0.45s ease-out forwards",
            }}
          />
          {PARTICLES.map((p, i) => (
            <span
              key={i}
              className={cn("absolute rounded-full pointer-events-none", s.dot, p.color)}
              style={
                {
                  "--a": `${p.angle}deg`,
                  animation: `burst-particle 0.55s ease-out ${i * 18}ms forwards`,
                } as React.CSSProperties
              }
            />
          ))}
        </>
      )}

      <button
        onClick={handleClick}
        aria-label="Toggle complete"
        className={cn(
          "rounded-full flex items-center justify-center transition-all",
          s.btn,
          completed
            ? "bg-foreground border-foreground"
            : "border-border hover:border-foreground/40",
          bursting && "scale-95",
        )}
        style={completed && bursting
          ? { animation: "check-pop 0.3s ease-out forwards" }
          : undefined}
      >
        {completed && (
          <Check
            className={cn("text-background stroke-[3]", s.icon)}
            style={{ animation: bursting ? "check-pop 0.3s ease-out forwards" : undefined }}
          />
        )}
      </button>
    </div>
  );
}
