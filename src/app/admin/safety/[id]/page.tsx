"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Icon } from "@/components/icons";
import { MapView } from "@/components/map-view";
import { useLiveQuery } from "@/lib/use-live-query";
import { useRidePosition } from "@/lib/use-ride-position";
import { SAFETY_TIPS } from "@/lib/safety-tips";
import { formatJMD, type Place } from "@/lib/jamaica";

/**
 * Officer alert detail / chat console.
 *
 * One alert, one page:
 *   - live both-party positions (driver + rider) on the trip map
 *   - chat thread with the rider (officer sees rider's free text +
 *     can send own free text + can fire a pre-canned tip in one tap)
 *   - quick actions: call rider, call driver, acknowledge, resolve
 *
 * The list page polls every 12s; this page polls the messages every
 * 4s while open. Realtime broadcast is not used here yet — short poll
 * is good enough during a 5-minute incident, and avoids adding another
 * realtime channel for now.
 */

type AlertDetail = {
  alert: {
    id: string;
    rideId: string;
    riderId: string;
    driverId: string | null;
    kind: "sos" | "flag" | "unusual_stop" | "off_route";
    message: string | null;
    lat: number | null;
    lng: number | null;
    status: "open" | "acknowledged" | "resolved";
    acknowledgedAt: string | null;
    resolvedAt: string | null;
    resolutionNote: string | null;
    createdAt: string;
  };
  rider: { id: string; name: string; phone: string | null } | null;
  driver: {
    id: string;
    name: string;
    phone: string | null;
    plate: string | null;
    vehicle: string | null;
  } | null;
  ride: {
    id: string;
    status: string;
    pickupName: string;
    pickupLat: number;
    pickupLng: number;
    dropoffName: string;
    dropoffLat: number;
    dropoffLng: number;
    fareJmd: number | null;
  } | null;
};

type Message = {
  id: string;
  alertId: string;
  authorId: string;
  authorRole: "rider" | "safety_officer" | "admin";
  authorName: string | null;
  body: string;
  isTip: boolean;
  createdAt: string;
};

const KIND_LABEL: Record<AlertDetail["alert"]["kind"], string> = {
  sos: "SOS",
  flag: "Flag",
  unusual_stop: "Unusual stop",
  off_route: "Off route",
};

const KIND_TINT: Record<AlertDetail["alert"]["kind"], string> = {
  sos: "bg-rajlo-red text-white",
  flag: "bg-amber-500 text-white",
  unusual_stop: "bg-amber-200 text-amber-900",
  off_route: "bg-orange-500 text-white",
};

