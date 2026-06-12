import type { Metadata } from "next";
import "../globals.css";

export const metadata: Metadata = {
  title: "JustDilo",
};

// Root layout for the floating desktop widget windows. Deliberately minimal:
// no service worker, feature flags, or global toaster — those belong to the
// main app window only. The body stays transparent so the frameless Electron
// window shows the desktop through it.
export default function WidgetLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="bg-transparent">
      <head>
        {/* apply saved theme before first paint to prevent flash */}
        <script dangerouslySetInnerHTML={{ __html: `(function(){var t=localStorage.getItem('theme');if(t==='dark'||(!t&&window.matchMedia('(prefers-color-scheme: dark)').matches)){document.documentElement.classList.add('dark');}})();` }} />
      </head>
      <body className="overflow-hidden !bg-transparent">{children}</body>
    </html>
  );
}
