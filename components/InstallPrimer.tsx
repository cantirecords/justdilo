"use client";
import { useEffect, useRef, useState } from "react";
import { Download, X } from "lucide-react";
import { useFeature } from "@/lib/features";

const LS_KEY = "justdilo:installPrimerDismissed";

type BIPEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

function detectLocale(): "en" | "es" {
  if (typeof navigator === "undefined") return "en";
  return navigator.language?.toLowerCase().startsWith("es") ? "es" : "en";
}

const COPY = {
  en: {
    title:   "Install JustDilo for faster access",
    sub:     "Adds a home-screen icon so you can capture tasks in one tap.",
    install: "Install",
    later:   "Maybe later",
  },
  es: {
    title:   "Instala JustDilo para acceso rápido",
    sub:     "Añade un icono a tu pantalla principal — captura tareas con un toque.",
    install: "Instalar",
    later:   "Más tarde",
  },
} as const;

const isElectron = () =>
  typeof navigator !== "undefined" && navigator.userAgent.includes("Electron");

export default function InstallPrimer() {
  const enabled = useFeature("install_primer");
  const [show, setShow] = useState(false);
  const promptRef = useRef<BIPEvent | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (isElectron()) return;
    if (localStorage.getItem(LS_KEY) === "1") return;
    if (window.matchMedia("(display-mode: standalone)").matches) return;

    function onBIP(e: Event) {
      e.preventDefault();
      promptRef.current = e as BIPEvent;
      setShow(true);
    }
    function onInstalled() {
      setShow(false);
      try { localStorage.setItem(LS_KEY, "1"); } catch {}
    }
    window.addEventListener("beforeinstallprompt", onBIP);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBIP);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (!enabled || !show) return null;

  const c = COPY[detectLocale()];

  async function install() {
    const evt = promptRef.current;
    if (!evt) return;
    await evt.prompt();
    const choice = await evt.userChoice;
    if (choice.outcome === "accepted") {
      try { localStorage.setItem(LS_KEY, "1"); } catch {}
    }
    setShow(false);
  }
  function dismiss() {
    try { localStorage.setItem(LS_KEY, "1"); } catch {}
    setShow(false);
  }

  return (
    <div className="relative mb-3 rounded-xl border border-sky-500/30 bg-sky-500/[0.06] px-3 py-3 animate-rise">
      <button
        onClick={dismiss}
        className="absolute top-2 right-2 p-0.5 text-muted-foreground/40 hover:text-muted-foreground transition"
        aria-label="Dismiss"
      >
        <X className="w-3 h-3" />
      </button>

      <div className="flex items-center gap-2 mb-1">
        <Download className="w-3.5 h-3.5 text-sky-500" />
        <p className="text-xs font-semibold text-foreground">{c.title}</p>
      </div>
      <p className="text-[11px] text-muted-foreground leading-snug mb-2.5">{c.sub}</p>

      <div className="flex gap-2">
        <button
          onClick={install}
          className="flex-1 text-[11px] font-medium px-3 py-1.5 rounded-lg bg-foreground text-background hover:opacity-90 transition"
        >
          {c.install}
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
