"use client";
import { useEffect, useState } from "react";
import { X, RefreshCw, Mic, CheckSquare, BarChart2, Users, Brain, Zap, AlertTriangle, TrendingUp, Clock, ChevronDown, ChevronUp, Trash2, Copy, Check, Flag } from "lucide-react";
import { cn } from "@/lib/utils";
import { useFeature } from "@/lib/features";

// ── Types ─────────────────────────────────────────────────────────────────────
type DayCount = { date: string; count: number };
type Stats = {
  capturesByDay: DayCount[];
  tasksByDay: DayCount[];
  totals: { captures7d: number; tasks7d: number; uniqueUsers: number; uniqueUsersToday: number };
  cost: { per_capture_usd: number; estimated_7d_usd: number; estimated_daily_usd: number; note: string };
  recentCaptures: { id: string; created_at: string; user_id: string; transcript_snippet: string; transcript_length: number }[];
  aiQuality: {
    conversionRate: number; emptyRate: number; avgTasksPerCapture: number;
    voicePct: number; textPct: number;
    langEsPct: number; langEnPct: number; langMixedPct: number;
    totalCaptures30d: number; capturesWithTasks: number;
    voiceCaptures: number; textCaptures: number;
    failureBreakdown?: Record<string, number>;
    emptyCount?: number;
    correctionsCount?: number;
  };
  behavior: {
    dau: number; wau: number; dauWauRatio: number;
    completionRate: number; retentionRate: number;
    newUsers7d: number; returningUsers7d: number; week1UserCount: number;
    peakHour: number; peakHourCount: number; hourlyDistribution: number[];
  };
};
type AnalysisIssue = { title: string; severity: string; evidence: string; root_cause: string; fix: string };
type AnalysisWin = { title: string; evidence: string };
type AnalysisQuickWin = { action: string; effort: string; expected_impact: string };
type Analysis = {
  health_score: number; health_label: string; executive_summary: string;
  critical_issues: AnalysisIssue[];
  wins: AnalysisWin[];
  quick_wins: AnalysisQuickWin[];
  prompt_improvements: string[];
  weekly_priority: string;
  watch_next_week: string[];
};

// ── Helpers ───────────────────────────────────────────────────────────────────
function pct(n: number) { return `${(n * 100).toFixed(1)}%`; }
function shortDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
function timeAgo(iso: string) {
  const d = (Date.now() - new Date(iso).getTime()) / 60000;
  if (d < 1) return "just now";
  if (d < 60) return `${Math.floor(d)}m ago`;
  if (d < 1440) return `${Math.floor(d / 60)}h ago`;
  return `${Math.floor(d / 1440)}d ago`;
}
function healthColor(score: number) {
  if (score >= 80) return "text-emerald-400";
  if (score >= 60) return "text-yellow-400";
  if (score >= 40) return "text-orange-400";
  return "text-red-400";
}
function severityColor(s: string) {
  if (s === "high") return "text-red-400 bg-red-500/10 border-red-500/20";
  if (s === "medium") return "text-yellow-400 bg-yellow-500/10 border-yellow-500/20";
  return "text-blue-400 bg-blue-500/10 border-blue-500/20";
}

// ── Sub-components ────────────────────────────────────────────────────────────
function Bar({ value, max, color }: { value: number; max: number; color: string }) {
  const pctW = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
        <div className={cn("h-full rounded-full", color)} style={{ width: `${pctW}%` }} />
      </div>
      <span className="text-[11px] text-zinc-400 w-5 text-right tabular-nums">{value}</span>
    </div>
  );
}

function Metric({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3">
      <p className={cn("text-xl font-bold", color ?? "text-zinc-100")}>{value}</p>
      <p className="text-[11px] text-zinc-400 leading-tight">{label}</p>
      {sub && <p className="text-[10px] text-zinc-600 mt-0.5">{sub}</p>}
    </div>
  );
}

function Collapsible({ title, children, defaultOpen = false }: { title: string; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border border-zinc-800 rounded-xl overflow-hidden">
      <button onClick={() => setOpen(v => !v)} className="w-full flex items-center justify-between px-4 py-3 bg-zinc-900 hover:bg-zinc-800 transition text-left">
        <span className="text-[11px] font-semibold tracking-wider text-zinc-400 uppercase">{title}</span>
        {open ? <ChevronUp className="w-3.5 h-3.5 text-zinc-500" /> : <ChevronDown className="w-3.5 h-3.5 text-zinc-500" />}
      </button>
      {open && <div className="px-4 pb-4 pt-3 bg-zinc-900/50 space-y-2">{children}</div>}
    </div>
  );
}

