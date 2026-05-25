"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase-browser";
import { Icon } from "./icons";
import { useActiveCall } from "./active-call-provider";
import {
  addIncomingCallNative,
  addNativeCallEventListener,
  clearIncomingCallNotification,
  endCallNative,
  registerCallNotificationChannel,
  registerNativeCallKit,
  showIncomingCallNotification,
} from "@/lib/native-call";

/**
 * Global incoming-call listener + full-screen ringer. Mount this once
 * near the top of any route the rider or driver might be on while an
 * active trip can generate an incoming call (i.e. anywhere in the
 * authenticated app).
 *
 * Subscribes to Supabase Realtime INSERTs on `public.calls` filtered
 * to `callee_id=eq.{userId}`. When a row arrives:
 *
 *   1. Slap a FULL-SCREEN incoming-call overlay over the page —
 *      avatar, name, ringtone, vibrate — like a native phone ringing.
 *      Can't accidentally miss it. Can't accidentally book a trip
 *      while a driver is ringing you.
 *   2. On Accept → POST /api/calls/[id]/accept, get a LiveKit token,
 *      mount <InCallSheet> with the returned credentials.
 *   3. On Decline → POST /api/calls/[id]/decline, overlay vanishes.
 *
 * Realtime is the primary channel; the push notification is a
 * backup that opens the same flow via the `?call=` URL param the
 * push's href carries.
 */

type IncomingCall = {
  id: string;
  callerName: string;
  callerRole: "rider" | "driver";
};

export type PreloadedIncomingCall = IncomingCall;

// Two-tone ringtone built with Web Audio — no asset upload needed.
// 0.4s on / 0.6s off, repeated, sweeping between A4 and E5 for the
// "call coming in" sound recognised across most phones.
function useRingtone(active: boolean) {
  const ctxRef = useRef<AudioContext | null>(null);
  const stopFnRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!active) {
      stopFnRef.current?.();
      stopFnRef.current = null;
      return;
    }

    // Lazy-create AudioContext on first ring — some browsers refuse
    // to construct it before a user gesture, but the calling rider/
    // driver has been interacting with the app, so the gesture-gate
    // is satisfied.
    const Ctx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    ctxRef.current = ctx;
    let cancelled = false;

    const playPattern = async () => {
      while (!cancelled) {
        // High beep (E5 = 659.25 Hz) for 200ms
        await beep(ctx, 659.25, 0.2);
        if (cancelled) break;
        // Low beep (A4 = 440 Hz) for 200ms
        await beep(ctx, 440, 0.2);
        if (cancelled) break;
        // Silence for 600ms
        await sleep(600);
      }
    };

    void playPattern();

    // Vibrate pattern — same on/off rhythm as the audio.
    if (typeof navigator !== "undefined" && navigator.vibrate) {
      // Repeating pattern via setInterval. The Vibration API has a
      // single-shot signature, so we restart it every cycle.
      const vib = window.setInterval(() => {
        try {
          navigator.vibrate([200, 100, 200, 600]);
        } catch {
          /* swallow */
        }
      }, 1100);
      stopFnRef.current = () => {
        cancelled = true;
        window.clearInterval(vib);
        try {
          navigator.vibrate(0);
        } catch {
          /* swallow */
        }
        void ctx.close();
      };
    } else {
      stopFnRef.current = () => {
        cancelled = true;
        void ctx.close();
      };
    }

    return () => {
      stopFnRef.current?.();
      stopFnRef.current = null;
    };
  }, [active]);
}

