"use client";

import Link from "next/link";
import { use, useEffect, useState } from "react";
import { Icon } from "@/components/icons";
import { FadeUp } from "@/components/anim";
import { Skeleton } from "@/components/skeleton";

/**
 * Admin chat-log viewer. Read-only window into a ride's full driver
 * ↔ rider conversation, including image + voice attachments.
 *
 * Reachable from any admin surface that surfaces a ride id (e.g. the
 * dispute / safety review pages we'll wire later). For now the URL is
 * the entry point — type or paste the ride id at /admin/ride-chat/<id>.
 *
 * Backed by /api/admin/rides/[id]/messages, which is gated to admin
 * role and bypasses the "active ride only" rule via the
 * `is_admin()` helper in the RLS policies.
 */

type Message = {
  id: string;
  rideId: string;
  senderId: string;
  senderRole: "rider" | "driver";
  kind: "text" | "image" | "voice";
  body: string;
  durationMs: number | null;
  readAt: string | null;
  createdAt: string;
};

type Response = {
  ride: {
    id: string;
    status: string;
    pickup: string;
    dropoff: string;
    requestedAt: string;
    endedAt: string | null;
    rider: { id: string; name: string };
    driver: { externalId: string; name: string } | null;
  };
  messages: Message[];
};

export default function AdminRideChatPage({
  params,
}: {
  params: Promise<{ rideId: string }>;
}) {
  const { rideId } = use(params);
  const [data, setData] = useState<Response | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/admin/rides/${rideId}/messages`);
        if (!res.ok) {
          const j = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(j.error ?? `HTTP ${res.status}`);
        }
        const json = (await res.json()) as Response;
        if (!cancelled) setData(json);
      } catch (e) {
        if (!cancelled)
          setError(
            e instanceof Error ? e.message : "Couldn't load chat.",
          );
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [rideId]);

  if (loading) {
    return (
      <div className="mx-auto max-w-3xl space-y-4 px-2 py-8 md:px-3">
        <Skeleton className="h-32 w-full" rounded="xl" />
        {[0, 1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-12 w-full" rounded="xl" />
        ))}
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center">
        <span className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-primary-soft">
          <span aria-hidden className="text-3xl leading-none">😢</span>
        </span>
        <h1 className="mt-5 text-2xl font-extrabold tracking-tight">
          Chat not available
        </h1>
        <p className="mt-2 text-sm text-muted">
          {error ?? "Couldn't reach the chat log for this ride."}
        </p>
      </div>
    );
  }

  const { ride, messages } = data;

  return (
    <div className="mx-auto max-w-3xl space-y-5 px-2 py-6 md:px-3 md:py-10">
      <FadeUp>
        <div className="rounded-3xl border border-line bg-rajlo-black p-6 text-white shadow-xl">
          <p className="font-secondary text-xs font-bold uppercase tracking-wider text-rajlo-red">
            Admin · chat audit
          </p>
          <h1 className="mt-2 text-2xl font-extrabold leading-tight tracking-tight md:text-3xl">
            {ride.pickup} → {ride.dropoff}
          </h1>
          <div className="mt-4 grid grid-cols-2 gap-4 border-t border-white/15 pt-4 text-xs md:grid-cols-4">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-white/55">
                Ride id
              </p>
              <p className="mt-0.5 font-mono">#{ride.id.slice(0, 8)}</p>
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-white/55">
                Status
              </p>
              <p className="mt-0.5 font-bold uppercase">{ride.status}</p>
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-white/55">
                Rider
              </p>
              <p className="mt-0.5 truncate font-bold">{ride.rider.name}</p>
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-white/55">
                Driver
              </p>
              <p className="mt-0.5 truncate font-bold">
                {ride.driver?.name ?? "—"}
                {ride.driver?.externalId && (
                  <span className="ml-1 text-white/55">
                    {ride.driver.externalId}
                  </span>
                )}
              </p>
            </div>
          </div>
          <p className="mt-4 text-[11px] text-white/65">
            Read-only conversation log retained for safety review. Riders
            and drivers lose access the moment the ride completes or
            cancels.
          </p>
        </div>
      </FadeUp>

      {messages.length === 0 ? (
        <FadeUp delay={0.05}>
          <div className="rounded-2xl border border-line bg-surface p-10 text-center">
            <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-surface-soft text-muted">
              <Icon name="bell" className="h-5 w-5" />
            </span>
            <p className="mt-3 text-sm font-bold">No messages on this ride</p>
            <p className="mt-1 text-xs text-muted">
              Driver and rider didn&apos;t exchange any messages.
            </p>
          </div>
        </FadeUp>
      ) : (
        <FadeUp delay={0.05}>
          <ol className="space-y-3 rounded-2xl border border-line bg-surface p-5">
            {messages.map((m) => (
              <AdminMessageRow key={m.id} m={m} />
            ))}
          </ol>
        </FadeUp>
      )}

      <Link
        href="/admin"
        className="inline-flex items-center gap-1.5 text-xs font-bold text-muted hover:text-rajlo-red"
      >
        <Icon name="chevron-left" className="h-3.5 w-3.5" />
        Back to admin
      </Link>
    </div>
  );
}

function AdminMessageRow({ m }: { m: Message }) {
  const t = new Date(m.createdAt).toLocaleString("en-JM", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
  const tone =
    m.senderRole === "driver"
      ? "border-l-rajlo-red"
      : "border-l-emerald-500";

  return (
    <li className={`rounded-r-xl border-l-4 bg-surface-soft p-3 ${tone}`}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-[10px] font-extrabold uppercase tracking-wider text-muted">
          {m.senderRole}
        </p>
        <p className="text-[10px] text-muted">{t}</p>
      </div>
      <div className="mt-2">
        {m.kind === "text" && (
          <p className="text-sm text-rajlo-black whitespace-pre-wrap break-words">
            {m.body}
          </p>
        )}
        {m.kind === "image" && m.body && (
          <a
            href={m.body}
            target="_blank"
            rel="noopener noreferrer"
            className="block max-w-xs overflow-hidden rounded-xl border border-line"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={m.body}
              alt="Photo"
              className="block max-h-64 w-full object-cover"
            />
          </a>
        )}
        {m.kind === "voice" && m.body && (
          <div className="flex items-center gap-2">
            <audio controls src={m.body} className="h-10 max-w-xs" />
            {m.durationMs !== null && (
              <span className="text-[11px] font-semibold text-muted">
                {Math.max(1, Math.round(m.durationMs / 1000))}s
              </span>
            )}
          </div>
        )}
      </div>
    </li>
  );
}
