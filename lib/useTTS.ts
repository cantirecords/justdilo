"use client";
import { useCallback, useEffect, useRef } from "react";

// ── Shared AudioContext (must be created/resumed inside a user gesture) ────────
let sharedCtx: AudioContext | null = null;
let activeSource: AudioBufferSourceNode | null = null;

export function unlockAudio() {
  if (typeof window === "undefined") return;
  if (!sharedCtx) sharedCtx = new AudioContext();
  if (sharedCtx.state === "suspended") sharedCtx.resume();
}

// ── Language detection ─────────────────────────────────────────────────────────
function isSpanish(text: string): boolean {
  return /[¿¡áéíóúñüÁÉÍÓÚÑ]|\b(el|la|los|las|un|una|que|de|en|es|por|para|con|listo|guardé|tienes|tengo|hoy|mañana|semana|urgente|tareas|primero|vamos)\b/i.test(text);
}

// ── Split text at sentence boundaries so long responses never cut off ──────────
function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?…])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

// ── Play an MP3 ArrayBuffer through the shared AudioContext ───────────────────
async function playBuffer(buffer: ArrayBuffer): Promise<void> {
  if (!sharedCtx) sharedCtx = new AudioContext();
  if (sharedCtx.state === "suspended") await sharedCtx.resume();
  if ((sharedCtx.state as string) === "closed") return;

  let decoded: AudioBuffer;
  try {
    decoded = await sharedCtx.decodeAudioData(buffer.slice(0));
  } catch {
    return; // context was closed during decode or buffer was invalid
  }

  if (!sharedCtx || (sharedCtx.state as string) === "closed") return;

  return new Promise((resolve) => {
    const src = sharedCtx!.createBufferSource();
    src.buffer = decoded;
    src.connect(sharedCtx!.destination);
    src.onended = () => {
      if (activeSource === src) activeSource = null;
      resolve();
    };
    activeSource = src;
    src.start(0);
  });
}

// ── Best Web Speech voice for language ────────────────────────────────────────
function pickWebVoice(spanish: boolean): SpeechSynthesisVoice | null {
  const voices = window.speechSynthesis.getVoices();
  if (!voices.length) return null;
  const preferred = spanish
    ? ["Paulina", "Mónica", "Monica", "Luciana", "es-MX", "es-US", "es-ES"]
    : ["Samantha", "Karen", "Moira", "Ava", "Google US English", "en-US"];
  for (const hint of preferred) {
    const v = voices.find((v) => v.name.includes(hint) || v.lang.startsWith(hint));
    if (v) return v;
  }
  return voices.find((v) => v.lang.startsWith(spanish ? "es" : "en")) ?? null;
}

// ── Speak one sentence via Web Speech API, waiting for it to fully end ────────
function speakWebSentence(sentence: string, spanish: boolean): Promise<void> {
  return new Promise((resolve) => {
    const utt = new SpeechSynthesisUtterance(sentence);
    utt.rate = 0.93;
    utt.lang = spanish ? "es-MX" : "en-US";

    const setVoice = () => {
      const v = pickWebVoice(spanish);
      if (v) utt.voice = v;
    };
    if (window.speechSynthesis.getVoices().length > 0) setVoice();
    else window.speechSynthesis.addEventListener("voiceschanged", setVoice, { once: true });

    utt.onend = () => resolve();
    utt.onerror = () => resolve();
    window.speechSynthesis.speak(utt);
  });
}

// ── Main hook ─────────────────────────────────────────────────────────────────
export function useTTS() {
  const stopRef = useRef(false);

  // Fix iOS Safari: resume paused synthesis when tab becomes visible again
  useEffect(() => {
    function onVisible() {
      if (document.visibilityState === "visible") {
        if (sharedCtx?.state === "suspended") sharedCtx.resume();
        if (window.speechSynthesis?.paused) window.speechSynthesis.resume();
      }
    }
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, []);

  useEffect(() => () => { stopRef.current = true; window.speechSynthesis?.cancel(); }, []);

  const speak = useCallback(async (text: string) => {
    if (!text.trim()) return;
    stopRef.current = false;
    window.speechSynthesis?.cancel();

    const spanish = isSpanish(text);
    const sentences = splitSentences(text);

    for (const sentence of sentences) {
      if (stopRef.current) break;

      // ── Try server TTS (natural neural voice) ──
      try {
        const res = await fetch("/api/tts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: sentence }),
        });
        if (res.ok) {
          const buf = await res.arrayBuffer();
          if (!stopRef.current) await playBuffer(buf);
          continue;
        }
      } catch {
        // server TTS failed — fall through to Web Speech
      }

      // ── Fallback: Web Speech API ──
      if (!stopRef.current && typeof window !== "undefined" && "speechSynthesis" in window) {
        await speakWebSentence(sentence, spanish);
      }
    }
  }, []);

  const stop = useCallback(() => {
    stopRef.current = true;
    window.speechSynthesis?.cancel();
    // Stop active source first — fires onended, resolving any awaited speak()
    if (activeSource) {
      try { activeSource.stop(); } catch {}
      activeSource = null;
    }
    // Reset AudioContext so next speak() starts completely fresh (original behavior)
    if (sharedCtx) {
      sharedCtx.close().catch(() => {});
      sharedCtx = null;
    }
  }, []);

  return { speak, stop };
}