export default function AdminSafetyAlertDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id ?? "";

  const detail = useLiveQuery<AlertDetail>(
    id ? `/api/admin/safety-alerts/${id}` : null,
    { interval: 8_000 },
  );
  const messages = useLiveQuery<{ messages: Message[] }>(
    id ? `/api/admin/safety-alerts/${id}/messages` : null,
    { interval: 4_000 },
  );

  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState("");
  const [resolveNote, setResolveNote] = useState("");
  const [showResolve, setShowResolve] = useState(false);
  // Acknowledge is a one-tap state-change with regulatory weight (it
  // tells the rider/driver "Rajlo has seen your alert"), so we gate
  // it behind an explicit confirm dialog rather than firing on the
  // first click — same pattern as Resolve.
  const [confirmingAck, setConfirmingAck] = useState(false);

  const send = async (payload: { body?: string; tipId?: string }) => {
    if (busy) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/safety-alerts/${id}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        setDraft("");
        messages.refresh?.();
        detail.refresh?.();
      }
    } finally {
      setBusy(false);
    }
  };

  const decide = async (
    next: "acknowledged" | "resolved",
    note?: string,
  ) => {
    if (busy) return;
    setBusy(true);
    try {
      await fetch(`/api/admin/safety-alerts/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: next, resolution_note: note }),
      });
      detail.refresh?.();
    } finally {
      setBusy(false);
    }
  };

  if (detail.loading && !detail.data) {
    return (
      <div className="mx-auto max-w-7xl px-3 py-10 text-center text-sm text-muted">
        Loading alert…
      </div>
    );
  }
  if (!detail.data) {
    return (
      <div className="mx-auto max-w-7xl px-3 py-10 text-center">
        <p className="text-base font-semibold">Alert not found.</p>
        <Link
          href="/admin/safety"
          className="mt-3 inline-block text-sm font-bold text-rajlo-red hover:underline"
        >
          ← Back to safety queue
        </Link>
      </div>
    );
  }

  const { alert, rider, driver, ride } = detail.data;

  return (
    <div className="mx-auto max-w-7xl space-y-5 px-2 py-2 md:px-3 md:py-8">
      {/* ─── Back ─── */}
      <Link
        href="/admin/safety"
        className="inline-flex items-center gap-1 text-xs font-bold uppercase tracking-wider text-muted hover:text-rajlo-red"
      >
        <Icon name="arrow-right" className="h-3 w-3 rotate-180" />
        Safety queue
      </Link>

      {/* ─── Header ─── */}
      <header className="rounded-3xl border border-line bg-surface p-5 md:p-7">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex min-w-0 items-start gap-3">
            <span
              className={`grid h-12 w-12 shrink-0 place-items-center rounded-2xl ${KIND_TINT[alert.kind]}`}
            >
              <Icon
                name={
                  alert.kind === "sos"
                    ? "shield-alert"
                    : alert.kind === "off_route"
                      ? "navigation"
                      : "map-pin"
                }
                className="h-5 w-5"
              />
            </span>
            <div className="min-w-0">
              <p className="text-xs font-bold uppercase tracking-wider text-rajlo-red">
                {KIND_LABEL[alert.kind]} ·{" "}
                {alert.status.charAt(0).toUpperCase() + alert.status.slice(1)}
              </p>
              <h1 className="mt-1 text-2xl font-extrabold leading-tight tracking-tight md:text-3xl">
                {rider?.name ?? "Unknown rider"}
              </h1>
              {ride && (
                <p className="mt-1 text-sm text-muted">
                  {ride.pickupName} → {ride.dropoffName}
                </p>
              )}
              {alert.message && (
                <p className="mt-3 rounded-xl bg-surface-soft px-3 py-2 text-sm">
                  &ldquo;{alert.message}&rdquo;
                </p>
              )}
            </div>
          </div>

          <div className="flex shrink-0 flex-col items-end gap-2">
            <span className="font-mono text-[10px] uppercase tracking-wider text-muted">
              {alert.id.slice(0, 8)}
            </span>
            {alert.status !== "resolved" && (
              <div className="flex flex-wrap items-center gap-2">
                {alert.status === "open" && (
                  <button
                    type="button"
                    onClick={() => setConfirmingAck(true)}
                    disabled={busy}
                    className="inline-flex items-center gap-1 rounded-full bg-amber-500 px-4 py-1.5 text-xs font-bold text-white hover:bg-amber-600 disabled:opacity-50"
                  >
                    <Icon name="check-circle" className="h-3 w-3" />
                    Acknowledge
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setShowResolve((v) => !v)}
                  disabled={busy}
                  className="inline-flex items-center gap-1 rounded-full bg-emerald-600 px-4 py-1.5 text-xs font-bold text-white hover:bg-emerald-700 disabled:opacity-50"
                >
                  <Icon name="check-circle" className="h-3 w-3" />
                  Resolve
                </button>
              </div>
            )}
          </div>
        </div>

        {showResolve && alert.status !== "resolved" && (
          <div className="mt-4 flex flex-wrap items-center gap-2 rounded-2xl bg-surface-soft px-3 py-2">
            <input
              type="text"
              value={resolveNote}
              onChange={(e) => setResolveNote(e.target.value)}
              placeholder="Resolution note (optional)…"
              className="flex-1 rounded-lg border border-line bg-surface px-3 py-1.5 text-xs outline-none focus:border-emerald-500"
            />
            <button
              type="button"
              onClick={() => {
                decide("resolved", resolveNote.trim() || undefined);
                setResolveNote("");
                setShowResolve(false);
              }}
              disabled={busy}
              className="rounded-full bg-emerald-600 px-4 py-1.5 text-xs font-bold text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              Confirm resolution
            </button>
          </div>
        )}

        {alert.resolutionNote && (
          <p className="mt-3 text-[12px] italic text-muted">
            Resolution: {alert.resolutionNote}
          </p>
        )}
      </header>

      {/* ─── Main: parties + map | chat ─── */}
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          {/* Parties */}
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <PartyCard
              role="Rider"
              name={rider?.name ?? "—"}
              phone={rider?.phone ?? null}
              sub={null}
            />
            <PartyCard
              role="Driver"
              name={driver?.name ?? "—"}
              phone={driver?.phone ?? null}
              sub={
                driver
                  ? [driver.vehicle, driver.plate].filter(Boolean).join(" · ") ||
                    null
                  : null
              }
            />
          </div>

          {/* Map */}
          {ride ? (
            <LiveTripMap ride={ride} alertLat={alert.lat} alertLng={alert.lng} />
          ) : (
            <div className="rounded-3xl border border-line bg-surface p-8 text-center text-sm text-muted">
              No ride context available for this alert.
            </div>
          )}

          {/* Emergency quicklinks */}
          <div className="rounded-3xl border border-rajlo-red/30 bg-rajlo-red/5 p-4">
            <p className="text-xs font-bold uppercase tracking-wider text-rajlo-red">
              Emergency contacts
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              <a
                href="tel:119"
                className="inline-flex items-center gap-1.5 rounded-full bg-rajlo-red px-4 py-2 text-xs font-bold text-white hover:bg-rajlo-red/90"
              >
                <Icon name="phone" className="h-3.5 w-3.5" />
                Call 119 (Police)
              </a>
              <a
                href="tel:110"
                className="inline-flex items-center gap-1.5 rounded-full bg-rajlo-red px-4 py-2 text-xs font-bold text-white hover:bg-rajlo-red/90"
              >
                <Icon name="phone" className="h-3.5 w-3.5" />
                Call 110 (Fire / Ambulance)
              </a>
            </div>
          </div>
        </div>

        {/* Chat */}
        <ChatPanel
          messages={messages.data?.messages ?? []}
          loading={messages.loading}
          draft={draft}
          setDraft={setDraft}
          onSend={(text) => send({ body: text })}
          onTip={(tipId) => send({ tipId })}
          busy={busy}
        />
      </div>

      {/* ─── Acknowledge confirm modal ───
         Fires when the safety admin clicks "Acknowledge." Held behind
         an explicit confirm because acknowledging is a logged action
         that surfaces to the rider/driver immediately. The state
         change isn't reversible without a follow-up resolve, so the
         extra tap is cheap insurance against fat-fingering. */}
      {confirmingAck && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="ack-confirm-title"
          className="fixed inset-0 z-[120] flex items-center justify-center bg-rajlo-black/55 backdrop-blur-sm px-4"
          onClick={() => !busy && setConfirmingAck(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-2xl bg-surface p-6 shadow-2xl ring-1 ring-line"
          >
            <div className="flex items-start gap-3">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-amber-100 text-amber-700">
                <Icon name="shield-alert" className="h-5 w-5" />
              </span>
              <div className="min-w-0 flex-1">
                <h2
                  id="ack-confirm-title"
                  className="text-base font-extrabold tracking-tight"
                >
                  Acknowledge this alert?
                </h2>
                <p className="mt-1 text-sm text-muted">
                  The rider and driver will be notified that Rajlo Safety has
                  seen their alert and is engaging. This action is logged.
                </p>
              </div>
            </div>
            <div className="mt-5 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmingAck(false)}
                disabled={busy}
                className="rounded-full border border-line bg-surface px-4 py-1.5 text-xs font-bold text-foreground hover:bg-surface-soft disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={async () => {
                  await decide("acknowledged");
                  setConfirmingAck(false);
                }}
                disabled={busy}
                className="inline-flex items-center gap-1 rounded-full bg-amber-500 px-4 py-1.5 text-xs font-bold text-white hover:bg-amber-600 disabled:opacity-50"
              >
                <Icon name="check-circle" className="h-3 w-3" />
                {busy ? "Acknowledging…" : "Acknowledge"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function PartyCard({
  role,
  name,
  phone,
  sub,
}: {
  role: string;
  name: string;
  phone: string | null;
  sub: string | null;
}) {
  return (
    <div className="rounded-2xl border border-line bg-surface px-4 py-3">
      <p className="text-[10px] font-bold uppercase tracking-wider text-muted">
        {role}
      </p>
      <p className="mt-0.5 truncate text-sm font-semibold">{name}</p>
      {sub && (
        <p className="truncate text-[11px] font-mono uppercase tracking-wider text-rajlo-red">
          {sub}
        </p>
      )}
      {phone ? (
        <a
          href={`tel:${phone}`}
          className="mt-2 inline-flex items-center gap-1 rounded-full bg-emerald-600 px-3 py-1 text-[11px] font-bold text-white hover:bg-emerald-700"
        >
          <Icon name="phone" className="h-3 w-3" />
          {phone}
        </a>
      ) : (
        <p className="mt-2 text-[11px] text-muted">No phone on file</p>
      )}
    </div>
  );
}

function LiveTripMap({
  ride,
  alertLat,
  alertLng,
}: {
  ride: NonNullable<AlertDetail["ride"]>;
  alertLat: number | null;
  alertLng: number | null;
}) {
  // Listen-only — officer doesn't broadcast a position.
  const { driverPosition, riderPosition } = useRidePosition(
    ride.id,
    "driver",
    false,
  );

  const pickup: Place = useMemo(
    () => ({
      placeId: `${ride.id}-pickup`,
      name: ride.pickupName,
      address: ride.pickupName,
      lat: ride.pickupLat,
      lng: ride.pickupLng,
      parish: null,
    }),
    [ride.id, ride.pickupName, ride.pickupLat, ride.pickupLng],
  );
  const dropoff: Place = useMemo(
    () => ({
      placeId: `${ride.id}-dropoff`,
      name: ride.dropoffName,
      address: ride.dropoffName,
      lat: ride.dropoffLat,
      lng: ride.dropoffLng,
      parish: null,
    }),
    [ride.id, ride.dropoffName, ride.dropoffLat, ride.dropoffLng],
  );

  // Use the realtime driver position; fall back to the alert's captured
  // coordinates so we always have *something* on the map.
  const driverMarker = driverPosition
    ? { lat: driverPosition.lat, lng: driverPosition.lng }
    : alertLat !== null && alertLng !== null
      ? { lat: alertLat, lng: alertLng }
      : null;
  const riderMarker = riderPosition
    ? { lat: riderPosition.lat, lng: riderPosition.lng }
    : null;

  return (
    <div className="overflow-hidden rounded-3xl border border-line bg-surface shadow-sm">
      <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-3">
        <p className="text-xs font-bold uppercase tracking-wider text-muted">
          Live trip · {ride.status}
        </p>
        <p className="text-xs font-extrabold text-rajlo-red tabular-nums">
          {ride.fareJmd ? formatJMD(ride.fareJmd) : ""}
        </p>
      </div>
      <div className="relative">
        <MapView
          pickup={pickup}
          stops={[]}
          dropoff={dropoff}
          driverPosition={driverMarker}
          riderPosition={riderMarker}
          className="h-80 w-full md:h-96"
        />
        {!driverPosition && (
          <div className="pointer-events-none absolute right-3 top-3 rounded-full bg-rajlo-black/85 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-white backdrop-blur">
            Waiting for live GPS
          </div>
        )}
      </div>
    </div>
  );
}

function ChatPanel({
  messages,
  loading,
  draft,
  setDraft,
  onSend,
  onTip,
  busy,
}: {
  messages: Message[];
  loading: boolean;
  draft: string;
  setDraft: (v: string) => void;
  onSend: (text: string) => void;
  onTip: (tipId: string) => void;
  busy: boolean;
}) {
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  // Auto-scroll to bottom when new messages arrive.
  const lastCountRef = useRef(messages.length);
  useEffect(() => {
    if (messages.length !== lastCountRef.current) {
      lastCountRef.current = messages.length;
      const el = scrollerRef.current;
      if (el) el.scrollTop = el.scrollHeight;
    }
  }, [messages.length]);

  return (
    <aside className="flex flex-col overflow-hidden rounded-3xl border border-line bg-surface shadow-sm lg:max-h-[760px]">
      <div className="border-b border-line px-4 py-3">
        <p className="text-xs font-bold uppercase tracking-wider text-muted">
          Chat with rider
        </p>
      </div>

      <div
        ref={scrollerRef}
        className="flex-1 space-y-2 overflow-y-auto px-4 py-4"
      >
        {loading && messages.length === 0 ? (
          <p className="py-6 text-center text-xs text-muted">Loading…</p>
        ) : messages.length === 0 ? (
          <p className="py-6 text-center text-xs text-muted">
            No messages yet. Send a tip or write something to reach the rider.
          </p>
        ) : (
          messages.map((m) => <MessageBubble key={m.id} m={m} />)
        )}
      </div>

      {/* Tips palette */}
      <div className="border-t border-line bg-surface-soft px-3 py-2">
        <p className="px-1 text-[10px] font-bold uppercase tracking-wider text-muted">
          Send a tip
        </p>
        <div className="mt-1 flex flex-wrap gap-1">
          {SAFETY_TIPS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => onTip(t.id)}
              disabled={busy}
              title={t.body}
              className="rounded-full border border-line bg-surface px-2.5 py-1 text-[11px] font-bold text-foreground transition-colors hover:border-rajlo-red/40 hover:text-rajlo-red disabled:opacity-50"
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Composer */}
      <form
        className="flex items-end gap-2 border-t border-line bg-surface px-3 py-3"
        onSubmit={(e) => {
          e.preventDefault();
          const text = draft.trim();
          if (text) onSend(text);
        }}
      >
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Message the rider…"
          rows={2}
          className="flex-1 resize-none rounded-2xl border border-line bg-surface-soft px-3 py-2 text-sm outline-none focus:border-rajlo-red"
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              const text = draft.trim();
              if (text) onSend(text);
            }
          }}
        />
        <button
          type="submit"
          disabled={busy || draft.trim().length === 0}
          className="rounded-full bg-rajlo-red px-4 py-2 text-xs font-bold text-white hover:bg-rajlo-red/90 disabled:opacity-50"
        >
          Send
        </button>
      </form>
    </aside>
  );
}

function MessageBubble({ m }: { m: Message }) {
  const fromOfficer = m.authorRole !== "rider";
  return (
    <div
      className={`flex ${fromOfficer ? "justify-end" : "justify-start"}`}
    >
      <div
        className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm ${
          fromOfficer
            ? m.isTip
              ? "bg-amber-100 text-amber-900"
              : "bg-rajlo-red text-white"
            : "bg-surface-soft text-foreground"
        }`}
      >
        <p className="text-[10px] font-bold uppercase tracking-wider opacity-70">
          {fromOfficer
            ? m.isTip
              ? "Tip"
              : (m.authorName ?? "Rajlo Safety")
            : (m.authorName ?? "Rider")}
        </p>
        <p className="mt-0.5 whitespace-pre-wrap leading-snug">{m.body}</p>
      </div>
    </div>
  );
}
