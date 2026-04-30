"use client";
import { createPortal } from "react-dom";
import { useState } from "react";
import { X, Plus, Trash2, ArrowRight, Check, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import type { Idea, IdeaSection } from "@/lib/types";

type Props = {
  idea: Idea;
  onSave: (updated: Idea) => void;
  onClose: () => void;
};

export default function IdeaEditModal({ idea, onSave, onClose }: Props) {
  const [title, setTitle] = useState(idea.title ?? "");
  const [summary, setSummary] = useState(idea.summary ?? "");
  const [insights, setInsights] = useState<string[]>([...(idea.key_insights ?? [])]);
  const [sections, setSections] = useState<IdeaSection[]>(
    (idea.sections ?? []).map((s) => ({ heading: s.heading, points: [...s.points] })),
  );
  const [actions, setActions] = useState<string[]>([...(idea.action_items ?? [])]);
  const [tags, setTags] = useState<string[]>([...(idea.tags ?? [])]);
  const [newTag, setNewTag] = useState("");
  const [saving, setSaving] = useState(false);
  const [pushed, setPushed] = useState<Set<number>>(new Set());
  const [pushing, setPushing] = useState<number | null>(null);

  async function save() {
    setSaving(true);
    try {
      const res = await fetch(`/api/ideas/${idea.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, summary, key_insights: insights, sections, action_items: actions, tags }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      onSave(data.idea);
      onClose();
    } catch (e: any) {
      toast.error(e.message || "Couldn't save");
    } finally {
      setSaving(false);
    }
  }

  async function pushToTask(index: number) {
    if (pushed.has(index) || pushing === index) return;
    setPushing(index);
    try {
      const res = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: actions[index], group_name: title || idea.title || "Idea" }),
      });
      if (!res.ok) throw new Error("Failed");
      setPushed((prev) => new Set([...prev, index]));
      toast.success("Added to tasks");
    } catch {
      toast.error("Couldn't add task");
    } finally {
      setPushing(null);
    }
  }

  // ── Helpers ──
  function updateInsight(i: number, val: string) {
    setInsights((prev) => prev.map((v, idx) => (idx === i ? val : v)));
  }
  function removeInsight(i: number) {
    setInsights((prev) => prev.filter((_, idx) => idx !== i));
  }

  function updateSectionHeading(si: number, val: string) {
    setSections((prev) => prev.map((s, idx) => idx === si ? { ...s, heading: val } : s));
  }
  function updateSectionPoint(si: number, pi: number, val: string) {
    setSections((prev) => prev.map((s, idx) =>
      idx === si ? { ...s, points: s.points.map((p, pidx) => pidx === pi ? val : p) } : s,
    ));
  }
  function removeSectionPoint(si: number, pi: number) {
    setSections((prev) => prev.map((s, idx) =>
      idx === si ? { ...s, points: s.points.filter((_, pidx) => pidx !== pi) } : s,
    ));
  }
  function addSectionPoint(si: number) {
    setSections((prev) => prev.map((s, idx) =>
      idx === si ? { ...s, points: [...s.points, ""] } : s,
    ));
  }

  function updateAction(i: number, val: string) {
    setActions((prev) => prev.map((v, idx) => (idx === i ? val : v)));
  }
  function removeAction(i: number) {
    setActions((prev) => prev.filter((_, idx) => idx !== i));
    setPushed((prev) => {
      const next = new Set<number>();
      prev.forEach((n) => { if (n < i) next.add(n); else if (n > i) next.add(n - 1); });
      return next;
    });
  }

  function addTag() {
    const t = newTag.trim().toLowerCase().replace(/^#/, "");
    if (t && !tags.includes(t)) setTags((prev) => [...prev, t]);
    setNewTag("");
  }

  const modal = (
    <div className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative z-10 w-full max-w-lg bg-background rounded-t-3xl sm:rounded-3xl shadow-2xl max-h-[90dvh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-border/40 flex-shrink-0">
          <h2 className="text-sm font-semibold">Edit Idea</h2>
          <div className="flex items-center gap-2">
            <button
              onClick={save}
              disabled={saving}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-foreground text-background text-xs font-medium disabled:opacity-50 transition"
            >
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
              Save
            </button>
            <button onClick={onClose} className="p-1.5 rounded-full hover:bg-muted transition">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Scrollable body */}
        <div className="overflow-y-auto flex-1 px-5 py-4 space-y-5">
          {/* Title */}
          <div>
            <label className="text-[10px] uppercase tracking-widest font-semibold text-muted-foreground block mb-1.5">Title</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full bg-muted/30 rounded-xl px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-foreground/20"
            />
          </div>

          {/* Summary */}
          <div>
            <label className="text-[10px] uppercase tracking-widest font-semibold text-muted-foreground block mb-1.5">Summary</label>
            <textarea
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              rows={3}
              className="w-full bg-muted/30 rounded-xl px-3 py-2 text-sm outline-none resize-none focus:ring-1 focus:ring-foreground/20 leading-relaxed"
            />
          </div>

          {/* Key Insights */}
          {insights.length > 0 && (
            <div>
              <label className="text-[10px] uppercase tracking-widest font-semibold text-yellow-600 dark:text-yellow-500 block mb-1.5">Key Insights</label>
              <div className="space-y-1.5">
                {insights.map((ins, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <span className="text-yellow-500 flex-shrink-0 text-xs">•</span>
                    <input
                      value={ins}
                      onChange={(e) => updateInsight(i, e.target.value)}
                      className="flex-1 bg-muted/30 rounded-lg px-2.5 py-1.5 text-xs outline-none focus:ring-1 focus:ring-foreground/20"
                    />
                    <button onClick={() => removeInsight(i)} className="text-muted-foreground hover:text-red-500 transition flex-shrink-0">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
              <button
                onClick={() => setInsights((prev) => [...prev, ""])}
                className="mt-2 flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition"
              >
                <Plus className="w-3 h-3" /> Add insight
              </button>
            </div>
          )}

          {/* Sections */}
          {sections.map((section, si) => (
            <div key={si}>
              <input
                value={section.heading}
                onChange={(e) => updateSectionHeading(si, e.target.value)}
                className="w-full bg-transparent text-[10px] uppercase tracking-widest font-semibold text-muted-foreground outline-none mb-1.5 border-b border-border/30 pb-1"
              />
              <div className="space-y-1.5 pl-1">
                {section.points.map((point, pi) => (
                  <div key={pi} className="flex items-center gap-2">
                    <span className="text-muted-foreground/50 flex-shrink-0 text-xs">–</span>
                    <input
                      value={point}
                      onChange={(e) => updateSectionPoint(si, pi, e.target.value)}
                      className="flex-1 bg-muted/30 rounded-lg px-2.5 py-1.5 text-xs outline-none focus:ring-1 focus:ring-foreground/20"
                    />
                    <button onClick={() => removeSectionPoint(si, pi)} className="text-muted-foreground hover:text-red-500 transition flex-shrink-0">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
                <button
                  onClick={() => addSectionPoint(si)}
                  className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition"
                >
                  <Plus className="w-3 h-3" /> Add point
                </button>
              </div>
            </div>
          ))}

          {/* Action Items */}
          {(actions.length > 0) && (
            <div>
              <label className="text-[10px] uppercase tracking-widest font-semibold text-muted-foreground block mb-1.5">Action Items</label>
              <div className="space-y-1.5">
                {actions.map((action, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <div className="flex-1 flex items-center gap-2 bg-muted/30 rounded-lg pr-1">
                      <input
                        value={action}
                        onChange={(e) => updateAction(i, e.target.value)}
                        className="flex-1 bg-transparent px-2.5 py-1.5 text-xs outline-none"
                      />
                      <button
                        onClick={() => pushToTask(i)}
                        disabled={pushed.has(i) || pushing === i}
                        className={cn(
                          "flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-medium transition flex-shrink-0",
                          pushed.has(i)
                            ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                            : "bg-foreground/10 text-foreground hover:bg-foreground/20",
                        )}
                        title="Add as task"
                      >
                        {pushing === i
                          ? <Loader2 className="w-3 h-3 animate-spin" />
                          : pushed.has(i)
                          ? <Check className="w-3 h-3" />
                          : <ArrowRight className="w-3 h-3" />
                        }
                        {pushed.has(i) ? "Added" : "→ Task"}
                      </button>
                    </div>
                    <button onClick={() => removeAction(i)} className="text-muted-foreground hover:text-red-500 transition flex-shrink-0">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
              <button
                onClick={() => setActions((prev) => [...prev, ""])}
                className="mt-2 flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition"
              >
                <Plus className="w-3 h-3" /> Add action
              </button>
            </div>
          )}

          {/* Tags */}
          <div>
            <label className="text-[10px] uppercase tracking-widest font-semibold text-muted-foreground block mb-1.5">Tags</label>
            <div className="flex flex-wrap gap-1.5 mb-2">
              {tags.map((tag, i) => (
                <span
                  key={i}
                  className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground"
                >
                  #{tag}
                  <button onClick={() => setTags((prev) => prev.filter((_, idx) => idx !== i))}>
                    <X className="w-2.5 h-2.5" />
                  </button>
                </span>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <input
                value={newTag}
                onChange={(e) => setNewTag(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addTag(); } }}
                placeholder="Add tag…"
                className="flex-1 bg-muted/30 rounded-lg px-2.5 py-1.5 text-xs outline-none placeholder:text-muted-foreground/40"
              />
              {newTag.trim() && (
                <button onClick={addTag} className="text-xs text-muted-foreground hover:text-foreground transition">
                  <Plus className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>

          <div className="h-4" />
        </div>
      </div>
    </div>
  );

  return typeof document !== "undefined" ? createPortal(modal, document.body) : null;
}
