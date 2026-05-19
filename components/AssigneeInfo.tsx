"use client";
import { cn } from "@/lib/utils";
import type { Task, TaskAssignee } from "@/lib/types";

function resolveAssignees(task: Task): TaskAssignee[] {
  return task.assignees?.length
    ? task.assignees
    : task.assigned_to
    ? [{ user_id: task.assigned_to_id ?? "", profile: task.assigned_to }]
    : [];
}

function displayName(a: TaskAssignee): string {
  return a.profile?.nickname || a.profile?.email?.split("@")[0] || "?";
}

function Avatar({ label, isYou }: { label: string; isYou: boolean }) {
  const initial = (label.charAt(0) || "?").toUpperCase();
  return (
    <span
      className={cn(
        "inline-flex items-center justify-center w-4 h-4 rounded-full text-[8px] font-bold shrink-0 leading-none",
        isYou ? "bg-blue-500 text-white" : "bg-foreground/15 text-foreground/80",
      )}
    >
      {initial}
    </span>
  );
}

export default function AssigneeInfo({
  task,
  currentUserId,
}: {
  task: Task;
  currentUserId?: string;
}) {
  const assignees = resolveAssignees(task);

  // Unassigned org task — small nudge so admins notice
  if (!assignees.length) {
    if (task.org_id) {
      return (
        <div className="ml-[34px] mt-1">
          <span className="text-[10px] font-medium italic text-orange-600/80 dark:text-orange-400/70">
            Unassigned
          </span>
        </div>
      );
    }
    return null;
  }

  const youAssigned = !!currentUserId && assignees.some((a) => a.user_id === currentUserId);
  const others = currentUserId
    ? assignees.filter((a) => a.user_id !== currentUserId)
    : assignees;

  // Only you — strong "this is yours" cue
  if (youAssigned && others.length === 0) {
    return (
      <div className="ml-[34px] mt-1 flex items-center gap-1.5">
        <Avatar label="You" isYou />
        <span className="text-[10px] font-semibold text-blue-600 dark:text-blue-300">
          For you
        </span>
      </div>
    );
  }

  // You + others — still highlight your role
  if (youAssigned) {
    const names = others.slice(0, 2).map(displayName).join(", ");
    const extra = others.length > 2 ? ` +${others.length - 2}` : "";
    return (
      <div className="ml-[34px] mt-1 flex items-center gap-1.5 flex-wrap">
        <Avatar label="You" isYou />
        <span className="text-[10px] font-semibold text-blue-600 dark:text-blue-300">You</span>
        <span className="text-[10px] text-muted-foreground/70">
          + {names}{extra}
        </span>
      </div>
    );
  }

  // Others only — admin/observer view: show who it's going to
  const shown = others.slice(0, 2);
  const extra = others.length > 2 ? others.length - 2 : 0;
  return (
    <div className="ml-[34px] mt-1 flex items-center gap-1.5 flex-wrap">
      <span className="text-[10px] text-muted-foreground/50">→</span>
      {shown.map((a, i) => {
        const name = displayName(a);
        return (
          <span key={a.user_id || `${name}-${i}`} className="inline-flex items-center gap-1">
            <Avatar label={name} isYou={false} />
            <span className="text-[10px] text-muted-foreground/80 font-medium">{name}</span>
          </span>
        );
      })}
      {extra > 0 && (
        <span className="text-[10px] text-muted-foreground/60">+{extra}</span>
      )}
    </div>
  );
}
