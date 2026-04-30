"use client";
import { useState, useRef, useEffect } from "react";
import { format, parseISO, addDays, nextMonday } from "date-fns";
import { Trash2, ChevronDown, Lightbulb, ListChecks, Pencil, ArrowRight, Calendar, Users } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import IdeaEditModal from "./IdeaEditModal";
import IdeaShareModal from "./IdeaShareModal";
import type { Idea, IdeaCollaborator } from "@/lib/types";

const LS_KEY = "justdilo:ideaExpanded";

function getExpandedState(id: string): boolean {
  if (typeof window === "undefined") return true;
  try {
    const saved = localStorage.getItem(LS_KEY);
    const state = saved ? JSON.parse(saved) : {};
    return state[id] !== false;
  } catch { return true; }
}

function saveExpandedState(id: string, value: boolean) {
  try {
    const saved = localStorage.getItem(LS_KEY);
    const state = saved ? JSON.parse(saved) : {};
    state[id] = value;
    localStorage.setItem(LS_KEY, JSON.stringify(state));
  } catch {}
}

type Props = {
  idea: Idea;
  onDelete: (id: string) => void;
  onUpdate: (updated: Idea) => void;
};

export default function IdeaCard({ idea, onDelete, onUpdate }: Props) {
  const [expanded, setExpanded] = useState(() => getExpandedState(idea.id));
  const [editOpen, setEditOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [pushed, setPushed] = useState<Set<number>>(new Set());
  const [datePicker, setDatePicker] = useState<number | null>(null);
  const [localCollaborators, setLocalCollaborators] = useState<IdeaCollaborator[]>(idea.collaborators ?? []);
  const datePickerRef = useRef<HTMLDivElement>(null);

  const isOwner = idea.is_owner !== false;

  useEffect(() => {
    if (datePicker === null) return;
    function handleClick(e: MouseEvent) {
      if (datePickerRef.current && !datePickerRef.current.contains(e.target as Node)) {
        setDatePicker(null);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [datePicker]);

  const hasSections = idea.sections?.length > 0;
  const hasInsights = idea.key_insights?.length > 0;
  const hasActions = idea.action_items?.length > 0;
  const hasTags = idea.tags?.length > 0;

  function toggleExpanded() {
    const next = !expanded;
    setExpanded(next);
    saveExpandedState(idea.id, next);
  }

  const DATE_OPTIONS = [
    { label: "Today", getDue: () => { const d = new Date(); d.setHours(23, 59, 0, 0); return d.toISOString(); } },
    { label: "Tomorrow", getDue: () => { const d = addDays(new Date(), 1); d.setHours(23, 59, 0, 0); return d.toISOString(); } },
    { label: "Next week", getDue: () => { const d = nextMonday(new Date()); d.setHours(23, 59, 0, 0); return d.toISOString(); } },
    { label: "Someday", getDue: () => null },
  ];

  async function quickPushTask(index: number, dueISO: string | null) {
    if (pushed.has(index)) return;
    setDatePicker(null);
    try {
      const body: Record<string, unknown> = {
        title: idea.action_items[index],
        group_name: idea.title || "Idea",
      };
      if (dueISO) body.due_date = dueISO;
      const res = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error();
      setPushed((prev) => new Set([...prev, index]));
      const label = dueISO ? DATE_OPTIONS.find(o => o.getDue() === dueISO)?.label ?? "List" : "Someday";
      toast.success(`Added to List → ${label}`);
    } catch {
      toast.error("Couldn't add task");
    }
  }

  return (
    <>
      <div className="rounded-2xl border border-border bg-muted/20 overflow-hidden animate-rise">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 px-4 pt-4 pb-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <Lightbulb className="w-3.5 h-3.5 text-yellow-500 flex-shrink-0" />
              <h3 className="text-sm font-semibold leading-tight">{idea.title || "Untitled"}</h3>
              {!isOwner && (
                <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 font-medium">
                  Shared
                </span>
              )}
              {isOwner && localCollaborators.length > 0 && (
                <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground font-medium">
                  {localCollaborators.length} collab{localCollaborators.length !== 1 ? "s" : ""}
                </span>
              )}
            </div>
            {idea.summary && (
              <p className="text-xs text-muted-foreground leading-relaxed">{idea.summary}</p>
            )}
          </div>
          <div className="flex items-center gap-0.5 flex-shrink-0">
            <span className="text-[10px] text-muted-foreground/50 mr-1">
              {format(parseISO(idea.created_at), "MMM d")}
            </span>
            <button
              onClick={() => setEditOpen(true)}
              className="p-1 text-muted-foreground hover:text-foreground transition"
              aria-label="Edit idea"
            >
              <Pencil className="w-3.5 h-3.5" />
            </button>
            {isOwner && (
              <button
                onClick={() => setShareOpen(true)}
                className={cn(
                  "p-1 transition",
                  localCollaborators.length > 0
                    ? "text-blue-500 hover:text-blue-600"
                    : "text-muted-foreground hover:text-foreground",
                )}
                aria-label="Share idea"
              >
                <Users className="w-3.5 h-3.5" />
              </button>
            )}
            <button
              onClick={toggleExpanded}
              className="p-1 text-muted-foreground hover:text-foreground transition"
              aria-label={expanded ? "Collapse" : "Expand"}
            >
              <ChevronDown className={cn("w-3.5 h-3.5 transition-transform duration-150", expanded && "rotate-180")} />
            </button>
            {isOwner && (
              <button
                onClick={() => onDelete(idea.id)}
                className="p-1 text-muted-foreground hover:text-red-500 transition"
                aria-label="Delete idea"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {expanded && (
          <div className="px-4 pb-4 space-y-3 border-t border-border/40 pt-3">
            {/* Key Insights */}
            {hasInsights && (
              <div className="bg-yellow-50 dark:bg-yellow-950/30 rounded-xl px-3 py-2.5 space-y-1.5">
                <p className="text-[10px] uppercase tracking-widest font-semibold text-yellow-600 dark:text-yellow-500">
                  Key Insights
                </p>
                {idea.key_insights.map((insight, i) => (
                  <div key={i} className="flex items-start gap-2">
                    <span className="text-yellow-500 flex-shrink-0 mt-0.5">•</span>
                    <p className="text-xs leading-relaxed">{insight}</p>
                  </div>
                ))}
              </div>
            )}

            {/* Sections */}
            {hasSections && (
              <div className="space-y-3">
                {idea.sections.map((section, i) => (
                  <div key={i}>
                    <p className="text-[10px] uppercase tracking-widest font-semibold text-muted-foreground mb-1.5">
                      {section.heading}
                    </p>
                    <ul className="space-y-1">
                      {section.points.map((point, j) => (
                        <li key={j} className="flex items-start gap-2">
                          <span className="text-muted-foreground/50 flex-shrink-0 mt-0.5 text-xs">–</span>
                          <p className="text-xs text-foreground/80 leading-relaxed">{point}</p>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            )}

            {/* Action Items */}
            {hasActions && (
              <div>
                <div className="flex items-center gap-1.5 mb-1.5">
                  <ListChecks className="w-3 h-3 text-muted-foreground" />
                  <p className="text-[10px] uppercase tracking-widest font-semibold text-muted-foreground">
                    Action Items
                  </p>
                </div>
                <ul className="space-y-1.5">
                  {idea.action_items.map((item, i) => (
                    <li key={i} className="flex items-center gap-2">
                      <div className="flex-1 flex items-start gap-2">
                        <span className={cn(
                          "w-3.5 h-3.5 mt-0.5 rounded border flex-shrink-0 transition-colors duration-300",
                          pushed.has(i) ? "bg-green-500 border-green-500" : "border-border",
                        )} />
                        <p className={cn(
                          "text-xs leading-relaxed",
                          pushed.has(i) && "line-through text-muted-foreground",
                        )}>
                          {item}
                        </p>
                      </div>
                        <div className="relative flex-shrink-0">
                        <button
                          onClick={() => { if (!pushed.has(i)) setDatePicker(datePicker === i ? null : i); }}
                          disabled={pushed.has(i)}
                          className={cn(
                            "flex items-center gap-0.5 text-[10px] px-2 py-0.5 rounded-full transition whitespace-nowrap",
                            pushed.has(i)
                              ? "text-green-600 dark:text-green-400"
                              : "text-muted-foreground hover:text-foreground hover:bg-muted",
                          )}
                          title="Add as task"
                        >
                          {pushed.has(i) ? <ArrowRight className="w-3 h-3" /> : <Calendar className="w-3 h-3" />}
                          {pushed.has(i) ? "Added" : "Task"}
                        </button>
                        {datePicker === i && (
                          <div
                            ref={datePickerRef}
                            className="absolute right-0 bottom-full mb-1 z-50 bg-background border border-border rounded-xl shadow-xl py-1 min-w-[110px] overflow-hidden"
                          >
                            {DATE_OPTIONS.map((opt) => (
                              <button
                                key={opt.label}
                                onClick={() => quickPushTask(i, opt.getDue())}
                                className="w-full text-left px-3 py-1.5 text-xs hover:bg-muted transition whitespace-nowrap"
                              >
                                {opt.label}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Tags */}
            {hasTags && (
              <div className="flex flex-wrap gap-1 pt-1">
                {idea.tags.map((tag, i) => (
                  <span key={i} className="text-[10px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                    #{tag}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {editOpen && (
        <IdeaEditModal
          idea={idea}
          onSave={(updated) => { onUpdate(updated); }}
          onClose={() => setEditOpen(false)}
        />
      )}
      {shareOpen && (
        <IdeaShareModal
          ideaId={idea.id}
          ideaTitle={idea.title}
          onClose={() => setShareOpen(false)}
          onCollaboratorsChange={setLocalCollaborators}
        />
      )}
    </>
  );
}
