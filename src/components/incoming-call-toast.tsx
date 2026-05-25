"use client";

import { useEffect, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase-browser";
import { Icon } from "./icons";
import { InCallSheet } from "./in-call-sheet";

/**
 * Global incoming-call listener. Mount this once near the top of any
 * route the rider or driver might be on while an active trip can
 * generate an incoming call (i.e. anywhere in the authenticated app).
 *
 * Subscribes to Supabase Realtime INSERTs on `public.calls` filtered
 * to `callee_id=eq.{userId}`. When a row arrives:
 *
 *   1. Show a sliding toast at the top of the screen with the
 *      caller's name + Accept / Decline buttons.
 *   2. On Accept → POST /api/calls/[id]/accept, get a LiveKit token,
 *      mount <InCallSheet> with the returned credentials.
 *   3. On Decline → POST /api/calls/[id]/decline, toast vanishes.
 *
 * Realtime is the primary channel; the push notification is a
 * backup that opens the same flow via the `?call=` URL param the
 * push's href carries. We don't double-handle here — if a user
 * opens the page via that URL the toast appears as well because the
 * row was INSERTed regardless of how they got here.
 */

type IncomingCall = {
  id: string;
  callerName: string;
  callerRole: "rider" | "driver";
};

type ActiveCall = {
  id: string;
  roomName: string;
  token: string;
  livekitUrl: string;
  otherPartyName: string;
};

export function IncomingCallToast({ userId }: { userId: string }) {
  const [incoming, setIncoming] = useState<IncomingCall | null>(null);
  const [active, setActive] = useState<ActiveCall | null>(null);

  useEffect(() => {
    if (!userId) return;
    const supabase = createSupabaseBrowserClient();
    // Subscribe to INSERTs where callee_id = me. Postgres-changes
    // server-side filter so we don't burn bandwidth on every call
    // happening across the platform.
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
          // Resolve caller's name via a one-shot lookup. Profile first,
          // then driver — same logic as the server-side resolveDisplayName.
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
      // Also listen for UPDATEs so the toast clears if the caller
      // hangs up before we accept.
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
          if (
            incoming?.id === row.id &&
            ["ended", "missed", "declined"].includes(row.status)
          ) {
            setIncoming(null);
          }
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
    // We intentionally don't include `incoming` in deps — the UPDATE
    // handler reads it via closure each fire, and re-subscribing on
    // every state change would drop incoming events.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  const accept = async () => {
    if (!incoming) return;
    try {
      const res = await fetch(`/api/calls/${incoming.id}/accept`, {
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
        return;
      }
      setActive({
        id: json.call.id,
        roomName: json.call.roomName,
        token: json.token,
        livekitUrl: json.livekitUrl,
        otherPartyName: incoming.callerName,
      });
      setIncoming(null);
    } catch {
      setIncoming(null);
    }
  };

  const decline = async () => {
    if (!incoming) return;
    try {
      await fetch(`/api/calls/${incoming.id}/decline`, { method: "POST" });
    } catch {
      /* swallow */
    }
    setIncoming(null);
  };

  return (
    <>
      {incoming && (
        <div className="fixed inset-x-0 top-4 z-[110] mx-auto flex max-w-md justify-center px-4">
          <div className="flex w-full items-center gap-3 rounded-2xl bg-rajlo-black px-4 py-3 text-white shadow-2xl ring-1 ring-white/10">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-rajlo-red">
              <Icon name="phone" className="h-5 w-5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-bold">
                Incoming call · {incoming.callerName}
              </p>
              <p className="text-[11px] text-white/70">
                {incoming.callerRole === "driver" ? "Your driver" : "Your passenger"}
              </p>
            </div>
            <button
              type="button"
              onClick={decline}
              className="grid h-9 w-9 place-items-center rounded-full bg-rajlo-red transition-transform hover:scale-105"
              title="Decline"
            >
              <Icon name="phone-off" className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={accept}
              className="grid h-9 w-9 place-items-center rounded-full bg-emerald-500 transition-transform hover:scale-105"
              title="Accept"
            >
              <Icon name="phone" className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
      {active && (
        <InCallSheet
          callId={active.id}
          roomName={active.roomName}
          token={active.token}
          livekitUrl={active.livekitUrl}
          otherPartyName={active.otherPartyName}
          weAreCaller={false}
          onClose={() => setActive(null)}
        />
      )}
    </>
  );
}
