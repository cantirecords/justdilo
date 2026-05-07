"use client";
import { useEffect, useRef, useState, useCallback } from "react";
import { Mic, Check, X, ListTodo } from "lucide-react";
import { createSupabaseBrowser } from "@/lib/supabase/client";
import { format, isToday, isPast } from "date-fns";

type Phase = "idle" | "listening" | "processing" | "done" | "error";
type Mode  = "mic" | "focus";
type SlimTask = { id: string; title: string; due_date: string | null };

declare global {
  interface Window {
    electronAPI?: {
      resizeWindow: (w: number, h: number) => Promise<void>;
      switchWidget: (style: string) => Promise<void>;
    };
  }
}

const MIC_SIZE = 160;
const TASK_ROW_H = 50;   // height per task row
const FOCUS_CHROME = 96; // top controls + bottom row + padding

function hasTime(due_date: string) { return due_date.includes("T"); }
function isNow(due_date: string | null) {
  if (!due_date || !hasTime(due_date)) return false;
  const d = new Date(due_date);
  return isPast(d) && isToday(d);
}
function isOverdueDay(due_date: string | null) {
  if (!due_date) return false;
  const d = new Date(due_date);
  return isPast(d) && !isToday(d);
}
function taskTime(due_date: string) {
  if (!hasTime(due_date)) return null;
  return format(new Date(due_date), "h:mm a");
}

