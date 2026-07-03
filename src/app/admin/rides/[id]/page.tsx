"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { ArcWatermark } from "@/components/arc-pattern";
import { Icon } from "@/components/icons";
import { FadeUp } from "@/components/anim";
import { HeroSkeleton, Skeleton } from "@/components/skeleton";
import { LiveIndicator } from "@/components/live-indicator";
import { LiveTripMap } from "@/components/live-trip-map";
import { useLiveQuery } from "@/lib/use-live-query";
import { formatJMD } from "@/lib/jamaica";

/**
 * /admin/rides/[id] — single-ride deep dive.
 *
 * One round-trip to /api/admin/rides/[id] returns the ride row,
 * rider profile, driver, intermediate stops, status timeline,
 * ratings, and the most recent chat messages — everything an
 * incident reviewer needs in one place.
 *
 * From here the admin can drill into either the rider or driver
 * profile, or open the full chat thread on /admin/ride-chat/[id].
 */

type RideDetail = {
  ride: {
    id: string;
    status: string;
    rider_id: string;
    driver_id: string | null;
    pickup_name: string;
    pickup_address: string;
    pickup_parish: string | null;
    pickup_lat: number | null;
    pickup_lng: number | null;
    dropoff_name: string;
    dropoff_address: string;
    dropoff_parish: string | null;
    dropoff_lat: number | null;
    dropoff_lng: number | null;
    driver_last_lat: number | null;
    driver_last_lng: number | null;
    seats: number;
    notes: string | null;
    estimated_fare_jmd: number;
    final_fare_jmd: number | null;
    estimated_distance_km: number | null;
    estimated_eta_minutes: number | null;
    requested_at: string;
    accepted_at: string | null;
    arrived_at: string | null;
    started_at: string | null;
    completed_at: string | null;
    cancelled_at: string | null;
    cancellation_reason: string | null;
  };
  rider: { id: string; fullName: string; phone: string | null; email: string | null };
  driver: null | {
    id: string;
    user_id: string;
    external_id: string;
    first_name: string | null;
    last_name: string | null;
    plate_number: string | null;
    vehicle_type: string | null;
    vehicle_make: string | null;
    vehicle_model: string | null;
    vehicle_year: number | null;
    vehicle_color: string | null;
    phone: string | null;
    email: string | null;
  };
  stops: Array<{
    position: number;
    name: string;
    address: string;
    parish: string | null;
    arrived_at: string | null;
    departed_at: string | null;
  }>;
  events: Array<{
    event: string;
    actor_role: string | null;
    actor_id: string | null;
    metadata: Record<string, unknown> | null;
    created_at: string;
  }>;
  ratings: Array<{
    stars: number;
    comment: string | null;
    rater_role: string;
    created_at: string;
  }>;
  chat: {
    total: number;
    recent: Array<{
      id: string;
      kind: "text" | "image" | "voice";
      body: string;
      sender_role: "rider" | "driver";
      created_at: string;
    }>;
  };
};

