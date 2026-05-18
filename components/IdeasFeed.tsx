"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { Mic, MicOff, Send, Loader2, Sparkles, ListChecks, Users, Lightbulb } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import IdeaCard from "./IdeaCard";
import MeetingsView from "./MeetingsView";
import { useFeature } from "@/lib/features";
import type { Idea } from "@/lib/types";

type NotesTab = "ideas" | "meetings";

type Filter = "all" | "mine" | "shared" | "actions";

const EXAMPLES = [
  "A side project I keep thinking about…",
  "Notes from this morning's call…",
  "What if we tried…",
  "Three things to fix this week…",
];

function bucketOf(iso: string): "today" | "week" | "earlier" {
  const now = new Date();
  const d = new Date(iso);
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) return "today";
  const diff = (now.getTime() - d.getTime()) / 86400000;
  if (diff < 7) return "week";
  return "earlier";
}

export default function IdeasFeed() {
  const meetingsEnabled = useFeature("meetings");
  const [notesTab, setNotesTab] = useState<NotesTab>("ideas");
  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState("");
  const [processing, setProcessing] = useState(false);
  const [recording, setRecording] = useState(false);
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const mediaRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  // Rotating placeholder — picked once per mount, no re-render churn
  const placeholder = useMemo(
    () => EXAMPLES[Math.floor(Math.random() * EXAMPLES.length)],
    [],
  );

  useEffect(() => {
    const LS_KEY = "justdilo:lastIdeaCheck";
    const lastCheck = localStorage.getItem(LS_KEY);

    fetch("/api/ideas")
      .then((r) => r.json())
      .then(({ ideas }) => {
        const all: Idea[] = ideas ?? [];
        setIdeas(all);
        const newShared = all.filter(
          (i) => i.is_owner === false &&
            (!lastCheck || new Date(i.created_at) > new Date(lastCheck)),
        );
        if (newShared.length > 0) {
          toast(`${newShared.length} new idea${newShared.length > 1 ? "s" : ""} shared with you`, {
            duration: 5000,
          });
        }
        localStorage.setItem(LS_KEY, new Date().toISOString());
      })
      .catch(() => toast.error("Couldn't load ideas"))
      .finally(() => setLoading(false));
  }, []);

  // Derived stats — connects this tab to the Tasks tab and sharing system
  const stats = useMemo(() => {
    let actions = 0;
    let shared = 0;
    for (const i of ideas) {
      actions += i.action_items?.length ?? 0;
      if (i.is_owner === false) shared++;
    }
    return { total: ideas.length, actions, shared };
  }, [ideas]);

  // Tag index with counts
  const tagCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const i of ideas) for (const t of i.tags ?? []) map.set(t, (map.get(t) ?? 0) + 1);
    return [...map.entries()].sort((a, b) => b[1] - a[1]);
  }, [ideas]);

  // Apply filter + tag, then group by time bucket
  const grouped = useMemo(() => {
    const filtered = ideas.filter((i) => {
      if (activeTag && !i.tags?.includes(activeTag)) return false;
      if (filter === "mine" && i.is_owner === false) return false;
      if (filter === "shared" && i.is_owner !== false) return false;
      if (filter === "actions" && !(i.action_items?.length)) return false;
      return true;
    });
    const today: Idea[] = [];
    const week: Idea[] = [];
    const earlier: Idea[] = [];
    for (const i of filtered) {
      const b = bucketOf(i.created_at);
      if (b === "today") today.push(i);
      else if (b === "week") week.push(i);
      else earlier.push(i);
    }
    return { today, week, earlier, total: filtered.length };
  }, [ideas, activeTag, filter]);

  async function submitText() {
    if (!text.trim() || processing) return;
    setProcessing(true);
    try {
      const res = await fetch("/api/process-idea", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: text.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setIdeas((prev) => [{ ...data.idea, is_owner: true, collaborators: [] }, ...prev]);
      setText("");
    } catch (e: any) {
      toast.error(e.message || "Couldn't process idea");
    } finally {
      setProcessing(false);
    }
  }

  async function toggleRecording() {
    if (recording) {
      mediaRef.current?.stop();
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      chunksRef.current = [];
      mr.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      mr.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        setRecording(false);
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        const form = new FormData();
        form.append("audio", blob, "idea.webm");
        setProcessing(true);
        try {
          const res = await fetch("/api/process-idea", { method: "POST", body: form });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error);
          setIdeas((prev) => [{ ...data.idea, is_owner: true, collaborators: [] }, ...prev]);
        } catch (e: any) {
          toast.error(e.message || "Couldn't process idea");
        } finally {
          setProcessing(false);
        }
      };
      mr.start();
      mediaRef.current = mr;
      setRecording(true);
    } catch {
      toast.error("Microphone access denied");
    }
  }

  function updateIdea(updated: Idea) {
    setIdeas((prev) => prev.map((i) =>
      i.id === updated.id ? { ...updated, is_owner: i.is_owner, collaborators: i.collaborators } : i,
    ));
  }

  async function deleteIdea(id: string) {
    setIdeas((prev) => prev.filter((i) => i.id !== id));
    await fetch(`/api/ideas/${id}`, { method: "DELETE" });
  }

  const charCount = text.length;
  const charHint = charCount > 0 && charCount < 20;

  return (
    <div className="space-y-4">
      {/* Ideas | Meetings toggle (only when meetings flag is enabled) */}
      {meetingsEnabled && (
        <div className="flex items-center gap-0.5 bg-muted/40 rounded-2xl p-1">
          {(["ideas", "meetings"] as NotesTab[]).map((tab) => (
            <button
              key={tab}
              onClick={() => setNotesTab(tab)}
              className={cn(
                "flex-1 py-1.5 rounded-xl text-[11px] font-medium capitalize transition-all duration-150",
                notesTab === tab
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {tab}
            </button>
          ))}
        </div>
      )}

      {/* Meetings sub-view */}
      {meetingsEnabled && notesTab === "meetings" && <MeetingsView />}

      {/* Ideas sub-view (hidden when meetings tab is active) */}
      {(!meetingsEnabled || notesTab === "ideas") && <>

      {/* Stats strip — connects to Tasks + sharing */}
      {!loading && stats.total > 0 && (
        <div className="grid grid-cols-3 gap-2">
          <StatPill icon={<Lightbulb className="w-3.5 h-3.5 text-yellow-500" />} label="Ideas" value={stats.total} />
          <StatPill icon={<ListChecks className="w-3.5 h-3.5 text-emerald-500" />} label="Actions" value={stats.actions} />
          <StatPill icon={<Users className="w-3.5 h-3.5 text-blue-500" />} label="Shared" value={stats.shared} />
        </div>
      )}

      {/* Capture */}
      <div className={cn(
        "relative rounded-2xl border bg-gradient-to-br from-muted/30 via-muted/20 to-transparent p-3 space-y-2 transition",
        recording ? "border-red-500/40" : "border-border",
      )}>
        <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-muted-foreground/60">
          <Sparkles className="w-3 h-3" />
          Brain dump
        </div>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={placeholder}
          disabled={processing || recording}
          rows={3}
          onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submitText(); }}
          className="w-full bg-transparent text-sm outline-none resize-none placeholder:text-muted-foreground/40 leading-relaxed"
        />
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <button
              onClick={toggleRecording}
              disabled={processing}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium transition",
                recording
                  ? "bg-red-500 text-white animate-pulse"
                  : "bg-muted text-muted-foreground hover:text-foreground",
              )}
            >
              {recording ? <MicOff className="w-3.5 h-3.5" /> : <Mic className="w-3.5 h-3.5" />}
              {recording ? "Recording… tap to stop" : "Voice"}
            </button>
            {charCount > 0 && (
              <span className={cn(
                "text-[10px] tabular-nums transition",
                charHint ? "text-muted-foreground/40" : "text-muted-foreground/60",
              )}>
                {charCount} {charHint && "· keep going…"}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <kbd className="hidden sm:inline text-[9px] text-muted-foreground/40 font-mono">⌘↵</kbd>
            <button
              onClick={submitText}
              disabled={!text.trim() || processing || recording}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium bg-foreground text-background disabled:opacity-30 transition"
            >
              {processing
                ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Processing…</>
                : <><Send className="w-3.5 h-3.5" /> Structure</>
              }
            </button>
          </div>
        </div>
      </div>

      {/* Filters: kind + tags */}
      {!loading && stats.total > 0 && (
        <div className="space-y-2">
          <div className="flex gap-1.5 overflow-x-auto pb-0.5 -mx-1 px-1 no-scrollbar">
            <FilterChip active={filter === "all"} onClick={() => setFilter("all")}>All</FilterChip>
            <FilterChip active={filter === "mine"} onClick={() => setFilter("mine")}>Mine</FilterChip>
            {stats.shared > 0 && (
              <FilterChip active={filter === "shared"} onClick={() => setFilter("shared")}>
                Shared · {stats.shared}
              </FilterChip>
            )}
            {stats.actions > 0 && (
              <FilterChip active={filter === "actions"} onClick={() => setFilter("actions")}>
                Has actions
              </FilterChip>
            )}
          </div>

          {tagCounts.length > 0 && (
            <div className="flex gap-1.5 overflow-x-auto pb-0.5 -mx-1 px-1 no-scrollbar">
              {activeTag && (
                <button
                  onClick={() => setActiveTag(null)}
                  className="text-[10px] px-2.5 py-1 rounded-full whitespace-nowrap bg-foreground text-background flex-shrink-0"
                >
                  Clear #{activeTag}
                </button>
              )}
              {tagCounts.map(([tag, count]) => (
                <button
                  key={tag}
                  onClick={() => setActiveTag(tag === activeTag ? null : tag)}
                  className={cn(
                    "text-[10px] px-2.5 py-1 rounded-full whitespace-nowrap transition flex-shrink-0 flex items-center gap-1",
                    activeTag === tag
                      ? "bg-foreground text-background"
                      : "bg-muted text-muted-foreground hover:text-foreground",
                  )}
                >
                  #{tag}
                  <span className="text-muted-foreground/50">{count}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* List */}
      {loading ? (
        <div className="flex justify-center py-10">
          <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
        </div>
      ) : grouped.total === 0 ? (
        <EmptyState hasIdeas={stats.total > 0} activeTag={activeTag} filter={filter} />
      ) : (
        <div className="space-y-5">
          <Bucket title="Today" ideas={grouped.today} onDelete={deleteIdea} onUpdate={updateIdea} />
          <Bucket title="This week" ideas={grouped.week} onDelete={deleteIdea} onUpdate={updateIdea} />
          <Bucket title="Earlier" ideas={grouped.earlier} onDelete={deleteIdea} onUpdate={updateIdea} />
        </div>
      )}
      </>}
    </div>
  );
}

function StatPill({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <div className="flex items-center gap-2 rounded-xl border border-border bg-muted/20 px-3 py-2">
      {icon}
      <div className="min-w-0">
        <div className="text-sm font-semibold leading-none tabular-nums">{value}</div>
        <div className="text-[10px] text-muted-foreground leading-tight mt-0.5">{label}</div>
      </div>
    </div>
  );
}

function FilterChip({
  active, onClick, children,
}: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "text-[11px] px-3 py-1 rounded-full whitespace-nowrap transition flex-shrink-0 font-medium",
        active ? "bg-foreground text-background" : "bg-muted text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

function Bucket({
  title, ideas, onDelete, onUpdate,
}: {
  title: string;
  ideas: Idea[];
  onDelete: (id: string) => void;
  onUpdate: (idea: Idea) => void;
}) {
  if (ideas.length === 0) return null;
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 px-1">
        <span className="text-[10px] uppercase tracking-widest text-muted-foreground/60 font-semibold">
          {title}
        </span>
        <span className="text-[10px] text-muted-foreground/40 tabular-nums">{ideas.length}</span>
        <div className="flex-1 border-t border-border/30" />
      </div>
      {ideas.map((idea) => (
        <IdeaCard key={idea.id} idea={idea} onDelete={onDelete} onUpdate={onUpdate} />
      ))}
    </div>
  );
}

function EmptyState({
  hasIdeas, activeTag, filter,
}: { hasIdeas: boolean; activeTag: string | null; filter: Filter }) {
  if (hasIdeas) {
    return (
      <div className="text-center py-10 space-y-1">
        <p className="text-sm text-muted-foreground">
          {activeTag ? `No ideas tagged #${activeTag} match this filter.` : "No ideas match this filter."}
        </p>
        <p className="text-xs text-muted-foreground/40">Try clearing the filter or tag.</p>
      </div>
    );
  }
  return (
    <div className="text-center py-12 space-y-3">
      <div className="mx-auto w-12 h-12 rounded-2xl bg-muted/40 flex items-center justify-center">
        <Lightbulb className="w-6 h-6 text-yellow-500" />
      </div>
      <div className="space-y-1">
        <p className="text-sm font-medium">No ideas yet</p>
        <p className="text-xs text-muted-foreground/60 max-w-[260px] mx-auto leading-relaxed">
          Brain dump anything above — AI structures it, surfaces action items, and you push them into your task list.
        </p>
      </div>
    </div>
  );
}
