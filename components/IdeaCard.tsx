"use client";
import { useState } from "react";
import { format, parseISO } from "date-fns";
import { Trash2, ChevronDown, Lightbulb, ListChecks, Pencil, ArrowRight } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import IdeaEditModal from "./IdeaEditModal";
import type { Idea } from "@/lib/types";

type Props = {
  idea: Idea;
  onDelete: (id: string) => void;
  onUpdate: (updated: Idea) => void;
};

export default function IdeaCard({ idea, onDelete, onUpdate }: Props) {
  const [expanded, setExpanded] = useState(true);
  const [editOpen, setEditOpen] = useState(false);
  const [pushed, setPushed] = useState<Set<number>>(new Set());

  const hasSections = idea.sections?.length > 0;
  const hasInsights = idea.key_insights?.length > 0;
  const hasActions = idea.action_items?.length > 0;
  const hasTags = idea.tags?.length > 0;

  async function quickPushTask(index: number) {
    if (pushed.has(index)) return;
    try {
      const res = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: idea.action_items[index],
          group_name: idea.title || "Idea",
        }),
      });
      if (!res.ok) throw new Error();
      setPushed((prev) => new Set([...prev, index]));
      toast.success("Added to tasks");
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
            <div className="flex items-center gap-2 mb-1">
              <Lightbulb className="w-3.5 h-3.5 text-yellow-500 flex-shrink-0" />
              <h3 className="text-sm font-semibold leading-tight">{idea.title || "Untitled"}</h3>
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
            <button
              onClick={() => setExpanded((v) => !v)}
              className="p-1 text-muted-foreground hover:text-foreground transition"
              aria-label={expanded ? "Collapse" : "Expand"}
            >
              <ChevronDown className={cn("w-3.5 h-3.5 transition-transform duration-150", expanded && "rotate-180")} />
            </button>
            <button
              onClick={() => onDelete(idea.id)}
              className="p-1 text-muted-foreground hover:text-red-500 transition"
              aria-label="Delete idea"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
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
                          "w-3.5 h-3.5 mt-0.5 rounded border flex-shrink-0 transition-colors",
                          pushed.has(i) ? "bg-green-500 border-green-500" : "border-border",
                        )} />
                        <p className={cn(
                          "text-xs leading-relaxed",
                          pushed.has(i) && "line-through text-muted-foreground",
                        )}>
                          {item}
                        </p>
                      </div>
                      <button
                        onClick={() => quickPushTask(i)}
                        disabled={pushed.has(i)}
                        className={cn(
                          "flex items-center gap-0.5 text-[10px] px-2 py-0.5 rounded-full flex-shrink-0 transition",
                          pushed.has(i)
                            ? "text-green-600 dark:text-green-400"
                            : "text-muted-foreground hover:text-foreground hover:bg-muted",
                        )}
                        title="Add as task"
                      >
                        <ArrowRight className="w-3 h-3" />
                        {pushed.has(i) ? "Done" : "Task"}
                      </button>
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
    </>
  );
}
