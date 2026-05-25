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
            setActiveState(null);
          }
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
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
