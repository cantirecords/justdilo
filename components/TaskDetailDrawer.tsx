"use client";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X, Send, Trash2, Link2, Loader2, UserPlus } from "lucide-react";
import { format, parseISO } from "date-fns";
import { cn } from "@/lib/utils";
import type { Task, TaskComment, TaskAssignee } from "@/lib/types";

type OrgMember = { user_id: string; display: string; nickname: string | null; email: string };

type Props = {
  task: Task;
  onClose: () => void;
  onUpdate: (id: string, patch: Partial<Task> & { assignee_ids?: string[] }) => void;
  currentUserId: string;
};

function displayName(a: TaskAssignee) {
  return a.profile?.nickname || a.profile?.email?.split("@")[0] || "?";
}

export default function TaskDetailDrawer({ task, onClose, onUpdate, currentUserId }: Props) {
  const [comments, setComments] = useState<TaskComment[]>([]);
  const [loadingComments, setLoadingComments] = useState(true);
  const [body, setBody] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [showLinkInput, setShowLinkInput] = useState(false);
  const [sending, setSending] = useState(false);
  const [orgMembers, setOrgMembers] = useState<OrgMember[]>([]);
  const [showMemberPicker, setShowMemberPicker] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const assignees: TaskAssignee[] = task.assignees ?? (
    task.assigned_to ? [{ user_id: task.assigned_to_id ?? "", profile: task.assigned_to }] : []
  );
  const assigneeIds = assignees.map((a) => a.user_id).filter(Boolean);

  useEffect(() => {
    fetch(`/api/tasks/${task.id}/comments`)
      .then((r) => r.ok ? r.json() : { comments: [] })
      .then(({ comments }) => { setComments(comments); setLoadingComments(false); })
      .catch(() => setLoadingComments(false));

    fetch("/api/orgs/members")
      .then((r) => r.ok ? r.json() : { members: [] })
      .then(({ members }) => setOrgMembers(members))
      .catch(() => {});
  }, [task.id]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [comments]);

  useEffect(() => {
    function handler(e: KeyboardEvent) { if (e.key === "Escape") onClose(); }
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  async function sendComment() {
    if (!body.trim() && !linkUrl.trim()) return;
    setSending(true);
    const res = await fetch(`/api/tasks/${task.id}/comments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body: body.trim() || null, link_url: linkUrl.trim() || null }),
    });
    if (res.ok) {
      const { comment } = await res.json();
      setComments((prev) => [...prev, comment]);
      setBody(""); setLinkUrl(""); setShowLinkInput(false);
    }
    setSending(false);
  }

  async function deleteComment(commentId: string) {
    await fetch(`/api/tasks/${task.id}/comments`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ commentId }),
    });
    setComments((prev) => prev.filter((c) => c.id !== commentId));
  }

  function toggleAssignee(member: OrgMember) {
    const alreadyIn = assigneeIds.includes(member.user_id);
    const newIds = alreadyIn
      ? assigneeIds.filter((id) => id !== member.user_id)
      : [...assigneeIds, member.user_id];
    const newAssignees: TaskAssignee[] = orgMembers
      .filter((m) => newIds.includes(m.user_id))
      .map((m) => ({ user_id: m.user_id, profile: { nickname: m.nickname, email: m.email } }));
    onUpdate(task.id, {
      assignee_ids: newIds,
      assignees: newAssignees,
      org_id: newIds.length > 0 ? (task.org_id ?? undefined) : null,
    } as any);
    setShowMemberPicker(false);
  }

  const drawer = (
    <div className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/70" onClick={onClose} />
      <div className="relative w-full sm:max-w-lg bg-background rounded-t-3xl sm:rounded-2xl shadow-2xl border border-border overflow-hidden flex flex-col max-h-[85vh]">

        {/* Header */}
        <div className="flex items-start justify-between px-5 pt-5 pb-4 border-b border-border/50 shrink-0">
          <div className="flex-1 min-w-0 pr-3">
            <p className="text-xs text-muted-foreground mb-0.5">{task.group_name ?? "Task"}</p>
            <h2 className="text-sm font-semibold leading-snug">{task.title}</h2>
            {task.due_date && (
              <p className="text-xs text-muted-foreground mt-0.5">
                {format(parseISO(task.due_date), "EEE MMM d · h:mma").toLowerCase()}
              </p>
            )}
          </div>
          <button onClick={onClose} className="p-1.5 rounded-full hover:bg-muted transition shrink-0">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Assignees */}
        {task.org_id && (
          <div className="px-5 py-3 border-b border-border/30 shrink-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[11px] uppercase tracking-wider text-muted-foreground">Assigned</span>
              {assignees.map((a) => (
                <span key={a.user_id} className="text-xs px-2 py-0.5 rounded-md bg-blue-500/10 text-blue-600 dark:text-blue-400 font-medium">
                  @{displayName(a)}
                </span>
              ))}
              {assignees.length === 0 && (
                <span className="text-xs text-muted-foreground/60">Nobody yet</span>
              )}
              {orgMembers.length > 0 && (
                <div className="relative">
                  <button onClick={() => setShowMemberPicker((v) => !v)}
                    className="p-1 rounded-full hover:bg-muted text-muted-foreground hover:text-foreground transition">
                    <UserPlus className="w-3.5 h-3.5" />
                  </button>
                  {showMemberPicker && (
                    <div className="absolute top-7 left-0 z-10 bg-background border border-border rounded-xl shadow-lg p-2 space-y-1 min-w-[140px]">
                      {orgMembers.map((m) => (
                        <button key={m.user_id} onClick={() => toggleAssignee(m)}
                          className={cn("w-full text-left px-3 py-1.5 rounded-lg text-xs transition",
                            assigneeIds.includes(m.user_id) ? "bg-blue-500 text-white" : "hover:bg-muted")}>
                          {m.display}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Comments */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
          {loadingComments && (
            <div className="flex justify-center py-4">
              <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
            </div>
          )}
          {!loadingComments && comments.length === 0 && (
            <p className="text-xs text-muted-foreground/50 text-center py-4">
              No comments yet. Start the thread below.
            </p>
          )}
          {comments.map((c) => {
            const author = c.profile?.nickname || c.profile?.email?.split("@")[0] || "Someone";
            const isMe = c.user_id === currentUserId;
            return (
              <div key={c.id} className={cn("flex gap-2.5", isMe && "flex-row-reverse")}>
                <div className="w-6 h-6 rounded-full bg-muted flex items-center justify-center text-[10px] font-bold shrink-0">
                  {author[0]?.toUpperCase()}
                </div>
                <div className={cn("flex-1 max-w-[75%]", isMe && "items-end flex flex-col")}>
                  <div className={cn("rounded-2xl px-3 py-2 text-xs leading-relaxed",
                    isMe ? "bg-foreground text-background rounded-tr-sm" : "bg-muted/60 rounded-tl-sm")}>
                    {c.body && <p>{c.body}</p>}
                    {c.link_url && (
                      <a href={c.link_url} target="_blank" rel="noopener noreferrer"
                        className={cn("flex items-center gap-1 mt-1 underline underline-offset-2 break-all",
                          isMe ? "text-background/80" : "text-blue-500")}>
                        <Link2 className="w-3 h-3 shrink-0" />
                        {c.link_url.length > 40 ? c.link_url.slice(0, 40) + "…" : c.link_url}
                      </a>
                    )}
                  </div>
                  <div className={cn("flex items-center gap-1 mt-0.5", isMe && "flex-row-reverse")}>
                    <span className="text-[10px] text-muted-foreground/50">
                      {author} · {format(parseISO(c.created_at), "MMM d, h:mm a")}
                    </span>
                    {isMe && (
                      <button onClick={() => deleteComment(c.id)} className="text-muted-foreground/40 hover:text-red-500 transition">
                        <Trash2 className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
          <div ref={bottomRef} />
        </div>

        {/* Input */}
        <div className="px-5 py-4 border-t border-border/50 shrink-0 space-y-2">
          {showLinkInput && (
            <input value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)}
              placeholder="https://…"
              className="w-full bg-muted/30 rounded-xl px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-foreground/20 border border-transparent focus:border-foreground/10" />
          )}
          <div className="flex items-center gap-2">
            <button onClick={() => setShowLinkInput((v) => !v)}
              className={cn("p-2 rounded-full transition shrink-0", showLinkInput ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground hover:bg-muted")}>
              <Link2 className="w-4 h-4" />
            </button>
            <input
              value={body}
              onChange={(e) => setBody(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendComment(); } }}
              placeholder="Add a comment…"
              className="flex-1 bg-muted/30 rounded-xl px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-foreground/20 border border-transparent focus:border-foreground/10"
            />
            <button onClick={sendComment} disabled={(!body.trim() && !linkUrl.trim()) || sending}
              className="p-2 rounded-full bg-foreground text-background hover:opacity-90 transition disabled:opacity-30 shrink-0">
              {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  return typeof document !== "undefined" ? createPortal(drawer, document.body) : null;
}
