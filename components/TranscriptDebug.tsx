"use client";
import { useEffect, useState } from "react";
import { X, Copy, Check, ChevronDown, ChevronUp, Clock, Cpu, AlertCircle, CheckCircle } from "lucide-react";
import { cn } from "@/lib/utils";

type DebugData = {
  transcript: string;
  intent: string;
  provider?: string;
  timing?: { transcription_ms?: number; extraction_ms?: number };
  tasks?: { title: string; group_name?: string; due_date?: string; priority?: string }[];
  groups?: any[];
  overall_summary?: string;
  updated_tasks?: { title: string }[];
  deleted_task_ids?: string[];
  completed_task_ids?: string[];
  duplicates_skipped?: number;
  answer?: string;
  not_found?: boolean;
  target_task_keywords?: string[];
  target_group?: string | null;
  update_due?: string | null;
  update_title?: string | null;
  update_priority?: string | null;
  failure_reason?: string | null;
};

type Props = { data: DebugData; onClose: () => void };

const INTENT_LABEL: Record<string, string> = {
  CREATE_TASK: "CREATE", UPDATE_TASK: "UPDATE",
  DELETE_TASK: "DELETE", COMPLETE_TASK: "COMPLETE", QUERY_TASKS: "QUERY",
};
const INTENT_COLOR: Record<string, string> = {
  CREATE_TASK: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  UPDATE_TASK: "bg-blue-500/15 text-blue-400 border-blue-500/30",
  DELETE_TASK: "bg-red-500/15 text-red-400 border-red-500/30",
  COMPLETE_TASK: "bg-purple-500/15 text-purple-400 border-purple-500/30",
  QUERY_TASKS: "bg-amber-500/15 text-amber-400 border-amber-500/30",
};
const PROVIDER_COLOR: Record<string, string> = {
  groq: "bg-orange-500/15 text-orange-400 border-orange-500/30",
  openai: "bg-teal-500/15 text-teal-400 border-teal-500/30",
  "openai-fallback": "bg-yellow-500/15 text-yellow-400 border-yellow-500/30",
  "groq-fallback": "bg-yellow-500/15 text-yellow-400 border-yellow-500/30",
};
const FAILURE_LABEL: Record<string, string> = {
  too_short: "Audio muy corto",
  question: "Era una pregunta",
  background_noise: "Ruido de fondo",
  no_action_verbs: "Sin verbos de acción",
  too_vague: "Demasiado vago",
  unclear_intent: "Intención poco clara",
};
const ISSUE_TYPES = [
  { value: "vague",        label: "Petición vaga" },
  { value: "noise",        label: "Ruido / audio malo" },
  { value: "wrong_intent", label: "Intent incorrecto" },
  { value: "missed_tasks", label: "Faltaron tareas" },
  { value: "wrong_date",   label: "Fecha equivocada" },
  { value: "language",     label: "Problema de idioma" },
  { value: "other",        label: "Otro" },
];

