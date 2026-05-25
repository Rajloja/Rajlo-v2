"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase-browser";
import { InCallSheet } from "./in-call-sheet";
import { playHangupTone } from "@/lib/call-sounds";
import { haptics } from "@/lib/native";
import {
  acquireScreenWake,
  addNativeCallEventListener,
  endCallNative,
  releaseScreenWake,
} from "@/lib/native-call";

/**
 * Global active-call context. Lives in the portal layout so the
 * in-call sheet + sticky banner survive page navigation — a rider
 * who taps "Wallet" mid-call sees the green minimized bar follow
 * them, taps it again to expand the sheet, and never loses the
 * connection.
 *
 * Two operations push into this context:
 *
 *   • CallButton (the rider/driver tapping "Call …" on a trip)
 *     → calls POST /api/calls/start, then `setActive()`.
 *
 *   • IncomingCallToast (the callee tapping Accept on a ringer)
 *     → calls POST /api/calls/[id]/accept, then `setActive()`.
 *
 * Hangup is two-way:
 *
 *   • Local hangup → InCallSheet calls POST /api/calls/[id]/end,
 *     which flips status to "ended" / "missed".
 *
 *   • Remote hangup → this provider subscribes to UPDATEs on
 *     `public.calls` filtered to the active call id. When the row's
 *     status flips to ended / missed / declined, we close the
 *     sheet IMMEDIATELY (no 5-second grace). That window is
 *     reserved for unexpected disconnects (network blip), not
 *     explicit hangups.
 */

export type ActiveCall = {
  id: string;
  roomName: string;
  token: string;
  livekitUrl: string;
  otherPartyName: string;
  weAreCaller: boolean;
};

type ActiveCallContextValue = {
  active: ActiveCall | null;
  setActive: (call: ActiveCall | null) => void;
};

const ActiveCallContext = createContext<ActiveCallContextValue | null>(null);

export function ActiveCallProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [active, setActiveState] = useState<ActiveCall | null>(null);

  const setActive = useCallback((call: ActiveCall | null) => {
    setActiveState(call);
  }, []);

  // Keep the device screen awake for the full call. Without this
  // a 30-minute call locks the phone every 30 s and the rider /
  // driver has to wake + unlock to interact. No-op on web.
  useEffect(() => {
    if (!active) return;
    void acquireScreenWake();
    return () => {
      void releaseScreenWake();
    };
  }, [active]);

  // Subscribe to UPDATEs on the active call's row. When the remote
  // side hangs up (or our own /end endpoint completes), status
  // flips to ended/missed/declined — close instantly.
  useEffect(() => {
    if (!active?.id) return;
    const supabase = createSupabaseBrowserClient();
    const channel = supabase
      .channel(`active-call-${active.id}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "calls",
          filter: `id=eq.${active.id}`,
        },
        (payload) => {
          const row = payload.new as { id: string; status: string };
          if (["ended", "missed", "declined"].includes(row.status)) {
            // eslint-disable-next-line no-console
            console.log("[active-call] remote terminated, status =", row.status);
            // Audible + haptic confirmation that the remote side
            // hung up — same tone as the local-hangup case in
            // InCallSheet so both sides hear the call close.
            playHangupTone();
            void haptics.medium();
            // Drop the OS-level Telecom call if it's still up. Mostly
            // matters when the remote side hangs up while ours was
            // already in_call (system call log + ongoing-call status).
            void endCallNative(row.id);
            setActiveState(null);
          }
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [active?.id]);

  // OS-driven hangup during an in-progress call (the user tapped the
  // hang-up button on the lockscreen / system call UI / Bluetooth
  // headset). RajloCallConnection.onDisconnect emits "ended" → we
  // mirror what InCallSheet's own hangup does: POST /end so the row
  // updates and the remote side is notified via Realtime.
  useEffect(() => {
    if (!active?.id) return;
    let cleanup: (() => void) | null = null;
    (async () => {
      cleanup = await addNativeCallEventListener((event) => {
        if (event.callId !== active.id) return;
        if (event.action !== "ended" && event.action !== "declined") return;
        playHangupTone();
        void haptics.medium();
        // Fire-and-forget the /end call — server flips the row, which
        // hits the UPDATE subscription above and clears state. Don't
        // await: if the network is slow the user has already lost
        // the call UI on the OS side and we want JS-side parity ASAP.
        void fetch(`/api/calls/${active.id}/end`, { method: "POST" }).catch(
          () => {},
        );
        setActiveState(null);
      });
    })();
    return () => {
      cleanup?.();
    };
  }, [active?.id]);

  const value = useMemo(
    () => ({ active, setActive }),
    [active, setActive],
  );

  return (
    <ActiveCallContext.Provider value={value}>
      {children}
      {/* The in-call sheet renders here, OUTSIDE the page content,
         so it survives `{children}` re-mounting on route changes.
         Sheet handles its own minimized state for the sticky bar. */}
      {active && (
        <InCallSheet
          callId={active.id}
          roomName={active.roomName}
          token={active.token}
          livekitUrl={active.livekitUrl}
          otherPartyName={active.otherPartyName}
          weAreCaller={active.weAreCaller}
          onClose={() => setActiveState(null)}
        />
      )}
    </ActiveCallContext.Provider>
  );
}

/**
 * Imperative API for components that want to start or join a call.
 * Throws (in dev) if used outside an ActiveCallProvider so wiring
 * mistakes surface immediately.
 */
export function useActiveCall(): ActiveCallContextValue {
  const ctx = useContext(ActiveCallContext);
  if (!ctx) {
    throw new Error(
      "useActiveCall must be used inside <ActiveCallProvider />",
    );
  }
  return ctx;
}
