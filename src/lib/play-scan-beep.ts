/**
 * Two-tone confirmation beep for QR scan moments.
 *
 * Played on both sides of a successful route taxi scan — the rider's
 * scanner closes with a chirp, and the driver's pickup modal does the
 * same when the status flips to picked_up — so both phones audibly
 * confirm the handshake without either side having to look at the
 * screen.
 *
 * Implementation: short A5 → E6 sine sweep via the Web Audio API.
 * Roughly 250ms total. No audio asset required, no decoding, no
 * autoplay-policy issues because the trigger is a user gesture (scan
 * tap or QR detection inside an explicit "open scanner" flow).
 *
 * Silent-fails if:
 *   - Called server-side
 *   - AudioContext isn't supported
 *   - Browser blocks creation (e.g. no prior user gesture on Safari)
 */

export function playScanBeep(): void {
  if (typeof window === "undefined") return;
  try {
    const Ctx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(880, ctx.currentTime); // A5
    osc.frequency.setValueAtTime(1318.5, ctx.currentTime + 0.09); // E6
    // Quick attack → smooth tail so it doesn't click.
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.2, ctx.currentTime + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.24);
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.26);
    // Close the context after the tone finishes so we don't leak audio
    // graphs across repeated scans.
    osc.addEventListener("ended", () => {
      void ctx.close().catch(() => null);
    });
  } catch {
    /* silent — audio is a "nice to have" confirmation */
  }
}
