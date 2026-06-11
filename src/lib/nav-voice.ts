"use client";

/**
 * Turn-by-turn voice prompts.
 *
 * Primary path: Web Speech API (`window.speechSynthesis`). Works on
 * every modern browser AND on the Capacitor Android WebView when the
 * device has an active TTS engine (Google TTS, Samsung TTS, etc).
 *
 * Reliability path: if the optional Capacitor plugin
 * `@capacitor-community/text-to-speech` is installed, we use it
 * INSTEAD of Web Speech on native — that plugin talks directly to
 * the Android TTS service and works even when the WebView's JS
 * speechSynthesis is unreliable (which it often is on Samsung One UI).
 *
 * Behavior:
 *   - `speak()` cancels any in-flight utterance before starting the
 *     new one. Nav prompts never stack — if we're saying "In 200m,
 *     turn right" and we're about to say "Now turn right", the new
 *     one wins.
 *   - `setMuted(true)` persists and cancels any current speech.
 *   - Voice selection picks a US English voice when available.
 *
 * SSR-safe: every function checks for window before touching it.
 *
 * Diagnostic: every call logs `[nav-voice]` to console so adb logcat
 * shows the path actually being used + the text being read.
 */

const STORAGE_KEY = "rajlo_nav_voice_muted";
const LOG_TAG = "[nav-voice]";

/** True if the browser's speech synthesis is usable. */
function isWebSpeechAvailable(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.speechSynthesis !== "undefined"
  );
}

/** Read persisted mute state. Defaults to FALSE (voice on). */
export function isMuted(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

/** Persist mute state; cancel any in-flight utterance when muting. */
export function setMuted(muted: boolean): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, muted ? "1" : "0");
  } catch {
    /* localStorage unavailable — accept it */
  }
  if (muted) cancel();
}

/* ─────────────── Capacitor TTS plugin path (preferred on native) ─────────────── */

/** Capacitor TTS plugin lookup.
 *
 *  Two detection paths, in order:
 *    1. Dynamic ES-module import of `@capacitor-community/text-to-speech`.
 *       This is the documented usage pattern for the plugin and the
 *       most reliable detection — Capacitor's `registerPlugin()` exports
 *       the live plugin object directly. Dynamic-import keeps the
 *       package out of the web bundle.
 *    2. Fallback to the global `window.Capacitor.Plugins.TextToSpeech`
 *       for older Capacitor versions / SSR-loaded contexts where the
 *       ES-module path isn't available yet.
 *
 *  Resolved lazily and cached so the first speak() call doesn't pay
 *  the import cost on every word. */
type CapTts = {
  speak: (opts: {
    text: string;
    lang?: string;
    rate?: number;
    pitch?: number;
    volume?: number;
  }) => Promise<void>;
  stop: () => Promise<void>;
};
let capTtsCached: CapTts | null = null;
let capTtsPromise: Promise<CapTts | null> | null = null;

function isNative(): boolean {
  if (typeof window === "undefined") return false;
  const cap = (
    window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }
  ).Capacitor;
  return !!cap?.isNativePlatform?.();
}

async function resolveCapTts(): Promise<CapTts | null> {
  if (capTtsCached) return capTtsCached;
  if (!isNative()) return null;

  // Path 1 — proper ES-module import. This is what
  // `@capacitor-community/text-to-speech` exports.
  try {
    const mod = (await import(
      "@capacitor-community/text-to-speech"
    )) as { TextToSpeech?: CapTts };
    if (mod.TextToSpeech) {
      capTtsCached = mod.TextToSpeech;
      // eslint-disable-next-line no-console
      console.log(`${LOG_TAG} using Capacitor TTS plugin (ES import)`);
      return capTtsCached;
    }
  } catch {
    /* plugin not installed yet — fall through to the global lookup */
  }

  // Path 2 — legacy global. Some older registrations land here.
  const cap = (
    window as unknown as { Capacitor?: { Plugins?: { TextToSpeech?: CapTts } } }
  ).Capacitor;
  const tts = cap?.Plugins?.TextToSpeech ?? null;
  if (tts) {
    capTtsCached = tts;
    // eslint-disable-next-line no-console
    console.log(`${LOG_TAG} using Capacitor TTS plugin (window.Capacitor)`);
  }
  return capTtsCached;
}

function getCapTts(): Promise<CapTts | null> {
  if (capTtsPromise) return capTtsPromise;
  capTtsPromise = resolveCapTts();
  return capTtsPromise;
}

/** Diagnostic-only — returns the resolved Capacitor TTS plugin handle
 *  (or null) so the driver settings page's "Test voice" button can
 *  probe + report whether the native path is even available. Not
 *  intended for production speech — use `speak()` for that. */
export function debugGetCapacitorTts(): Promise<CapTts | null> {
  return getCapTts();
}

/* ─────────────── Web Speech voice picking ─────────────── */

