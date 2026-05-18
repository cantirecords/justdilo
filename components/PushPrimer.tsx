"use client";
import { useEffect, useState } from "react";
import { Bell, X } from "lucide-react";
import { useFeature } from "@/lib/features";

const LS_KEY = "justdilo:pushPrimerDismissed";

function detectLocale(): "en" | "es" {
  if (typeof navigator === "undefined") return "en";
  return navigator.language?.toLowerCase().startsWith("es") ? "es" : "en";
}

const COPY = {
  en: {
    title:  "Want a reminder when tasks are due?",
    sub:    "We'll send a quiet daily nudge for today's tasks — that's it.",
    enable: "Enable reminders",
    later:  "Not now",
  },
  es: {
    title:  "¿Quieres recordatorios cuando tus tareas vencen?",
    sub:    "Enviamos un aviso diario discreto para las tareas de hoy — nada más.",
    enable: "Activar recordatorios",
    later:  "Ahora no",
  },
} as const;

const isElectron = () =>
  typeof navigator !== "undefined" && navigator.userAgent.includes("Electron");

export default function PushPrimer({ taskCount }: { taskCount: number }) {
  const enabled = useFeature("push_primer");
  const [state, setState] = useState<"loading" | "ok" | "show" | "dismissed">("loading");

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (localStorage.getItem(LS_KEY) === "1") { setState("dismissed"); return; }

    if (isElectron()) {
      if (Notification.permission === "granted") setState("ok");
      else if (Notification.permission === "denied") setState("ok");
      else setState("show");
      return;
    }

    if (!("serviceWorker" in navigator) || !("PushManager" in window)) { setState("ok"); return; }
    if (Notification.permission === "denied") { setState("ok"); return; }

    navigator.serviceWorker.ready.then((reg) =>
      reg.pushManager.getSubscription().then((sub) => setState(sub ? "ok" : "show")),
    ).catch(() => setState("ok"));
  }, []);

  // Hide as soon as the user has subscribed via any path
  useEffect(() => {
    function onSubscribed() { setState("ok"); }
    window.addEventListener("justdilo:push-subscribed", onSubscribed);
    return () => window.removeEventListener("justdilo:push-subscribed", onSubscribed);
  }, []);

  if (!enabled || state !== "show" || taskCount < 1) return null;

  const c = COPY[detectLocale()];

  function enable() {
    window.dispatchEvent(new CustomEvent("justdilo:request-push"));
  }
  function dismiss() {
    try { localStorage.setItem(LS_KEY, "1"); } catch {}
    setState("dismissed");
  }

  return (
    <div className="relative mb-3 rounded-xl border border-yellow-500/30 bg-yellow-500/[0.06] px-3 py-3 animate-rise">
      <button
        onClick={dismiss}
        className="absolute top-2 right-2 p-0.5 text-muted-foreground/40 hover:text-muted-foreground transition"
        aria-label="Dismiss"
      >
        <X className="w-3 h-3" />
      </button>

      <div className="flex items-center gap-2 mb-1">
        <Bell className="w-3.5 h-3.5 text-yellow-500" />
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
