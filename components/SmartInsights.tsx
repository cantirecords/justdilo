"use client";
import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { useFeature } from "@/lib/features";

type RecurringSuggestion = {
  norm_title: string;
  occurrences: number;
  avg_gap_days: number;
  suggested_type: string;
  sample_title: string;
};

type Insights = {
  recurring: RecurringSuggestion[];
  abandonment: {
    no_due_date_rate: number | null;
    no_due_date_sample: number;
    with_due_date_rate: number | null;
  };
  priority: Array<{
    priority: string;
    total: number;
    completed_cnt: number;
    completion_pct: number;
    avg_days: number | null;
  }>;
};

const LS_KEY = "justdilo:dismissedInsights";

function getDismissed(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(LS_KEY) ?? "[]"));
  } catch { return new Set(); }
}

function saveDismissed(set: Set<string>) {
  try { localStorage.setItem(LS_KEY, JSON.stringify([...set])); } catch {}
}

export default function SmartInsights() {
  const enabled = useFeature("smart_insights");
  const [insights, setInsights] = useState<Insights | null>(null);
  const [dismissed, setDismissed] = useState<Set<string>>(() =>
    typeof window !== "undefined" ? getDismissed() : new Set()
  );

  useEffect(() => {
    if (!enabled) return;
    fetch("/api/insights")
      .then((r) => r.json())
      .then(setInsights)
      .catch(() => {});
  }, [enabled]);

  if (!enabled || !insights) return null;

  function dismiss(key: string) {
    setDismissed((prev) => {
      const next = new Set([...prev, key]);
      saveDismissed(next);
      return next;
    });
  }

  const visibleRecurring = insights.recurring.filter(
    (r) => !dismissed.has(`recurring:${r.norm_title}`)
  );

  const high = insights.priority.find((p) => p.priority === "high");
  const low  = insights.priority.find((p) => p.priority === "low");
  const priorityInverted =
    high && low &&
    low.completion_pct > high.completion_pct + 15 &&
    !dismissed.has("priority:recalibrate");

  if (!visibleRecurring.length && !priorityInverted) return null;

  return (
    <div className="space-y-2 mb-4">
      {visibleRecurring.slice(0, 2).map((r) => (
        <Chip key={r.norm_title} onDismiss={() => dismiss(`recurring:${r.norm_title}`)}>
          <span className="text-base leading-none shrink-0">↻</span>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium leading-snug">
              "{r.sample_title}" added {r.occurrences}×
            </p>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Looks {r.suggested_type} — consider making it recurring
            </p>
          </div>
        </Chip>
      ))}

      {priorityInverted && (
        <Chip onDismiss={() => dismiss("priority:recalibrate")}>
          <span className="text-base leading-none shrink-0">🎯</span>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium leading-snug">
              Low-priority tasks close {low!.completion_pct}% of the time vs {high!.completion_pct}% for high-priority
            </p>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Your urgent labels might not match what's actually getting done
            </p>
          </div>
        </Chip>
      )}
    </div>
  );
}

function Chip({ children, onDismiss }: { children: React.ReactNode; onDismiss: () => void }) {
  return (
    <div className="flex items-start gap-3 rounded-2xl border border-amber-200/60 dark:border-amber-800/30 bg-amber-50/30 dark:bg-amber-950/10 px-4 py-3 animate-rise">
      {children}
      <button
        onClick={onDismiss}
        className="shrink-0 text-muted-foreground/40 hover:text-muted-foreground transition mt-0.5"
        aria-label="Dismiss"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}
