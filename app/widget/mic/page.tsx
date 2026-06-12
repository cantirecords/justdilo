"use client";
import { useLayoutEffect, useRef, useState } from "react";
import { Mic, Check, X, ListTodo, LogIn } from "lucide-react";
import { electronAPI, openMainApp } from "@/lib/electron-api";
import { useWidgetTasks } from "@/lib/useWidgetTasks";
import { useVoiceRecorder } from "@/lib/useVoiceRecorder";
import { isDueNow, isOverdue, dueTime } from "@/lib/widget-dates";

type Mode = "mic" | "focus";

const MIC_SIZE = 160;

export default function MicWidget() {
  const [hovered, setHovered] = useState(false);
  const [mode, setMode] = useState<Mode>("mic");
  const contentRef = useRef<HTMLDivElement | null>(null);

  const { tasks, auth, load, complete } = useWidgetTasks({ urgentOnly: true, limit: 6 });
  const { phase, toggle } = useVoiceRecorder(() => load());
  const signedOut = auth === "signedOut";

  // Focus mode: size the window to the actual rendered content. The old
  // row-height formula overshot, leaving a tall invisible (but draggable)
  // strip that blocked clicks on windows underneath the widget.
  useLayoutEffect(() => {
    if (mode !== "focus") return;
    const el = contentRef.current;
    if (!el) return;
    const w = Math.max(window.innerWidth, MIC_SIZE);
    const h = Math.min(Math.max(el.offsetHeight + 16, 180), 600);
    if (Math.abs(window.innerHeight - h) > 4) electronAPI()?.resizeWindow(w, h);
  }, [mode, tasks.length, auth]);

  async function toggleMode() {
    const next: Mode = mode === "mic" ? "focus" : "mic";
    setMode(next);
    if (next === "mic") {
      // Square window, preserving whatever width the user resized to.
      const w = Math.max(window.innerWidth, MIC_SIZE);
      await electronAPI()?.resizeWindow(w, w);
    }
  }

  function handleClick() {
    if (signedOut) { openMainApp(); return; }
    toggle();
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
          WebkitAppRegion: "drag",
          cursor: "grab",
          fontFamily: "-apple-system, BlinkMacSystemFont, sans-serif",
        } as React.CSSProperties}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        <div
          ref={contentRef}
          style={{
            display: "flex", flexDirection: "column", alignItems: "center",
            paddingTop: mode === "focus" ? 8 : 0,
            gap: "clamp(4px, 2vh, 10px)",
            width: "100%",
          }}
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
              {signedOut ? (
                <p style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", textAlign: "center", padding: "4px 0" }}>
                  Sign in to see tasks
                </p>
              ) : tasks.length === 0 ? (
                <p style={{ fontSize: 12, color: "rgba(255,255,255,0.3)", textAlign: "center", padding: "4px 0" }}>
                  All done! 🎉
                </p>
              ) : tasks.map(t => {
                const now   = isDueNow(t.due_date);
                const over  = isOverdue(t.due_date);
                const time  = t.due_date ? dueTime(t.due_date) : null;
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
                      {(time || over) && (
                        <p style={{ fontSize: 10, color: now ? "#fb923c" : over ? "#f87171" : "rgba(255,255,255,0.35)", marginTop: 1 }}>
                          {over ? "overdue" : now ? `NOW · ${time}` : time}
                        </p>
                      )}
                    </div>

                    {/* Complete button */}
                    <button className="complete-btn" onClick={() => complete(t.id)}>
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
              signedOut ? (
                <LogIn style={{ width: "26%", height: "26%", color: "white", strokeWidth: 2 }} />
              ) : (
                <Mic style={{
                  width: "30%", height: "30%", color: "white", strokeWidth: 2,
                  filter: phase === "listening" ? "drop-shadow(0 0 6px rgba(255,255,255,0.6))" : "none",
                  transition: "filter 0.2s",
                }} />
              )
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
               signedOut && hovered ? "sign in" :
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
              {/* Badge: tasks due NOW */}
              {mode !== "focus" && tasks.some(t => isDueNow(t.due_date)) && (
                <span className="now-blink" style={{
                  position: "absolute", top: 3, right: 3,
                  width: 5, height: 5, borderRadius: "50%", background: "#fb923c",
                }} />
              )}
            </button>
          </div>
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
