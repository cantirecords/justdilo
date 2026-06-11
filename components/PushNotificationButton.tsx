"use client";
import { useEffect, useState } from "react";
import { Bell, BellOff, Loader2, Monitor } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

const isElectron = () =>
  typeof navigator !== "undefined" && navigator.userAgent.includes("Electron");

export default function PushNotificationButton() {
  const [state, setState] = useState<"loading" | "unsupported" | "denied" | "subscribed" | "unsubscribed">("loading");

  useEffect(() => {
    // In Electron, use native OS notifications — no push server needed
    if (isElectron()) {
      if (Notification.permission === "granted") setState("subscribed");
      else if (Notification.permission === "denied") setState("denied");
      else setState("unsubscribed");
      return;
    }

    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
      setState("unsupported");
      return;
    }
    if (Notification.permission === "denied") { setState("denied"); return; }

    navigator.serviceWorker.ready.then((reg) =>
      reg.pushManager.getSubscription().then((sub) => {
        setState(sub ? "subscribed" : "unsubscribed");
        // Self-heal: re-save this device's timezone. Rows from before the
        // timezone column (or from moved devices) read as UTC, which made
        // notification times render in UTC instead of local time.
        const keys = sub?.toJSON().keys;
        if (sub && keys?.p256dh && keys?.auth) {
          fetch("/api/push/subscribe", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              endpoint: sub.endpoint,
              keys: { p256dh: keys.p256dh, auth: keys.auth },
              timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
            }),
          }).catch(() => {});
        }
      }),
    );
  }, []);

  async function toggle() {
    // Electron path — just toggle native notification permission
    if (isElectron()) {
      if (state === "subscribed") {
        setState("unsubscribed");
        toast("Notifications off");
      } else {
        setState("loading");
        const permission = await Notification.requestPermission();
        if (permission === "granted") {
          setState("subscribed");
          window.dispatchEvent(new Event("justdilo:push-subscribed"));
          toast.success("You'll get system alerts for your tasks");
          new Notification("JustDilo", { body: "Notifications are on!" });
        } else {
          setState("denied");
          toast.error("Notifications blocked in system settings");
        }
      }
      return;
    }

    // Browser path — web push
    if (state === "subscribed") {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await fetch("/api/push/subscribe", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        });
        await sub.unsubscribe();
      }
      setState("unsubscribed");
      toast("Notifications off");
      return;
    }

    setState("loading");
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") { setState("denied"); toast.error("Notifications blocked"); return; }

      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!),
      });

      await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          endpoint: sub.endpoint,
          keys: { p256dh: sub.toJSON().keys!.p256dh, auth: sub.toJSON().keys!.auth },
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        }),
      });

      setState("subscribed");
      window.dispatchEvent(new Event("justdilo:push-subscribed"));
      toast.success("You'll get a daily reminder for tasks due today");
    } catch {
      setState("unsubscribed");
      toast.error("Couldn't enable notifications");
    }
  }

  // Allow other components (e.g. PushPrimer) to trigger the same subscribe flow
  useEffect(() => {
    function onRequest() {
      if (state === "unsubscribed") toggle();
    }
    window.addEventListener("justdilo:request-push", onRequest);
    return () => window.removeEventListener("justdilo:request-push", onRequest);
  }, [state]);

  if (state === "unsupported" || state === "denied") return null;

  return (
    <button
      onClick={toggle}
      disabled={state === "loading"}
      className={cn(
        "p-1.5 rounded-full transition",
        state === "subscribed"
          ? "text-yellow-500 hover:text-yellow-600"
          : "text-muted-foreground hover:text-foreground",
      )}
      title={
        isElectron()
          ? state === "subscribed" ? "Turn off system alerts" : "Turn on system alerts"
          : state === "subscribed" ? "Turn off reminders" : "Turn on daily reminders"
      }
    >
      {state === "loading" ? (
        <Loader2 className="w-4 h-4 animate-spin" />
      ) : isElectron() && state !== "subscribed" ? (
        <Monitor className="w-4 h-4" />
      ) : state === "subscribed" ? (
        <Bell className="w-4 h-4" />
      ) : (
        <BellOff className="w-4 h-4" />
      )}
    </button>
  );
}
