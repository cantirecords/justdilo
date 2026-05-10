"use client";
import { useEffect } from "react";

// Runs only inside the Electron desktop app.
// Polls every hour and fires a native OS notification at morning (6-10am)
// and evening (7-10pm) local time, using the user's real task data.
export default function ElectronNotifier() {
  useEffect(() => {
    if (typeof navigator === "undefined") return;
    if (!navigator.userAgent.includes("Electron")) return;
    if (Notification.permission !== "granted") return;

    async function check() {
      const hour = new Date().getHours();
      const isMorning = hour >= 6 && hour <= 10;
      const isEvening = hour >= 19 && hour <= 22;
      if (!isMorning && !isEvening) return;

      const type = isMorning ? "morning" : "evening";
      try {
        const res = await fetch(`/api/push/content?type=${type}`);
        if (!res.ok) return;
        const { title, body } = await res.json();
        // content endpoint returns message only — no web push sent, no double notification on mobile
        if (title && body) new Notification(title, { body, icon: "/icons/icon-128.png" });
      } catch {}
    }

    check();
    const interval = setInterval(check, 60 * 60 * 1000); // every hour
    return () => clearInterval(interval);
  }, []);

  return null;
}
