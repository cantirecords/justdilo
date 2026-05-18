"use client";
import { useFeature } from "@/lib/features";

const HINTS_EN = [
  "Call mom tomorrow at 5pm",
  "Buy oat milk in the morning",
  "Review the report by Friday",
];

const HINTS_ES = [
  "Llamar a mi mamá mañana a las 5",
  "Comprar leche en la mañana",
  "Revisar el reporte el viernes",
];

function detectLocale(): "en" | "es" {
  if (typeof navigator === "undefined") return "en";
  return navigator.language?.toLowerCase().startsWith("es") ? "es" : "en";
}

export default function OnboardingHints({ taskCount }: { taskCount: number }) {
  const enabled = useFeature("onboarding_hints");
  if (!enabled || taskCount > 0) return null;

  const locale = detectLocale();
  const hints = locale === "es" ? HINTS_ES : HINTS_EN;
  const label = locale === "es" ? "Prueba decir:" : "Try saying:";

  function seed(text: string) {
    window.dispatchEvent(new CustomEvent("justdilo:seed-quickadd", { detail: { text } }));
  }

  return (
    <div className="mt-5 flex flex-col items-center gap-2 px-2 animate-rise">
      <p className="text-[11px] text-muted-foreground/60 tracking-wide">{label}</p>
      <div className="flex flex-wrap justify-center gap-1.5">
        {hints.map((h) => (
          <button
            key={h}
            onClick={() => seed(h)}
            className="text-[11px] px-3 py-1.5 rounded-full border border-border bg-muted/30 hover:bg-muted/60 text-foreground/70 hover:text-foreground transition"
          >
            {h}
          </button>
        ))}
      </div>
    </div>
  );
}
