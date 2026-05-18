"use client";
import { useEffect, useState } from "react";
import { Mic, X } from "lucide-react";
import { useFeature } from "@/lib/features";

const LS_KEY = "justdilo:micPrimerDismissed";

function detectLocale(): "en" | "es" {
  if (typeof navigator === "undefined") return "en";
  return navigator.language?.toLowerCase().startsWith("es") ? "es" : "en";
}

const COPY = {
  en: {
    title:   "One quick step: enable your microphone",
    sub:     "We only listen the moment you tap the mic — never in the background.",
    enable:  "Enable microphone",
    later:   "Maybe later",
  },
  es: {
    title:   "Un paso rápido: activa tu micrófono",
    sub:     "Solo escuchamos cuando tocas el micro — nunca en segundo plano.",
    enable:  "Activar micrófono",
    later:   "Más tarde",
  },
} as const;

export default function MicPrimer() {
  const enabled = useFeature("mic_primer");
  const [state, setState] = useState<"loading" | "ok" | "show" | "dismissed">("loading");

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (localStorage.getItem(LS_KEY) === "1") { setState("dismissed"); return; }
    if (!navigator.mediaDevices || !navigator.permissions) { setState("ok"); return; }

    navigator.permissions.query({ name: "microphone" as PermissionName })
      .then((status: PermissionStatus) => {
        if (status.state === "granted" || status.state === "denied") setState("ok");
        else setState("show");
      })
      .catch(() => setState("ok"));
  }, []);

  if (!enabled || state !== "show") return null;

  const c = COPY[detectLocale()];

  async function enable() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((t) => t.stop());
    } catch {
      // user denied — still hide the primer
    } finally {
      setState("ok");
    }
  }

  function dismiss() {
    try { localStorage.setItem(LS_KEY, "1"); } catch {}
    setState("dismissed");
  }

  return (
    <div className="relative mb-3 rounded-xl border border-amber-500/30 bg-amber-500/[0.06] px-3 py-3 animate-rise">
      <button
        onClick={dismiss}
        className="absolute top-2 right-2 p-0.5 text-muted-foreground/40 hover:text-muted-foreground transition"
        aria-label="Dismiss"
      >
        <X className="w-3 h-3" />
      </button>

      <div className="flex items-center gap-2 mb-1">
        <Mic className="w-3.5 h-3.5 text-amber-500" />
        <p className="text-xs font-semibold text-foreground">{c.title}</p>
      </div>
      <p className="text-[11px] text-muted-foreground leading-snug mb-2.5">{c.sub}</p>

      <div className="flex gap-2">
        <button
          onClick={enable}
          className="flex-1 text-[11px] font-medium px-3 py-1.5 rounded-lg bg-foreground text-background hover:opacity-90 transition"
        >
          {c.enable}
        </button>
        <button
          onClick={dismiss}
          className="text-[11px] text-muted-foreground hover:text-foreground px-2 py-1.5 transition"
        >
          {c.later}
        </button>
      </div>
    </div>
  );
}
