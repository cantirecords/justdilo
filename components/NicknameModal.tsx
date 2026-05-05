"use client";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

interface Props {
  onSave: (nickname: string) => void;
}

export default function NicknameModal({ onSave }: Props) {
  const [value, setValue] = useState("");
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Small delay so the modal entrance feels intentional, not jarring
    const t = setTimeout(() => inputRef.current?.focus(), 200);
    return () => clearTimeout(t);
  }, []);

  async function save(name: string) {
    const trimmed = name.trim();
    setSaving(true);
    try {
      const res = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        // "" means "was asked, chose to skip" — distinct from null (never asked)
        body: JSON.stringify({ nickname: trimmed }),
      });
      if (!res.ok) throw new Error();
      onSave(trimmed || "");
    } catch {
      toast.error("couldn't save, try again");
      setSaving(false);
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    save(value);
  }

  function handleSkip() {
    save("");
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-5">
      <div className="w-full max-w-sm bg-background border border-border rounded-2xl p-6 shadow-xl animate-in fade-in slide-in-from-bottom-4 duration-300">
        <p className="text-2xl mb-1">👋</p>
        <h2 className="text-lg font-semibold mb-1">what should i call you?</h2>
        <p className="text-sm text-muted-foreground mb-5">
          i'll use it when i text you — feels better than "hey user"
        </p>

        <form onSubmit={handleSubmit} className="space-y-3">
          <input
            ref={inputRef}
            type="text"
            value={value}
            onChange={(e) => setValue(e.target.value.slice(0, 30))}
            placeholder="your name or nickname"
            autoComplete="given-name"
            disabled={saving}
            className="w-full bg-muted rounded-xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-ring placeholder:text-muted-foreground/50 disabled:opacity-50"
          />

          <button
            type="submit"
            disabled={saving || !value.trim()}
            className="w-full bg-foreground text-background rounded-xl py-3 text-sm font-medium disabled:opacity-40 transition hover:opacity-90"
          >
            {saving ? "saving…" : "let's go"}
          </button>

          <button
            type="button"
            onClick={handleSkip}
            disabled={saving}
            className="w-full text-xs text-muted-foreground py-1 hover:text-foreground transition disabled:opacity-40"
          >
            skip for now
          </button>
        </form>
      </div>
    </div>
  );
}
