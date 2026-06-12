"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { createSupabaseBrowser } from "@/lib/supabase/client";
import { electronAPI } from "@/lib/electron-api";

export type WidgetTask = {
  id: string;
  title: string;
  due_date: string | null;
  priority: string | null;
  group_name?: string | null;
};

export type WidgetAuth = "loading" | "signedOut" | "ready";

type Options = {
  // Only tasks due before tomorrow (local) or undated — the "urgent" views.
  urgentOnly?: boolean;
  limit?: number;
  initialTasks?: WidgetTask[];
};

// Local end-of-today as an ISO instant. Date-only tasks carry the 23:59 local
// sentinel, so "due before local tomorrow midnight" includes everything due
// today regardless of timezone — unlike the old UTC split("T")[0] boundary.
function localTomorrowISO(): string {
  const n = new Date();
  return new Date(n.getFullYear(), n.getMonth(), n.getDate() + 1).toISOString();
}

// Task data shared by all widget surfaces. Beyond the initial load it keeps
// itself fresh through: realtime changes (filtered to the signed-in user),
// a 60s poll (covers dead websockets after laptop sleep), and refetches on
// online/focus/visibility plus the Electron resume signal. Completion goes
// through PATCH /api/tasks/[id] — NOT a direct Supabase update — because the
// API route is what spawns the next occurrence of recurring tasks.
export function useWidgetTasks({ urgentOnly = false, limit = 50, initialTasks }: Options = {}) {
  const [tasks, setTasks] = useState<WidgetTask[]>(initialTasks ?? []);
  const [auth, setAuth] = useState<WidgetAuth>("loading");
  const [userId, setUserId] = useState<string | null>(null);
  const sbRef = useRef(createSupabaseBrowser());
  const optsRef = useRef({ urgentOnly, limit });
  optsRef.current = { urgentOnly, limit };

  const load = useCallback(async () => {
    const sb = sbRef.current;
    const { data: { user } } = await sb.auth.getUser();
    if (!user) {
      setAuth("signedOut");
      setUserId(null);
      setTasks([]);
      return;
    }
    setAuth("ready");
    setUserId(user.id);

    let q = sb.from("tasks")
      .select("id, title, due_date, priority, group_name")
      .eq("user_id", user.id)
      .eq("completed", false);
    if (optsRef.current.urgentOnly) {
      q = q.or(`due_date.is.null,due_date.lt.${localTomorrowISO()}`);
    }
    const { data, error } = await q
      .order("due_date", { ascending: true, nullsFirst: false })
      .limit(optsRef.current.limit);
    if (!error) setTasks(data ?? []);
  }, []);

  // Initial load + every channel that can make stale data fresh again.
  useEffect(() => {
    load();
    const interval = setInterval(load, 60_000);
    const onVisible = () => { if (document.visibilityState === "visible") load(); };
    window.addEventListener("online", load);
    window.addEventListener("focus", load);
    document.addEventListener("visibilitychange", onVisible);
    const offRefresh = electronAPI()?.onRefresh?.(load);
    return () => {
      clearInterval(interval);
      window.removeEventListener("online", load);
      window.removeEventListener("focus", load);
      document.removeEventListener("visibilitychange", onVisible);
      offRefresh?.();
    };
  }, [load]);

  // Realtime — any change to my tasks triggers a refetch, which keeps results
  // correctly filtered and sorted (no client-side patching of the list).
  useEffect(() => {
    if (!userId) return;
    const sb = sbRef.current;
    const ch = sb.channel(`widget-rt-${userId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "tasks", filter: `user_id=eq.${userId}` }, () => load())
      .subscribe();
    return () => { sb.removeChannel(ch); };
  }, [userId, load]);

  // Optimistic complete with rollback-by-refetch on failure.
  const complete = useCallback(async (id: string): Promise<boolean> => {
    const prev = tasks;
    setTasks(t => t.filter(x => x.id !== id));
    try {
      const res = await fetch(`/api/tasks/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ completed: true }),
      });
      if (!res.ok) throw new Error();
      return true;
    } catch {
      setTasks(prev);
      load();
      return false;
    }
  }, [tasks, load]);

  return { tasks, auth, load, complete };
}
