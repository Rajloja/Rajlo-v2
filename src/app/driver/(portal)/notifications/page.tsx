"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Icon, type IconName } from "@/components/icons";
import { ArcWatermark } from "@/components/arc-pattern";
import { FadeUp } from "@/components/anim";
import { NotificationSkeleton, Skeleton } from "@/components/skeleton";
import { createSupabaseBrowserClient } from "@/lib/supabase-browser";
import { complianceThresholds, type TADocument } from "@/lib/mock-data";
import {
  getCachedDriverData,
  setCachedDriverData,
} from "@/lib/driver-prefetch";

const PAGE_SIZE = 30;
const FIRST_PAGE_URL = `/api/driver/notifications?limit=${PAGE_SIZE}&offset=0`;

type NotifsResponse = {
  notifications: DriverNotification[];
  pagination?: { hasMore: boolean };
  unreadCount: number;
};

/**
 * Driver notifications inbox. Two sections:
 *
 *   1. Activity feed — backed by `driver_notifications` (live via
 *      Supabase Realtime). Verification decisions, vehicle-change
 *      decisions, trip updates, system messages.
 *
 *   2. Renewal reminders — TA document countdown surfaced from
 *      /api/driver/compliance. These are computed from expiry dates,
 *      not stored notifications, so they sit alongside the feed
 *      rather than mixing into it.
 *
 * Mirrors the rider inbox (/rider/notifications) for the activity
 * feed half, but keeps the driver-specific compliance card.
 */

type NotificationKind =
  | "ride_available"
  | "trip_update"
  | "verification"
  | "vehicle_change"
  | "system";

type DriverNotification = {
  id: string;
  kind: NotificationKind;
  title: string;
  body: string;
  href: string | null;
  cta: string | null;
  read: boolean;
  at: string;
};

const NOTIFICATION_TYPE: Record<
  NotificationKind,
  { label: string; icon: IconName; iconBg: string }
> = {
  ride_available: {
    label: "Ride",
    icon: "navigation",
    iconBg: "bg-rajlo-red text-white",
  },
  trip_update: {
    label: "Trip",
    icon: "navigation",
    iconBg: "bg-rajlo-black text-white",
  },
  verification: {
    label: "Verification",
    icon: "shield-check",
    iconBg: "bg-emerald-600 text-white",
  },
  vehicle_change: {
    label: "Vehicle",
    icon: "car",
    iconBg: "bg-amber-500 text-white",
  },
  system: {
    label: "System",
    icon: "bell",
    iconBg: "bg-rajlo-black text-white",
  },
};

type Tab = "all" | "verification" | "vehicle_change" | "trip_update" | "system";
const TABS: { key: Tab; label: string }[] = [
  { key: "all", label: "All" },
  { key: "verification", label: "Verification" },
  { key: "vehicle_change", label: "Vehicle" },
  { key: "trip_update", label: "Trips" },
  { key: "system", label: "System" },
];

/* ─────────── Compliance reminder types ─────────── */

type ReminderLevel = "info" | "warning" | "urgent" | "expired";

