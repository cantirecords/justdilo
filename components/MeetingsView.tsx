"use client";
import { useEffect, useState } from "react";
import { format, parseISO } from "date-fns";
import { Clock, Users } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import MeetingDetailDrawer from "./MeetingDetailDrawer";
import type { Meeting } from "@/lib/types";

function formatDuration(seconds: number | null | undefined): string {
  if (!seconds) return "";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m} min`;
  return `${seconds}s`;
}

export default function MeetingsView() {
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Meeting | null>(null);

  useEffect(() => {
    fetch("/api/meetings?limit=50")
      .then((r) => r.json())
      .then(({ meetings }) => setMeetings(meetings ?? []))
      .catch(() => toast.error("Couldn't load meetings"))
      .finally(() => setLoading(false));
  }, []);

  function handleDelete(id: string) {
    setMeetings((prev) => prev.filter((m) => m.id !== id));
  }

  if (loading) {
    return (
      <div className="py-12 text-center">
        <p className="text-sm text-muted-foreground">Loading meetings…</p>
      </div>
    );
  }

  if (!meetings.length) {
    return (
      <div className="py-12 text-center space-y-2">
        <p className="text-sm text-muted-foreground">No meetings yet.</p>
        <p className="text-xs text-muted-foreground/50">
          Tap <strong>+</strong> → <strong>Meeting</strong> to record your first one.
        </p>
      </div>
    );
  }

  // Group by date bucket
  const today = new Date().toDateString();
  const groups = new Map<string, Meeting[]>();
  for (const m of meetings) {
    const d = parseISO(m.completed_at || m.created_at);
    const dayStr = d.toDateString();
    const label = dayStr === today ? "Today" : format(d, "MMMM d, yyyy");
    if (!groups.has(label)) groups.set(label, []);
    groups.get(label)!.push(m);
  }

  return (
    <>
      <div className="space-y-6">
        {[...groups.entries()].map(([label, items]) => (
          <div key={label}>
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground/60 mb-2 px-0.5">{label}</p>
            <div className="space-y-2">
              {items.map((m) => {
                const participants = [...new Set(
                  (m.action_items ?? []).map((a) => a.assignee_name).filter(Boolean)
                )];
                const actionCount = m.action_items?.length ?? 0;

                return (
                  <button
                    key={m.id}
                    onClick={() => setSelected(m)}
                    className={cn(
                      "w-full text-left rounded-2xl border border-border bg-muted/20 p-4 hover:bg-muted/40 transition animate-rise",
                      m.status === "processing" && "opacity-60",
                    )}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <Users className="w-3 h-3 text-muted-foreground/60 shrink-0" />
                          <p className="font-medium text-sm truncate">{m.title}</p>
                        </div>
                        {m.summary && (
                          <p className="text-xs text-muted-foreground leading-snug line-clamp-2 mt-0.5">{m.summary}</p>
                        )}
                        {m.status === "processing" && (
                          <p className="text-xs text-muted-foreground/60 mt-0.5">Processing…</p>
                        )}
                        {m.status === "failed" && (
                          <p className="text-xs text-red-500/70 mt-0.5">Failed — {m.error ?? "unknown error"}</p>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-3 mt-2 flex-wrap">
                      <span className="text-[11px] text-muted-foreground/60">
                        {format(parseISO(m.completed_at || m.created_at), "h:mm a")}
                      </span>
                      {m.duration_seconds ? (
                        <span className="flex items-center gap-1 text-[11px] text-muted-foreground/60">
                          <Clock className="w-2.5 h-2.5" />
                          {formatDuration(m.duration_seconds)}
                        </span>
                      ) : null}
                      {actionCount > 0 && (
                        <span className="text-[11px] text-muted-foreground/60">
                          {actionCount} action item{actionCount !== 1 ? "s" : ""}
                        </span>
                      )}
                      {participants.length > 0 && (
                        <span className="text-[11px] text-muted-foreground/60 truncate max-w-[160px]">
                          {participants.join(", ")}
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {selected && (
        <MeetingDetailDrawer
          meeting={selected}
          onClose={() => setSelected(null)}
          onDelete={handleDelete}
        />
      )}
    </>
  );
}