// ── Tabs ──────────────────────────────────────────────────────────────────────
function OverviewTab({ stats }: { stats: Stats }) {
  const maxC = Math.max(...stats.capturesByDay.map(d => d.count), 1);
  const maxT = Math.max(...stats.tasksByDay.map(d => d.count), 1);
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3">
        <Metric label="Captures (7d)" value={String(stats.totals.captures7d)} color="text-blue-400" />
        <Metric label="Tasks created (7d)" value={String(stats.totals.tasks7d)} color="text-emerald-400" />
        <Metric label="Total users" value={String(stats.totals.uniqueUsers)} color="text-purple-400" />
        <Metric label="Active today" value={String(stats.totals.uniqueUsersToday)} color="text-amber-400" />
      </div>
      <Collapsible title="Captures per day" defaultOpen>
        {stats.capturesByDay.map(d => (
          <div key={d.date} className="flex items-center gap-2">
            <span className="text-[11px] text-zinc-600 w-16 shrink-0">{shortDate(d.date)}</span>
            <Bar value={d.count} max={maxC} color="bg-blue-500" />
          </div>
        ))}
      </Collapsible>
      <Collapsible title="Tasks per day">
        {stats.tasksByDay.map(d => (
          <div key={d.date} className="flex items-center gap-2">
            <span className="text-[11px] text-zinc-600 w-16 shrink-0">{shortDate(d.date)}</span>
            <Bar value={d.count} max={maxT} color="bg-emerald-500" />
          </div>
        ))}
      </Collapsible>
      <Collapsible title="Cost estimate (LLM only)">
        <div className="grid grid-cols-3 gap-3 text-center">
          {[
            { v: `$${stats.cost.estimated_daily_usd.toFixed(4)}`, l: "per day" },
            { v: `$${stats.cost.estimated_7d_usd.toFixed(4)}`, l: "last 7 days" },
            { v: `$${stats.cost.per_capture_usd.toFixed(5)}`, l: "per capture" },
          ].map(({ v, l }) => (
            <div key={l}>
              <p className="text-base font-bold text-zinc-100">{v}</p>
              <p className="text-[10px] text-zinc-500">{l}</p>
            </div>
          ))}
        </div>
        <p className="text-[10px] text-zinc-600 pt-1">{stats.cost.note}</p>
      </Collapsible>
      <Collapsible title={`Recent captures (${stats.recentCaptures.length})`}>
        <div className="space-y-2">
          {stats.recentCaptures.map(c => (
            <div key={c.id} className="bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2">
              <div className="flex justify-between mb-0.5">
                <span className="text-[10px] text-zinc-600 font-mono">{c.user_id.slice(0, 8)}…</span>
                <span className="text-[10px] text-zinc-600">{timeAgo(c.created_at)}</span>
              </div>
              <p className="text-[12px] text-zinc-300 leading-snug">
                {c.transcript_snippet || <span className="text-zinc-600 italic">empty</span>}
                {c.transcript_length > 120 && <span className="text-zinc-600"> …</span>}
              </p>
            </div>
          ))}
        </div>
      </Collapsible>
    </div>
  );
}

const FAILURE_LABELS: Record<string, string> = {
  too_short: "Too short",
  question: "Question/Query",
  background_noise: "Background noise",
  no_action_verbs: "No action verbs",
  too_vague: "Too vague",
  unclear_intent: "Unclear intent",
};

const SETUP_SQL = `CREATE TABLE IF NOT EXISTS prompt_corrections (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at timestamptz DEFAULT now(),
  original_transcript text NOT NULL,
  correct_intent text NOT NULL DEFAULT 'CREATE_TASK',
  correct_tasks jsonb DEFAULT '[]',
  issue_type text,
  admin_note text
);`;

type CorrectionRow = {
  id: string;
  created_at: string;
  original_transcript: string;
  correct_intent: string;
  issue_type: string | null;
  admin_note: string | null;
};

