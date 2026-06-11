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

      // Only fire once per day per type — survive app restarts
      const today = new Date().toDateString();
      const storageKey = `dilo_notif_${type}_${today}`;
      if (localStorage.getItem(storageKey)) return;

      try {
        const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
        const res = await fetch(`/api/push/content?type=${type}&tz=${encodeURIComponent(tz)}`);
        if (!res.ok) return;
        const { title, body } = await res.json();
        if (title && body) {
          new Notification(title, { body, icon: "/icons/icon-128.png" });
          localStorage.setItem(storageKey, "1");
        }
      } catch {}
    }

    check();
    const interval = setInterval(check, 60 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  return null;
}