function daysUntil(dateStr?: string): number | null {
  if (!dateStr) return null;
  const diff = new Date(dateStr).getTime() - Date.now();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

function getLevel(days: number | null): ReminderLevel | null {
  if (days === null) return null;
  if (days < 0) return "expired";
  if (days <= complianceThresholds.criticalDays) return "urgent";
  if (days <= complianceThresholds.urgentDays) return "warning";
  if (days <= complianceThresholds.warningDays) return "info";
  return null;
}

function levelStyle(level: ReminderLevel) {
  if (level === "expired") {
    return {
      bg: "bg-red-50",
      border: "border-red-300",
      text: "text-red-700",
      label: "Expired",
    };
  }
  if (level === "urgent") {
    return {
      bg: "bg-orange-50",
      border: "border-orange-300",
      text: "text-orange-700",
      label: "Urgent · ≤7 days",
    };
  }
  if (level === "warning") {
    return {
      bg: "bg-amber-50",
      border: "border-amber-300",
      text: "text-amber-700",
      label: "Warning · ≤30 days",
    };
  }
  return {
    bg: "bg-emerald-50",
    border: "border-emerald-300",
    text: "text-emerald-700",
    label: "Upcoming · ≤60 days",
  };
}

/* ─────────── Page ─────────── */

export default function DriverNotificationsPage() {
  // Seed from the prefetch cache so opening Notifications from the
  // drawer lands on the real list instantly. The refresh below + the
  // Supabase Realtime channel keep things live.
  const cachedNotifs = getCachedDriverData<NotifsResponse>(FIRST_PAGE_URL);
  const [items, setItems] = useState<DriverNotification[]>(
    cachedNotifs?.notifications ?? [],
  );
  const [unreadFromServer, setUnreadFromServer] = useState(
    cachedNotifs?.unreadCount ?? 0,
  );
  const [loading, setLoading] = useState(cachedNotifs == null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("all");
  // Pagination state. `hasMore` comes from the API (over-fetch by one
  // trick); `loadingMore` drives the spinner on the Load-more button.
  const [hasMore, setHasMore] = useState(
    cachedNotifs?.pagination?.hasMore ?? false,
  );
  const [loadingMore, setLoadingMore] = useState(false);

  // Compliance reminders (separate fetch — not stored in
  // driver_notifications because they're computed from expiry dates).
  const [docs, setDocs] = useState<TADocument[]>([]);
  const [reminderError, setReminderError] = useState<string | null>(null);

  // Initial fetch + Realtime subscription on driver_notifications.
  // Realtime carefully MERGES the first-page fetch into the existing
  // accumulated list — naively replacing would wipe any older pages
  // the driver already loaded via "Load more".
  useEffect(() => {
    let cancelled = false;

    const refresh = async () => {
      try {
        const res = await fetch(FIRST_PAGE_URL);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = (await res.json()) as NotifsResponse;
        if (cancelled) return;
        setItems((prev) => {
          // Merge the freshly-fetched first page into the current
          // list: take any rows from the server that aren't in the
          // current list (new arrivals via realtime), prepend them.
          // Then keep any older pages the driver has already loaded.
          // This avoids the "load more then a realtime event drops
          // your older pages" bug.
          if (prev.length === 0) return json.notifications;
          const existingIds = new Set(prev.map((n) => n.id));
          const incoming = json.notifications.filter(
            (n) => !existingIds.has(n.id),
          );
          // Also reconcile read-state updates the server returned for
          // ids we already have (someone marked them read elsewhere).
          const incomingById = new Map(
            json.notifications.map((n) => [n.id, n] as const),
          );
          const updated = prev.map((n) => incomingById.get(n.id) ?? n);
          return [...incoming, ...updated];
        });
        setUnreadFromServer(json.unreadCount);
        // Only trust hasMore from the FIRST page fetch when no older
        // pages have been loaded yet — once the driver taps Load more
        // it's the loadMore call below that owns hasMore.
        if (cachedNotifs == null) {
          setHasMore(json.pagination?.hasMore ?? false);
        }
        setError(null);
        setCachedDriverData(FIRST_PAGE_URL, json);
      } catch (e) {
        if (!cancelled)
          setError(
            e instanceof Error ? e.message : "Couldn't load notifications.",
          );
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    refresh();

    const supabase = createSupabaseBrowserClient();
    const channel = supabase
      .channel("driver-notifications")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "driver_notifications" },
        () => {
          if (!cancelled) refresh();
        },
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
    // cachedNotifs is read once on mount — exhaustive-deps would
    // re-run this whole effect on every render otherwise.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadMore = async () => {
    setLoadingMore(true);
    try {
      const res = await fetch(
        `/api/driver/notifications?limit=${PAGE_SIZE}&offset=${items.length}`,
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as NotifsResponse;
      setItems((prev) => {
        // Append, deduping by id in case a realtime insert raced us.
        const existingIds = new Set(prev.map((n) => n.id));
        const extra = json.notifications.filter(
          (n) => !existingIds.has(n.id),
        );
        return [...prev, ...extra];
      });
      setHasMore(json.pagination?.hasMore ?? false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't load more.");
    } finally {
      setLoadingMore(false);
    }
  };

  // Compliance reminders — fetched against the auth-gated endpoint
  // (no `?driverId=...` query) so each driver sees THEIR own document
  // statuses. The previous version hit `?driverId=DRV-1031`, which is
  // a mock external_id, and when that lookup failed it surfaced the
  // hardcoded mock payload — that's what was showing the bogus
  // "expired" reminder Raj flagged. Now we read the signed-in
  // driver's real `compliance.docs` array and just render an empty
  // section on error rather than fake data.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/driver/compliance");
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = (await res.json()) as { docs: TADocument[] };
        if (cancelled) return;
        setDocs(json.docs ?? []);
        setReminderError(null);
      } catch (e) {
        if (!cancelled) {
          setDocs([]);
          setReminderError(
            e instanceof Error
              ? e.message
              : "Couldn't load renewal reminders.",
          );
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const unread = useMemo(
    () =>
      items.length > 0 ? items.filter((n) => !n.read).length : unreadFromServer,
    [items, unreadFromServer],
  );

  const filtered = useMemo(
    () => (tab === "all" ? items : items.filter((n) => n.kind === tab)),
    [items, tab],
  );

  const grouped = useMemo(() => groupByDay(filtered), [filtered]);

  const reminders = useMemo(
    () =>
      docs
        .map((doc) => {
          const days = daysUntil(doc.expiryDate);
          const level = getLevel(days);
          return { doc, days, level };
        })
        .filter((entry) => entry.level !== null)
        .sort((a, b) => (a.days ?? 99999) - (b.days ?? 99999)),
    [docs],
  );

  const expiredCount = reminders.filter((r) => r.level === "expired").length;
  const urgentCount = reminders.filter((r) => r.level === "urgent").length;

  const markAllRead = async () => {
    setItems((prev) => prev.map((n) => ({ ...n, read: true })));
    try {
      await fetch("/api/driver/notifications", { method: "POST" });
    } catch {
      /* re-fetch will reconcile */
    }
  };

  const markRead = async (id: string) => {
    setItems((prev) =>
      prev.map((n) => (n.id === id ? { ...n, read: true } : n)),
    );
    try {
      await fetch(`/api/driver/notifications/${id}`, { method: "PATCH" });
    } catch {
      /* re-fetch will reconcile */
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-5 py-2 md:px-3 md:py-8">
      {/* Hero */}
      <FadeUp>
        <div className="relative overflow-hidden rounded-3xl bg-rajlo-black p-6 text-white shadow-xl shadow-rajlo-black/30 md:p-8">
          <ArcWatermark
            size={360}
            variant="red"
            className="absolute -right-20 -bottom-24 opacity-[0.18]"
          />
          <div className="relative flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="font-secondary text-xs font-bold uppercase tracking-wider text-rajlo-red">
                Inbox
              </p>
              <h1 className="mt-2 text-3xl font-extrabold leading-tight tracking-tight md:text-4xl">
                Notifications
              </h1>
              <p className="mt-1 text-sm text-white/75">
                Verification updates, vehicle changes, trip events, and
                document renewal reminders.
              </p>
            </div>
            <div className="flex items-center gap-3">
              <div className="rounded-2xl bg-white/10 px-4 py-2 text-center backdrop-blur">
                <p className="text-[10px] font-bold uppercase tracking-wider text-white/70">
                  Unread
                </p>
                <p className="mt-0.5 text-2xl font-extrabold tracking-tight">
                  {unread}
                </p>
              </div>
              {unread > 0 && (
                <button
                  type="button"
                  onClick={markAllRead}
                  className="rounded-full bg-white px-4 py-2 text-xs font-bold text-foreground transition-all hover:-translate-y-0.5"
                >
                  Mark all read
                </button>
              )}
            </div>
          </div>
        </div>
      </FadeUp>

      {/* Renewal reminders — pinned above the activity feed because
          a driver with an expired doc auto-suspends, so it's the most
          time-sensitive thing on the page. */}
      {(expiredCount > 0 || urgentCount > 0 || reminders.length > 0) && (
        <FadeUp delay={0.04}>
          <section className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <span className="grid h-7 w-7 place-items-center rounded-lg bg-primary-soft text-rajlo-red">
                  <Icon name="shield-check" className="h-3.5 w-3.5" />
                </span>
                <p className="font-secondary text-xs font-bold uppercase tracking-wider text-rajlo-red">
                  Renewal reminders
                </p>
              </div>
              <Link
                href="/driver/verification"
                className="text-[11px] font-bold text-muted hover:text-rajlo-red"
              >
                Open compliance →
              </Link>
            </div>

            {reminderError && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                {reminderError}
              </div>
            )}

            {(expiredCount > 0 || urgentCount > 0) && (
              <div
                className={`rounded-2xl border px-4 py-3 ${
                  expiredCount > 0
                    ? "border-red-300 bg-red-50"
                    : "border-orange-300 bg-orange-50"
                }`}
              >
                <p
                  className={`text-sm font-bold ${
                    expiredCount > 0 ? "text-red-700" : "text-orange-700"
                  }`}
                >
                  {expiredCount > 0
                    ? `${expiredCount} document${expiredCount === 1 ? "" : "s"} expired — your account may auto-suspend until updated.`
                    : `${urgentCount} document${urgentCount === 1 ? "" : "s"} expiring within 7 days.`}
                </p>
              </div>
            )}

            <div className="space-y-2">
              {reminders.map(({ doc, days, level }) => {
                const style = levelStyle(level as ReminderLevel);
                return (
                  <div
                    key={doc.id}
                    className={`rounded-2xl border p-4 ${style.bg} ${style.border}`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-extrabold tracking-tight">
                          {doc.label}
                        </p>
                        <p className="mt-0.5 text-xs text-muted">
                          {doc.description}
                        </p>
                      </div>
                      <span
                        className={`shrink-0 rounded-full bg-white px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wider ${style.text} border ${style.border}`}
                      >
                        {style.label}
                      </span>
                    </div>
                    <div
                      className={`mt-3 flex items-center justify-between text-xs ${style.text}`}
                    >
                      <span className="font-semibold">
                        {days !== null && days >= 0
                          ? `${days} day${days === 1 ? "" : "s"} remaining`
                          : "Already expired"}
                      </span>
                      <span>
                        {doc.expiryDate ? `Expires ${doc.expiryDate}` : "No expiry"}
                      </span>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Link
                        href="/driver/verification"
                        className="rounded-full bg-rajlo-red px-3 py-1.5 text-xs font-bold text-white"
                      >
                        Upload renewal
                      </Link>
                      <Link
                        href="/driver/verification"
                        className="rounded-full border border-line bg-white px-3 py-1.5 text-xs font-bold"
                      >
                        Open compliance
                      </Link>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        </FadeUp>
      )}

      {/* Activity feed header + tabs */}
      <FadeUp delay={0.06}>
        <div className="flex items-center gap-2">
          <span className="grid h-7 w-7 place-items-center rounded-lg bg-primary-soft text-rajlo-red">
            <Icon name="bell" className="h-3.5 w-3.5" />
          </span>
          <p className="font-secondary text-xs font-bold uppercase tracking-wider text-rajlo-red">
            Activity
          </p>
        </div>
      </FadeUp>

      <FadeUp delay={0.08}>
        <div className="-mx-4 overflow-x-auto px-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <div className="inline-flex gap-1 rounded-full border border-line bg-surface-soft p-1">
            {TABS.map((t) => {
              const active = tab === t.key;
              const count =
                t.key === "all"
                  ? items.length
                  : items.filter((n) => n.kind === t.key).length;
              return (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => setTab(t.key)}
                  className={`relative rounded-full px-4 py-2 text-xs font-bold transition-all md:text-sm md:px-5 ${
                    active
                      ? "bg-rajlo-red text-white shadow-md shadow-rajlo-red/30"
                      : "text-muted hover:text-foreground"
                  }`}
                >
                  {t.label}
                  <span
                    className={`ml-2 inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[10px] font-extrabold ${
                      active
                        ? "bg-white/20 text-white"
                        : "bg-rajlo-red/10 text-rajlo-red"
                    }`}
                  >
                    {count}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </FadeUp>

      {loading && (
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <Skeleton className="h-2.5 w-12" rounded="md" />
            <span className="h-px flex-1 bg-line" />
            <Skeleton className="h-2.5 w-12" rounded="md" />
          </div>
          {[0, 1, 2, 3].map((i) => (
            <NotificationSkeleton key={i} />
          ))}
        </div>
      )}

      {error && !loading && (
        <div className="rounded-xl border border-rajlo-red/30 bg-primary-soft px-4 py-3 text-sm font-semibold text-rajlo-red">
          {error}
        </div>
      )}

      {!loading && filtered.length === 0 && (
        <FadeUp delay={0.1}>
          <div className="rounded-3xl border border-line bg-surface p-10 text-center">
            <span className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-surface-soft text-muted">
              <Icon name="bell" className="h-6 w-6" />
            </span>
            <h2 className="mt-5 text-xl font-extrabold tracking-tight">
              {items.length === 0 ? "No activity yet" : "You're all caught up"}
            </h2>
            <p className="mx-auto mt-2 max-w-sm text-sm text-muted">
              {items.length === 0
                ? "Verification updates, vehicle decisions, and trip events land here."
                : "No notifications in this filter. Switch tabs above."}
            </p>
          </div>
        </FadeUp>
      )}

      {grouped.map((group, groupIndex) => (
        <FadeUp key={group.label} delay={0.1 + groupIndex * 0.04}>
          <section>
            <div className="mb-3 flex items-center gap-3">
              <p className="text-xs font-extrabold uppercase tracking-wider text-muted">
                {group.label}
              </p>
              <span className="h-px flex-1 bg-line" />
              <span className="text-[11px] font-semibold text-muted">
                {group.items.length} item{group.items.length === 1 ? "" : "s"}
              </span>
            </div>
            <div className="space-y-2">
              {group.items.map((n) => (
                <NotificationCard
                  key={n.id}
                  n={n}
                  onMarkRead={() => markRead(n.id)}
                />
              ))}
            </div>
          </section>
        </FadeUp>
      ))}

      {/* Load-more — only renders on the "All" tab (other tabs filter
         a fixed subset, so paging older items there would require a
         server-side filter param which we don't have. The All tab
         drives back-history; if a driver wants to see older items in
         a specific category they can switch tabs after loading.) */}
      {!loading && tab === "all" && hasMore && (
        <div className="pt-2 text-center">
          <button
            type="button"
            onClick={loadMore}
            disabled={loadingMore}
            className="inline-flex items-center gap-2 rounded-full border border-line bg-surface px-5 py-2.5 text-sm font-bold text-foreground transition-colors hover:bg-surface-soft disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loadingMore ? (
              <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-rajlo-red border-t-transparent" />
            ) : null}
            {loadingMore ? "Loading…" : "Load more"}
          </button>
        </div>
      )}

      {/* Settings hint — drives drivers to the profile page where the
          push toggle lives. */}
      <FadeUp delay={0.22}>
        <Link
          href="/driver/profile"
          className="group flex items-center justify-between rounded-2xl border border-dashed border-line bg-surface-soft px-5 py-4 transition-colors hover:border-rajlo-red hover:bg-primary-soft/40"
        >
          <div className="flex items-center gap-3">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-white text-rajlo-red shadow-sm">
              <Icon name="bell" className="h-4 w-4" />
            </span>
            <div>
              <p className="text-sm font-bold">Push notification settings</p>
              <p className="mt-0.5 text-xs text-muted">
                Get a buzz the second a new ride request comes in.
              </p>
            </div>
          </div>
          <Icon
            name="chevron-right"
            className="h-5 w-5 text-muted transition-transform group-hover:translate-x-0.5 group-hover:text-rajlo-red"
          />
        </Link>
      </FadeUp>
    </div>
  );
}

/* ─────────── Notification card ─────────── */

function NotificationCard({
  n,
  onMarkRead,
}: {
  n: DriverNotification;
  onMarkRead: () => void;
}) {
  const type = NOTIFICATION_TYPE[n.kind];

  const body = (
    <div
      className={`group relative flex items-start gap-3 rounded-2xl border p-4 transition-all hover:-translate-y-0.5 hover:shadow-md ${
        n.read
          ? "border-line bg-surface"
          : "border-rajlo-red/30 bg-primary-soft/40 shadow-sm"
      }`}
    >
      {!n.read && (
        <span className="absolute left-0 top-1/2 -ml-1 h-3 w-3 -translate-y-1/2 rounded-full border-2 border-surface bg-rajlo-red" />
      )}

      <span
        className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${type.iconBg}`}
      >
        <Icon name={type.icon} className="h-5 w-5" />
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p
              className={`text-sm font-extrabold tracking-tight ${
                n.read ? "text-foreground" : "text-foreground"
              }`}
            >
              {n.title}
            </p>
            <p className="mt-1 text-sm text-muted">{n.body}</p>
          </div>
          <span className="shrink-0 text-[11px] font-semibold text-muted">
            {timeAgo(n.at)}
          </span>
        </div>
        {n.cta && (
          <p className="mt-2 inline-flex items-center gap-1 text-[11px] font-bold text-rajlo-red transition-transform group-hover:translate-x-0.5">
            {n.cta}
            <Icon name="arrow-right" className="h-3 w-3" />
          </p>
        )}
      </div>
    </div>
  );

  return n.href ? (
    <Link href={n.href} onClick={onMarkRead} className="block">
      {body}
    </Link>
  ) : (
    <button
      type="button"
      onClick={onMarkRead}
      className="block w-full text-left"
    >
      {body}
    </button>
  );
}

/* ─────────── Helpers ─────────── */

function groupByDay(
  items: DriverNotification[],
): { label: string; items: DriverNotification[] }[] {
  const today: DriverNotification[] = [];
  const yesterday: DriverNotification[] = [];
  const earlier: DriverNotification[] = [];
  const now = new Date();
  const startOfToday = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
  ).getTime();
  const startOfYesterday = startOfToday - 1000 * 60 * 60 * 24;

  for (const n of items) {
    const ts = new Date(n.at).getTime();
    if (ts >= startOfToday) today.push(n);
    else if (ts >= startOfYesterday) yesterday.push(n);
    else earlier.push(n);
  }

  const groups: { label: string; items: DriverNotification[] }[] = [];
  if (today.length) groups.push({ label: "Today", items: today });
  if (yesterday.length) groups.push({ label: "Yesterday", items: yesterday });
  if (earlier.length) groups.push({ label: "Earlier", items: earlier });
  return groups;
}

function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diffMs / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d`;
  return new Date(iso).toLocaleDateString("en-JM", {
    day: "numeric",
    month: "short",
  });
}
