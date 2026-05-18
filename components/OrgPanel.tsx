"use client";
import { useState } from "react";
import { X, Building2, UserPlus, Trash2, Crown, Shield, User, Clock } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import type { Organization, OrgMember, OrgRole } from "@/lib/types";

type Props = {
  orgs: Organization[];
  userId: string;
  onClose: () => void;
  onOrgsChange: (orgs: Organization[]) => void;
};

function memberDisplayName(m: OrgMember): string {
  return m.profile?.nickname || m.profile?.email || m.invited_email;
}

function memberInitials(m: OrgMember): string {
  const name = m.profile?.nickname || m.invited_email;
  return name.slice(0, 2).toUpperCase();
}

const ROLE_ICON: Record<OrgRole, React.ElementType> = {
  owner: Crown,
  admin: Shield,
  member: User,
};

const ROLE_COLOR: Record<OrgRole, string> = {
  owner: "text-amber-500",
  admin: "text-blue-500",
  member: "text-muted-foreground",
};

function OrgCard({
  org,
  userId,
  onUpdated,
  onDeleted,
}: {
  org: Organization;
  userId: string;
  onUpdated: (updated: Organization) => void;
  onDeleted: (id: string) => void;
}) {
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviting, setInviting] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState(org.name);

  const members = org.members ?? [];
  const myMember = members.find((m) => m.user_id === userId);
  const isOwner = myMember?.role === "owner";
  const isAdmin = myMember?.role === "admin";
  const canManage = isOwner || isAdmin;

  async function saveName() {
    if (!nameInput.trim() || nameInput.trim() === org.name) { setEditingName(false); return; }
    const res = await fetch(`/api/orgs/${org.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: nameInput.trim() }),
    });
    if (!res.ok) { toast.error("Couldn't rename team"); return; }
    const { org: updated } = await res.json();
    onUpdated({ ...org, name: updated.name });
    setEditingName(false);
  }

  async function invite() {
    const email = inviteEmail.trim().toLowerCase();
    if (!email) return;
    setInviting(true);
    const res = await fetch(`/api/orgs/${org.id}/members`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    setInviting(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      toast.error(body.error ? `Couldn't invite: ${body.error}` : "Couldn't invite member");
      return;
    }
    const { member } = await res.json();
    const exists = members.some((m) => m.id === member.id);
    const newMembers = exists ? members.map((m) => m.id === member.id ? member : m) : [...members, member];
    onUpdated({ ...org, members: newMembers });
    setInviteEmail("");
    toast.success(`${member.status === "active" ? "Added" : "Invite sent to"} ${email}`);
  }

  async function removeMember(memberId: string) {
    setRemoving(memberId);
    const res = await fetch(`/api/orgs/${org.id}/members?memberId=${memberId}`, { method: "DELETE" });
    setRemoving(null);
    if (!res.ok) { toast.error("Couldn't remove member"); return; }
    onUpdated({ ...org, members: members.filter((m) => m.id !== memberId) });
  }

  async function deleteOrg() {
    if (!confirm(`Delete "${org.name}"? This will remove all team tasks.`)) return;
    const res = await fetch(`/api/orgs/${org.id}`, { method: "DELETE" });
    if (!res.ok) { toast.error("Couldn't delete team"); return; }
    onDeleted(org.id);
    toast("Team deleted");
  }

  return (
    <div className="border border-border rounded-2xl p-5 space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          {editingName && isOwner ? (
            <input
              autoFocus
              value={nameInput}
              onChange={(e) => setNameInput(e.target.value)}
              onBlur={saveName}
              onKeyDown={(e) => { if (e.key === "Enter") saveName(); if (e.key === "Escape") setEditingName(false); }}
              className="text-base font-semibold bg-muted rounded-lg px-2 py-0.5 w-full outline-none border border-border"
            />
          ) : (
            <button
              onClick={() => isOwner && setEditingName(true)}
              className={cn("text-base font-semibold text-left truncate block w-full", isOwner && "hover:opacity-70 transition")}
              title={isOwner ? "Click to rename" : undefined}
            >
              {org.name}
            </button>
          )}
          <p className="text-xs text-muted-foreground mt-0.5">{members.filter((m) => m.status === "active").length} active member{members.filter((m) => m.status === "active").length !== 1 ? "s" : ""}</p>
        </div>
        {isOwner && (
          <button onClick={deleteOrg} className="text-muted-foreground/40 hover:text-red-500 transition shrink-0">
            <Trash2 className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Member list */}
      <ul className="space-y-2">
        {members.map((m) => {
          const RoleIcon = ROLE_ICON[m.role];
          const isSelf = m.user_id === userId;
          const canRemove = canManage && !isSelf && m.role !== "owner";
          return (
            <li key={m.id} className="flex items-center gap-2.5">
              {/* Avatar */}
              <div className="w-7 h-7 rounded-full bg-muted flex items-center justify-center text-[10px] font-bold shrink-0">
                {memberInitials(m)}
              </div>
              {/* Name + status */}
              <div className="flex-1 min-w-0">
                <p className={cn("text-sm font-medium truncate", m.status === "pending" && "text-muted-foreground")}>
                  {memberDisplayName(m)}
                  {isSelf && <span className="ml-1.5 text-[10px] text-muted-foreground/60">(you)</span>}
                </p>
                {m.status === "pending" && (
                  <p className="flex items-center gap-1 text-[10px] text-muted-foreground/60">
                    <Clock className="w-2.5 h-2.5" /> pending invite
                  </p>
                )}
              </div>
              {/* Role */}
              <RoleIcon className={cn("w-3.5 h-3.5 shrink-0", ROLE_COLOR[m.role])} />
              {/* Remove */}
              {canRemove && (
                <button
                  onClick={() => removeMember(m.id)}
                  disabled={removing === m.id}
                  className="text-muted-foreground/30 hover:text-red-500 transition shrink-0"
                  aria-label="Remove member"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </li>
          );
        })}
      </ul>

      {/* Invite form */}
      {canManage && (
        <div className="flex gap-2 pt-1">
          <input
            type="email"
            value={inviteEmail}
            onChange={(e) => setInviteEmail(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && invite()}
            placeholder="Invite by email…"
            className="flex-1 text-sm bg-muted/50 border border-border rounded-xl px-3 py-2 outline-none focus:border-foreground/30 transition"
          />
          <button
            onClick={invite}
            disabled={inviting || !inviteEmail.trim()}
            className="px-3 py-2 rounded-xl bg-foreground text-background text-sm font-medium disabled:opacity-40 transition hover:opacity-80"
          >
            <UserPlus className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
}

export default function OrgPanel({ orgs, userId, onClose, onOrgsChange }: Props) {
  // If user has no teams yet, jump straight into the create form
  const [creating, setCreating] = useState(orgs.length === 0);
  const [newName, setNewName] = useState("");
  const [loading, setLoading] = useState(false);

  async function createOrg() {
    if (!newName.trim()) return;
    setLoading(true);
    const res = await fetch("/api/orgs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newName.trim() }),
    });
    setLoading(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      toast.error(body.error ? `Couldn't create team: ${body.error}` : "Couldn't create team");
      return;
    }
    const { org } = await res.json();
    onOrgsChange([{ ...org, members: [] }, ...orgs]);
    setNewName("");
    setCreating(false);
    toast.success(`"${org.name}" created`);
  }

  function handleUpdated(updated: Organization) {
    onOrgsChange(orgs.map((o) => o.id === updated.id ? updated : o));
  }

  function handleDeleted(id: string) {
    onOrgsChange(orgs.filter((o) => o.id !== id));
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div
        className="w-full max-w-md bg-background border border-border rounded-3xl shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div className="flex items-center gap-2">
            <Building2 className="w-4 h-4 text-muted-foreground" />
            <h2 className="text-sm font-semibold">Your Teams</h2>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4 max-h-[70vh] overflow-y-auto">
          {orgs.length === 0 && !creating && (
            <div className="text-center py-8 space-y-3">
              <p className="text-4xl">🏢</p>
              <p className="text-sm font-medium">No teams yet</p>
              <p className="text-xs text-muted-foreground">Create a team to assign tasks with your colleagues.</p>
            </div>
          )}

          {orgs.map((org) => (
            <OrgCard
              key={org.id}
              org={org}
              userId={userId}
              onUpdated={handleUpdated}
              onDeleted={handleDeleted}
            />
          ))}

          {/* Create form */}
          {creating ? (
            <div className="border border-border rounded-2xl p-4 space-y-3">
              <p className="text-sm font-medium">New team</p>
              <input
                autoFocus
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") createOrg(); if (e.key === "Escape") setCreating(false); }}
                placeholder="Team name…"
                className="w-full text-sm bg-muted/50 border border-border rounded-xl px-3 py-2 outline-none focus:border-foreground/30 transition"
              />
              <div className="flex gap-2">
                <button
                  onClick={createOrg}
                  disabled={loading || !newName.trim()}
                  className="flex-1 py-2 rounded-xl bg-foreground text-background text-sm font-medium disabled:opacity-40 transition hover:opacity-80"
                >
                  {loading ? "Creating…" : "Create"}
                </button>
                <button
                  onClick={() => setCreating(false)}
                  className="flex-1 py-2 rounded-xl bg-muted text-sm font-medium transition hover:bg-muted/80"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setCreating(true)}
              className="w-full py-2.5 rounded-2xl border border-dashed border-border text-sm text-muted-foreground hover:text-foreground hover:border-foreground/30 transition flex items-center justify-center gap-2"
            >
              <Building2 className="w-3.5 h-3.5" />
              Create new team
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