function CorrectionsSection() {
  const [corrections, setCorrections] = useState<CorrectionRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [setupNeeded, setSetupNeeded] = useState(false);
  const [copied, setCopied] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  async function fetchCorrections() {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/corrections");
      const json = await res.json();
      if (json.setup_needed) { setSetupNeeded(true); return; }
      setCorrections(json.corrections ?? []);
      setLoaded(true);
    } finally {
      setLoading(false);
    }
  }

  async function deleteCorrection(id: string) {
    setDeleting(id);
    try {
      await fetch("/api/admin/corrections", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
      setCorrections(prev => prev.filter(c => c.id !== id));
    } finally {
      setDeleting(null);
    }
  }

  function copySQL() {
    navigator.clipboard.writeText(SETUP_SQL);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  if (setupNeeded) {
    return (
      <div className="space-y-3">
        <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl px-4 py-3">
          <p className="text-[12px] text-amber-300 font-medium mb-1">Table not created yet</p>
          <p className="text-[11px] text-zinc-500 mb-3">Run this SQL in your Supabase dashboard to enable the corrections feedback loop.</p>
          <pre className="text-[10px] text-zinc-400 bg-zinc-900 border border-zinc-800 rounded-lg p-3 overflow-x-auto whitespace-pre-wrap leading-relaxed">{SETUP_SQL}</pre>
          <button onClick={copySQL} className="mt-2 flex items-center gap-1.5 text-[11px] text-zinc-500 hover:text-zinc-200 transition">
            {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
            {copied ? "Copied!" : "Copy SQL"}
          </button>
        </div>
      </div>
    );
  }

  if (!loaded && !loading) {
    return (
      <button onClick={fetchCorrections} className="text-[11px] text-zinc-500 hover:text-zinc-300 transition underline underline-offset-2">
        Load corrections
      </button>
    );
  }

  if (loading) {
    return <div className="flex items-center gap-2 text-[11px] text-zinc-600"><RefreshCw className="w-3 h-3 animate-spin" /> Loading…</div>;
  }

  if (corrections.length === 0) {
    return <p className="text-[12px] text-zinc-600 italic">No corrections saved yet. Mark bad transcriptions from the debug panel.</p>;
  }

  return (
    <div className="space-y-2">
      {corrections.map(c => (
        <div key={c.id} className="bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2.5">
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                {c.issue_type && (
                  <span className="text-[9px] font-semibold uppercase tracking-wider bg-zinc-800 text-zinc-400 px-1.5 py-0.5 rounded">
                    {FAILURE_LABELS[c.issue_type] ?? c.issue_type}
                  </span>
                )}
                <span className="text-[9px] text-zinc-600 bg-blue-500/10 text-blue-400 px-1.5 py-0.5 rounded font-mono">{c.correct_intent}</span>
                <span className="text-[10px] text-zinc-700 ml-auto">{timeAgo(c.created_at)}</span>
              </div>
              <p className="text-[11px] text-zinc-400 leading-snug line-clamp-2">"{c.original_transcript.slice(0, 100)}{c.original_transcript.length > 100 ? "…" : ""}"</p>
              {c.admin_note && <p className="text-[10px] text-zinc-600 mt-0.5 italic">{c.admin_note}</p>}
            </div>
            <button
              onClick={() => deleteCorrection(c.id)}
              disabled={deleting === c.id}
              className="p-1 rounded hover:bg-red-500/10 hover:text-red-400 text-zinc-700 transition shrink-0"
            >
              {deleting === c.id ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

function QualityTab({ q }: { q: Stats["aiQuality"] }) {
  const convColor = q.conversionRate >= 0.75 ? "text-emerald-400" : q.conversionRate >= 0.5 ? "text-yellow-400" : "text-red-400";
  const failureBreakdown = q.failureBreakdown ?? {};
  const maxFailure = Math.max(...Object.values(failureBreakdown), 1);

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3">
        <Metric label="Conversion rate" value={pct(q.conversionRate)} sub="> 75% is healthy" color={convColor} />
        <Metric label="Avg tasks / capture" value={q.avgTasksPerCapture.toFixed(1)} color="text-blue-400" />
        <Metric label="Empty captures (0 tasks)" value={pct(q.emptyRate)} color={q.emptyRate > 0.25 ? "text-red-400" : "text-zinc-100"} sub={q.emptyCount !== undefined ? `${q.emptyCount} captures` : undefined} />
        <Metric label="AI corrections saved" value={String(q.correctionsCount ?? 0)} color={(q.correctionsCount ?? 0) > 0 ? "text-emerald-400" : "text-zinc-500"} sub="few-shot training examples" />
      </div>

      {Object.keys(failureBreakdown).length > 0 && (
        <Collapsible title={`Failure breakdown (${q.emptyCount ?? 0} empty captures)`} defaultOpen>
          <div className="space-y-2">
            {Object.entries(failureBreakdown)
              .sort(([, a], [, b]) => b - a)
              .map(([reason, count]) => (
                <div key={reason} className="flex items-center gap-3">
                  <span className="text-[11px] text-zinc-500 w-32 shrink-0">{FAILURE_LABELS[reason] ?? reason}</span>
                  <div className="flex-1 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                    <div className="h-full rounded-full bg-red-500/70" style={{ width: `${(count / maxFailure) * 100}%` }} />
                  </div>
                  <span className="text-[11px] text-zinc-400 w-4 text-right tabular-nums">{count}</span>
                </div>
              ))}
          </div>
          <p className="text-[10px] text-zinc-700 pt-1">Rule-based classification — no extra LLM calls.</p>
        </Collapsible>
      )}

      <Collapsible title="Voice vs text (30d)" defaultOpen>
        <div className="space-y-2">
          {[
            { label: "Voice (mic)", value: q.voiceCaptures, pctVal: q.voicePct, color: "bg-orange-500" },
            { label: "QuickAdd (text)", value: q.textCaptures, pctVal: q.textPct, color: "bg-blue-500" },
          ].map(({ label, value, pctVal, color }) => (
            <div key={label} className="flex items-center gap-3">
              <span className="text-[11px] text-zinc-500 w-28 shrink-0">{label}</span>
              <div className="flex-1 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                <div className={cn("h-full rounded-full", color)} style={{ width: `${(pctVal * 100).toFixed(0)}%` }} />
              </div>
              <span className="text-[11px] text-zinc-400 w-14 text-right tabular-nums">{pct(pctVal)} ({value})</span>
            </div>
          ))}
        </div>
      </Collapsible>

      <Collapsible title="Language distribution (30d)" defaultOpen>
        <div className="space-y-2">
          {[
            { label: "English", value: q.langEnPct, color: "bg-blue-500" },
            { label: "Spanish", value: q.langEsPct, color: "bg-emerald-500" },
            { label: "Mixed", value: q.langMixedPct, color: "bg-purple-500" },
          ].map(({ label, value, color }) => (
            <div key={label} className="flex items-center gap-3">
              <span className="text-[11px] text-zinc-500 w-16 shrink-0">{label}</span>
              <div className="flex-1 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                <div className={cn("h-full rounded-full", color)} style={{ width: `${(value * 100).toFixed(0)}%` }} />
              </div>
              <span className="text-[11px] text-zinc-400 w-10 text-right tabular-nums">{pct(value)}</span>
            </div>
          ))}
        </div>
      </Collapsible>

      <Collapsible title={`Corrections (few-shot training)${(q.correctionsCount ?? 0) > 0 ? ` · ${q.correctionsCount}` : ""}`}>
        <CorrectionsSection />
      </Collapsible>
    </div>
  );
}

function UsersTab({ b }: { b: Stats["behavior"] }) {
  const retColor = b.retentionRate >= 0.5 ? "text-emerald-400" : b.retentionRate >= 0.3 ? "text-yellow-400" : "text-red-400";
  const dauColor = b.dauWauRatio >= 0.4 ? "text-emerald-400" : b.dauWauRatio >= 0.2 ? "text-yellow-400" : "text-red-400";
  const maxHour = Math.max(...b.hourlyDistribution, 1);

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3">
        <Metric label="DAU / WAU" value={pct(b.dauWauRatio)} sub="> 40% is healthy" color={dauColor} />
        <Metric label="Retention (w/w)" value={pct(b.retentionRate)} sub="> 50% is healthy" color={retColor} />
        <Metric label="Task completion" value={pct(b.completionRate)} color="text-blue-400" />
        <Metric label="New users (7d)" value={String(b.newUsers7d)} sub={`${b.returningUsers7d} returning`} color="text-purple-400" />
      </div>

      <Collapsible title="Peak hours (all time, UTC)" defaultOpen>
        <div className="grid grid-cols-12 gap-0.5">
          {b.hourlyDistribution.map((count, h) => {
            const heightPct = maxHour > 0 ? (count / maxHour) * 100 : 0;
            const isPeak = h === b.peakHour;
            return (
              <div key={h} className="flex flex-col items-center gap-1" title={`${h}:00 — ${count} captures`}>
                <div className="w-full flex items-end h-8">
                  <div
                    className={cn("w-full rounded-sm", isPeak ? "bg-amber-400" : "bg-zinc-700")}
                    style={{ height: `${Math.max(heightPct, count > 0 ? 10 : 0)}%` }}
                  />
                </div>
                {h % 6 === 0 && <span className="text-[9px] text-zinc-600">{h}h</span>}
              </div>
            );
          })}
        </div>
        <p className="text-[11px] text-zinc-500 mt-1">
          Peak: <span className="text-amber-400">{b.peakHour}:00</span> ({b.peakHourCount} captures)
        </p>
      </Collapsible>

      <Collapsible title="Retention details">
        <div className="space-y-1.5 text-[12px] text-zinc-400">
          <p>Users active week before last: <span className="text-zinc-200">{b.week1UserCount}</span></p>
          <p>Of those, returned this week: <span className={retColor}>{b.returningUsers7d} ({pct(b.retentionRate)})</span></p>
          <p>Brand new users this week: <span className="text-zinc-200">{b.newUsers7d}</span></p>
          <p>DAU: <span className="text-zinc-200">{b.dau}</span> · WAU: <span className="text-zinc-200">{b.wau}</span></p>
        </div>
      </Collapsible>
    </div>
  );
}

function AnalysisTab({ stats }: { stats: Stats }) {
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [generatedAt, setGeneratedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function generate() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/analysis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(stats),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Analysis failed");
      setAnalysis(json.analysis);
      setGeneratedAt(json.generated_at);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  if (!analysis) {
    return (
      <div className="flex flex-col items-center justify-center py-12 gap-4">
        <Brain className="w-10 h-10 text-zinc-600" />
        <div className="text-center">
          <p className="text-sm text-zinc-300 font-medium mb-1">Weekly AI Analysis</p>
          <p className="text-[12px] text-zinc-600 max-w-xs">
            Groq analyzes all your metrics and tells you exactly what to fix, what's working, and what to prioritize this week.
          </p>
        </div>
        {error && <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-2">{error}</p>}
        <button
          onClick={generate}
          disabled={loading}
          className="flex items-center gap-2 bg-zinc-100 text-zinc-900 font-semibold text-sm px-5 py-2.5 rounded-full hover:bg-white disabled:opacity-50 transition"
        >
          {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Brain className="w-4 h-4" />}
          {loading ? "Analyzing…" : "Generate Analysis"}
        </button>
      </div>
    );
  }

  const scoreColor = healthColor(analysis.health_score);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="text-center">
            <p className={cn("text-3xl font-bold tabular-nums", scoreColor)}>{analysis.health_score}</p>
            <p className="text-[10px] text-zinc-600">/100</p>
          </div>
          <div>
            <p className={cn("text-sm font-semibold", scoreColor)}>{analysis.health_label}</p>
            <p className="text-[10px] text-zinc-600">{generatedAt ? `Generated ${timeAgo(generatedAt)}` : ""}</p>
          </div>
        </div>
        <button onClick={generate} disabled={loading} className="flex items-center gap-1.5 text-[11px] text-zinc-500 hover:text-zinc-300 transition">
          <RefreshCw className={cn("w-3.5 h-3.5", loading && "animate-spin")} />
          Refresh
        </button>
      </div>

      {/* Summary */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3">
        <p className="text-[12px] text-zinc-300 leading-relaxed">{analysis.executive_summary}</p>
      </div>

      {/* Weekly priority */}
      <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl px-4 py-3">
        <div className="flex items-center gap-2 mb-1">
          <Zap className="w-3.5 h-3.5 text-amber-400" />
          <span className="text-[11px] font-bold tracking-wider text-amber-400 uppercase">This Week's Priority</span>
        </div>
        <p className="text-[12px] text-zinc-200 leading-relaxed">{analysis.weekly_priority}</p>
      </div>

      {/* Critical issues */}
      {analysis.critical_issues?.length > 0 && (
        <Collapsible title={`Critical issues (${analysis.critical_issues.length})`} defaultOpen>
          {analysis.critical_issues.map((issue, i) => (
            <div key={i} className={cn("border rounded-xl px-3 py-2.5 space-y-1.5", severityColor(issue.severity))}>
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                <span className="text-[12px] font-semibold">{issue.title}</span>
                <span className="text-[10px] uppercase tracking-wide opacity-70 ml-auto">{issue.severity}</span>
              </div>
              <p className="text-[11px] opacity-80"><span className="font-medium">Evidence:</span> {issue.evidence}</p>
              <p className="text-[11px] opacity-80"><span className="font-medium">Cause:</span> {issue.root_cause}</p>
              <p className="text-[11px] text-zinc-200 bg-zinc-900/60 rounded-lg px-2.5 py-1.5">
                <span className="font-medium">Fix:</span> {issue.fix}
              </p>
            </div>
          ))}
        </Collapsible>
      )}

      {/* Quick wins */}
      {analysis.quick_wins?.length > 0 && (
        <Collapsible title="Quick wins" defaultOpen>
          {analysis.quick_wins.map((w, i) => (
            <div key={i} className="bg-emerald-500/10 border border-emerald-500/20 rounded-lg px-3 py-2.5">
              <div className="flex items-start gap-2">
                <TrendingUp className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                <div>
                  <p className="text-[12px] text-zinc-200">{w.action}</p>
                  <p className="text-[11px] text-zinc-500 mt-0.5">{w.effort} · {w.expected_impact}</p>
                </div>
              </div>
            </div>
          ))}
        </Collapsible>
      )}

      {/* Wins */}
      {analysis.wins?.length > 0 && (
        <Collapsible title="What's working">
          {analysis.wins.map((w, i) => (
            <div key={i} className="flex items-start gap-2">
              <span className="text-emerald-400 text-sm mt-0.5">✓</span>
              <div>
                <p className="text-[12px] text-zinc-300">{w.title}</p>
                <p className="text-[11px] text-zinc-600">{w.evidence}</p>
              </div>
            </div>
          ))}
        </Collapsible>
      )}

      {/* Prompt improvements */}
      {analysis.prompt_improvements?.length > 0 && (
        <Collapsible title="AI prompt improvements">
          {analysis.prompt_improvements.map((p, i) => (
            <div key={i} className="flex items-start gap-2">
              <Brain className="w-3.5 h-3.5 text-blue-400 shrink-0 mt-0.5" />
              <p className="text-[12px] text-zinc-400">{p}</p>
            </div>
          ))}
        </Collapsible>
      )}

      {/* Watch next week */}
      {analysis.watch_next_week?.length > 0 && (
        <Collapsible title="Watch next week">
          {analysis.watch_next_week.map((w, i) => (
            <div key={i} className="flex items-center gap-2">
              <Clock className="w-3 h-3 text-zinc-600 shrink-0" />
              <p className="text-[12px] text-zinc-500">{w}</p>
            </div>
          ))}
        </Collapsible>
      )}
    </div>
  );
}

// ── User Activity Section ─────────────────────────────────────────────────────
type ActivityData = {
  totalUsers: number;
  active24h: number;
  active7d: number;
  active30d: number;
  dailyActives: { date: string; count: number }[];
  users: { id: string; email: string; nickname: string | null; lastActivityAt: string | null; tasks30d: number }[];
};

function relativeAgo(iso: string | null): string {
  if (!iso) return "never";
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1)   return "just now";
  if (m < 60)  return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24)  return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30)  return `${d}d ago`;
  const mo = Math.floor(d / 30);
  return `${mo}mo ago`;
}

function UserActivitySection() {
  const [data, setData]       = useState<ActivityData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    fetch("/api/admin/activity")
      .then((r) => r.json().then((j) => ({ ok: r.ok, json: j })))
      .then(({ ok, json }) => {
        if (!alive) return;
        if (!ok) setError(json?.error ?? "Failed to load activity");
        else setData(json);
      })
      .catch((e) => alive && setError(e.message))
      .finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-6 text-zinc-600 text-sm">
        <RefreshCw className="w-4 h-4 animate-spin mr-2" /> Loading activity…
      </div>
    );
  }
  if (error || !data) return (
    <p className="text-[11px] text-zinc-600 italic">Activity unavailable: {error ?? "no data"}</p>
  );

  const maxDaily = Math.max(1, ...data.dailyActives.map((d) => d.count));

  return (
    <div className="space-y-4 mb-5">
      <div>
        <p className="text-[11px] font-bold tracking-widest text-zinc-500 uppercase mb-2">User activity</p>
        <div className="grid grid-cols-4 gap-2">
          <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 px-2 py-2">
            <p className="text-[9px] text-zinc-500 uppercase tracking-wider">Total</p>
            <p className="text-lg font-bold text-zinc-100 leading-tight">{data.totalUsers}</p>
          </div>
          <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 px-2 py-2">
            <p className="text-[9px] text-emerald-400 uppercase tracking-wider">24h</p>
            <p className="text-lg font-bold text-zinc-100 leading-tight">{data.active24h}</p>
          </div>
          <div className="rounded-lg border border-sky-500/30 bg-sky-500/5 px-2 py-2">
            <p className="text-[9px] text-sky-400 uppercase tracking-wider">7d</p>
            <p className="text-lg font-bold text-zinc-100 leading-tight">{data.active7d}</p>
          </div>
          <div className="rounded-lg border border-violet-500/30 bg-violet-500/5 px-2 py-2">
            <p className="text-[9px] text-violet-400 uppercase tracking-wider">30d</p>
            <p className="text-lg font-bold text-zinc-100 leading-tight">{data.active30d}</p>
          </div>
        </div>
      </div>

      {data.dailyActives.length > 0 && (
        <div>
          <p className="text-[10px] text-zinc-500 mb-1.5">Daily active users (last 30 days)</p>
          <div className="flex items-end gap-[2px] h-12 px-1 bg-zinc-900/40 border border-zinc-800 rounded-lg py-1">
            {data.dailyActives.map((d) => (
              <div
                key={d.date}
                className="flex-1 bg-emerald-500/60 rounded-sm min-h-[2px]"
                style={{ height: `${(d.count / maxDaily) * 100}%` }}
                title={`${d.date}: ${d.count} active`}
              />
            ))}
          </div>
        </div>
      )}

      <div>
        <p className="text-[10px] text-zinc-500 mb-1.5">Users by recency</p>
        <div className="space-y-1 max-h-64 overflow-y-auto">
          {data.users.map((u) => (
            <div key={u.id} className="flex items-center justify-between rounded-md border border-zinc-800/60 bg-zinc-900/30 px-2.5 py-1.5">
              <div className="min-w-0 flex-1">
                <p className="text-[12px] text-zinc-200 truncate">{u.nickname ?? u.email}</p>
                {u.nickname && <p className="text-[10px] text-zinc-600 truncate">{u.email}</p>}
              </div>
              <div className="text-right shrink-0 ml-2">
                <p className="text-[10px] text-zinc-400">{relativeAgo(u.lastActivityAt)}</p>
                <p className="text-[9px] text-zinc-600">{u.tasks30d} task{u.tasks30d === 1 ? "" : "s"} / 30d</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Flags Tab ─────────────────────────────────────────────────────────────────
type FeatureFlag = {
  key: string;
  description: string | null;
  category: string | null;
  how_to_use: string | null;
  impact: string | null;
  location: string | null;
  rollout: "off" | "admin" | "beta" | "all";
  created_at: string;
  updated_at: string;
};
type BetaTester = { id: string; email: string; nickname: string | null };

const ROLLOUT_STAGES: { id: FeatureFlag["rollout"]; label: string; color: string }[] = [
  { id: "off",   label: "Off",   color: "bg-zinc-800 text-zinc-400 border-zinc-700" },
  { id: "admin", label: "Admin", color: "bg-purple-500/20 text-purple-300 border-purple-500/40" },
  { id: "beta",  label: "Beta",  color: "bg-amber-500/20 text-amber-300 border-amber-500/40" },
  { id: "all",   label: "All",   color: "bg-emerald-500/20 text-emerald-300 border-emerald-500/40" },
];

const CATEGORY_COLORS: Record<string, string> = {
  "AI Insights":     "bg-violet-500/15 text-violet-300 border-violet-500/30",
  "Behavior nudge":  "bg-rose-500/15 text-rose-300 border-rose-500/30",
  "Analytics":       "bg-sky-500/15 text-sky-300 border-sky-500/30",
  "Productivity":    "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  "UX":              "bg-amber-500/15 text-amber-300 border-amber-500/30",
};

function categoryClass(c: string | null) {
  if (!c) return "bg-zinc-800/60 text-zinc-400 border-zinc-700";
  return CATEGORY_COLORS[c] ?? "bg-zinc-800/60 text-zinc-300 border-zinc-700";
}

function formatDate(iso: string) {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  } catch { return iso; }
}

function FlagsTab() {
  const [flags, setFlags] = useState<FeatureFlag[]>([]);
  const [testers, setTesters] = useState<BetaTester[]>([]);
  const [loading, setLoading] = useState(true);
  const [newTesterEmail, setNewTesterEmail] = useState("");
  const [adding, setAdding] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState<"all" | FeatureFlag["rollout"]>("all");

  function toggleExpand(key: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  }

  async function load() {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/features");
      const json = await res.json();
      setFlags(json.flags ?? []);
      setTesters(json.betaTesters ?? []);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function setRollout(key: string, rollout: FeatureFlag["rollout"]) {
    setFlags((prev) => prev.map((f) => f.key === key ? { ...f, rollout } : f));
    await fetch("/api/admin/features", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key, rollout }),
    });
  }

  async function toggleTester(email: string, enabled: boolean) {
    setAdding(true);
    try {
      const res = await fetch("/api/admin/beta-testers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim().toLowerCase(), enabled }),
      });
      if (res.ok) {
        await load();
        setNewTesterEmail("");
      }
    } finally {
      setAdding(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-zinc-600 text-sm">
        <RefreshCw className="w-4 h-4 animate-spin mr-2" /> Loading flags…
      </div>
    );
  }

  const counts = {
    all:   flags.length,
    off:   flags.filter((f) => f.rollout === "off").length,
    admin: flags.filter((f) => f.rollout === "admin").length,
    beta:  flags.filter((f) => f.rollout === "beta").length,
    rolled: flags.filter((f) => f.rollout === "all").length,
  };
  const visibleFlags = filter === "all" ? flags : flags.filter((f) => f.rollout === filter);

  return (
    <div className="space-y-5">
      {/* Summary strip */}
      <div className="grid grid-cols-4 gap-2">
        <button
          onClick={() => setFilter("all")}
          className={cn("rounded-lg border px-2 py-2 text-left transition",
            filter === "all" ? "border-zinc-500 bg-zinc-800/40" : "border-zinc-800 bg-zinc-900/30 hover:border-zinc-700")}>
          <p className="text-[9px] text-zinc-500 uppercase tracking-wider">Total</p>
          <p className="text-lg font-bold text-zinc-100 leading-tight">{counts.all}</p>
        </button>
        <button
          onClick={() => setFilter("admin")}
          className={cn("rounded-lg border px-2 py-2 text-left transition",
            filter === "admin" ? "border-purple-500/60 bg-purple-500/15" : "border-zinc-800 bg-zinc-900/30 hover:border-zinc-700")}>
          <p className="text-[9px] text-purple-400 uppercase tracking-wider">Admin</p>
          <p className="text-lg font-bold text-zinc-100 leading-tight">{counts.admin}</p>
        </button>
        <button
          onClick={() => setFilter("beta")}
          className={cn("rounded-lg border px-2 py-2 text-left transition",
            filter === "beta" ? "border-amber-500/60 bg-amber-500/15" : "border-zinc-800 bg-zinc-900/30 hover:border-zinc-700")}>
          <p className="text-[9px] text-amber-400 uppercase tracking-wider">Beta</p>
          <p className="text-lg font-bold text-zinc-100 leading-tight">{counts.beta}</p>
        </button>
        <button
          onClick={() => setFilter("all")}
          className={cn("rounded-lg border px-2 py-2 text-left transition",
            filter === "all" ? "border-zinc-700 bg-zinc-900/30" : "border-zinc-800 bg-zinc-900/30 hover:border-zinc-700")}>
          <p className="text-[9px] text-emerald-400 uppercase tracking-wider">Live</p>
          <p className="text-lg font-bold text-zinc-100 leading-tight">{counts.rolled}</p>
        </button>
      </div>

      <div>
        <div className="flex items-center justify-between mb-2">
          <p className="text-[11px] font-bold tracking-widest text-zinc-500 uppercase">Feature flags</p>
          {filter !== "all" && (
            <button onClick={() => setFilter("all")} className="text-[10px] text-zinc-500 hover:text-zinc-300">
              Clear filter
            </button>
          )}
        </div>
        <div className="space-y-2">
          {visibleFlags.map((f) => {
            const isOpen = expanded.has(f.key);
            return (
              <div key={f.key} className="rounded-xl border border-zinc-800 bg-zinc-900/40 overflow-hidden">
                {/* Header row — always visible */}
                <button
                  onClick={() => toggleExpand(f.key)}
                  className="w-full text-left p-3 hover:bg-zinc-900/60 transition"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-medium text-zinc-100">{f.key}</p>
                        {f.category && (
                          <span className={cn("text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded border font-semibold",
                            categoryClass(f.category))}>
                            {f.category}
                          </span>
                        )}
                      </div>
                      {f.description && (
                        <p className="text-[11px] text-zinc-500 mt-1 leading-snug">{f.description}</p>
                      )}
                      <div className="flex items-center gap-2 mt-2 text-[10px] text-zinc-600">
                        <span>Added {formatDate(f.created_at)}</span>
                        {f.updated_at && f.updated_at !== f.created_at && (
                          <>
                            <span>·</span>
                            <span>Updated {formatDate(f.updated_at)}</span>
                          </>
                        )}
                      </div>
                    </div>
                    {isOpen ? <ChevronUp className="w-4 h-4 text-zinc-500 shrink-0 mt-0.5" /> : <ChevronDown className="w-4 h-4 text-zinc-500 shrink-0 mt-0.5" />}
                  </div>
                </button>

                {/* Expanded detail */}
                {isOpen && (
                  <div className="px-3 pb-3 space-y-3 border-t border-zinc-800/60 pt-3">
                    {f.how_to_use && (
                      <div>
                        <p className="text-[9px] font-bold tracking-widest text-zinc-500 uppercase mb-1">How to use</p>
                        <p className="text-[11px] text-zinc-300 leading-relaxed">{f.how_to_use}</p>
                      </div>
                    )}
                    {f.impact && (
                      <div>
                        <p className="text-[9px] font-bold tracking-widest text-zinc-500 uppercase mb-1">Why it matters</p>
                        <p className="text-[11px] text-zinc-300 leading-relaxed">{f.impact}</p>
                      </div>
                    )}
                    {f.location && (
                      <div>
                        <p className="text-[9px] font-bold tracking-widest text-zinc-500 uppercase mb-1">Where it shows</p>
                        <p className="text-[11px] text-zinc-400 font-mono">{f.location}</p>
                      </div>
                    )}
                  </div>
                )}

                {/* Rollout controls — always visible */}
                <div className="flex gap-1.5 px-3 pb-3">
                  {ROLLOUT_STAGES.map((s) => (
                    <button
                      key={s.id}
                      onClick={(e) => { e.stopPropagation(); setRollout(f.key, s.id); }}
                      className={cn(
                        "flex-1 px-2 py-1 rounded-md text-[10px] font-semibold uppercase tracking-wider border transition",
                        f.rollout === s.id ? s.color : "bg-zinc-900/30 text-zinc-600 border-zinc-800 hover:text-zinc-400 hover:border-zinc-700",
                      )}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
          {visibleFlags.length === 0 && (
            <p className="text-[11px] text-zinc-600 italic">
              {flags.length === 0 ? "No flags registered yet." : "No flags match this filter."}
            </p>
          )}
        </div>
      </div>

      <div>
        <p className="text-[11px] font-bold tracking-widest text-zinc-500 uppercase mb-2">Beta testers</p>
        <div className="space-y-2">
          {testers.map((t) => (
            <div key={t.id} className="flex items-center justify-between rounded-lg border border-zinc-800 bg-zinc-900/40 px-3 py-2">
              <span className="text-xs text-zinc-300">{t.email}</span>
              <button
                onClick={() => toggleTester(t.email, false)}
                className="text-[10px] text-zinc-500 hover:text-red-400 transition"
              >
                Remove
              </button>
            </div>
          ))}
          {testers.length === 0 && (
            <p className="text-[11px] text-zinc-600 italic">No beta testers yet.</p>
          )}
          <div className="flex gap-2 pt-1">
            <input
              type="email"
              value={newTesterEmail}
              onChange={(e) => setNewTesterEmail(e.target.value)}
              placeholder="user@email.com"
              className="flex-1 bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-1.5 text-xs text-zinc-200 placeholder:text-zinc-600 outline-none focus:border-zinc-600"
              onKeyDown={(e) => { if (e.key === "Enter" && newTesterEmail.trim()) toggleTester(newTesterEmail, true); }}
            />
            <button
              onClick={() => newTesterEmail.trim() && toggleTester(newTesterEmail, true)}
              disabled={!newTesterEmail.trim() || adding}
              className="px-3 py-1.5 rounded-lg bg-zinc-100 text-zinc-900 text-xs font-medium disabled:opacity-40"
            >
              Add
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main Panel ────────────────────────────────────────────────────────────────
type Tab = "overview" | "quality" | "users" | "analysis" | "flags";
const TABS: { id: Tab; label: string; icon: any }[] = [
  { id: "overview", label: "Overview", icon: BarChart2 },
  { id: "quality",  label: "AI Quality", icon: Brain },
  { id: "users",    label: "Users", icon: Users },
  { id: "analysis", label: "Analysis", icon: Zap },
  { id: "flags",    label: "Flags", icon: Flag },
];

export default function AdminPanel({ onClose }: { onClose: () => void }) {
  const [tab, setTab] = useState<Tab>("overview");
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const activityPanelEnabled = useFeature("user_activity_panel");

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/stats");
      if (!res.ok) throw new Error("Failed");
      setStats(await res.json());
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/75 backdrop-blur-sm overflow-y-auto py-6 px-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="w-full max-w-lg bg-zinc-950 border border-zinc-800 rounded-2xl overflow-hidden" style={{ animation: "slideUp 0.2s ease-out" }}>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-zinc-800">
          <span className="text-[10px] font-bold tracking-widest text-zinc-500 uppercase">Admin · yorohn</span>
          <div className="flex items-center gap-2">
            <button onClick={load} className="p-1.5 rounded-full hover:bg-zinc-800 text-zinc-600 hover:text-zinc-300 transition">
              <RefreshCw className={cn("w-3.5 h-3.5", loading && "animate-spin")} />
            </button>
            <button onClick={onClose} className="p-1.5 rounded-full hover:bg-zinc-800 text-zinc-600 hover:text-zinc-300 transition">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-zinc-800">
          {TABS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={cn(
                "flex-1 flex flex-col items-center gap-1 py-2.5 text-[10px] font-semibold tracking-wide uppercase transition border-b-2",
                tab === id ? "border-zinc-100 text-zinc-100" : "border-transparent text-zinc-600 hover:text-zinc-400"
              )}
            >
              <Icon className="w-3.5 h-3.5" />
              {label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="p-5 max-h-[75vh] overflow-y-auto">
          {loading && !stats && (
            <div className="flex items-center justify-center py-16 text-zinc-600 text-sm">
              <RefreshCw className="w-4 h-4 animate-spin mr-2" /> Loading…
            </div>
          )}
          {error && !stats && (
            <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3">{error}</p>
          )}
          {stats && tab === "overview"  && <OverviewTab stats={stats} />}
          {stats && tab === "quality"   && <QualityTab q={stats.aiQuality} />}
          {stats && tab === "users"     && <UsersTab b={stats.behavior} />}
          {tab === "analysis" && activityPanelEnabled && <UserActivitySection />}
          {stats && tab === "analysis"  && <AnalysisTab stats={stats} />}
          {tab === "flags" && <FlagsTab />}
        </div>
      </div>

      <style>{`
        @keyframes slideUp {
          from { transform: translateY(30px); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
      `}</style>
    </div>
  );
}
