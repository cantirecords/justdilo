"use client";
import { useEffect, useRef } from "react";

export default function FloatingWidget() {
  const popupRef = useRef<Window | null>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === "d")) return;
      e.preventDefault();

      if (popupRef.current && !popupRef.current.closed) {
        popupRef.current.focus();
        return;
      }

      // Position in bottom-right corner of the current screen
      const w = 280;
      const h = 460;
      const left = window.screen.availWidth - w - 20;
      const top = window.screen.availHeight - h - 40;

      popupRef.current = window.open(
        "/widget",
        "justdilo-widget",
        `width=${w},height=${h},left=${left},top=${top},toolbar=no,menubar=no,scrollbars=no,resizable=yes,location=no,status=no`,
      );
    }

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return null;
}

/*
  Electron/Tauri upgrade: replace window.open() with:
  - Electron: new BrowserWindow({ width: 280, height: 460, alwaysOnTop: true, frame: false, transparent: true })
  - Tauri: WebviewWindow with alwaysOnTop: true and decorations: false
  Register CMD+SHIFT+D as a global OS shortcut via globalShortcut (Electron) or ShortcutManager (Tauri).
*/
