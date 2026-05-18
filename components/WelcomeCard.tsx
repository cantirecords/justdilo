"use client";
import { useEffect, useState } from "react";
import { Mic, Sparkles, X } from "lucide-react";
import { useFeature } from "@/lib/features";

const LS_KEY = "justdilo:welcomeDismissed";

function detectLocale(): "en" | "es" {
  if (typeof navigator === "undefined") return "en";
  return navigator.language?.toLowerCase().startsWith("es") ? "es" : "en";
}

const COPY = {
  en: {
    title: (name: string | null) => name ? `Welcome, ${name}` : "Welcome to JustDilo",
    sub:   "Speak your tasks — we organize them for you.",
    step1: "Tap the mic",
    step2: "Say anything in any language",
    step3: "AI handles dates, priority, recurring",
    dismiss: "Got it",
  },
  es: {
    title: (name: string | null) => name ? `Hola, ${name}` : "Bienvenido a JustDilo",
    sub:   "Habla tus tareas — nosotros las organizamos.",
    step1: "Toca el micrófono",
    step2: "Di lo que sea, en cualquier idioma",
    step3: "La IA pone fechas, prioridad y recurrencia",
    dismiss: "Entendido",
  },
} as const;

export default function WelcomeCard({ taskCount, nickname }: { taskCount: number; nickname: string | null }) {
  const enabled = useFeature("welcome_card");
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    if (typeof window === "undefined") return;
    setDismissed(localStorage.getItem(LS_KEY) === "1");
  }, []);

  if (!enabled || dismissed || taskCount > 0) return null;

  const c = COPY[detectLocale()];

  function dismiss() {
    try { localStorage.setItem(LS_KEY, "1"); } catch {}
    setDismissed(true);
  }

  return (
    <div className="relative mb-5 rounded-2xl border border-border bg-gradient-to-br from-foreground/[0.04] to-transparent px-4 py-4 animate-rise">
      <button
        onClick={dismiss}
        className="absolute top-2.5 right-2.5 p-1 text-muted-foreground/40 hover:text-muted-foreground transition"
        aria-label="Dismiss"
      >
        <X className="w-3.5 h-3.5" />
      </button>

      <div className="flex items-center gap-2 mb-1">
        <Sparkles className="w-3.5 h-3.5 text-foreground/60" />
        <p className="text-sm font-semibold">{c.title(nickname)}</p>
      </div>
      <p className="text-xs text-muted-foreground mb-3 leading-snug">{c.sub}</p>

      <ol className="space-y-1.5">
        <li className="flex items-center gap-2 text-xs text-foreground/80">
          <span className="inline-flex w-5 h-5 items-center justify-center rounded-full bg-foreground/10 text-[10px] font-semibold shrink-0">1</span>
          <Mic className="w-3 h-3 text-foreground/50" />
          <span>{c.step1}</span>
        </li>
        <li className="flex items-center gap-2 text-xs text-foreground/80">
          <span className="inline-flex w-5 h-5 items-center justify-center rounded-full bg-foreground/10 text-[10px] font-semibold shrink-0">2</span>
          <span>{c.step2}</span>
        </li>
        <li className="flex items-center gap-2 text-xs text-foreground/80">
          <span className="inline-flex w-5 h-5 items-center justify-center rounded-full bg-foreground/10 text-[10px] font-semibold shrink-0">3</span>
          <span>{c.step3}</span>
        </li>
      </ol>

      <button
        onClick={dismiss}
        className="mt-3 w-full text-[11px] font-medium text-muted-foreground hover:text-foreground transition py-1.5"
      >
        {c.dismiss}
      </button>
    </div>
  );
}