function beep(ctx: AudioContext, freq: number, duration: number): Promise<void> {
  return new Promise((resolve) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0, ctx.currentTime);
    // Quick attack + release to avoid clicks.
    gain.gain.linearRampToValueAtTime(0.18, ctx.currentTime + 0.02);
    gain.gain.linearRampToValueAtTime(0, ctx.currentTime + duration);
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + duration);
    osc.onended = () => resolve();
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function IncomingCallToast({
  userId,
  preloaded,
  onPreloadConsumed,
}: {
  userId: string;
  preloaded?: PreloadedIncomingCall | null;
  onPreloadConsumed?: () => void;
}) {
  const [incoming, setIncoming] = useState<IncomingCall | null>(null);
  // The accept handler pushes into the global active-call context.
  // The provider's <InCallSheet> takes over from there — this toast
  // doesn't render the sheet anymore.
  const { setActive } = useActiveCall();

  // When the layout passes a preloaded call (from `?call=` URL param),
  // promote it to the live `incoming` state so the ringer pops, then
  // tell the parent we've consumed it so re-renders don't duplicate.
  useEffect(() => {
    if (preloaded) {
      setIncoming(preloaded);
      onPreloadConsumed?.();
    }
  }, [preloaded, onPreloadConsumed]);

  // Register the high-importance Android notification channel once
  // per session. iOS ignores; web no-ops.
  useEffect(() => {
    void registerCallNotificationChannel();
    // Also register the self-managed PhoneAccount with the Android
    // Telecom framework. Idempotent — fine to call once per mount.
    void registerNativeCallKit();
  }, []);

  // Fire/clear the native heads-up notification AND the OS-level
  // Telecom ringer in sync with the in-app ringer. The Telecom call
  // is what makes the call show on the lockscreen / system call UI;
  // the heads-up notification is the fallback for older OS versions
  // or if the user disables the Rajlo PhoneAccount in Settings.
  useEffect(() => {
    if (incoming) {
      void showIncomingCallNotification({
        callId: incoming.id,
        callerName: incoming.callerName,
        callerRole: incoming.callerRole,
      });
      void addIncomingCallNative({
        callId: incoming.id,
        callerName: incoming.callerName,
      });
    } else {
      void clearIncomingCallNotification();
    }
  }, [incoming]);

  // Ring + vibrate while the overlay is showing. The OS Telecom
  // framework drives its own ringer when addIncomingCallNative
  // succeeds, but the in-app one stays so the web + iOS surfaces
  // (and pre-O Android fallback) still ring.
  useRingtone(incoming !== null);

  useEffect(() => {
    if (!userId) return;
    const supabase = createSupabaseBrowserClient();
    const channel = supabase
      .channel(`incoming-calls-${userId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "calls",
          filter: `callee_id=eq.${userId}`,
        },
        async (payload) => {
          const row = payload.new as {
            id: string;
            caller_id: string;
            caller_role: string;
            status: string;
          };
          if (!["initiated", "ringing"].includes(row.status)) return;
          let name = "Caller";
          if (row.caller_role === "driver") {
            const { data } = await supabase
              .from("drivers")
              .select("first_name, last_name")
              .eq("user_id", row.caller_id)
              .maybeSingle();
            if (data) {
              name =
                [data.first_name, data.last_name].filter(Boolean).join(" ") ||
                "Driver";
            }
          } else {
            const { data } = await supabase
              .from("profiles")
              .select("full_name")
              .eq("id", row.caller_id)
              .maybeSingle();
            if (data?.full_name) name = data.full_name as string;
          }
          setIncoming({
            id: row.id,
            callerName: name,
            callerRole: row.caller_role as "rider" | "driver",
          });
        },
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "calls",
          filter: `callee_id=eq.${userId}`,
        },
        (payload) => {
          const row = payload.new as { id: string; status: string };
          // Caller hung up mid-ring → drop the overlay.
          if (["ended", "missed", "declined"].includes(row.status)) {
            setIncoming((prev) => (prev?.id === row.id ? null : prev));
          }
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [userId]);

  // Hold the latest `incoming` in a ref so the native event listener
  // (set up once, lives across re-renders) can read the current call
  // without going stale.
  const incomingRef = useRef<IncomingCall | null>(null);
  useEffect(() => {
    incomingRef.current = incoming;
  }, [incoming]);

  const accept = useCallback(async (callOverride?: IncomingCall) => {
    const target = callOverride ?? incomingRef.current;
    if (!target) return;
    try {
      const res = await fetch(`/api/calls/${target.id}/accept`, {
        method: "POST",
      });
      const json = (await res.json()) as
        | {
            call: { id: string; roomName: string };
            token: string;
            livekitUrl: string;
          }
        | { error: string };
      if (!res.ok || "error" in json) {
        setIncoming(null);
        void endCallNative(target.id);
        return;
      }
      // Push into the global active-call context. The provider
      // renders the InCallSheet from there, so navigating away from
      // this toast (e.g. across page routes) doesn't kill the call.
      setActive({
        id: json.call.id,
        roomName: json.call.roomName,
        token: json.token,
        livekitUrl: json.livekitUrl,
        otherPartyName: target.callerName,
        weAreCaller: false,
      });
      setIncoming(null);
      // If the user accepted via the JS overlay (not the OS UI), the
      // Telecom call is still in RINGING state — flip it active so
      // the OS shows "ongoing call" rather than leaving the ringer up.
      void endCallNative(target.id);
    } catch {
      setIncoming(null);
      void endCallNative(target.id);
    }
  }, [setActive]);

  const decline = useCallback(async (callOverride?: IncomingCall) => {
    const target = callOverride ?? incomingRef.current;
    if (!target) return;
    try {
      await fetch(`/api/calls/${target.id}/decline`, { method: "POST" });
    } catch {
      /* swallow */
    }
    setIncoming(null);
    void endCallNative(target.id);
  }, []);

  // Bridge from the OS call UI back to the JS flow. When the user
  // taps Accept / Decline on the lockscreen, the Connection fires
  // emitCallEvent which surfaces here. We route to the existing
  // accept / decline handlers so both surfaces behave identically.
  useEffect(() => {
    let cleanup: (() => void) | null = null;
    (async () => {
      cleanup = await addNativeCallEventListener((event) => {
        const target = incomingRef.current;
        if (!target || target.id !== event.callId) return;
        if (event.action === "accepted") {
          void accept(target);
        } else if (event.action === "declined" || event.action === "ended") {
          // The OS call UI is already gone by the time these fire,
          // so just tell the server and clear our state.
          void decline(target);
        }
      });
    })();
    return () => {
      cleanup?.();
    };
  }, [accept, decline]);

  return (
    <>
      {incoming && (
        // Full-screen ringer — covers everything, can't be dismissed
        // accidentally, mimics the native incoming-call screen.
        <div className="fixed inset-0 z-[120] flex flex-col bg-gradient-to-b from-rajlo-black via-rajlo-black to-[#1c0a0a] text-white">
          <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
            <p className="mb-6 animate-pulse text-xs font-bold uppercase tracking-[0.3em] text-white/60">
              Incoming Rajlo call
            </p>
            <div className="relative mb-6">
              {/* Pulsing rings around the avatar to signal active ring */}
              <span className="absolute inset-0 animate-ping rounded-full bg-rajlo-red/30" />
              <span
                className="absolute inset-0 animate-ping rounded-full bg-rajlo-red/20"
                style={{ animationDelay: "300ms" }}
              />
              <div className="relative grid h-32 w-32 place-items-center rounded-full bg-rajlo-red text-5xl font-extrabold shadow-2xl">
                {incoming.callerName.charAt(0).toUpperCase()}
              </div>
            </div>
            <p className="text-2xl font-extrabold tracking-tight">
              {incoming.callerName}
            </p>
            <p className="mt-1 text-sm text-white/70">
              {incoming.callerRole === "driver"
                ? "Your driver"
                : "Your passenger"}
            </p>
          </div>

          <div className="flex items-center justify-between gap-12 px-10 pb-12 pt-6 sm:justify-center sm:gap-24">
            <button
              type="button"
              onClick={decline}
              className="flex flex-col items-center gap-2"
            >
              <span className="grid h-16 w-16 place-items-center rounded-full bg-rajlo-red shadow-lg shadow-rajlo-red/40 transition-transform active:scale-95">
                <Icon name="phone-off" className="h-7 w-7" />
              </span>
              <span className="text-xs font-semibold text-white/80">
                Decline
              </span>
            </button>
            <button
              type="button"
              onClick={accept}
              className="flex flex-col items-center gap-2"
            >
              <span className="grid h-16 w-16 place-items-center rounded-full bg-emerald-500 shadow-lg shadow-emerald-500/40 transition-transform active:scale-95">
                <Icon name="phone" className="h-7 w-7" />
              </span>
              <span className="text-xs font-semibold text-white/80">
                Accept
              </span>
            </button>
          </div>
        </div>
      )}
    </>
  );
}
