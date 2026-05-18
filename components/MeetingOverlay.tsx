"use client";
import { useEffect, useRef, useState } from "react";
import { X, Square, Loader2, Users, Plus, Trash2, ChevronLeft } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { createSupabaseBrowser } from "@/lib/supabase/client";
import { useFeature } from "@/lib/features";
import type { Meeting, MeetingTemplate, Organization, Task } from "@/lib/types";

type Phase = "idle" | "recording" | "uploading" | "processing" | "done" | "error";

function formatElapsed(ms: number): string {
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  return `${m}:${String(sec).padStart(2, "0")}`;
}

// snake_case key → "Snake case" label
function labelizeSectionKey(key: string): string {
  const spaced = key.replace(/_/g, " ");
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

type Props = {
  userId: string;
  orgs: Organization[];
  onClose: () => void;
  onTasksCreated: (tasks: Task[]) => void;
  parentMeeting?: Meeting | null;
};

export default function MeetingOverlay({ userId, orgs, onClose, onTasksCreated, parentMeeting }: Props) {
  const templatesEnabled = useFeature("meeting_templates");
  const [phase, setPhase] = useState<Phase>("idle");
  const [elapsed, setElapsed] = useState(0);
  const [meeting, setMeeting] = useState<Meeting | null>(null);
  const [taskCount, setTaskCount] = useState(0);

  // Templates state
  const [templates, setTemplates] = useState<MeetingTemplate[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const [creatingTemplate, setCreatingTemplate] = useState(false);
  const [newTplName, setNewTplName] = useState("");
  const [newTplSections, setNewTplSections] = useState("");
  const [savingTpl, setSavingTpl] = useState(false);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startTsRef = useRef<number>(0);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const wakeLockRef = useRef<any>(null);

  useEffect(() => () => cleanup(), []);

  // Load templates when the feature is on (skip for continuations — template is inherited)
  useEffect(() => {
    if (!templatesEnabled || parentMeeting) return;
    fetch("/api/meetings/templates")
      .then((r) => r.json())
      .then(({ templates }) => {
        const list: MeetingTemplate[] = templates ?? [];
        setTemplates(list);
        // Default to "General" built-in
        const general = list.find((t) => t.is_builtin && t.slug === "general");
        if (general) setSelectedTemplateId(general.id);
      })
      .catch(() => {});
  }, [templatesEnabled, parentMeeting]);

  const selectedTemplate = templates.find((t) => t.id === selectedTemplateId) ?? null;

  // Dismiss on Escape
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && phase === "idle") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phase, onClose]);

  function cleanup() {
    if (tickRef.current) clearInterval(tickRef.current);
    tickRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    try { wakeLockRef.current?.release(); } catch {}
    wakeLockRef.current = null;
  }

  async function saveCustomTemplate() {
    const name = newTplName.trim();
    if (!name) { toast.error("Name required"); return; }
    const sectionLines = newTplSections
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
    if (!sectionLines.length) { toast.error("Add at least one section"); return; }

    setSavingTpl(true);
    try {
      const sections = sectionLines.map((label) => ({
        key: label.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 40) || "section",
        label,
      }));
      const res = await fetch("/api/meetings/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, sections }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Couldn't save template");
      setTemplates((prev) => [...prev, json]);
      setSelectedTemplateId(json.id);
      setCreatingTemplate(false);
      setNewTplName("");
      setNewTplSections("");
      toast.success("Template saved");
    } catch (e: any) {
      toast.error(e?.message ?? "Couldn't save template");
    } finally {
      setSavingTpl(false);
    }
  }

  async function deleteTemplate(id: string) {
    if (!confirm("Delete this template? Past meetings keep their sections.")) return;
    try {
      const res = await fetch(`/api/meetings/templates/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Delete failed");
      setTemplates((prev) => prev.filter((t) => t.id !== id));
      if (selectedTemplateId === id) {
        const general = templates.find((t) => t.is_builtin && t.slug === "general");
        setSelectedTemplateId(general?.id ?? null);
      }
      toast.success("Template deleted");
    } catch {
      toast.error("Couldn't delete template");
    }
  }

  async function startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
      });
      streamRef.current = stream;
      const mime = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus", ""]
        .find((m) => m === "" || MediaRecorder.isTypeSupported(m)) ?? "";
      const rec = new MediaRecorder(stream, { ...(mime ? { mimeType: mime } : {}), audioBitsPerSecond: 24_000 });
      chunksRef.current = [];
      rec.ondataavailable = (e) => { if (e.data.size) chunksRef.current.push(e.data); };
      rec.onstop = () => { void handleStop(rec.mimeType || mime); };
      rec.start(5_000);
      recorderRef.current = rec;
      startTsRef.current = Date.now();
      setElapsed(0);
      tickRef.current = setInterval(() => setElapsed(Date.now() - startTsRef.current), 1000);
      setPhase("recording");
      try {
        const wl = (navigator as any).wakeLock;
        if (wl?.request) wakeLockRef.current = await wl.request("screen");
      } catch {}
    } catch (e: any) {
      toast.error(e?.message || "Microphone access denied");
    }
  }

  function stopRecording() {
    if (phase !== "recording") return;
    recorderRef.current?.stop();
    if (tickRef.current) { clearInterval(tickRef.current); tickRef.current = null; }
  }

  async function handleStop(mime: string) {
    const blob = new Blob(chunksRef.current, { type: mime || "audio/webm" });
    const seconds = Math.round((Date.now() - startTsRef.current) / 1000);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    try { wakeLockRef.current?.release(); } catch {}
    wakeLockRef.current = null;

    if (blob.size < 1024) { toast.error("Recording too short."); setPhase("idle"); return; }

    setPhase("uploading");
    try {
      const supabase = createSupabaseBrowser();
      const ext = mime.includes("mp4") ? "mp4" : mime.includes("ogg") ? "ogg" : "webm";
      const path = `${userId}/meetings/${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("captures")
        .upload(path, blob, { contentType: blob.type || "audio/webm", upsert: false });
      if (upErr) throw upErr;

      setPhase("processing");
      const orgId = orgs[0]?.id ?? null;
      const res = await fetch("/api/meetings/finish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          path,
          duration_seconds: seconds,
          org_id: orgId,
          project_id: null,
          utcOffset: -new Date().getTimezoneOffset(),
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          parent_meeting_id: parentMeeting?.id ?? null,
          template_id: parentMeeting ? null : selectedTemplateId,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed");

      const tasks: Task[] = json.tasks ?? [];
      setMeeting(json.meeting as Meeting);
      setTaskCount(tasks.length);
      onTasksCreated(tasks);
      setPhase("done");
      if (tasks.length) toast.success(`${tasks.length} task${tasks.length !== 1 ? "s" : ""} created`);
    } catch (e: any) {
      toast.error(e?.message || "Couldn't process the meeting. Try again.");
      setPhase("error");
    }
  }

  const canClose = phase === "idle" || phase === "done" || phase === "error";

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end">
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={canClose ? onClose : undefined}
      />
      <div className="relative bg-background rounded-t-3xl shadow-2xl animate-rise max-h-[85dvh] flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-4 shrink-0">
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-foreground/60" />
            <h2 className="font-semibold">Meeting</h2>
            {phase === "recording" && (
              <div className="flex items-center gap-1.5 ml-2">
                <span className="w-1.5 h-1.5 rounded-full bg-red-500" style={{ animation: "micBreathe 1.6s ease-in-out infinite" }} />
                <span className="text-sm tabular-nums text-red-500 font-medium">{formatElapsed(elapsed)}</span>
              </div>
            )}
          </div>
          {canClose && (
            <button onClick={onClose} className="p-1.5 rounded-full hover:bg-muted transition">
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Body */}
        <div className="px-5 pb-8 overflow-y-auto">

          {/* Idle */}
          {phase === "idle" && !creatingTemplate && (
            <div className="space-y-4">
              {parentMeeting && (
                <div className="rounded-xl bg-muted/40 px-3 py-2.5 text-xs text-muted-foreground leading-snug">
                  Continuing <strong className="text-foreground/80">{parentMeeting.title}</strong> — new action items will be added to this meeting.
                </div>
              )}

              {/* Template picker — hidden during continuations (template inherited) */}
              {templatesEnabled && !parentMeeting && templates.length > 0 && (
                <div>
                  <p className="text-[10px] uppercase tracking-widest text-muted-foreground/60 mb-2">Template</p>
                  <div className="flex flex-wrap gap-1.5">
                    {templates.map((t) => (
                      <button
                        key={t.id}
                        onClick={() => setSelectedTemplateId(t.id)}
                        className={cn(
                          "group relative px-3 py-1.5 rounded-full text-xs border transition flex items-center gap-1.5",
                          selectedTemplateId === t.id
                            ? "bg-foreground text-background border-foreground"
                            : "border-border text-foreground/70 hover:bg-muted",
                        )}
                      >
                        {t.name}
                        {!t.is_builtin && selectedTemplateId === t.id && (
                          <span
                            role="button"
                            tabIndex={0}
                            onClick={(e) => { e.stopPropagation(); deleteTemplate(t.id); }}
                            onKeyDown={(e) => { if (e.key === "Enter") { e.stopPropagation(); deleteTemplate(t.id); } }}
                            className="opacity-60 hover:opacity-100 transition"
                            aria-label="Delete template"
                          >
                            <Trash2 className="w-3 h-3" />
                          </span>
                        )}
                      </button>
                    ))}
                    <button
                      onClick={() => setCreatingTemplate(true)}
                      className="px-3 py-1.5 rounded-full text-xs border border-dashed border-border text-muted-foreground hover:bg-muted hover:text-foreground transition flex items-center gap-1"
                    >
                      <Plus className="w-3 h-3" />
                      New
                    </button>
                  </div>
                  {selectedTemplate && (
                    <p className="text-[10px] text-muted-foreground/60 mt-2 leading-snug">
                      Will extract: {(selectedTemplate.sections ?? []).map((s) => s.label).join(" · ")}
                    </p>
                  )}
                </div>
              )}

              <p className="text-sm text-muted-foreground leading-relaxed">
                Tap <strong>Start</strong> when your meeting begins. Keep this screen open — or leave the tab in the foreground. Tap <strong>End</strong> when you&apos;re done.
              </p>
              <p className="text-xs text-muted-foreground/60">
                Audio is deleted immediately after transcription. Only the transcript and tasks are saved.
              </p>
              <button
                onClick={startRecording}
                className="w-full py-3 rounded-2xl bg-foreground text-background font-semibold text-sm hover:opacity-90 transition active:scale-[0.98]"
              >
                {parentMeeting ? "Continue recording" : "Start meeting"}
              </button>
            </div>
          )}

          {/* Create custom template form */}
          {phase === "idle" && creatingTemplate && (
            <div className="space-y-4">
              <button
                onClick={() => { setCreatingTemplate(false); setNewTplName(""); setNewTplSections(""); }}
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition"
              >
                <ChevronLeft className="w-3 h-3" />
                Back
              </button>
              <div>
                <p className="text-[10px] uppercase tracking-widest text-muted-foreground/60 mb-1.5">Template name</p>
                <input
                  value={newTplName}
                  onChange={(e) => setNewTplName(e.target.value)}
                  placeholder="e.g. BTV Production Sync"
                  className="w-full rounded-xl border border-border bg-muted/30 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-foreground/10 placeholder:text-muted-foreground/50"
                  autoFocus
                />
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-widest text-muted-foreground/60 mb-1.5">Sections to extract</p>
                <textarea
                  value={newTplSections}
                  onChange={(e) => setNewTplSections(e.target.value)}
                  placeholder={"One section per line, e.g.\nOn-air issues\nContent schedule\nTechnical bugs\nNext steps"}
                  rows={6}
                  className="w-full rounded-xl border border-border bg-muted/30 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-foreground/10 placeholder:text-muted-foreground/50 resize-none"
                />
                <p className="text-[10px] text-muted-foreground/60 mt-1.5 leading-snug">
                  Action items are always extracted automatically — you don&apos;t need to add them.
                </p>
              </div>
              <button
                onClick={saveCustomTemplate}
                disabled={savingTpl || !newTplName.trim() || !newTplSections.trim()}
                className="w-full py-3 rounded-2xl bg-foreground text-background font-semibold text-sm hover:opacity-90 transition active:scale-[0.98] disabled:opacity-40"
              >
                {savingTpl ? "Saving…" : "Save template"}
              </button>
            </div>
          )}

          {/* Recording */}
          {phase === "recording" && (
            <div className="space-y-4">
              <div className="rounded-2xl border border-red-500/20 bg-red-500/[0.04] px-4 py-4 text-center">
                <p className="text-4xl font-black tabular-nums tracking-tight text-red-500">{formatElapsed(elapsed)}</p>
                <p className="text-xs text-muted-foreground mt-1">Recording in progress</p>
              </div>
              <p className="text-xs text-center text-muted-foreground/60">Keep this tab open while recording.</p>
              <button
                onClick={stopRecording}
                className="w-full py-3 rounded-2xl bg-red-500 hover:bg-red-600 text-white font-semibold text-sm flex items-center justify-center gap-2 transition active:scale-[0.98]"
              >
                <Square className="w-4 h-4" fill="currentColor" />
                End meeting
              </button>
            </div>
          )}

          {/* Uploading / processing */}
          {(phase === "uploading" || phase === "processing") && (
            <div className="py-8 flex flex-col items-center gap-4 text-center">
              <Loader2 className="w-8 h-8 animate-spin text-foreground/40" />
              <div>
                <p className="font-medium text-sm">
                  {phase === "uploading" ? "Uploading audio…" : "Transcribing & extracting tasks…"}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  {phase === "uploading"
                    ? "Almost there — this takes a few seconds"
                    : "This can take up to a minute for long meetings"}
                </p>
              </div>
            </div>
          )}

          {/* Done */}
          {phase === "done" && meeting && (
            <div className="space-y-4">
              <div>
                <p className="text-xs uppercase tracking-widest text-muted-foreground/60 mb-1">Summary</p>
                <h3 className="font-semibold text-base leading-snug mb-1">{meeting.title}</h3>
                {meeting.summary && (
                  <p className="text-sm text-muted-foreground leading-relaxed">{meeting.summary}</p>
                )}
              </div>

              {/* Render template-driven sections dynamically (skip action_items — has its own block) */}
              {meeting.sections && Object.entries(meeting.sections)
                .filter(([key, items]) => key !== "action_items" && Array.isArray(items) && items.length > 0)
                .map(([key, items]) => (
                  <div key={key}>
                    <p className="text-xs uppercase tracking-widest text-muted-foreground/60 mb-1.5">{labelizeSectionKey(key)}</p>
                    <ul className="space-y-1">
                      {items.map((d, i) => (
                        <li key={i} className="text-sm text-foreground/80 leading-snug flex gap-2">
                          <span className="text-muted-foreground/40 shrink-0">•</span>
                          {d}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}

              {/* Backwards-compat: show legacy decisions column if there are no new-style sections */}
              {(!meeting.sections || Object.keys(meeting.sections).length === 0) && Array.isArray(meeting.decisions) && meeting.decisions.length > 0 && (
                <div>
                  <p className="text-xs uppercase tracking-widest text-muted-foreground/60 mb-1.5">Decisions</p>
                  <ul className="space-y-1">
                    {meeting.decisions.map((d, i) => (
                      <li key={i} className="text-sm text-foreground/80 leading-snug flex gap-2">
                        <span className="text-muted-foreground/40 shrink-0">•</span>
                        {d}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {Array.isArray(meeting.action_items) && meeting.action_items.length > 0 && (
                <div>
                  <p className="text-xs uppercase tracking-widest text-muted-foreground/60 mb-1.5">
                    Action items · <span className="normal-case font-normal">{taskCount} task{taskCount !== 1 ? "s" : ""} created</span>
                  </p>
                  <ul className="space-y-1.5">
                    {meeting.action_items.map((item, i) => (
                      <li key={i} className="text-sm leading-snug flex items-start gap-2">
                        <span className="text-muted-foreground/40 mt-0.5 shrink-0">→</span>
                        <span>
                          {item.title}
                          {item.assignee_name && (
                            <span className="ml-1.5 text-xs text-muted-foreground">· {item.assignee_name}</span>
                          )}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {!meeting.action_items?.length && (
                <p className="text-xs text-muted-foreground/60">No specific action items captured.</p>
              )}

              <div className="flex gap-2 pt-2">
                <button
                  onClick={() => { setPhase("idle"); setMeeting(null); setTaskCount(0); setElapsed(0); }}
                  className="flex-1 py-2.5 rounded-xl border border-border text-sm font-medium hover:bg-muted transition"
                >
                  Record another
                </button>
                <button
                  onClick={onClose}
                  className="flex-1 py-2.5 rounded-xl bg-foreground text-background text-sm font-medium hover:opacity-90 transition"
                >
                  Done
                </button>
              </div>
            </div>
          )}

          {/* Error */}
          {phase === "error" && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">Something went wrong. Try recording again.</p>
              <button
                onClick={() => setPhase("idle")}
                className="w-full py-3 rounded-2xl bg-foreground text-background font-semibold text-sm"
              >
                Try again
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
