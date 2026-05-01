"use client";
import { createPortal } from "react-dom";
import { useState, useEffect } from "react";
import { X, UserPlus, Loader2, Trash2, Users, Check, Pencil } from "lucide-react";
import { toast } from "sonner";
import type { IdeaCollaborator } from "@/lib/types";

function NicknameRow() {
  const [nickname, setNickname] = useState("");
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    fetch("/api/profile")
      .then((r) => r.json())
      .then(({ profile }) => {
        setNickname(profile?.nickname ?? "");
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }, []);

  async function save() {
    setSaving(true);
    try {
      const res = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nickname }),
      });
      if (!res.ok) throw new Error();
      setEditing(false);
      toast.success("Display name saved");
    } catch {
      toast.error("Couldn't save");
    } finally {
      setSaving(false);
    }
  }

  if (!loaded) return null;

  return (
    <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-muted/30 border border-border/40">
      <div className="flex-1 min-w-0">
        <p className="text-[9px] uppercase tracking-widest font-semibold text-muted-foreground mb-0.5">
          Your display name
        </p>
        {editing ? (
          <input
            autoFocus
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") save(); if (e.key === "Escape") setEditing(false); }}
            placeholder="e.g. Dilo, Alex, Mami…"
            className="w-full bg-transparent text-xs outline-none placeholder:text-muted-foreground/40"
          />
        ) : (
          <p className="text-xs truncate text-foreground/80">
            {nickname || <span className="text-muted-foreground/40 italic">Not set — others see your email</span>}
          </p>
        )}
      </div>
      {editing ? (
        <button
          onClick={save}
          disabled={saving}
          className="flex-shrink-0 p-1 text-green-500 hover:text-green-600 transition"
        >
          {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
        </button>
      ) : (
        <button
          onClick={() => setEditing(true)}
          className="flex-shrink-0 p-1 text-muted-foreground hover:text-foreground transition"
        >
          <Pencil className="w-3 h-3" />
        </button>
      )}
    </div>
  );
}

function collabLabel(c: IdeaCollaborator): string {
  return c.nickname || c.email;
}

type Props = {
  ideaId: string;
  ideaTitle: string | null;
  onClose: () => void;
  onCollaboratorsChange: (collaborators: IdeaCollaborator[]) => void;
};

export default function IdeaShareModal({ ideaId, ideaTitle, onClose, onCollaboratorsChange }: Props) {
  const [collaborators, setCollaborators] = useState<IdeaCollaborator[]>([]);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState("");
  const [inviting, setInviting] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/ideas/${ideaId}/share`)
      .then((r) => r.json())
      .then(({ collaborators }) => setCollaborators(collaborators ?? []))
      .catch(() => toast.error("Couldn't load collaborators"))
      .finally(() => setLoading(false));
  }, [ideaId]);

  async function invite() {
    if (!email.trim() || inviting) return;
    setInviting(true);
    try {
      const res = await fetch(`/api/ideas/${ideaId}/share`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim().toLowerCase() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      const next = [...collaborators, data.collaborator];
      setCollaborators(next);
      onCollaboratorsChange(next);
      setEmail("");
      toast.success("Shared!");
    } catch (e: any) {
      toast.error(e.message || "Couldn't share");
    } finally {
      setInviting(false);
    }
  }

  async function remove(userId: string) {
    setRemoving(userId);
    try {
      const res = await fetch(`/api/ideas/${ideaId}/share?user_id=${userId}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      const next = collaborators.filter((c) => c.id !== userId);
      setCollaborators(next);
      onCollaboratorsChange(next);
      toast.success("Removed");
    } catch {
      toast.error("Couldn't remove");
    } finally {
      setRemoving(null);
    }
  }

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-sm bg-background rounded-t-3xl sm:rounded-2xl border border-border shadow-2xl p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-muted-foreground" />
            <h2 className="text-sm font-semibold">Share idea</h2>
          </div>
          <button onClick={onClose} className="p-1 text-muted-foreground hover:text-foreground transition">
            <X className="w-4 h-4" />
          </button>
        </div>

        {ideaTitle && (
          <p className="text-xs text-muted-foreground/60 truncate">"{ideaTitle}"</p>
        )}

        <NicknameRow />

        <div className="flex gap-2">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && invite()}
            placeholder="Friend's Dilo email…"
            className="flex-1 bg-muted/30 rounded-xl px-3 py-2 text-sm outline-none border border-border focus:border-foreground/30 transition placeholder:text-muted-foreground/40"
          />
          <button
            onClick={invite}
            disabled={!email.trim() || inviting}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-foreground text-background text-xs font-medium disabled:opacity-30 transition"
          >
            {inviting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <UserPlus className="w-3.5 h-3.5" />}
            Invite
          </button>
        </div>

        <div className="space-y-2">
          <p className="text-[10px] uppercase tracking-widest font-semibold text-muted-foreground">
            Can edit · {collaborators.length}
          </p>
          {loading ? (
            <div className="flex justify-center py-3">
              <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
            </div>
          ) : collaborators.length === 0 ? (
            <p className="text-xs text-muted-foreground/40 py-1">No collaborators yet.</p>
          ) : (
            <ul className="space-y-1.5">
              {collaborators.map((c) => (
                <li key={c.id} className="flex items-center justify-between gap-2 px-3 py-2 rounded-xl bg-muted/30">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="w-5 h-5 rounded-full bg-blue-500/20 text-blue-500 text-[9px] font-bold flex items-center justify-center flex-shrink-0 uppercase">
                      {collabLabel(c).charAt(0)}
                    </span>
                    <div className="min-w-0">
                      {c.nickname && (
                        <p className="text-xs font-medium truncate leading-tight">{c.nickname}</p>
                      )}
                      <p className={`truncate leading-tight ${c.nickname ? "text-[10px] text-muted-foreground/60" : "text-xs"}`}>
                        {c.email}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => remove(c.id)}
                    disabled={removing === c.id}
                    className="text-muted-foreground hover:text-red-500 transition flex-shrink-0"
                  >
                    {removing === c.id
                      ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      : <Trash2 className="w-3.5 h-3.5" />}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <p className="text-[10px] text-muted-foreground/40 text-center">
          Collaborators can edit & add — only you can delete.
        </p>
      </div>
    </div>,
    document.body,
  );
}
