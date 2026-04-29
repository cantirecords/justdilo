"use client";
import { useEffect, useState } from "react";
import { X, Mic } from "lucide-react";
import { cn } from "@/lib/utils";

type Props = {
  transcript: string;
  summary: string;
  taskCount: number;
  groupCount: number;
  onClose: () => void;
};

export default function CaptureSummary({ transcript, summary, taskCount, groupCount, onClose }: Props) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    requestAnimationFrame(() => setVisible(true));
    const t = setTimeout(() => {
      setVisible(false);
      setTimeout(onClose, 300);
    }, 12000);
    return () => clearTimeout(t);
  }, [onClose]);

  return (
    <div
      className={cn(
        "rounded-2xl border border-border bg-foreground text-background p-5 transition-all duration-300",
        visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4",
      )}
    >
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-full bg-background/10 flex items-center justify-center">
            <Mic className="w-3.5 h-3.5" />
          </div>
          <span className="text-sm font-medium">Just captured</span>
        </div>
        <button onClick={onClose} className="opacity-50 hover:opacity-100 transition">
          <X className="w-4 h-4" />
        </button>
      </div>

      {summary && (
        <p className="text-sm leading-relaxed mb-3 opacity-90">{summary}</p>
      )}

      <div className="flex gap-3 text-xs opacity-60 mb-4">
        <span>{taskCount} task{taskCount !== 1 ? "s" : ""}</span>
        <span>·</span>
        <span>{groupCount} group{groupCount !== 1 ? "s" : ""}</span>
      </div>

      {transcript && (
        <details className="group">
          <summary className="text-xs opacity-50 cursor-pointer hover:opacity-80 transition list-none flex items-center gap-1">
            <span className="group-open:hidden">Show transcript</span>
            <span className="hidden group-open:inline">Hide transcript</span>
          </summary>
          <p className="mt-2 text-xs opacity-60 leading-relaxed border-t border-background/10 pt-2">
            {transcript}
          </p>
        </details>
      )}
    </div>
  );
}
