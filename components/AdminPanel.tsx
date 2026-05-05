"use client";
import { useEffect, useState } from "react";
import { X, RefreshCw, Mic, CheckSquare, BarChart2 } from "lucide-react";
import { cn } from "@/lib/utils";

type DayCount = { date: string; count: number };
type RecentCapture = {
  id: string;
  created_at: string;
  user_id: string;
  transcript_snippet: string;
  transcript_length: number;
};
type Stats = {
  capturesByDay: DayCount[];
  tasksByDay: DayCount[];
  totals: { captures7d: number; tasks7d: number; uniqueUsers: number; uniqueUsersToday: number };
  cost: { per_capture_usd: number; estimated_7d_usd: number; estimated_daily_usd: number; note: string };
  recentCaptures: RecentCapture[];
};

type Props = { onClose: () => void };

function Bar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-2 bg-zinc-800 rounded-full overflow-hidden">
        <div className={cn("h-full rounded-full transition-all", color)} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-[11px] text-zinc-400 w-5 text-right">{value}</span>
    </div>
  );
}

function shortDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export default function AdminPanel({ onClose }: Props) {
  const [tab, setTab] = useState<"captures" | "stats">("stats");
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/stats");
      if (!res.ok) throw new Error("Failed to load stats");
      setStats(await res.json());
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  const maxCaptures = Math.max(...(stats?.capturesByDay.map((d) => d.count) ?? [1]), 1);
  const maxTasks = Math.max(...(stats?.tasksByDay.map((d) => d.count) ?? [1]), 1);

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/70 backdrop-blur-sm overflow-y-auto"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="w-full max-w-lg bg-zinc-950 border border-zinc-800 rounded-2xl my-8 mx-4 overflow-hidden" style={{ animation: "slideUp 0.22s ease-out" }}>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800">
          <div className="flex items-center gap-3">
            <span className="text-[10px] font-bold tracking-widest text-zinc-500 uppercase">Admin</span>
            <div className="flex gap-1">
              <button
                onClick={() => setTab("stats")}
                className={cn("text-xs px-3 py-1 rounded-full transition", tab === "stats" ? "bg-zinc-700 text-zinc-100" : "text-zinc-500 hover:text-zinc-300")}
              >
                Stats
              </button>
              <button
                onClick={() => setTab("captures")}
                className={cn("text-xs px-3 py-1 rounded-full transition", tab === "captures" ? "bg-zinc-700 text-zinc-100" : "text-zinc-500 hover:text-zinc-300")}
              >
                Captures
              </button>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={load} className="p-1.5 rounded-full hover:bg-zinc-800 text-zinc-500 hover:text-zinc-300 transition">
              <RefreshCw className={cn("w-3.5 h-3.5", loading && "animate-spin")} />
            </button>
            <button onClick={onClose} className="p-1.5 rounded-full hover:bg-zinc-800 text-zinc-500 hover:text-zinc-300 transition">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="p-5">
          {loading && !stats && (
            <div className="flex items-center justify-center py-12 text-zinc-600 text-sm">Loading…</div>
          )}
          {error && (
            <div className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3">{error}</div>
          )}

          {stats && tab === "stats" && (
            <div className="space-y-6">
              {/* Totals */}
              <div className="grid grid-cols-2 gap-3">
                {[
                  { label: "Captures (7d)", value: stats.totals.captures7d, icon: Mic, color: "text-blue-400" },
                  { label: "Tasks created (7d)", value: stats.totals.tasks7d, icon: CheckSquare, color: "text-emerald-400" },
                  { label: "Total users", value: stats.totals.uniqueUsers, icon: BarChart2, color: "text-purple-400" },
                  { label: "Active today", value: stats.totals.uniqueUsersToday, icon: BarChart2, color: "text-amber-400" },
                ].map(({ label, value, icon: Icon, color }) => (
                  <div key={label} className="bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3">
                    <Icon className={cn("w-3.5 h-3.5 mb-1", color)} />
                    <p className="text-xl font-bold text-zinc-100">{value}</p>
                    <p className="text-[11px] text-zinc-500">{label}</p>
                  </div>
                ))}
              </div>

              {/* Captures chart */}
              <div>
                <p className="text-[11px] font-semibold tracking-wider text-zinc-500 uppercase mb-2">Captures per day</p>
                <div className="space-y-1.5">
                  {stats.capturesByDay.map((d) => (
                    <div key={d.date} className="flex items-center gap-2">
                      <span className="text-[11px] text-zinc-600 w-16 shrink-0">{shortDate(d.date)}</span>
                      <Bar value={d.count} max={maxCaptures} color="bg-blue-500" />
                    </div>
                  ))}
                </div>
              </div>

              {/* Tasks chart */}
              <div>
                <p className="text-[11px] font-semibold tracking-wider text-zinc-500 uppercase mb-2">Tasks created per day</p>
                <div className="space-y-1.5">
                  {stats.tasksByDay.map((d) => (
                    <div key={d.date} className="flex items-center gap-2">
                      <span className="text-[11px] text-zinc-600 w-16 shrink-0">{shortDate(d.date)}</span>
                      <Bar value={d.count} max={maxTasks} color="bg-emerald-500" />
                    </div>
                  ))}
                </div>
              </div>

              {/* Cost estimate */}
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 space-y-2">
                <p className="text-[11px] font-semibold tracking-wider text-zinc-500 uppercase">Cost estimate (LLM only)</p>
                <div className="grid grid-cols-3 gap-3 text-center">
                  <div>
                    <p className="text-base font-bold text-zinc-100">${stats.cost.estimated_daily_usd.toFixed(4)}</p>
                    <p className="text-[10px] text-zinc-500">per day</p>
                  </div>
                  <div>
                    <p className="text-base font-bold text-zinc-100">${stats.cost.estimated_7d_usd.toFixed(4)}</p>
                    <p className="text-[10px] text-zinc-500">last 7 days</p>
                  </div>
                  <div>
                    <p className="text-base font-bold text-zinc-100">${stats.cost.per_capture_usd.toFixed(5)}</p>
                    <p className="text-[10px] text-zinc-500">per capture</p>
                  </div>
                </div>
                <p className="text-[10px] text-zinc-600">{stats.cost.note}</p>
              </div>
            </div>
          )}

          {stats && tab === "captures" && (
            <div className="space-y-2">
              <p className="text-[11px] font-semibold tracking-wider text-zinc-500 uppercase mb-3">
                Last 30 captures · all users
              </p>
              {stats.recentCaptures.length === 0 && (
                <p className="text-sm text-zinc-600 text-center py-8">No captures yet</p>
              )}
              {stats.recentCaptures.map((c) => (
                <div key={c.id} className="bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2.5">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] text-zinc-600 font-mono">{c.user_id.slice(0, 8)}…</span>
                    <span className="text-[10px] text-zinc-600">{timeAgo(c.created_at)}</span>
                  </div>
                  <p className="text-sm text-zinc-200 leading-snug">
                    {c.transcript_snippet || <span className="text-zinc-600 italic">empty</span>}
                    {c.transcript_length > 120 && <span className="text-zinc-600"> …({c.transcript_length} chars)</span>}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <style>{`
        @keyframes slideUp {
          from { transform: translateY(40px); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
      `}</style>
    </div>
  );
}