export default function MicWidget() {
  const [phase, setPhase]     = useState<Phase>("idle");
  const [hovered, setHovered] = useState(false);
  const [mode, setMode]       = useState<Mode>("mic");
  const [tasks, setTasks]     = useState<SlimTask[]>([]);
  const [tick, setTick]       = useState(0); // forces re-render every minute for NOW updates
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef   = useRef<Blob[]>([]);
  const winW = useRef(MIC_SIZE);

  const sb = createSupabaseBrowser();

  const loadTasks = useCallback(async () => {
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return;
    const tomorrow = new Date(Date.now() + 86400000).toISOString().split("T")[0];
    const { data } = await sb.from("tasks")
      .select("id, title, due_date")
      .eq("user_id", user.id).eq("completed", false)
      .or(`due_date.is.null,due_date.lt.${tomorrow}`)
      .order("due_date", { ascending: true, nullsFirst: false })
      .limit(6);
    setTasks(data ?? []);
  }, []);

  useEffect(() => {
    loadTasks();
    const ch = sb.channel("mic-widget-rt")
      .on("postgres_changes", { event: "*", schema: "public", table: "tasks" }, () => loadTasks())
      .subscribe();
    // tick every minute to update NOW status
    const interval = setInterval(() => setTick(t => t + 1), 60_000);
    return () => { sb.removeChannel(ch); clearInterval(interval); };
  }, []);

  useEffect(() => { winW.current = window.innerWidth; }, []);

  // When tasks load or mode changes, resize window to fit content
  useEffect(() => {
    if (mode !== "focus") return;
    const w = Math.max(winW.current, MIC_SIZE);
    const taskCount = Math.max(1, Math.min(tasks.length, 5));
    const h = FOCUS_CHROME + taskCount * TASK_ROW_H + 72; // +72 for mic circle
    window.electronAPI?.resizeWindow(w, h);
  }, [mode, tasks.length]);

  async function toggleMode() {
    const next = mode === "mic" ? "focus" : "mic";
    setMode(next);
    const w = Math.max(winW.current, MIC_SIZE);
    if (next === "mic") {
      await window.electronAPI?.resizeWindow(w, w);
    }
    winW.current = w;
  }

  async function completeTask(id: string) {
    setTasks(t => t.filter(x => x.id !== id));
    await sb.from("tasks").update({ completed: true }).eq("id", id);
  }

  async function handleClick() {
    if (phase === "listening") {
      recorderRef.current?.stop();
      recorderRef.current = null;
      return;
    }
    if (phase !== "idle" && phase !== "error") return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", ""]
        .find(m => m === "" || MediaRecorder.isTypeSupported(m)) ?? "";
      const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : {});
      chunksRef.current = [];
      rec.ondataavailable = e => e.data.size && chunksRef.current.push(e.data);
      rec.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());
        setPhase("processing");
        const ext = mime.includes("mp4") ? "mp4" : "webm";
        const fd = new FormData();
        fd.append("audio", new File(chunksRef.current, `r.${ext}`, { type: mime }));
        fd.append("utcOffset", String(-new Date().getTimezoneOffset()));
        fd.append("timezone", Intl.DateTimeFormat().resolvedOptions().timeZone);
        try {
          const res = await fetch("/api/process-voice", { method: "POST", body: fd });
          const j = await res.json();
          if (!res.ok) throw new Error(j.error || "Failed");
          setPhase("done");
          loadTasks();
          setTimeout(() => setPhase("idle"), 1800);
        } catch {
          setPhase("error");
          setTimeout(() => setPhase("idle"), 2000);
        }
      };
      rec.start();
      recorderRef.current = rec;
      setPhase("listening");
    } catch {
      setPhase("error");
      setTimeout(() => setPhase("idle"), 2000);
    }
  }

  const bg =
    phase === "listening"  ? "#ef4444" :
    phase === "done"       ? "#22c55e" :
    phase === "error"      ? "#f97316" :
    phase === "processing" ? "rgba(0,0,0,0.82)" :
                             "rgba(0,0,0,0.86)";

  const shadow =
    phase === "listening"  ? "0 0 0 0 rgba(239,68,68,0.4), 0 8px 48px rgba(239,68,68,0.5)" :
    phase === "done"       ? "0 8px 40px rgba(34,197,94,0.5)" :
    phase === "error"      ? "0 8px 40px rgba(249,115,22,0.4)" :
                             hovered ? "0 16px 56px rgba(0,0,0,0.55)" : "0 6px 36px rgba(0,0,0,0.38)";

  const micSize = mode === "focus" ? "64px" : "min(82vw, 82vh)";

  return (
    <>
      <style>{`
        * { margin: 0; padding: 0; box-sizing: border-box; }
        html, body { width: 100%; height: 100%; overflow: hidden; background: transparent; -webkit-user-select: none; user-select: none; }

        @keyframes ping  { 0% { transform: scale(1); opacity: 0.55; } 100% { transform: scale(1.75); opacity: 0; } }
        @keyframes ping2 { 0% { transform: scale(1); opacity: 0.35; } 100% { transform: scale(2.3);  opacity: 0; } }
        @keyframes spin  { to { transform: rotate(360deg); } }
        @keyframes pop   { 0% { transform: scale(0.7) rotate(-10deg); opacity: 0; } 60% { transform: scale(1.15) rotate(2deg); } 100% { transform: scale(1) rotate(0); opacity: 1; } }
        @keyframes shake { 0%,100% { transform: translateX(0); } 20%,60% { transform: translateX(-4px); } 40%,80% { transform: translateX(4px); } }
        @keyframes slideDown { from { opacity: 0; transform: translateY(-8px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes nowPulse { 0%,100% { opacity: 1; } 50% { opacity: 0.25; } }

        .ring1 { animation: ping  1s ease-out infinite; }
        .ring2 { animation: ping2 1.5s ease-out infinite 0.25s; }
        .spin  { animation: spin  0.75s linear infinite; }
        .pop   { animation: pop   0.35s cubic-bezier(.34,1.56,.64,1) forwards; }
        .shake { animation: shake 0.4s ease; }
        .slide-down { animation: slideDown 0.22s ease forwards; }
        .now-blink { animation: nowPulse 1s ease-in-out infinite; }

        .task-row { display: flex; align-items: center; gap: 8px; padding: 6px 0; border-top: 1px solid rgba(255,255,255,0.06); }
        .task-row:first-child { border-top: none; }
        .complete-btn {
          width: 16px; height: 16px; border-radius: 50%; border: 1.5px solid rgba(255,255,255,0.2);
          flex-shrink: 0; display: flex; align-items: center; justify-content: center;
          cursor: pointer; background: none; transition: border-color 0.2s, background 0.2s;
        }
        .complete-btn:hover { border-color: #4ade80; background: rgba(74,222,128,0.1); }
        .complete-btn:hover .check-icon { opacity: 1; }
        .check-icon { opacity: 0; transition: opacity 0.15s; }

        .resize-grip {
          position: fixed; bottom: 0; right: 0; width: 22px; height: 22px;
          cursor: se-resize; display: flex; align-items: flex-end; justify-content: flex-end;
          padding: 4px; -webkit-app-region: no-drag; z-index: 100;
        }
        .resize-grip svg { opacity: 0.22; transition: opacity 0.2s; }
        .resize-grip:hover svg { opacity: 0.6; }
      `}</style>

      <div
        style={{
          width: "100vw", height: "100vh",
          display: "flex", flexDirection: "column",
          alignItems: "center", justifyContent: mode === "focus" ? "flex-start" : "center",
          paddingTop: mode === "focus" ? 8 : 0,
          gap: "clamp(4px, 2vh, 10px)",
          WebkitAppRegion: "drag",
          cursor: "grab",
          fontFamily: "-apple-system, BlinkMacSystemFont, sans-serif",
        } as React.CSSProperties}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        {/* Drag handle */}
        <div style={{
          display: "flex", gap: 4, alignItems: "center",
          opacity: hovered ? 0.5 : 0.18, transition: "opacity 0.2s ease", pointerEvents: "none",
        }}>
          {[0,1,2,3,4].map(i => (
            <div key={i} style={{ width: 4, height: 4, borderRadius: "50%", background: "white" }} />
          ))}
        </div>

        {/* Task list in focus mode */}
        {mode === "focus" && (
          <div
            className="slide-down"
            style={{
              width: "calc(100vw - 20px)",
              background: "rgba(255,255,255,0.06)",
              border: "1px solid rgba(255,255,255,0.09)",
              borderRadius: 16, padding: "10px 12px",
              WebkitAppRegion: "no-drag",
            } as React.CSSProperties}
          >
            {tasks.length === 0 ? (
              <p style={{ fontSize: 12, color: "rgba(255,255,255,0.3)", textAlign: "center", padding: "4px 0" }}>
                All done! 🎉
              </p>
            ) : tasks.map((t, i) => {
              const now   = isNow(t.due_date);
              const over  = isOverdueDay(t.due_date);
              const time  = t.due_date ? taskTime(t.due_date) : null;
              const color = over ? "#f87171" : now ? "#fb923c" : "rgba(255,255,255,0.85)";
              return (
                <div key={t.id} className="task-row">
                  {/* NOW blink dot */}
                  {now && (
                    <span className="now-blink" style={{
                      width: 6, height: 6, borderRadius: "50%", background: "#fb923c",
                      flexShrink: 0, display: "inline-block",
                    }} />
                  )}
                  {over && (
                    <span style={{
                      width: 6, height: 6, borderRadius: "50%", background: "#f87171",
                      flexShrink: 0, display: "inline-block",
                    }} />
                  )}

                  {/* Task title */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 12, fontWeight: 600, color, lineHeight: 1.3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {t.title}
                    </p>
                    {time && (
                      <p style={{ fontSize: 10, color: now ? "#fb923c" : over ? "#f87171" : "rgba(255,255,255,0.35)", marginTop: 1 }}>
                        {now ? "NOW · " : ""}{time}
                      </p>
                    )}
                  </div>

                  {/* Complete button */}
                  <button className="complete-btn" onClick={() => completeTask(t.id)}>
                    <Check className="check-icon" style={{ width: 9, height: 9, color: "#4ade80" }} />
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {/* Mic circle */}
        <button
          onClick={handleClick}
          style={{
            WebkitAppRegion: "no-drag",
            width: micSize, height: micSize,
            borderRadius: "50%", border: "none",
            cursor: phase === "processing" ? "wait" : "pointer",
            display: "flex", alignItems: "center", justifyContent: "center",
            position: "relative",
            background: bg, boxShadow: shadow,
            transition: "background 0.25s ease, box-shadow 0.25s ease, transform 0.15s ease, width 0.2s ease, height 0.2s ease",
            transform: hovered && phase === "idle" ? "scale(1.03)" : "scale(1)",
            outline: "none", flexShrink: 0,
          } as React.CSSProperties}
          className={phase === "error" ? "shake" : ""}
        >
          {phase === "listening" && <>
            <span className="ring1" style={{ position: "absolute", inset: 0, borderRadius: "50%", background: "rgba(239,68,68,0.3)" }} />
            <span className="ring2" style={{ position: "absolute", inset: 0, borderRadius: "50%", background: "rgba(239,68,68,0.18)" }} />
          </>}
          {phase === "processing" && (
            <span className="spin" style={{
              width: "24%", height: "24%", borderRadius: "50%", display: "block",
              border: "3px solid rgba(255,255,255,0.18)", borderTopColor: "rgba(255,255,255,0.9)",
            }} />
          )}
          {phase === "done"  && <Check className="pop" style={{ width: "30%", height: "30%", color: "white", strokeWidth: 2.5 }} />}
          {phase === "error" && <X style={{ width: "28%", height: "28%", color: "white", strokeWidth: 2.5 }} />}
          {(phase === "idle" || phase === "listening") && (
            <Mic style={{
              width: "30%", height: "30%", color: "white", strokeWidth: 2,
              filter: phase === "listening" ? "drop-shadow(0 0 6px rgba(255,255,255,0.6))" : "none",
              transition: "filter 0.2s",
            }} />
          )}
          {phase === "listening" && mode !== "focus" && (
            <span style={{
              position: "absolute", bottom: "14%", fontSize: "clamp(0px, 3vmin, 11px)",
              color: "rgba(255,255,255,0.75)", fontWeight: 500, letterSpacing: "0.05em", pointerEvents: "none",
            }}>
              tap to stop
            </span>
          )}
        </button>

        {/* Bottom row */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          width: "calc(100vw - 20px)", WebkitAppRegion: "no-drag",
        } as React.CSSProperties}>
          <div style={{
            fontSize: "clamp(0px, 2.2vmin, 10px)", color: "rgba(255,255,255,0.3)",
            fontWeight: 500, letterSpacing: "0.06em", pointerEvents: "none",
            height: "clamp(0px, 3vmin, 14px)", display: "flex", alignItems: "center",
          }}>
            {phase === "done"  ? "✓ saved" :
             phase === "error" ? "try again" :
             phase === "idle" && hovered ? (mode === "focus" ? "jd" : "click to speak") : ""}
          </div>

          <button
            onClick={toggleMode}
            title={mode === "focus" ? "Mic only" : "Focus mode"}
            style={{
              background: mode === "focus" ? "rgba(255,255,255,0.15)" : "rgba(255,255,255,0.07)",
              border: "none", borderRadius: 8, width: 24, height: 24,
              display: "flex", alignItems: "center", justifyContent: "center",
              cursor: "pointer", transition: "background 0.2s", opacity: hovered ? 1 : 0.45,
              position: "relative",
            }}
            onMouseEnter={e => (e.currentTarget.style.background = "rgba(255,255,255,0.2)")}
            onMouseLeave={e => (e.currentTarget.style.background = mode === "focus" ? "rgba(255,255,255,0.15)" : "rgba(255,255,255,0.07)")}
          >
            <ListTodo style={{ width: 12, height: 12, color: mode === "focus" ? "rgba(255,255,255,0.9)" : "rgba(255,255,255,0.5)" }} />
            {/* Badge: tasks with NOW */}
            {mode !== "focus" && tasks.some(t => isNow(t.due_date)) && (
              <span className="now-blink" style={{
                position: "absolute", top: 3, right: 3,
                width: 5, height: 5, borderRadius: "50%", background: "#fb923c",
              }} />
            )}
          </button>
        </div>
      </div>

      {/* Resize grip */}
      <div className="resize-grip">
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
          <circle cx="8" cy="8" r="1.2" fill="white"/>
          <circle cx="4.5" cy="8" r="1.2" fill="white"/>
          <circle cx="8" cy="4.5" r="1.2" fill="white"/>
        </svg>
      </div>
    </>
  );
}
