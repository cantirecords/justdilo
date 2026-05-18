"use client";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { LogOut, Sun, Moon, BarChart2, Users, FolderKanban } from "lucide-react";
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
import NicknameModal from "./NicknameModal";
import TranscriptDebug from "./TranscriptDebug";
import AdminPanel from "./AdminPanel";
import OrgPanel from "./OrgPanel";
import ProjectPanel from "./ProjectPanel";
import { parseISO, isPast, isToday } from "date-fns";
import type { Task, Organization } from "@/lib/types";

const DEV_EMAIL = "yorohn@duck.com";

// Rotating copy — picked once per page load. Every option nudges toward the mic
// since voice-first is the core interaction.
const PENDING_PHRASES = (n: number) => [
  `${n} to do`,
  `${n} on your plate`,
  `${n} up next`,
  `${n} waiting on you`,
  `you've got ${n}`,
  `${n} to handle`,
  `${n} in the queue`,
];

const EMPTY_GREETINGS = (name: string) => [
  `hey, ${name}`,
  `all clear, ${name}`,
  `inbox zero, ${name}`,
  `you're caught up, ${name}`,
  `nothing pending — talk to me`,
  `quiet day, ${name}`,
  `what's next, ${name}?`,
];

const MIC_MOBILE = [
  "Tap to talk",
  "Talk to me",
  "Say it out loud",
  "What's on your mind?",
  "Drop a thought",
  "Just speak",
  "Tap & speak",
  "Tell me anything",
];

const MIC_DESKTOP = [
  "Hold Space · or talk to me",
  "Hold Space · or just speak",
  "Press Space · or tap to talk",
  "Hold Space · say it out loud",
  "Hold Space · what's on your mind?",
  "Press Space · drop a thought",
  "Hold Space · tell me anything",
];

function pickRandom<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

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

