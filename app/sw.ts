import type { PrecacheEntry, SerwistGlobalConfig } from "serwist";
import { Serwist, NetworkFirst, CacheFirst } from "serwist";

declare global {
  interface ServiceWorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: [
    {
      // API routes — network first, fall back to cache
      matcher: /^\/api\//,
      handler: new NetworkFirst({
        cacheName: "api-cache",
        networkTimeoutSeconds: 10,
        plugins: [{ cacheWillUpdate: async ({ response }) => (response?.status === 200 ? response : null) }],
      }),
    },
    {
      // Static assets — cache first, long TTL
      matcher: /\.(?:png|jpg|jpeg|svg|gif|webp|ico|woff2?)$/,
      handler: new CacheFirst({
        cacheName: "static-assets",
      }),
    },
    {
      // Pages — network first so new deploys are served immediately
      matcher: ({ request }) => request.mode === "navigate",
      handler: new NetworkFirst({
        cacheName: "pages-cache",
        networkTimeoutSeconds: 5,
      }),
    },
  ],
});

serwist.addEventListeners();

// Push notifications — cast to any to avoid missing SW lib types
const swSelf = self as any;

swSelf.addEventListener("push", (event: any) => {
  if (!event.data) return;
  const { title, body, url } = event.data.json() as { title: string; body: string; url: string };
  event.waitUntil(
    swSelf.registration.showNotification(title, {
      body,
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-96.png",
      data: { url },
      vibrate: [100, 50, 100],
    }),
  );
});

swSelf.addEventListener("notificationclick", (event: any) => {
  event.notification.close();
  const url = (event.notification.data?.url as string) ?? "/";
  event.waitUntil(
    swSelf.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clients: any[]) => {
        const existing = clients.find((c: any) => c.url.includes(url));
        if (existing) return existing.focus();
        return swSelf.clients.openWindow(url);
      }),
  );
});
