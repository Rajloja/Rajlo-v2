"use client";

/**
 * Lightweight Web-Audio tones for call lifecycle events. No asset
 * downloads — the tones are synthesised on demand so they work
 * identically in the browser, the Capacitor WebView, and offline.
 *
 *   • playConnectTone() — short ascending two-tone "tee-doo" played
 *     to both sides the moment a remote participant joins. Same
 *     cue WhatsApp / FaceTime use to confirm "the other side picked
 *     up — start talking".
 *
 *   • playHangupTone() — falling "doo-dat" played when either side
 *     hangs up. Closes the call audibly so the user doesn't keep
 *     talking into a dead mic.
 *
 *   • playBusyTone() — single low beep for missed / declined.
 *
 * Each function is fire-and-forget. We construct a fresh
 * AudioContext per invocation because keeping one alive across page
 * navigations leaks; the tones are short enough that startup cost
 * is negligible.
 */

const AudioCtx =
  typeof window !== "undefined"
    ? window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext
    : null;

async function beep(
  ctx: AudioContext,
  freq: number,
  durationS: number,
  startAt: number = 0,
  peakGain = 0.18,
): Promise<void> {
  return new Promise((resolve) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = freq;
    const t0 = ctx.currentTime + startAt;
    gain.gain.setValueAtTime(0, t0);
    gain.gain.linearRampToValueAtTime(peakGain, t0 + 0.02);
    gain.gain.linearRampToValueAtTime(0, t0 + durationS);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t0);
    osc.stop(t0 + durationS + 0.02);
    osc.onended = () => resolve();
  });
}

export function playConnectTone(): void {
  if (!AudioCtx) return;
  try {
    const ctx = new AudioCtx();
    // Two ascending beeps — A4 → E5 over ~280ms total.
    void Promise.all([
      beep(ctx, 440, 0.12, 0),
      beep(ctx, 659.25, 0.14, 0.13),
    ]).finally(() => {
      // Give the context a beat to flush before tearing down.
      setTimeout(() => void ctx.close(), 350);
    });
  } catch {
    /* swallow — autoplay policy or no audio device */
  }
}

export function playHangupTone(): void {
  if (!AudioCtx) return;
  try {
    const ctx = new AudioCtx();
    // Two descending beeps — E5 → A4 over ~260ms. Symmetric to the
    // connect tone so the call's start/end feel like the same
    // gesture inverted.
    void Promise.all([
      beep(ctx, 659.25, 0.12, 0),
      beep(ctx, 440, 0.14, 0.13),
    ]).finally(() => {
      setTimeout(() => void ctx.close(), 350);
    });
  } catch {
    /* swallow */
  }
}

export function playBusyTone(): void {
  if (!AudioCtx) return;
  try {
    const ctx = new AudioCtx();
    // Single short low beep — the "they didn't pick up" cue.
    void beep(ctx, 330, 0.5, 0, 0.14).finally(() => {
      setTimeout(() => void ctx.close(), 200);
    });
  } catch {
    /* swallow */
  }
}
