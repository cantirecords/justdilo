"use client";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { LogOut, Sun, Moon } from "lucide-react";
import { toast } from "sonner";
import { useDarkMode } from "@/lib/useDarkMode";
import { useTTS } from "@/lib/useTTS";
import { createSupabaseBrowser } from "@/lib/supabase/client";
import MicButton, { type MicButtonHandle } from "./MicButton";
import PushNotificationButton from "./PushNotificationButton";
import ProcessingStatus, { type ProcessPhase } from "./ProcessingStatus";
import FloatingWidget from "./FloatingWidget";
import TaskFeed from "./TaskFeed";
import QuickAdd from "./QuickAdd";
import SearchBar from "./SearchBar";
import type { Task } from "@/lib/types";

function isSpanishText(text: string): boolean {
  return /[¿¡áéíóúñüÁÉÍÓÚÑ]|\b(el|la|los|las|un|una|que|de|en|es|por|para|con|hoy|mañana|tareas|urgente|semana)\b/i.test(text);
}

function buildVoiceReply(tasks: Task[], transcript: string): string {
  const count = tasks.length;
  const spanish = isSpanishText(transcript) || tasks.some((t) => isSpanishText(t.title));
  const today = new Date().toDateString();
  const tomorrow = new Date(Date.now() + 86_400_000).toDateString();
  const todayCount = tasks.filter((t) => t.due_date && new Date(t.due_date).toDateString() === today).length;
  const tomorrowCount = tasks.filter((t) => t.due_date && new Date(t.due_date).toDateString() === tomorrow).length;
  const noun = (n: number, sp: boolean) => sp ? (n === 1 ? "tarea" : "tareas") : (n === 1 ? "task" : "tasks");

  if (spanish) {
    if (count === 1) return `Listo. ${tasks[0].title}.`;
    if (tomorrowCount === count) return `Listo. Guardé ${count} ${noun(count, true)} para mañana.`;
    if (todayCount === count) return `Listo. Guardé ${count} ${noun(count, true)} para hoy.`;
    if (todayCount > 0 && tomorrowCount > 0)
      return `Listo. Guardé ${count} ${noun(count, true)}, ${todayCount} para hoy y ${tomorrowCount} para mañana.`;
    return `Listo. Guardé ${count} ${noun(count, true)}.`;
  } else {
    if (count === 1) return `Got it. ${tasks[0].title}.`;
    if (tomorrowCount === count) return `Done. Saved ${count} ${noun(count, false)} for tomorrow.`;
    if (todayCount === count) return `Done. Saved ${count} ${noun(count, false)} for today.`;
    return `Done. ${count} ${noun(count, false)} saved.`;
  }
}

