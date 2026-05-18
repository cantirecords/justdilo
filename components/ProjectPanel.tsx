"use client";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { X, Plus, ChevronRight, Loader2, FolderKanban } from "lucide-react";
import { format, parseISO } from "date-fns";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import type { Project, Organization } from "@/lib/types";

type OrgMember = { user_id: string; display: string; nickname: string | null; email: string };

const PHASE_CONFIG: Record<string, { label: string; color: string }> = {
  planning:    { label: "Planning",    color: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300" },
  in_progress: { label: "In Progress", color: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300" },
  review:      { label: "Review",      color: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300" },
  done:        { label: "Done",        color: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300" },
};

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  active:  { label: "Active",   color: "text-emerald-600 dark:text-emerald-400" },
  on_hold: { label: "On Hold",  color: "text-amber-600 dark:text-amber-400" },
  done:    { label: "Done",     color: "text-muted-foreground" },
};

type Props = { orgs: Organization[]; userId: string; onClose: () => void };

export default function ProjectPanel({ orgs, userId, onClose }: Props) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [orgMembers, setOrgMembers] = useState<OrgMember[]>([]);
  const [activeOrgId, setActiveOrgId] = useState<string | null>(orgs[0]?.id ?? null);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);

  // Create form state
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [phase, setPhase] = useState("planning");
  const [dueDate, setDueDate] = useState("");
  const [memberIds, setMemberIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/projects")
      .then((r) => r.ok ? r.json() : { projects: [] })
      .then(({ projects }) => { setProjects(projects); setLoading(false); })
      .catch(() => setLoading(false));

    fetch("/api/orgs/members")
      .then((r) => r.ok ? r.json() : { members: [], org_id: null })
      .then(({ members, org_id }) => {
        setOrgMembers(members);
        if (org_id) setActiveOrgId(org_id);
        // Pre-select self
        const self = members.find((m: OrgMember) => true); // will use userId below
        setMemberIds([userId]);
      })
      .catch(() => {});
  }, [userId]);

  async function createProject() {
    if (!name.trim() || !activeOrgId) return;
    setSaving(true);
    const res = await fetch("/api/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim(), description: description.trim() || null, phase, due_date: dueDate || null, org_id: activeOrgId, member_ids: memberIds }),
    });
    const body = await res.json();
    if (!res.ok) { toast.error(body.error || "Couldn't create project"); setSaving(false); return; }
    setProjects((prev) => [body.project, ...prev]);
    toast.success(`Project "${name.trim()}" created`);
    setName(""); setDescription(""); setPhase("planning"); setDueDate(""); setMemberIds([userId]);
    setCreating(false);
    setSaving(false);
  }

  async function updateProjectPhase(id: string, newPhase: string) {
    await fetch(`/api/projects/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phase: newPhase }),
    });
    setProjects((prev) => prev.map((p) => p.id === id ? { ...p, phase: newPhase as Project["phase"] } : p));
    if (selectedProject?.id === id) setSelectedProject((p) => p ? { ...p, phase: newPhase as Project["phase"] } : p);
  }

  async function deleteProject(id: string) {
    if (!confirm("Delete this project? Tasks will stay but lose their project link.")) return;
    await fetch(`/api/projects/${id}`, { method: "DELETE" });
    setProjects((prev) => prev.filter((p) => p.id !== id));
    if (selectedProject?.id === id) setSelectedProject(null);
    toast("Project deleted");
  }

  function toggleMember(uid: string) {
    setMemberIds((prev) => prev.includes(uid) ? prev.filter((id) => id !== uid) : [...prev, uid]);
  }

  const panel = (
    <div className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/70" onClick={onClose} />
      <div className="relative w-full sm:max-w-lg bg-background rounded-t-3xl sm:rounded-2xl shadow-2xl border border-border overflow-hidden flex flex-col max-h-[90vh]">

        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-border/50 shrink-0">
          <div className="flex items-center gap-2">
            {selectedProject && (
              <button onClick={() => setSelectedProject(null)} className="p-1 rounded-full hover:bg-muted transition">
                <ChevronRight className="w-4 h-4 rotate-180" />
              </button>
            )}
            <h2 className="text-sm font-semibold">
              {selectedProject ? selectedProject.name : "Projects"}
            </h2>
          </div>
          <div className="flex items-center gap-1">
            {!selectedProject && !creating && (
              <button onClick={() => setCreating(true)} className="p-1.5 rounded-full hover:bg-muted transition">
                <Plus className="w-4 h-4" />
              </button>
            )}
            <button onClick={onClose} className="p-1.5 rounded-full hover:bg-muted transition">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="overflow-y-auto flex-1 px-5 py-4 space-y-4">

          {/* Project detail view */}
          {selectedProject && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 flex-wrap">
                  {Object.entries(PHASE_CONFIG).map(([key, cfg]) => (
                    <button key={key} onClick={() => updateProjectPhase(selectedProject.id, key)}
                      className={cn("px-2.5 py-1 rounded-lg text-xs font-medium transition", selectedProject.phase === key ? cfg.color + " ring-2 ring-offset-1 ring-current" : "bg-muted/30 text-muted-foreground hover:text-foreground")}>
                      {cfg.label}
                    </button>
                  ))}
                </div>
              </div>
              {selectedProject.description && (
                <p className="text-xs text-muted-foreground leading-relaxed">{selectedProject.description}</p>
              )}
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>{selectedProject.task_count ?? 0} tasks · {selectedProject.done_count ?? 0} done</span>
                {selectedProject.due_date && <span>Due {format(parseISO(selectedProject.due_date), "MMM d")}</span>}
              </div>
              {(selectedProject.members ?? []).length > 0 && (
                <div>
                  <p className="text-[11px] uppercase tracking-wider text-muted-foreground mb-2">Team</p>
                  <div className="flex flex-wrap gap-2">
                    {(selectedProject.members ?? []).map((m) => {
                      const display = m.profile?.nickname || m.profile?.email?.split("@")[0] || "?";
                      return (
                        <span key={m.user_id} className={cn("px-2 py-0.5 rounded-md text-xs font-medium", m.role === "lead" ? "bg-blue-500/10 text-blue-600 dark:text-blue-400" : "bg-muted text-muted-foreground")}>
                          {m.role === "lead" ? "★ " : ""}{display}
                        </span>
                      );
                    })}
                  </div>
                </div>
              )}
              <button onClick={() => deleteProject(selectedProject.id)}
                className="text-xs text-red-500 hover:text-red-600 transition mt-2">
                Delete project
              </button>
            </div>
          )}

          {/* Create form */}
          {!selectedProject && creating && (
            <div className="space-y-3">
              <div>
                <label className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1.5 block">Project name</label>
                <input autoFocus value={name} onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Meta Campaign Q2, Logo Redesign…"
                  className="w-full bg-muted/30 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-1 focus:ring-foreground/20 border border-transparent focus:border-foreground/10" />
              </div>
              <div>
                <label className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1.5 block">Description (optional)</label>
                <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2}
                  placeholder="Goals, deliverables, context…"
                  className="w-full bg-muted/30 rounded-xl px-3 py-2.5 text-sm resize-none outline-none focus:ring-1 focus:ring-foreground/20 border border-transparent focus:border-foreground/10" />
              </div>
              <div className="flex gap-3">
                <div className="flex-1">
                  <label className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1.5 block">Phase</label>
                  <select value={phase} onChange={(e) => setPhase(e.target.value)}
                    className="w-full bg-muted/30 rounded-xl px-3 py-2.5 text-sm outline-none border border-transparent">
                    {Object.entries(PHASE_CONFIG).map(([key, cfg]) => (
                      <option key={key} value={key}>{cfg.label}</option>
                    ))}
                  </select>
                </div>
                <div className="flex-1">
                  <label className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1.5 block">Deadline</label>
                  <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)}
                    className="w-full bg-muted/30 rounded-xl px-3 py-2.5 text-sm text-foreground outline-none border border-transparent [color-scheme:light] dark:[color-scheme:dark]" />
                </div>
              </div>
              {orgMembers.length > 0 && (
                <div>
                  <label className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1.5 block">Team members</label>
                  <div className="flex flex-wrap gap-2">
                    {orgMembers.map((m) => (
                      <button key={m.user_id} onClick={() => toggleMember(m.user_id)}
                        className={cn("py-1.5 px-3 rounded-xl text-xs font-medium border transition",
                          memberIds.includes(m.user_id) ? "bg-blue-500 text-white border-blue-500" : "bg-muted/30 border-border text-muted-foreground hover:text-foreground")}>
                        {m.display}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <div className="flex gap-3 pt-1">
                <button onClick={() => setCreating(false)} className="flex-1 py-2.5 rounded-xl text-sm font-medium bg-muted/50 hover:bg-muted transition">Cancel</button>
                <button onClick={createProject} disabled={!name.trim() || saving}
                  className="flex-1 py-2.5 rounded-xl text-sm font-medium bg-foreground text-background hover:opacity-90 transition disabled:opacity-40 flex items-center justify-center gap-2">
                  {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  Create project
                </button>
              </div>
            </div>
          )}

          {/* Project list */}
          {!selectedProject && !creating && (
            <>
              {loading && (
                <div className="flex justify-center py-8">
                  <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                </div>
              )}
              {!loading && projects.length === 0 && (
                <div className="text-center py-10 space-y-3">
                  <FolderKanban className="w-8 h-8 text-muted-foreground/40 mx-auto" />
                  <p className="text-sm text-muted-foreground">No active projects yet.</p>
                  <button onClick={() => setCreating(true)} className="text-sm font-medium text-foreground underline underline-offset-2">
                    Create your first project
                  </button>
                </div>
              )}
              <div className="space-y-2">
                {projects.map((p) => {
                  const phaseCfg = PHASE_CONFIG[p.phase];
                  const total = p.task_count ?? 0;
                  const done = p.done_count ?? 0;
                  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
                  return (
                    <button key={p.id} onClick={() => setSelectedProject(p)}
                      className="w-full text-left rounded-2xl border border-border bg-muted/20 p-4 hover:bg-muted/40 transition space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium text-sm truncate">{p.name}</span>
                        <span className={cn("text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0", phaseCfg?.color)}>
                          {phaseCfg?.label}
                        </span>
                      </div>
                      {p.description && (
                        <p className="text-xs text-muted-foreground line-clamp-1">{p.description}</p>
                      )}
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span>{done}/{total} done</span>
                        {p.due_date && <span>Due {format(parseISO(p.due_date), "MMM d")}</span>}
                      </div>
                      {total > 0 && (
                        <div className="h-1 bg-muted rounded-full overflow-hidden">
                          <div className="h-full bg-foreground/40 rounded-full transition-all" style={{ width: `${pct}%` }} />
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );

  return typeof document !== "undefined" ? createPortal(panel, document.body) : null;
}
