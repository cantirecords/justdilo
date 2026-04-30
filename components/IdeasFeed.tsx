"use client";
import { useEffect, useRef, useState } from "react";
import { Mic, MicOff, Send, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import IdeaCard from "./IdeaCard";
import type { Idea } from "@/lib/types";

export default function IdeasFeed() {
  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState("");
  const [processing, setProcessing] = useState(false);
  const [recording, setRecording] = useState(false);
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const mediaRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  useEffect(() => {
    const LS_KEY = "justdilo:lastIdeaCheck";
    const lastCheck = localStorage.getItem(LS_KEY);

    fetch("/api/ideas")
      .then((r) => r.json())
      .then(({ ideas }) => {
        const all: Idea[] = ideas ?? [];
        setIdeas(all);

        // Notify about new shared ideas since last visit
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

  const allTags = [...new Set(ideas.flatMap((i) => i.tags ?? []))];
  const filtered = activeTag ? ideas.filter((i) => i.tags?.includes(activeTag)) : ideas;

  return (
    <div className="space-y-4">
      {/* Capture */}
      <div className="rounded-2xl border border-border bg-muted/20 p-3 space-y-2">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Brain dump your idea here… speak freely, AI will structure it."
          disabled={processing || recording}
          rows={3}
          onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submitText(); }}
          className="w-full bg-transparent text-sm outline-none resize-none placeholder:text-muted-foreground/40 leading-relaxed"
        />
        <div className="flex items-center justify-between gap-2">
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

      {/* Tag filter pills */}
      {allTags.length > 0 && (
        <div className="flex gap-1.5 overflow-x-auto pb-0.5 -mx-1 px-1 no-scrollbar">
          <button
            onClick={() => setActiveTag(null)}
            className={cn(
              "text-[10px] px-2.5 py-1 rounded-full whitespace-nowrap transition flex-shrink-0",
              !activeTag ? "bg-foreground text-background" : "bg-muted text-muted-foreground",
            )}
          >
            All
          </button>
          {allTags.map((tag) => (
            <button
              key={tag}
              onClick={() => setActiveTag(tag === activeTag ? null : tag)}
              className={cn(
                "text-[10px] px-2.5 py-1 rounded-full whitespace-nowrap transition flex-shrink-0",
                activeTag === tag ? "bg-foreground text-background" : "bg-muted text-muted-foreground",
              )}
            >
              #{tag}
            </button>
          ))}
        </div>
      )}

      {/* Ideas list */}
      {loading ? (
        <div className="flex justify-center py-10">
          <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-10 space-y-1">
          <p className="text-sm text-muted-foreground">
            {activeTag ? `No ideas tagged #${activeTag}.` : "No ideas yet."}
          </p>
          <p className="text-xs text-muted-foreground/40">Type or voice a brain dump above.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {(() => {
            const own = filtered.filter((i) => i.is_owner !== false);
            const shared = filtered.filter((i) => i.is_owner === false);
            return (
              <>
                {own.map((idea) => (
                  <IdeaCard key={idea.id} idea={idea} onDelete={deleteIdea} onUpdate={updateIdea} />
                ))}
                {shared.length > 0 && (
                  <>
                    <div className="flex items-center gap-2 py-1">
                      <div className="flex-1 border-t border-border/30" />
                      <span className="text-[10px] uppercase tracking-widest text-muted-foreground/40">
                        Shared with you
                      </span>
                      <div className="flex-1 border-t border-border/30" />
                    </div>
                    {shared.map((idea) => (
                      <IdeaCard key={idea.id} idea={idea} onDelete={deleteIdea} onUpdate={updateIdea} />
                    ))}
                  </>
                )}
              </>
            );
          })()}
        </div>
      )}
    </div>
  );
}