export default function Dashboard({ initialTasks, userEmail }: { initialTasks: Task[]; userEmail: string }) {
  const [tasks, setTasks] = useState<Task[]>(initialTasks);
  const [processing, setProcessing] = useState(false);
  const [phase, setPhase] = useState<ProcessPhase>("idle");
  const [search, setSearch] = useState("");
  const [voiceOn] = useState(() =>
    typeof window !== "undefined" ? localStorage.getItem("justdilo-voice") !== "off" : true
  );
  const [, start] = useTransition();
  const { speak } = useTTS();

  // 1-hour warning — client-side scheduler (runs while app is open)
  useEffect(() => {
    if (!("Notification" in window) || Notification.permission !== "granted") return;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const now = Date.now();
    const notified = new Set<string>(
      JSON.parse(sessionStorage.getItem("justdilo:notified1h") ?? "[]"),
    );

    for (const task of tasks) {
      if (task.completed || !task.due_date) continue;
      const due = new Date(task.due_date);
      const isMidnight = due.getHours() === 23 && due.getMinutes() === 59;
      if (isMidnight) continue;
      const msUntil1h = due.getTime() - 60 * 60 * 1000 - now;
      if (msUntil1h < 0 || msUntil1h > 4 * 60 * 60 * 1000) continue; // only schedule if within 4h
      if (notified.has(task.id)) continue;

      const t = setTimeout(async () => {
        const reg = await navigator.serviceWorker.ready;
        const timeStr = due.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
        reg.showNotification("In 1 hour ⏰", {
          body: `${task.title}${task.group_name ? ` · ${task.group_name}` : ""} — ${timeStr}. Ready?`,
          icon: "/icons/icon-192.png",
          data: { url: "/" },
        });
        notified.add(task.id);
        sessionStorage.setItem("justdilo:notified1h", JSON.stringify([...notified]));
      }, msUntil1h);
      timers.push(t);
    }
    return () => timers.forEach(clearTimeout);
  }, [tasks]);

  // Supabase Realtime — sync tasks across devices
  useEffect(() => {
    const supabase = createSupabaseBrowser();
    const channel = supabase
      .channel("tasks-realtime")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "tasks" }, (payload) => {
        const newTask = payload.new as Task;
        setTasks((prev) => prev.some((t) => t.id === newTask.id) ? prev : [newTask, ...prev]);
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "tasks" }, (payload) => {
        setTasks((prev) => prev.map((t) => t.id === payload.new.id ? { ...t, ...payload.new as Task } : t));
      })
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "tasks" }, (payload) => {
        setTasks((prev) => prev.filter((t) => t.id !== payload.old.id));
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  // Search filter
  const filteredTasks = useMemo(() => {
    if (!search.trim()) return tasks;
    const q = search.toLowerCase();
    return tasks.filter((t) =>
      t.title.toLowerCase().includes(q) ||
      t.group_name?.toLowerCase().includes(q) ||
      t.summary?.toLowerCase().includes(q),
    );
  }, [tasks, search]);

  const onNewTasks = useCallback((newTasks: Task[], transcript: string, _summary: string, _groupCount: number, duplicatesSkipped = 0, recurring: string[] = []) => {
    setTasks((prev) => [...newTasks, ...prev]);
    if (duplicatesSkipped > 0) toast.info(`${duplicatesSkipped} duplicate${duplicatesSkipped > 1 ? "s" : ""} skipped`);
    if (recurring.length > 0) recurring.forEach((r) => toast(`↻ Recurring: ${r}`, { duration: 8000 }));

    if (voiceOn && newTasks.length > 0) {
      speak(buildVoiceReply(newTasks, transcript));
    }
  }, [voiceOn, speak]);

  const handleVoiceResult = useCallback((json: any) => {
    const intent = json.intent ?? "CREATE_TASK";

    if (intent === "UPDATE_TASK" && json.updated_tasks?.length) {
      setTasks((prev) =>
        prev.map((t) => {
          const updated = json.updated_tasks.find((u: Task) => u.id === t.id);
          return updated ? { ...t, ...updated } : t;
        })
      );
      if (voiceOn) speak("Updated.");
    }

    if (intent === "DELETE_TASK" && json.deleted_task_ids?.length) {
      setTasks((prev) => prev.filter((t) => !json.deleted_task_ids.includes(t.id)));
    }

    if (intent === "COMPLETE_TASK" && json.completed_task_ids?.length) {
      setTasks((prev) =>
        prev.map((t) =>
          json.completed_task_ids.includes(t.id) ? { ...t, completed: true } : t
        )
      );
      if (voiceOn) speak("Done.");
    }

    if (intent === "QUERY_TASKS" && json.answer) {
      toast(json.answer, { duration: 6000 });
    }

    if ((intent === "UPDATE_TASK" || intent === "DELETE_TASK" || intent === "COMPLETE_TASK") && json.not_found) {
      toast.warning("Couldn't find that task");
    }
  }, [voiceOn, speak]);

  function onQuickAddTasks(newTasks: Task[], summary: string, groupCount: number) {
    onNewTasks(newTasks, "", summary, groupCount);
  }

  async function addTaskToGroup(title: string, groupName: string) {
    const res = await fetch("/api/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, group_name: groupName }),
    });
    if (!res.ok) { toast.error("Couldn't add task"); return; }
    const task: Task = await res.json();
    setTasks((prev) => [task, ...prev]);
  }

  function updateTask(id: string, patch: Partial<Task>) {
    const previous = tasks.find((t) => t.id === id);
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)));
    start(async () => {
      const res = await fetch(`/api/tasks/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch) });
      if (!res.ok && previous) {
        setTasks((prev) => prev.map((t) => (t.id === id ? previous : t)));
        toast.error("Couldn't save change");
      }
    });
  }

  function batchUpdateTasks(ids: string[], patch: Partial<Task>) {
    setTasks((prev) => prev.map((t) => ids.includes(t.id) ? { ...t, ...patch } : t));
    start(async () => {
      await Promise.all(ids.map((id) =>
        fetch(`/api/tasks/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch) }),
      ));
    });
  }

  function deleteTask(id: string) {
    const deleted = tasks.find((t) => t.id === id);
    setTasks((prev) => prev.filter((t) => t.id !== id));
    toast("Task deleted", {
      action: {
        label: "Undo",
        onClick: async () => {
          if (!deleted) return;
          // Row is gone — recreate it via POST, not PATCH
          const res = await fetch("/api/tasks", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              title: deleted.title,
              group_name: deleted.group_name,
              due_date: deleted.due_date,
              priority: deleted.priority,
              category: deleted.category,
            }),
          });
          if (res.ok) {
            const recreated: Task = await res.json();
            setTasks((prev) => [recreated, ...prev]);
          } else {
            toast.error("Couldn't restore task");
          }
        },
      },
      duration: 4000,
    });
    start(async () => { await fetch(`/api/tasks/${id}`, { method: "DELETE" }); });
  }

  function batchDeleteTasks(ids: string[]) {
    setTasks((prev) => prev.filter((t) => !ids.includes(t.id)));
    toast(`${ids.length} task${ids.length !== 1 ? "s" : ""} deleted`);
    start(async () => {
      await Promise.all(ids.map((id) => fetch(`/api/tasks/${id}`, { method: "DELETE" })));
    });
  }

  const { dark, toggle: toggleDark } = useDarkMode();
  const pending = tasks.filter((t) => !t.completed).length;

  const [autoStart] = useState(() =>
    typeof window !== "undefined" && new URLSearchParams(window.location.search).get("action") === "capture"
  );
  const micRef = useRef<MicButtonHandle>(null);

  return (
    <main className="min-h-dvh max-w-2xl mx-auto px-5 pb-40 pt-6">
      <header className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">JustDilo</h1>
          <p className="text-xs text-muted-foreground">
            {pending > 0 ? `${pending} task${pending !== 1 ? "s" : ""} pending` : userEmail}
          </p>
        </div>
        <div className="flex items-center gap-1">
          <PushNotificationButton />
          <button
            onClick={toggleDark}
            className="p-2 rounded-full hover:bg-muted transition"
            aria-label="Toggle dark mode"
          >
            {dark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>
          <form action="/auth/signout" method="post">
            <button className="p-2 rounded-full hover:bg-muted" aria-label="Sign out">
              <LogOut className="w-4 h-4" />
            </button>
          </form>
        </div>
      </header>

      <section className="mb-5">
        <SearchBar value={search} onChange={setSearch} />
      </section>

      <section className="flex flex-col items-center mb-2">
        <MicButton
          ref={micRef}
          onProcessingChange={setProcessing}
          onPhaseChange={setPhase}
          onNewTasks={onNewTasks}
          onVoiceResult={handleVoiceResult}
          autoStart={autoStart}
        />
        <div className="mt-4 h-5 flex items-center">
          {phase === "idle"
            ? <p className="text-sm text-muted-foreground/50">Tap to speak</p>
            : <ProcessingStatus phase={phase} />
          }
        </div>
      </section>

      <section className="mt-7">
        {search && filteredTasks.length === 0 ? (
          <p className="text-center text-sm text-muted-foreground py-8">No tasks match "{search}"</p>
        ) : (
          <TaskFeed tasks={filteredTasks} onUpdate={updateTask} onDelete={deleteTask} onAddTask={addTaskToGroup} onBatchUpdate={batchUpdateTasks} onBatchDelete={batchDeleteTasks} />
        )}
      </section>

      <QuickAdd onNewTasks={onQuickAddTasks} onVoiceResult={handleVoiceResult} />

      <FloatingWidget />
    </main>
  );
}
