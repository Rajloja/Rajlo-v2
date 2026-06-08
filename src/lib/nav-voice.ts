"use client";

/**
 * Web Speech API wrapper for turn-by-turn voice prompts.
 *
 * Behaviour:
 *   - `speak()` cancels any currently-queued utterance before
 *     starting the new one. Nav prompts should never stack — if the
 *     driver is hearing "In 200 meters, turn right" and we're about
 *     to say "Now turn right", the second one wins.
 *   - `setMuted(true)` persists to localStorage and cancels any
 *     in-flight speech. `setMuted(false)` does NOT replay the last
 *     prompt — the next legitimate trigger fires on its own schedule.
 *   - Voice selection picks the first English voice available, falling
 *     back to the platform default. Most Android Capacitor WebViews
 *     surface Google's TTS voices; iOS will surface Siri voices when
 *     we ship to iOS.
 *
 * SSR-safe: every function checks for `window` / `speechSynthesis`.
 */

const STORAGE_KEY = "rajlo_nav_voice_muted";

/** True if the browser's speech synthesis is usable. */
function isAvailable(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.speechSynthesis !== "undefined"
  );
}

/** Read persisted mute state. Defaults to FALSE (voice on) — drivers
 *  expect a navigation app to talk by default, like Google Maps and
 *  Uber. They can mute via the floating button if they prefer. */
export function isMuted(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

/** Persist mute state. Side-effect: cancels any in-flight utterance
 *  when muting so the driver doesn't have to listen to the rest of
 *  the prompt that was already mid-sentence. */
export function setMuted(muted: boolean): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, muted ? "1" : "0");
  } catch {
    /* localStorage unavailable — accept it */
  }
  if (muted) cancel();
}

/** Cached preferred voice. Picked lazily because voices load async
 *  on some platforms (Chrome fires "voiceschanged" after the first
 *  getVoices() call returns an empty list). */
let preferredVoice: SpeechSynthesisVoice | null = null;
let voiceLookupDone = false;

function pickVoice(): SpeechSynthesisVoice | null {
  if (!isAvailable()) return null;
  if (voiceLookupDone) return preferredVoice;
  const voices = window.speechSynthesis.getVoices();
  if (voices.length === 0) {
    // Voices aren't ready yet — defer the pick. We'll retry on the
    // next speak() call.
    return null;
  }
  voiceLookupDone = true;
  // Prefer en-US, then en-anything, then default.
  preferredVoice =
    voices.find((v) => v.lang === "en-US") ??
    voices.find((v) => v.lang.startsWith("en")) ??
    voices.find((v) => v.default) ??
    voices[0] ??
    null;
  return preferredVoice;
}

/** Speak a prompt. No-op when muted, when speech synthesis isn't
 *  available, or when called on the server. Cancels any prior
 *  utterance so prompts don't stack. */
export function speak(text: string): void {
  if (!isAvailable()) return;
  if (isMuted()) return;
  if (!text.trim()) return;
  try {
    const synth = window.speechSynthesis;
    // Cancel anything currently speaking or queued. Without this,
    // rapidly-fired prompts stack up and the driver gets a stale
    // instruction read out 10 seconds after they passed the turn.
    synth.cancel();
    const utter = new SpeechSynthesisUtterance(text);
    const voice = pickVoice();
    if (voice) utter.voice = voice;
    utter.rate = 1.05; // very slightly faster than default — feels more confident
    utter.pitch = 1.0;
    utter.volume = 1.0;
    synth.speak(utter);
  } catch {
    /* swallow — speech synthesis errors are non-fatal */
  }
}

/** Cancel any speaking / queued utterance immediately. */
export function cancel(): void {
  if (!isAvailable()) return;
  try {
    window.speechSynthesis.cancel();
  } catch {
    /* swallow */
  }
}
