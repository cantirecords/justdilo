"use client";
import { useState } from "react";
import { X, ChevronDown, Clock, Users, Calendar } from "lucide-react";
import { format, parseISO } from "date-fns";
import { cn } from "@/lib/utils";
import type { Meeting } from "@/lib/types";

function formatDuration(seconds: number | null | undefined): string {
  if (!seconds) return "";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m} min`;
  return `${seconds}s`;
}

type Props = {
  meeting: Meeting;
  onClose: () => void;
  onDelete?: (id: string) => void;
  onContinue?: (meeting: Meeting) => void;
};

export default function MeetingDetailDrawer({ meeting, onClose, onDelete, onContinue }: Props) {
  const [transcriptOpen, setTranscriptOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function handleDelete() {
    if (!confirm("Delete this meeting? This can't be undone.")) return;
    setDeleting(true);
    try {
      await fetch(`/api/meetings/${meeting.id}`, { method: "DELETE" });
      onDelete?.(meeting.id);
      onClose();
    } catch {
      setDeleting(false);
    }
  }

  const date = parseISO(meeting.completed_at || meeting.created_at);

  // Extract unique participant names from action items
  const participants = [...new Set(
    (meeting.action_items ?? [])
      .map((a) => a.assignee_name)
      .filter((n): n is string => Boolean(n))
  )];

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-background rounded-t-3xl shadow-2xl animate-rise max-h-[90dvh] flex flex-col">

        {/* Header */}
        <div className="flex items-start justify-between px-5 pt-5 pb-4 shrink-0">
          <div className="flex-1 min-w-0 pr-3">
            <div className="flex items-center gap-2 mb-1">
              <Users className="w-3.5 h-3.5 text-foreground/50 shrink-0" />
              <p className="text-[10px] uppercase tracking-widest text-muted-foreground/60">Meeting</p>
            </div>
            <h2 className="font-semibold text-base leading-snug">{meeting.title}</h2>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-full hover:bg-muted transition shrink-0 mt-0.5">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Meta row */}
        <div className="px-5 pb-4 shrink-0 flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <Calendar className="w-3 h-3" />
            {format(date, "MMM d, yyyy · h:mm a")}
          </div>
          {meeting.duration_seconds ? (
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <Clock className="w-3 h-3" />
              {formatDuration(meeting.duration_seconds)}
            </div>
          ) : null}
          {participants.length > 0 && (
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <Users className="w-3 h-3" />
              {participants.join(", ")}
            </div>
          )}
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto px-5 pb-8 space-y-5">

          {/* Summary */}
          {meeting.summary && (
            <div>
              <p className="text-[10px] uppercase tracking-widest text-muted-foreground/60 mb-1.5">Summary</p>
              <p className="text-sm text-foreground/80 leading-relaxed">{meeting.summary}</p>
            </div>
          )}

          {/* Decisions */}
          {Array.isArray(meeting.decisions) && meeting.decisions.length > 0 && (
            <div>
              <p className="text-[10px] uppercase tracking-widest text-muted-foreground/60 mb-1.5">Decisions</p>
              <ul className="space-y-1.5">
                {meeting.decisions.map((d, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-foreground/80 leading-snug">
                    <span className="text-muted-foreground/40 shrink-0 mt-0.5">•</span>
                    {d}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Action items */}
          {Array.isArray(meeting.action_items) && meeting.action_items.length > 0 && (
            <div>
              <p className="text-[10px] uppercase tracking-widest text-muted-foreground/60 mb-1.5">Action items</p>
              <ul className="space-y-2">
                {meeting.action_items.map((item, i) => (
                  <li key={i} className="rounded-xl border border-border bg-muted/20 px-3 py-2.5">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-medium leading-snug">{item.title}</p>
                      {item.priority === "high" && (
                        <span className="text-[9px] uppercase tracking-widest text-red-500 font-bold shrink-0 mt-0.5">Urgent</span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      {item.assignee_name && (
                        <span className="text-xs text-muted-foreground">→ {item.assignee_name}</span>
                      )}
                      {item.due && (
                        <span className="text-xs text-muted-foreground/60">{item.due}</span>
                      )}
                      {item.note && (
                        <span className="text-xs text-muted-foreground/60 italic">{item.note}</span>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Transcript (collapsed by default) */}
          {meeting.transcript && (
            <div>
              <button
                onClick={() => setTranscriptOpen((v) => !v)}
                className="flex items-center gap-2 w-full group"
              >
                <p className="text-[10px] uppercase tracking-widest text-muted-foreground/60">Transcript</p>
                <ChevronDown className={cn(
                  "w-3 h-3 text-muted-foreground/40 transition-transform",
                  transcriptOpen && "rotate-180",
                )} />
              </button>
              {transcriptOpen && (
                <div className="mt-2 rounded-xl border border-border bg-muted/20 px-4 py-3 max-h-60 overflow-y-auto">
                  <p className="text-xs text-muted-foreground leading-relaxed whitespace-pre-wrap">
                    {meeting.transcript}
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-2 pt-1">
            {onContinue && (
              <button
                onClick={() => onContinue(meeting)}
                className="flex-1 py-2.5 rounded-xl border border-border text-sm font-medium hover:bg-muted transition"
              >
                Continue meeting
              </button>
            )}
            <button
              onClick={handleDelete}
              disabled={deleting}
              className={cn(
                "py-2.5 rounded-xl text-sm font-medium transition",
                onContinue ? "px-4" : "flex-1",
                "text-red-500 hover:bg-red-50 dark:hover:bg-red-950/20 disabled:opacity-50",
              )}
            >
              {deleting ? "Deleting…" : "Delete"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
