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

/**
 * Outgoing ringback tone — plays continuously on the CALLER side while
 * the call is dialing/ringing waiting for the callee to answer.
 *
 * Pattern is the classic North American ringback (440 Hz + 480 Hz mixed,
 * 2 seconds on, 4 seconds off, looped). Stops cleanly when the returned
 * function is called — typically when the remote joins (connect tone
 * takes over) or the call is cancelled.
 *
 * Returns a stop function; calling it more than once is safe.
 */
export function startRingbackTone(): () => void {
  if (!AudioCtx) return () => {};
  let stopped = false;
  let ctx: AudioContext | null = null;
  try {
    ctx = new AudioCtx();
    const localCtx = ctx;

    const playOneRing = () => {
      if (stopped || !localCtx) return;
      // 2-second on burst with two sine oscillators mixed
      const osc1 = localCtx.createOscillator();
      const osc2 = localCtx.createOscillator();
      const gain = localCtx.createGain();
      osc1.type = "sine";
      osc2.type = "sine";
      osc1.frequency.value = 440;
      osc2.frequency.value = 480;
      const t0 = localCtx.currentTime;
      // Soft attack + release so we don't click on start/stop.
      gain.gain.setValueAtTime(0, t0);
      gain.gain.linearRampToValueAtTime(0.08, t0 + 0.05);
      gain.gain.setValueAtTime(0.08, t0 + 1.95);
      gain.gain.linearRampToValueAtTime(0, t0 + 2.0);
      osc1.connect(gain);
      osc2.connect(gain);
      gain.connect(localCtx.destination);
      osc1.start(t0);
      osc2.start(t0);
      osc1.stop(t0 + 2.05);
      osc2.stop(t0 + 2.05);
    };

    // Fire the first ring immediately, then every 6s (2s on + 4s off).
    playOneRing();
    const interval = window.setInterval(() => {
      if (stopped) {
        window.clearInterval(interval);
        return;
      }
      playOneRing();
    }, 6000);

    return () => {
      if (stopped) return;
      stopped = true;
      window.clearInterval(interval);
      // Brief grace so the tail of any in-flight beep flushes cleanly.
      setTimeout(() => {
        try {
          ctx?.close();
        } catch {
          /* already closed */
        }
      }, 100);
    };
  } catch {
    return () => {};
  }
}