export default function TranscriptDebug({ data, onClose }: Props) {
  const [copied, setCopied] = useState(false);
  const [showJson, setShowJson] = useState(false);
  const [showCorrect, setShowCorrect] = useState(false);
  const [issueType, setIssueType] = useState("other");
  const [correctText, setCorrectText] = useState("");
  const [adminNote, setAdminNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);

  async function copyTranscript() {
    await navigator.clipboard.writeText(data.transcript);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function saveCorrection() {
    setSaving(true);
    try {
      const res = await fetch("/api/admin/corrections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          original_transcript: data.transcript,
          correct_intent: data.intent ?? "CREATE_TASK",
          correct_tasks: correctText.trim() ? [{ title: correctText.trim(), note: null, due: null }] : [],
          issue_type: issueType,
          admin_note: adminNote.trim() || null,
        }),
      });
      if (res.status === 503) {
        alert("Primero crea la tabla `prompt_corrections` en Supabase. Ve a Admin → AI Quality para ver el SQL.");
        return;
      }
      if (!res.ok) throw new Error("Failed");
      setSaved(true);
      setShowCorrect(false);
      setTimeout(() => setSaved(false), 3000);
    } catch (e: any) {
      alert(e.message);
    } finally {
      setSaving(false);
    }
  }

  const intent = data.intent ?? "CREATE_TASK";
  const provider = data.provider ?? "groq";
  const txMs = data.timing?.transcription_ms;
  const exMs = data.timing?.extraction_ms;
  const totalMs = (txMs ?? 0) + (exMs ?? 0);
  const { tasks: _t, ...jsonDisplay } = data as any;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className="w-full max-w-2xl bg-zinc-950 border border-zinc-800 rounded-t-2xl p-5 pb-8 max-h-[85dvh] overflow-y-auto"
        style={{ animation: "slideUp 0.22s ease-out" }}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[10px] font-bold tracking-widest text-zinc-500 uppercase">Dev</span>
            <span className={cn("text-[11px] font-semibold px-2 py-0.5 rounded-full border", INTENT_COLOR[intent] ?? "bg-zinc-500/15 text-zinc-400 border-zinc-500/30")}>
              {INTENT_LABEL[intent] ?? intent}
            </span>
            <span className={cn("text-[11px] font-semibold px-2 py-0.5 rounded-full border", PROVIDER_COLOR[provider] ?? "bg-zinc-500/15 text-zinc-400 border-zinc-500/30")}>
              {provider.toUpperCase()}
            </span>
            {totalMs > 0 && (
              <span className="flex items-center gap-1 text-[11px] text-zinc-500 bg-zinc-900 border border-zinc-800 px-2 py-0.5 rounded-full">
                <Clock className="w-3 h-3" />{(totalMs / 1000).toFixed(1)}s
              </span>
            )}
          </div>
          <button onClick={onClose} className="p-1.5 rounded-full hover:bg-zinc-800 text-zinc-500 hover:text-zinc-300 transition">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Timing */}
        {(txMs || exMs) && (
          <div className="flex gap-2 mb-3">
            {txMs && <div className="flex items-center gap-1.5 bg-zinc-900 border border-zinc-800 rounded-lg px-2.5 py-1">
              <Cpu className="w-3 h-3 text-orange-400" />
              <span className="text-[11px] text-zinc-400">Whisper <span className="text-zinc-200 font-mono">{txMs}ms</span></span>
            </div>}
            {exMs && <div className="flex items-center gap-1.5 bg-zinc-900 border border-zinc-800 rounded-lg px-2.5 py-1">
              <Cpu className="w-3 h-3 text-blue-400" />
              <span className="text-[11px] text-zinc-400">LLM <span className="text-zinc-200 font-mono">{exMs}ms</span></span>
            </div>}
          </div>
        )}

        {/* Failure reason */}
        {data.failure_reason && (
          <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2 mb-3">
            <AlertCircle className="w-3.5 h-3.5 text-red-400 shrink-0" />
            <p className="text-[12px] text-red-300">
              0 tareas extraídas — <span className="font-medium">{FAILURE_LABEL[data.failure_reason] ?? data.failure_reason}</span>
            </p>
          </div>
        )}

        {/* Raw transcript */}
        <div className="mb-3">
          <div className="flex items-center justify-between mb-1.5">
            <p className="text-[11px] font-semibold tracking-wider text-zinc-500 uppercase">Raw Transcript</p>
            <button onClick={copyTranscript} className="flex items-center gap-1 text-[11px] text-zinc-500 hover:text-zinc-300 transition">
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

        {/* Summary */}
        {data.overall_summary && (
          <div className="mb-3">
            <p className="text-[11px] font-semibold tracking-wider text-zinc-500 uppercase mb-1">AI Summary</p>
            <p className="text-[12px] text-zinc-300 bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2">{data.overall_summary}</p>
          </div>
        )}

        {/* Extracted tasks */}
        {data.tasks && data.tasks.length > 0 && (
          <div className="mb-3">
            <p className="text-[11px] font-semibold tracking-wider text-zinc-500 uppercase mb-1.5">Tasks ({data.tasks.length})</p>
            <div className="flex flex-col gap-1">
              {data.tasks.map((t, i) => (
                <div key={i} className="bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2">
                  <p className="text-[12px] text-zinc-200">{t.title}</p>
                  <div className="flex flex-wrap gap-1.5 mt-1">
                    {t.group_name && <span className="text-[10px] text-zinc-500 bg-zinc-800 px-1.5 py-0.5 rounded">{t.group_name}</span>}
                    {t.due_date && <span className="text-[10px] text-zinc-500 bg-zinc-800 px-1.5 py-0.5 rounded">{new Date(t.due_date).toLocaleString()}</span>}
                    {t.priority && <span className="text-[10px] text-zinc-500 bg-zinc-800 px-1.5 py-0.5 rounded">{t.priority}</span>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Target info for non-create */}
        {(data.target_task_keywords?.length || data.target_group || data.update_due || data.update_title) && (
          <div className="mb-3">
            <p className="text-[11px] font-semibold tracking-wider text-zinc-500 uppercase mb-1">Target</p>
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-[12px] text-zinc-400 space-y-0.5">
              {!!data.target_task_keywords?.length && <p>Keywords: <span className="text-zinc-200">{data.target_task_keywords.join(", ")}</span></p>}
              {data.target_group && <p>Group: <span className="text-zinc-200">{data.target_group}</span></p>}
              {data.update_due && <p>New due: <span className="text-zinc-200">{data.update_due}</span></p>}
              {data.update_title && <p>New title: <span className="text-zinc-200">{data.update_title}</span></p>}
            </div>
          </div>
        )}

        {!!data.duplicates_skipped && (
          <p className="text-[12px] text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2 mb-3">
            {data.duplicates_skipped} duplicate{data.duplicates_skipped > 1 ? "s" : ""} skipped
          </p>
        )}
        {data.answer && (
          <p className="text-[12px] text-zinc-200 bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 mb-3">{data.answer}</p>
        )}
        {data.not_found && (
          <p className="text-[12px] text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2 mb-3">No matching tasks found</p>
        )}

        {/* Correction form */}
        <div className="mb-3">
          {saved ? (
            <div className="flex items-center gap-2 text-emerald-400 text-[12px] py-1">
              <CheckCircle className="w-3.5 h-3.5" /> Corrección guardada — el AI aprenderá de esto
            </div>
          ) : (
            <button
              onClick={() => setShowCorrect(v => !v)}
              className="text-[11px] text-zinc-600 hover:text-red-400 transition flex items-center gap-1"
            >
              <AlertCircle className="w-3 h-3" />
              {showCorrect ? "Cancelar" : "Marcar como incorrecto y corregir"}
            </button>
          )}

          {showCorrect && (
            <div className="mt-2 bg-zinc-900 border border-zinc-700 rounded-xl p-3 space-y-2.5">
              <div>
                <p className="text-[10px] text-zinc-500 uppercase font-semibold tracking-wider mb-1">¿Qué falló?</p>
                <div className="flex flex-wrap gap-1">
                  {ISSUE_TYPES.map(({ value, label }) => (
                    <button
                      key={value}
                      onClick={() => setIssueType(value)}
                      className={cn(
                        "text-[11px] px-2.5 py-1 rounded-full border transition",
                        issueType === value
                          ? "bg-red-500/20 text-red-300 border-red-500/40"
                          : "bg-zinc-800 text-zinc-500 border-zinc-700 hover:text-zinc-300"
                      )}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-[10px] text-zinc-500 uppercase font-semibold tracking-wider mb-1">¿Qué debió extraer? (opcional)</p>
                <input
                  type="text"
                  value={correctText}
                  onChange={e => setCorrectText(e.target.value)}
                  placeholder='ej: "Llamar al dentista"'
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-1.5 text-[12px] text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-500"
                />
              </div>
              <div>
                <p className="text-[10px] text-zinc-500 uppercase font-semibold tracking-wider mb-1">Nota (opcional)</p>
                <input
                  type="text"
                  value={adminNote}
                  onChange={e => setAdminNote(e.target.value)}
                  placeholder="Por qué falló..."
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-1.5 text-[12px] text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-500"
                />
              </div>
              <button
                onClick={saveCorrection}
                disabled={saving}
                className="w-full bg-red-500/20 hover:bg-red-500/30 text-red-300 border border-red-500/30 rounded-lg py-1.5 text-[12px] font-semibold transition disabled:opacity-50"
              >
                {saving ? "Guardando…" : "Guardar corrección"}
              </button>
            </div>
          )}
        </div>

        {/* Full JSON */}
        <button onClick={() => setShowJson(v => !v)} className="flex items-center gap-1.5 text-[11px] text-zinc-700 hover:text-zinc-500 transition mb-2">
          {showJson ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          {showJson ? "Hide" : "Show"} full JSON
        </button>
        {showJson && (
          <pre className="text-[11px] text-zinc-400 bg-zinc-900 border border-zinc-800 rounded-xl p-3 overflow-x-auto whitespace-pre-wrap break-all">
            {JSON.stringify(jsonDisplay, null, 2)}
          </pre>
        )}

        <p className="text-center text-[10px] text-zinc-700 mt-4">Solo visible para ti · Esc para cerrar</p>
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
