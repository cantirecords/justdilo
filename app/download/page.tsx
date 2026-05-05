'use client';

import { useState, useEffect } from 'react';

// Update these URLs after uploading your builds to GitHub Releases (or Vercel Blob)
const RELEASES = {
  mac: 'https://github.com/cantirecords/justdilo/releases/latest/download/JustDilo-mac.dmg',
  win: 'https://github.com/cantirecords/justdilo/releases/latest/download/JustDilo-win-Setup.exe',
};

type OS = 'mac' | 'win' | 'other';

function detectOS(): OS {
  if (typeof navigator === 'undefined') return 'other';
  const ua = navigator.userAgent;
  if (ua.includes('Mac OS')) return 'mac';
  if (ua.includes('Win')) return 'win';
  return 'other';
}

export default function DownloadPage() {
  const [os, setOS] = useState<OS>('other');

  useEffect(() => {
    setOS(detectOS());
  }, []);

  return (
    <main className="min-h-screen bg-[#0a0a0a] text-white flex flex-col items-center justify-center px-6 py-20">
      {/* Logo */}
      <div className="mb-6 flex flex-col items-center gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/icons/icon-128.png" alt="JustDilo" className="w-20 h-20 rounded-2xl" />
        <h1 className="text-3xl font-bold tracking-tight">JustDilo</h1>
        <p className="text-white/50 text-sm">Speak it. Done.</p>
      </div>

      {/* Primary download — auto-detected platform */}
      {os !== 'other' && (
        <a
          href={RELEASES[os]}
          className="mt-4 flex items-center gap-3 bg-white text-black font-semibold text-base px-8 py-4 rounded-2xl hover:bg-white/90 transition"
        >
          {os === 'mac' ? <AppleIcon /> : <WindowsIcon />}
          Download for {os === 'mac' ? 'macOS' : 'Windows'}
        </a>
      )}

      {/* Both options always visible */}
      <div className="mt-6 flex flex-col sm:flex-row gap-3">
        <DownloadButton
          href={RELEASES.mac}
          icon={<AppleIcon />}
          label="macOS"
          sub=".dmg · Intel &amp; Apple Silicon"
          highlight={os === 'mac'}
        />
        <DownloadButton
          href={RELEASES.win}
          icon={<WindowsIcon />}
          label="Windows"
          sub=".exe · 64-bit"
          highlight={os === 'win'}
        />
      </div>

      {/* Requirements */}
      <p className="mt-10 text-white/30 text-xs text-center max-w-xs leading-relaxed">
        macOS 12 Monterey or later &nbsp;·&nbsp; Windows 10/11 64-bit
        <br />
        Microphone access required for voice input.
      </p>

      {/* Web app fallback */}
      <a
        href="/"
        className="mt-8 text-white/40 text-sm underline underline-offset-4 hover:text-white/70 transition"
      >
        Use JustDilo in your browser instead →
      </a>
    </main>
  );
}

function DownloadButton({
  href,
  icon,
  label,
  sub,
  highlight,
}: {
  href: string;
  icon: React.ReactNode;
  label: string;
  sub: string;
  highlight: boolean;
}) {
  return (
    <a
      href={href}
      className={`flex items-center gap-3 px-6 py-3.5 rounded-xl border transition ${
        highlight
          ? 'border-white/20 bg-white/5 hover:bg-white/10'
          : 'border-white/10 hover:border-white/20 hover:bg-white/5'
      }`}
    >
      <span className="text-white/60">{icon}</span>
      <span className="flex flex-col">
        <span className="text-sm font-medium">{label}</span>
        <span
          className="text-xs text-white/40"
          dangerouslySetInnerHTML={{ __html: sub }}
        />
      </span>
    </a>
  );
}

function AppleIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
      <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98l-.09.06c-.22.14-2.2 1.32-2.18 3.93.03 3.13 2.73 4.17 2.76 4.18l-.13.47zM13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z" />
    </svg>
  );
}

function WindowsIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
      <path d="M0 3.449L9.75 2.1v9.451H0m10.949-9.602L24 0v11.4H10.949M0 12.6h9.75v9.451L0 20.699M10.949 12.6H24V24l-12.9-1.801" />
    </svg>
  );
}
