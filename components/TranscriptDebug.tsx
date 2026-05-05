"use client";
import { useEffect, useRef } from "react";
import { X, Copy, Check } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";

type DebugData = {
  transcript: string;
  intent: string;
  tasks?: { title: string; group_name?: string; due_date?: string; priority?: string }[];
  updated_tasks?: { title: string }[];
  deleted_task_ids?: string[];
  completed_task_ids?: string[];
  duplicates_skipped?: number;
  answer?: string;
  not_found?: boolean;
};

type Props = {
  data: DebugData;
  onClose: () => void;
};

const INTENT_LABEL: Record<string, string> = {
  CREATE_TASK: "CREATE TASK",
  UPDATE_TASK: "UPDATE TASK",
  DELETE_TASK: "DELETE TASK",
  COMPLETE_TASK: "COMPLETE TASK",
  QUERY_TASKS: "QUERY",
};

const INTENT_COLOR: Record<string, string> = {
  CREATE_TASK: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  UPDATE_TASK: "bg-blue-500/15 text-blue-400 border-blue-500/30",
  DELETE_TASK: "bg-red-500/15 text-red-400 border-red-500/30",
  COMPLETE_TASK: "bg-purple-500/15 text-purple-400 border-purple-500/30",
  QUERY_TASKS: "bg-amber-500/15 text-amber-400 border-amber-500/30",
};

export default function TranscriptDebug({ data, onClose }: Props) {
  const [copied, setCopied] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  // Close on backdrop click
  function handleBackdrop(e: React.MouseEvent) {
    if (e.target === e.currentTarget) onClose();
  }

  async function copyTranscript() {
    await navigator.clipboard.writeText(data.transcript);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const intent = data.intent ?? "CREATE_TASK";
  const intentColor = INTENT_COLOR[intent] ?? "bg-zinc-500/15 text-zinc-400 border-zinc-500/30";

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm"
      onClick={handleBackdrop}
    >
      <div
        ref={panelRef}
        className="w-full max-w-2xl bg-zinc-950 border border-zinc-800 rounded-t-2xl p-5 pb-safe-6 max-h-[80dvh] overflow-y-auto"
        style={{ animation: "slideUp 0.22s ease-out" }}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold tracking-widest text-zinc-500 uppercase">Dev</span>
            <span className={cn("text-[11px] font-semibold px-2 py-0.5 rounded-full border", intentColor)}>
              {INTENT_LABEL[intent] ?? intent}
            </span>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-full hover:bg-zinc-800 text-zinc-500 hover:text-zinc-300 transition">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Raw transcript */}
        <div className="mb-4">
          <div className="flex items-center justify-between mb-1.5">
            <p className="text-[11px] font-semibold tracking-wider text-zinc-500 uppercase">Raw Transcript</p>
            <button
              onClick={copyTranscript}
              className="flex items-center gap-1 text-[11px] text-zinc-500 hover:text-zinc-300 transition"
            >
              {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-3">
            <p className="text-sm text-zinc-100 leading-relaxed font-mono whitespace-pre-wrap">
              {data.transcript || <span className="text-zinc-600 italic">empty</span>}
            </p>
          </div>
        </div>

        {/* Extracted tasks */}
        {data.tasks && data.tasks.length > 0 && (
          <div className="mb-4">
            <p className="text-[11px] font-semibold tracking-wider text-zinc-500 uppercase mb-1.5">
              Extracted Tasks ({data.tasks.length})
            </p>
            <div className="flex flex-col gap-1.5">
              {data.tasks.map((t, i) => (
                <div key={i} className="bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2">
                  <p className="text-sm text-zinc-200">{t.title}</p>
                  <div className="flex flex-wrap gap-2 mt-1">
                    {t.group_name && (
                      <span className="text-[10px] text-zinc-500 bg-zinc-800 px-1.5 py-0.5 rounded">
                        {t.group_name}
                      </span>
                    )}
                    {t.due_date && (
                      <span className="text-[10px] text-zinc-500 bg-zinc-800 px-1.5 py-0.5 rounded">
                        {t.due_date}
                      </span>
                    )}
                    {t.priority && (
                      <span className="text-[10px] text-zinc-500 bg-zinc-800 px-1.5 py-0.5 rounded">
                        {t.priority}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Duplicates skipped */}
        {!!data.duplicates_skipped && (
          <div className="mb-4">
            <p className="text-[11px] font-semibold tracking-wider text-zinc-500 uppercase mb-1.5">Duplicates Skipped</p>
            <p className="text-sm text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2">
              {data.duplicates_skipped} duplicate{data.duplicates_skipped > 1 ? "s" : ""} detected and skipped
            </p>
          </div>
        )}

        {/* Query answer */}
        {data.answer && (
          <div className="mb-4">
            <p className="text-[11px] font-semibold tracking-wider text-zinc-500 uppercase mb-1.5">AI Answer</p>
            <p className="text-sm text-zinc-200 bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2">
              {data.answer}
            </p>
          </div>
        )}

        {/* Not found */}
        {data.not_found && (
          <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2 mb-4">
            No matching tasks found
          </p>
        )}

        <p className="text-center text-[11px] text-zinc-700 mt-2">
          Solo visible para ti · Presiona Esc para cerrar
        </p>
      </div>

      <style>{`
        @keyframes slideUp {
          from { transform: translateY(100%); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
      `}</style>
    </div>
  );
}