export default function Dashboard({ initialTasks, userEmail, userId, initialNickname, orgsEnabled = false, initialOrgs = [], initialOrgTasks = [] }: { initialTasks: Task[]; userEmail: string; userId: string; initialNickname: string | null; orgsEnabled?: boolean; initialOrgs?: Organization[]; initialOrgTasks?: Task[] }) {

  // Merge personal + org tasks into a single list, deduped by id.
  // Team tasks live side-by-side with personal tasks in the same views — they just carry an assignee.
  const [tasks, setTasks] = useState<Task[]>(() => {
    const seen = new Set<string>();
    return [...initialTasks, ...initialOrgTasks].filter((t) => {
      if (seen.has(t.id)) return false;
      seen.add(t.id);
      return true;
    });
  });
  const [orgs, setOrgs] = useState<Organization[]>(initialOrgs);
  const [showOrgPanel, setShowOrgPanel] = useState(false);
  const [showProjectPanel, setShowProjectPanel] = useState(false);
  const [nickname, setNickname] = useState<string | null>(initialNickname);
  const [showNicknameModal, setShowNicknameModal] = useState(initialNickname === null);
  const [processing, setProcessing] = useState(false);
  const [phase, setPhase] = useState<ProcessPhase>("idle");
  const [search, setSearch] = useState("");
  const [voiceOn] = useState(() =>
    typeof window !== "undefined" ? localStorage.getItem("justdilo-voice") !== "off" : true
  );
  // Rotating copy — picked once on mount, stable for the session, fresh on each reload
  const [micCopy] = useState(() => ({
    mobile: pickRandom(MIC_MOBILE),
    desktop: pickRandom(MIC_DESKTOP),
  }));
  const [randomSeed] = useState(() => Math.random());
  const [, start] = useTransition();
  const { speak } = useTTS();
  const isDevMode = userEmail === DEV_EMAIL;
  const [debugData, setDebugData] = useState<any>(null);
  const [showAdmin, setShowAdmin] = useState(false);

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
      if (msUntil1h < 0 || msUntil1h > 4 * 60 * 60 * 1000) continue;
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
      .channel(`tasks-realtime-${userId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "tasks", filter: `user_id=eq.${userId}` }, (payload) => {
        const newTask = payload.new as Task;
        setTasks((prev) => prev.some((t) => t.id === newTask.id) ? prev : [newTask, ...prev]);
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "tasks", filter: `user_id=eq.${userId}` }, (payload) => {
        setTasks((prev) => prev.map((t) => t.id === payload.new.id ? { ...t, ...payload.new as Task } : t));
      })
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "tasks", filter: `user_id=eq.${userId}` }, (payload) => {
        setTasks((prev) => prev.filter((t) => t.id !== payload.old.id));
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [userId]);

  // Supabase Realtime — sync org tasks across all team members (merged into the same tasks list)
  useEffect(() => {
    if (!orgsEnabled || orgs.length === 0) return;
    const supabase = createSupabaseBrowser();
    const channels = orgs.map((org) =>
      supabase
        .channel(`org-tasks-${org.id}`)
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "tasks", filter: `org_id=eq.${org.id}` }, (payload) => {
          const t = payload.new as Task;
          setTasks((prev) => prev.some((x) => x.id === t.id) ? prev : [t, ...prev]);
        })
        .on("postgres_changes", { event: "UPDATE", schema: "public", table: "tasks", filter: `org_id=eq.${org.id}` }, (payload) => {
          setTasks((prev) => prev.map((t) => t.id === payload.new.id ? { ...t, ...payload.new as Task } : t));
        })
        .on("postgres_changes", { event: "DELETE", schema: "public", table: "tasks", filter: `org_id=eq.${org.id}` }, (payload) => {
          setTasks((prev) => prev.filter((t) => t.id !== payload.old.id));
        })
        .subscribe()
    );
    return () => { channels.forEach((c) => supabase.removeChannel(c)); };
  }, [orgsEnabled, orgs]);

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

  // Top urgent task — shown persistently above tabs regardless of active tab
  // Sort by due_date ASC so the most overdue task wins, not the most recently created
  const urgentTask = useMemo(() => {
    const now = new Date();
    const overdue = tasks
      .filter((t) => !t.completed && t.due_date && parseISO(t.due_date) < now)
      .sort((a, b) => parseISO(a.due_date!).getTime() - parseISO(b.due_date!).getTime());
    return overdue[0] ?? tasks.find((t) => !t.completed && t.priority === "high") ?? null;
  }, [tasks]);

  const isOverdue = (t: Task) => {
    if (!t.due_date) return false;
    const d = parseISO(t.due_date);
    return isPast(d) && !isToday(d);
  };

  const onNewTasks = useCallback((newTasks: Task[], transcript: string, _summary: string, _groupCount: number, duplicatesSkipped = 0, recurring: string[] = []) => {
    setTasks((prev) => [...newTasks, ...prev]);
    if (duplicatesSkipped > 0) toast.info(`${duplicatesSkipped} duplicate${duplicatesSkipped > 1 ? "s" : ""} skipped`);
    if (recurring.length > 0) recurring.forEach((r) => toast(`↻ Recurring: ${r}`, { duration: 8000 }));
  }, [voiceOn]);

  const handleVoiceResult = useCallback((json: any) => {
    if (isDevMode) setDebugData(json);
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
  }, [voiceOn, speak, isDevMode]);

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
          const res = await fetch("/api/tasks", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              title: deleted.title,
              group_name: deleted.group_name,
              due_date: deleted.due_date,
              priority: deleted.priority,
              category: deleted.category,
              summary: deleted.summary,
              reminder_minutes: deleted.reminder_minutes,
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

  function handleNicknameSave(saved: string) {
    setNickname(saved || null);
    setShowNicknameModal(false);
  }

  const urgentIsOverdue = urgentTask ? isOverdue(urgentTask) : false;

  return (
    /*
     * Layout:
     * Mobile  — single column: aside (header + mic) stacks above main (search + tasks)
     * Desktop (xl+) — two columns: aside becomes a 300px left sidebar, main fills the rest
     */
    <main className="min-h-dvh xl:grid xl:grid-cols-[300px_1fr] xl:h-screen xl:overflow-hidden">
      {showNicknameModal && <NicknameModal onSave={handleNicknameSave} />}
      {isDevMode && debugData && (
        <TranscriptDebug data={debugData} onClose={() => setDebugData(null)} />
      )}
      {isDevMode && showAdmin && (
        <AdminPanel onClose={() => setShowAdmin(false)} />
      )}
      {orgsEnabled && showOrgPanel && (
        <OrgPanel
          orgs={orgs}
          userId={userId}
          onClose={() => setShowOrgPanel(false)}
          onOrgsChange={setOrgs}
        />
      )}
      {orgsEnabled && showProjectPanel && (
        <ProjectPanel
          orgs={orgs}
          userId={userId}
          onClose={() => setShowProjectPanel(false)}
        />
      )}

      {/* ── Left sidebar / mobile top section ── */}
      <aside className="flex flex-col pt-safe-6 px-5 pb-6
                        xl:h-screen xl:border-r xl:border-border xl:bg-muted/[0.04]
                        xl:pt-0 xl:px-0 xl:pb-0 xl:overflow-hidden">

        {/* Header row */}
        <div className="flex items-center justify-between mb-7
                        xl:px-5 xl:py-4 xl:mb-0
                        xl:border-b xl:border-border/50 xl:shrink-0">
          <div>
            <h1 className="text-lg font-semibold tracking-tight">JustDilo</h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              {pending > 0
                ? PENDING_PHRASES(pending)[Math.floor(randomSeed * PENDING_PHRASES(pending).length)]
                : nickname
                ? EMPTY_GREETINGS(nickname)[Math.floor(randomSeed * EMPTY_GREETINGS(nickname).length)]
                : userEmail}
            </p>
          </div>
          <div className="flex items-center gap-1">
            {isDevMode && (
              <button
                onClick={() => setShowAdmin(true)}
                className="p-2 rounded-full hover:bg-muted transition"
                aria-label="Admin panel"
              >
                <BarChart2 className="w-4 h-4" />
              </button>
            )}
            {orgsEnabled && (
              <button
                onClick={() => setShowOrgPanel(true)}
                className="p-2 rounded-full hover:bg-muted transition"
                aria-label="Teams"
                title="Teams"
              >
                <Users className="w-4 h-4" />
              </button>
            )}
            {orgsEnabled && (
              <button
                onClick={() => setShowProjectPanel(true)}
                className="p-2 rounded-full hover:bg-muted transition"
                aria-label="Projects"
                title="Projects"
              >
                <FolderKanban className="w-4 h-4" />
              </button>
            )}
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
        </div>

        {/* Mic button — centered vertically in sidebar on desktop */}
        <div className="flex flex-col items-center
                        xl:flex-1 xl:justify-center xl:py-8">
          <MicButton
            ref={micRef}
            onProcessingChange={setProcessing}
            onPhaseChange={setPhase}
            onNewTasks={onNewTasks}
            onVoiceResult={handleVoiceResult}
            autoStart={autoStart}
          />
          <div className="mt-4 h-5 flex items-center">
            {phase !== "idle"
              ? <ProcessingStatus phase={phase} />
              : <p className="text-sm text-muted-foreground/50">
                  <span className="sm:hidden">{micCopy.mobile}</span>
                  <span className="hidden sm:inline">{micCopy.desktop}</span>
                </p>
            }
          </div>
        </div>
      </aside>

      {/* ── Right / main content area ── */}
      <div className="px-5 pb-40
                      xl:h-screen xl:flex xl:flex-col xl:overflow-hidden
                      xl:px-8 xl:pb-0">

        {/* Persistent urgent task card — always visible above tabs */}
        {urgentTask && (
          <div
            className={`mt-5 mb-4 rounded-2xl border-2 p-4 flex items-center gap-3 shrink-0
              xl:mt-6
              ${urgentIsOverdue
                ? "border-red-400/70 dark:border-red-500/60 bg-red-50/40 dark:bg-red-950/20"
                : "border-orange-400/70 dark:border-orange-500/60 bg-orange-50/40 dark:bg-orange-950/20"}`}
            style={{ animation: "urgentCardPulse 2.4s ease-in-out infinite" }}
          >
            <div className="flex-1 min-w-0">
              <p className={`text-[10px] uppercase tracking-widest font-bold mb-0.5
                ${urgentIsOverdue ? "text-red-500" : "text-orange-500"}`}>
                {urgentIsOverdue ? "⚠ Overdue" : "⚡ Do this now"}
              </p>
              <p className="text-sm font-semibold leading-snug truncate">{urgentTask.title}</p>
            </div>
            <button
              onClick={() => updateTask(urgentTask.id, { completed: true })}
              className={`shrink-0 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all active:scale-95
                ${urgentIsOverdue
                  ? "bg-red-500 hover:bg-red-600 text-white"
                  : "bg-orange-500 hover:bg-orange-600 text-white"}`}
            >
              Done
            </button>
          </div>
        )}

        {/* Search */}
        <section className={`mb-5 shrink-0 ${!urgentTask ? "mt-5 xl:mt-6" : ""}`}>
          <SearchBar value={search} onChange={setSearch} />
        </section>

        {/* Task feed — scrollable on desktop */}
        <section className="xl:flex-1 xl:overflow-y-auto xl:pb-8">
          {search && filteredTasks.length === 0 ? (
            <p className="text-center text-sm text-muted-foreground py-8">No tasks match "{search}"</p>
          ) : (
            <TaskFeed
              tasks={filteredTasks}
              onUpdate={updateTask}
              onDelete={deleteTask}
              onAddTask={addTaskToGroup}
              onBatchUpdate={batchUpdateTasks}
              onBatchDelete={batchDeleteTasks}
              currentUserId={userId}
            />
          )}
        </section>
      </div>

      <QuickAdd onNewTasks={onQuickAddTasks} onVoiceResult={handleVoiceResult} />
      <FloatingWidget />
    </main>
  );
}