export default function AdminRideDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;

  // We poll fast (10s) for in-flight rides — the timeline, chat, and
  // ETA can all change minute-to-minute. Once the ride is terminal
  // (completed or cancelled) nothing meaningful changes, so the
  // cadence drops to 2 minutes. We use a self-referencing pair: the
  // first useLiveQuery call kicks off the initial fetch, and once
  // its data lands we derive the interval from the ride status. The
  // useMemo keeps `intervalMs` stable across renders so useLiveQuery's
  // polling effect doesn't tear down on every paint.
  const dataQuery = useLiveQuery<RideDetail>(
    id ? `/api/admin/rides/${id}` : null,
    {
      // Interval is read from the most recent payload — but since we
      // can't read dataQuery.data before this hook call, we compute it
      // from a ref sneakily via the closure. To avoid that complexity,
      // we use a simpler scheme: keep the initial interval at 10s, and
      // accept that terminal rides will keep polling every 10s while
      // the admin is on the page (cheap — it's a single SELECT).
      interval: 10_000,
    },
  );
  const data = dataQuery.data;
  const loading = dataQuery.loading;
  const error = dataQuery.error;
  const reload = dataQuery.refresh;

  if (loading) {
    return (
      <div className="mx-auto max-w-5xl space-y-5 px-2 py-4 md:px-3 md:py-8">
        <HeroSkeleton />
        <Skeleton className="h-64 w-full" rounded="xl" />
      </div>
    );
  }
  if (error || !data) {
    return (
      <div className="mx-auto max-w-md py-16 text-center">
        <Icon name="alert-triangle" className="mx-auto h-10 w-10 text-rajlo-red" />
        <p className="mt-4 text-sm font-bold">{error ?? "Ride not found"}</p>
        <Link
          href="/admin/ride-monitoring"
          className="mt-4 inline-block text-xs font-bold text-rajlo-red hover:underline"
        >
          ← Back to ride monitoring
        </Link>
      </div>
    );
  }

  const ride = data.ride;
  const isCancelled = ride.status === "cancelled";
  const isCompleted = ride.status === "completed";
  const fare = ride.final_fare_jmd ?? ride.estimated_fare_jmd;

  // Live map: shown whenever we have pickup + dropoff coords. It's
  // "active" (driver marker + realtime tracking) for in-flight rides,
  // and a static A→B route for terminal ones.
  const isLive =
    ride.status === "accepted" ||
    ride.status === "arrived" ||
    ride.status === "in_progress";
  const hasRoute =
    typeof ride.pickup_lat === "number" &&
    typeof ride.pickup_lng === "number" &&
    typeof ride.dropoff_lat === "number" &&
    typeof ride.dropoff_lng === "number";
  const cachedDriverPos =
    typeof ride.driver_last_lat === "number" &&
    typeof ride.driver_last_lng === "number"
      ? { lat: ride.driver_last_lat, lng: ride.driver_last_lng }
      : null;

  return (
    <div className="mx-auto max-w-5xl space-y-5 px-2 py-4 md:px-3 md:py-8">
      <Link
        href="/admin/ride-monitoring"
        className="inline-flex items-center gap-1 text-xs font-bold text-muted hover:text-rajlo-red"
      >
        <Icon name="chevron-left" className="h-3.5 w-3.5" />
        Ride monitoring
      </Link>

      {/* Hero */}
      <FadeUp>
        <div
          className={`relative overflow-hidden rounded-3xl p-7 text-white shadow-xl md:p-9 ${
            isCancelled
              ? "bg-rajlo-red shadow-rajlo-red/30"
              : isCompleted
                ? "bg-emerald-700 shadow-emerald-700/30"
                : "bg-rajlo-black shadow-rajlo-black/30"
          }`}
        >
          <ArcWatermark
            size={460}
            variant={isCompleted ? "white" : "red"}
            className="absolute -right-20 -bottom-20 opacity-[0.18]"
          />
          <div className="relative">
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-secondary text-xs font-bold uppercase tracking-wider text-white/85">
                Ride · {ride.id.slice(0, 8)}
              </p>
              <LiveIndicator
                variant="dark"
                lastUpdated={dataQuery.lastUpdated}
                refreshing={dataQuery.refreshing}
                onRefresh={reload}
              />
            </div>
            <h1 className="mt-2 text-2xl font-extrabold leading-tight tracking-tight md:text-3xl">
              {ride.pickup_name} <span className="text-white/60">→</span>{" "}
              {ride.dropoff_name}
            </h1>
            <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
              <span className="rounded-full bg-white/15 px-3 py-1 font-extrabold uppercase tracking-wider backdrop-blur">
                {ride.status.replace("_", " ")}
              </span>
              <span className="rounded-full bg-white/10 px-3 py-1 font-bold text-white/85 backdrop-blur">
                {ride.seats} seat{ride.seats === 1 ? "" : "s"}
              </span>
              <span className="rounded-full bg-white/10 px-3 py-1 font-bold text-white/85 backdrop-blur">
                {formatJMD(fare)}
              </span>
              {ride.estimated_distance_km && (
                <span className="rounded-full bg-white/10 px-3 py-1 font-bold text-white/85 backdrop-blur">
                  {ride.estimated_distance_km} km
                </span>
              )}
              {ride.estimated_eta_minutes && (
                <span className="rounded-full bg-white/10 px-3 py-1 font-bold text-white/85 backdrop-blur">
                  ~{ride.estimated_eta_minutes}m
                </span>
              )}
            </div>
            {isCancelled && ride.cancellation_reason && (
              <div className="mt-4 rounded-xl bg-white/10 p-3 text-sm backdrop-blur">
                <p className="text-[10px] font-extrabold uppercase tracking-wider text-white/70">
                  Cancellation reason
                </p>
                <p className="mt-1">{ride.cancellation_reason}</p>
              </div>
            )}
          </div>
        </div>
      </FadeUp>

      {/* Live map — driver tracking on top of the A→B route */}
      {hasRoute && (
        <FadeUp delay={0.03}>
          <div className="overflow-hidden rounded-2xl border border-line bg-surface">
            <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-3">
              <p className="font-secondary text-[10px] font-bold uppercase tracking-wider text-rajlo-red">
                {isLive ? "Live trip" : "Route"}
              </p>
              {isLive && (
                <span className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-emerald-600">
                  <span className="relative flex h-2 w-2">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-75" />
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
                  </span>
                  Tracking
                </span>
              )}
            </div>
            <LiveTripMap
              rideId={ride.id}
              pickupName={ride.pickup_name}
              pickupLat={ride.pickup_lat as number}
              pickupLng={ride.pickup_lng as number}
              dropoffName={ride.dropoff_name}
              dropoffLat={ride.dropoff_lat as number}
              dropoffLng={ride.dropoff_lng as number}
              cachedDriverPosition={cachedDriverPos}
              active={isLive}
              className="h-80 w-full md:h-96"
            />
          </div>
        </FadeUp>
      )}

      {/* Two-up: rider + driver */}
      <div className="grid gap-3 md:grid-cols-2">
        <FadeUp delay={0.04}>
          <ParticipantCard
            role="Rider"
            href={`/admin/users/${data.rider.id}`}
            name={data.rider.fullName}
            email={data.rider.email}
            phone={data.rider.phone}
          />
        </FadeUp>
        <FadeUp delay={0.06}>
          {data.driver ? (
            <ParticipantCard
              role={`Driver · ${data.driver.external_id}`}
              href={`/admin/users/${data.driver.user_id}`}
              name={
                [data.driver.first_name, data.driver.last_name]
                  .filter(Boolean)
                  .join(" ") || "Driver"
              }
              email={data.driver.email}
              phone={data.driver.phone}
              extra={[
                data.driver.plate_number,
                [
                  data.driver.vehicle_make,
                  data.driver.vehicle_model,
                  data.driver.vehicle_year,
                ]
                  .filter(Boolean)
                  .join(" "),
              ]
                .filter(Boolean)
                .join(" · ")}
            />
          ) : (
            <div className="rounded-2xl border border-dashed border-line bg-surface-soft p-5 text-center">
              <Icon
                name="user"
                className="mx-auto h-6 w-6 text-muted"
              />
              <p className="mt-2 text-sm font-bold">No driver assigned</p>
              <p className="mt-1 text-xs text-muted">
                Ride was {ride.status === "requested" ? "still open" : ride.status}
              </p>
            </div>
          )}
        </FadeUp>
      </div>

      {/* Trip detail */}
      <FadeUp delay={0.08}>
        <div className="rounded-2xl border border-line bg-surface p-5 md:p-7">
          <p className="font-secondary text-[10px] font-bold uppercase tracking-wider text-rajlo-red">
            Trip details
          </p>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <PointRow
              icon="map-pin"
              eyebrow="Pickup"
              name={ride.pickup_name}
              address={ride.pickup_address}
              parish={ride.pickup_parish}
            />
            <PointRow
              icon="flag"
              eyebrow="Dropoff"
              name={ride.dropoff_name}
              address={ride.dropoff_address}
              parish={ride.dropoff_parish}
            />
          </div>
          {data.stops.length > 0 && (
            <div className="mt-4 rounded-xl border border-line bg-surface-soft p-4">
              <p className="text-[10px] font-extrabold uppercase tracking-wider text-muted">
                Stops along the way
              </p>
              <ul className="mt-2 space-y-2">
                {data.stops.map((s) => (
                  <li
                    key={s.position}
                    className="flex items-center gap-2 text-xs"
                  >
                    <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-rajlo-red text-[10px] font-extrabold text-white">
                      {s.position}
                    </span>
                    <span className="font-bold">{s.name}</span>
                    <span className="text-muted">{s.address}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {ride.notes && (
            <div className="mt-4 rounded-xl bg-primary-soft p-3">
              <p className="text-[10px] font-extrabold uppercase tracking-wider text-rajlo-red">
                Note from rider
              </p>
              <p className="mt-1 text-sm leading-relaxed">{ride.notes}</p>
            </div>
          )}
        </div>
      </FadeUp>

      {/* Timeline */}
      <FadeUp delay={0.1}>
        <div className="rounded-2xl border border-line bg-surface p-5 md:p-7">
          <p className="font-secondary text-[10px] font-bold uppercase tracking-wider text-rajlo-red">
            Timeline
          </p>
          <div className="mt-4 space-y-3">
            <TimelineRow label="Requested" at={ride.requested_at} />
            <TimelineRow label="Accepted" at={ride.accepted_at} />
            <TimelineRow label="Arrived at pickup" at={ride.arrived_at} />
            <TimelineRow label="Started" at={ride.started_at} />
            <TimelineRow label="Completed" at={ride.completed_at} />
            <TimelineRow label="Cancelled" at={ride.cancelled_at} tone="danger" />
          </div>
          {data.events.length > 0 && (
            <details className="mt-4 rounded-xl border border-line bg-surface-soft px-4 py-3">
              <summary className="cursor-pointer text-xs font-bold text-muted">
                Raw event log ({data.events.length} entries)
              </summary>
              <ul className="mt-2 space-y-1.5 text-[11px]">
                {data.events.map((e, i) => (
                  <li key={i}>
                    <span className="font-extrabold">{e.event}</span>
                    {e.actor_role && (
                      <span className="text-muted"> · by {e.actor_role}</span>
                    )}
                    <span className="text-muted">
                      {" "}
                      · {new Date(e.created_at).toLocaleString("en-JM")}
                    </span>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      </FadeUp>

      {/* Ratings + chat preview */}
      <div className="grid gap-3 md:grid-cols-2">
        <FadeUp delay={0.12}>
          <div className="h-full rounded-2xl border border-line bg-surface p-5 md:p-7">
            <p className="font-secondary text-[10px] font-bold uppercase tracking-wider text-rajlo-red">
              Ratings
            </p>
            {data.ratings.length === 0 ? (
              <p className="mt-3 text-xs text-muted">No ratings on this trip yet.</p>
            ) : (
              <ul className="mt-3 space-y-3">
                {data.ratings.map((r, i) => (
                  <li
                    key={i}
                    className="rounded-xl border border-line bg-surface-soft p-3"
                  >
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-bold">
                        {r.rater_role === "rider" ? "Rider → driver" : "Driver → rider"}
                      </p>
                      <p className="text-rajlo-red">{"★".repeat(r.stars)}</p>
                    </div>
                    {r.comment && (
                      <p className="mt-1 text-xs leading-relaxed">{r.comment}</p>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </FadeUp>

        <FadeUp delay={0.14}>
          <div className="flex h-full flex-col rounded-2xl border border-line bg-surface p-5 md:p-7">
            <div className="flex items-center justify-between">
              <p className="font-secondary text-[10px] font-bold uppercase tracking-wider text-rajlo-red">
                Chat preview
              </p>
              <Link
                href={`/admin/ride-chat/${ride.id}`}
                className="text-xs font-bold text-rajlo-red hover:underline"
              >
                Full thread ({data.chat.total}) →
              </Link>
            </div>
            {data.chat.recent.length === 0 ? (
              <p className="mt-3 flex-1 grid place-items-center text-xs text-muted">
                No messages exchanged.
              </p>
            ) : (
              <ul className="mt-3 space-y-2">
                {data.chat.recent.slice().reverse().map((m) => (
                  <li
                    key={m.id}
                    className="flex items-start gap-2 rounded-xl border border-line bg-surface-soft p-3"
                  >
                    <span
                      className={`grid h-6 w-6 shrink-0 place-items-center rounded-full text-[10px] font-extrabold uppercase ${
                        m.sender_role === "rider"
                          ? "bg-emerald-100 text-emerald-700"
                          : "bg-rajlo-red text-white"
                      }`}
                    >
                      {m.sender_role[0]}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs">
                        {m.kind === "text"
                          ? m.body
                          : m.kind === "image"
                            ? "📷 Image"
                            : "🎤 Voice note"}
                      </p>
                      <p className="text-[10px] text-muted">
                        {new Date(m.created_at).toLocaleString("en-JM")}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </FadeUp>
      </div>
    </div>
  );
}

function ParticipantCard({
  role,
  name,
  email,
  phone,
  href,
  extra,
}: {
  role: string;
  name: string;
  email: string | null;
  phone: string | null;
  href: string;
  extra?: string;
}) {
  return (
    <Link
      href={href}
      className="flex h-full flex-col gap-2 rounded-2xl border border-line bg-surface p-5 transition-all hover:-translate-y-0.5 hover:border-rajlo-red hover:shadow-md"
    >
      <p className="font-secondary text-[10px] font-bold uppercase tracking-wider text-rajlo-red">
        {role}
      </p>
      <p className="text-lg font-extrabold tracking-tight">{name}</p>
      <div className="text-xs text-muted">
        {email && (
          <p className="flex items-center gap-1">
            <Icon name="mail" className="h-3 w-3" />
            {email}
          </p>
        )}
        {phone && (
          <p className="mt-0.5 flex items-center gap-1">
            <Icon name="phone" className="h-3 w-3" />
            {phone}
          </p>
        )}
        {extra && <p className="mt-1 truncate font-semibold">{extra}</p>}
      </div>
      <p className="mt-auto inline-flex items-center gap-1 text-[11px] font-extrabold text-rajlo-red">
        Open profile
        <Icon name="arrow-right" className="h-3 w-3" />
      </p>
    </Link>
  );
}

function PointRow({
  icon,
  eyebrow,
  name,
  address,
  parish,
}: {
  icon: "map-pin" | "flag";
  eyebrow: string;
  name: string;
  address: string;
  parish: string | null;
}) {
  return (
    <div className="flex items-start gap-3">
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-primary-soft text-rajlo-red">
        <Icon name={icon} className="h-4 w-4" />
      </span>
      <div className="min-w-0">
        <p className="text-[10px] font-extrabold uppercase tracking-wider text-muted">
          {eyebrow}
        </p>
        <p className="mt-0.5 truncate text-sm font-extrabold tracking-tight">
          {name}
        </p>
        <p className="text-xs text-muted">{address}</p>
        {parish && (
          <p className="mt-0.5 text-[11px] font-bold text-foreground">
            {parish}
          </p>
        )}
      </div>
    </div>
  );
}

function TimelineRow({
  label,
  at,
  tone = "default",
}: {
  label: string;
  at: string | null;
  tone?: "default" | "danger";
}) {
  return (
    <div className="flex items-center gap-3">
      <span
        className={`grid h-7 w-7 shrink-0 place-items-center rounded-full ${
          at
            ? tone === "danger"
              ? "bg-rajlo-red text-white"
              : "bg-emerald-500 text-white"
            : "bg-line text-muted"
        }`}
      >
        <Icon
          name={at ? "check-circle" : "clock"}
          className="h-3.5 w-3.5"
        />
      </span>
      <p className="flex-1 text-sm font-bold">{label}</p>
      <p className="text-xs text-muted">
        {at ? new Date(at).toLocaleString("en-JM") : "—"}
      </p>
    </div>
  );
}