let preferredVoice: SpeechSynthesisVoice | null = null;
let voicesReadyPromise: Promise<void> | null = null;

/** Returns a promise that resolves once the browser has loaded its
 *  voice list. Some Android WebViews return an empty getVoices() on
 *  first call and only populate after the `voiceschanged` event. */
function whenVoicesReady(): Promise<void> {
  if (voicesReadyPromise) return voicesReadyPromise;
  voicesReadyPromise = new Promise<void>((resolve) => {
    if (!isWebSpeechAvailable()) {
      resolve();
      return;
    }
    const synth = window.speechSynthesis;
    if (synth.getVoices().length > 0) {
      resolve();
      return;
    }
    const handler = () => {
      synth.removeEventListener("voiceschanged", handler);
      resolve();
    };
    synth.addEventListener("voiceschanged", handler);
    // Safety timeout — some WebViews never fire the event. After 2s
    // resolve anyway; we'll fall back to the default voice (or no voice).
    setTimeout(() => {
      synth.removeEventListener("voiceschanged", handler);
      resolve();
    }, 2000);
  });
  return voicesReadyPromise;
}

function pickVoice(): SpeechSynthesisVoice | null {
  if (preferredVoice) return preferredVoice;
  if (!isWebSpeechAvailable()) return null;
  const voices = window.speechSynthesis.getVoices();
  if (voices.length === 0) return null;
  preferredVoice =
    voices.find((v) => v.lang === "en-US") ??
    voices.find((v) => v.lang.startsWith("en")) ??
    voices.find((v) => v.default) ??
    voices[0] ??
    null;
  if (preferredVoice) {
    // eslint-disable-next-line no-console
    console.log(`${LOG_TAG} picked Web Speech voice: ${preferredVoice.name} (${preferredVoice.lang})`);
  }
  return preferredVoice;
}

/* ─────────────── Public API ─────────────── */

/** Speak a prompt. No-op when muted / unsupported / called server-side.
 *  Cancels any prior utterance so prompts don't stack. */
export async function speak(text: string): Promise<void> {
  if (typeof window === "undefined") return;
  if (isMuted()) return;
  const trimmed = text.trim();
  if (!trimmed) return;

  // Capacitor TTS plugin (preferred on Android if installed).
  const capTts = await getCapTts();
  if (capTts) {
    try {
      // Stop any in-flight utterance first so prompts don't stack.
      await capTts.stop().catch(() => null);
      await capTts.speak({
        text: trimmed,
        lang: "en-US",
        rate: 1.05,
        pitch: 1.0,
        volume: 1.0,
      });
      // eslint-disable-next-line no-console
      console.log(`${LOG_TAG} spoke via Capacitor TTS: "${trimmed}"`);
      return;
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn(`${LOG_TAG} Capacitor TTS failed, falling back to Web Speech:`, err);
    }
  }

  // Web Speech API fallback.
  if (!isWebSpeechAvailable()) {
    // eslint-disable-next-line no-console
    console.warn(`${LOG_TAG} no TTS available (Web Speech missing + Capacitor plugin not installed)`);
    return;
  }
  await whenVoicesReady();
  try {
    const synth = window.speechSynthesis;
    synth.cancel();
    const utter = new SpeechSynthesisUtterance(trimmed);
    const voice = pickVoice();
    if (voice) utter.voice = voice;
    utter.rate = 1.05;
    utter.pitch = 1.0;
    utter.volume = 1.0;
    utter.lang = "en-US";
    utter.onerror = (e) => {
      // eslint-disable-next-line no-console
      console.warn(`${LOG_TAG} Web Speech error:`, e.error);
    };
    synth.speak(utter);
    // eslint-disable-next-line no-console
    console.log(`${LOG_TAG} spoke via Web Speech: "${trimmed}"`);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn(`${LOG_TAG} Web Speech failed:`, err);
  }
}

/** Cancel any speaking / queued utterance immediately. */
export function cancel(): void {
  // Fire-and-forget — the lookup is cheap if already resolved.
  void getCapTts().then((capTts) => {
    if (capTts) void capTts.stop().catch(() => null);
  });
  if (isWebSpeechAvailable()) {
    try {
      window.speechSynthesis.cancel();
    } catch {
      /* swallow */
    }
  }
}

/**
 * Warm up the TTS engine. Some Android WebViews need a "primer" call
 * (often inside a user gesture) before subsequent speak() calls
 * actually produce audio. Call this once when the driver page mounts.
 *
 * Side-effect free if voice is already working OR if muted.
 */
export async function warmup(): Promise<void> {
  if (typeof window === "undefined") return;
  if (isMuted()) return;
  // Trigger the voiceschanged-wait path eagerly so the first real
  // speak() doesn't have to.
  void whenVoicesReady();
  // Resolve the Capacitor plugin lookup so the cached promise is
  // warm before the first incoming prompt. Fire-and-forget — the
  // call site doesn't need to await.
  void getCapTts();
}
