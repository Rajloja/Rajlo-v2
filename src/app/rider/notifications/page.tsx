"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Icon, type IconName } from "@/components/icons";
import { ArcWatermark } from "@/components/arc-pattern";
import { FadeUp } from "@/components/anim";
import { EmptyState } from "@/components/empty-state";
import { NotificationSkeleton, Skeleton } from "@/components/skeleton";
import { createSupabaseBrowserClient } from "@/lib/supabase-browser";
import { useT } from "@/lib/i18n";

/**
 * Rider notifications inbox. Backed by the `rider_notifications`
 * table — each entry is loaded via /api/rider/notifications and
 * mutated via PATCH /api/rider/notifications/[id] (mark single read)
 * or POST /api/rider/notifications (mark all).
 *
 * Subscribes to postgres_changes on the rider_notifications table so
 * new entries appear without refresh; RLS scopes the realtime stream
 * to the rider's own rows.
 */

type NotificationKind = "trip" | "promo" | "system" | "safety";

type RiderNotification = {
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
  trip: {
    label: "Trip",
    icon: "navigation",
    iconBg: "bg-rajlo-red text-white",
  },
  promo: {
    label: "Promo",
    icon: "trending-up",
    iconBg: "bg-amber-500 text-white",
  },
  system: {
    label: "System",
    icon: "bell",
    iconBg: "bg-rajlo-black text-white",
  },
  safety: {
    label: "Safety",
    icon: "shield",
    iconBg: "bg-rajlo-red text-white",
  },
};

type Tab = "all" | "trip" | "promo" | "system";
const TABS: { key: Tab; label: string }[] = [
  { key: "all", label: "All" },
  { key: "trip", label: "Trips" },
  { key: "promo", label: "Promos" },
  { key: "system", label: "System" },
];

const PAGE_SIZE = 30;
const FIRST_PAGE_URL = `/api/rider/notifications?limit=${PAGE_SIZE}&offset=0`;

type NotifsResponse = {
  notifications: RiderNotification[];
  pagination?: { hasMore: boolean };
  unreadCount: number;
};

export default function RiderNotificationsPage() {
  const { t } = useT();
  const [items, setItems] = useState<RiderNotification[]>([]);
  const [unreadFromServer, setUnreadFromServer] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("all");
  // Pagination state. `hasMore` is seeded from the first-page fetch
  // and re-set after each "Load more" round-trip.
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  // Initial fetch + Realtime subscription. Realtime MERGES the new
  // first page into the existing list — a naive replace would wipe
  // any older pages the rider already loaded via "Load more".
  useEffect(() => {
    let cancelled = false;
    let firstLoadDone = false;

    const refresh = async () => {
      try {
        const res = await fetch(FIRST_PAGE_URL);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = (await res.json()) as NotifsResponse;
        if (cancelled) return;
        setItems((prev) => {
          if (prev.length === 0) return json.notifications;
          const existingIds = new Set(prev.map((n) => n.id));
          const incoming = json.notifications.filter(
            (n) => !existingIds.has(n.id),
          );
          const incomingById = new Map(
            json.notifications.map((n) => [n.id, n] as const),
          );
          const updated = prev.map((n) => incomingById.get(n.id) ?? n);
          return [...incoming, ...updated];
        });
        setUnreadFromServer(json.unreadCount);
        // Only trust the first page's hasMore until the rider has
        // tapped Load more at least once; after that loadMore owns it.
        if (!firstLoadDone) {
          setHasMore(json.pagination?.hasMore ?? false);
          firstLoadDone = true;
        }
        setError(null);
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
      .channel("rider-notifications")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "rider_notifications" },
        () => {
          if (!cancelled) refresh();
        },
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, []);

  const loadMore = async () => {
    setLoadingMore(true);
    try {
      const res = await fetch(
        `/api/rider/notifications?limit=${PAGE_SIZE}&offset=${items.length}`,
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as NotifsResponse;
      setItems((prev) => {
        const seen = new Set(prev.map((n) => n.id));
        return [...prev, ...json.notifications.filter((n) => !seen.has(n.id))];
      });
      setHasMore(json.pagination?.hasMore ?? false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't load more.");
    } finally {
      setLoadingMore(false);
    }
  };

  // Local unread count is the source of truth for the header badge:
  // it stays in sync as we optimistically flip rows. unreadFromServer
  // is the initial seed.
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

  const markAllRead = async () => {
    // Optimistic: flip everything client-side then POST. Realtime
    // will re-sync on the server response anyway.
    setItems((prev) => prev.map((n) => ({ ...n, read: true })));
    try {
      await fetch("/api/rider/notifications", { method: "POST" });
    } catch {
      /* network blip — re-fetch will reconcile */
    }
  };

  const markRead = async (id: string) => {
    setItems((prev) =>
      prev.map((n) => (n.id === id ? { ...n, read: true } : n)),
    );
    try {
      await fetch(`/api/rider/notifications/${id}`, { method: "PATCH" });
    } catch {
      /* network blip — re-fetch will reconcile */
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
                {t("notifications.eyebrow", "Inbox")}
              </p>
              <h1 className="mt-2 text-3xl font-extrabold leading-tight tracking-tight md:text-4xl">
                {t("notifications.title", "Notifications")}
              </h1>
              <p className="mt-1 text-sm text-white/75">
                {t(
                  "notifications.subtitle",
                  "Trip updates, promos, and safety tips — all in one place.",
                )}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <div className="rounded-2xl bg-white/10 px-4 py-2 text-center backdrop-blur">
                <p className="text-[10px] font-bold uppercase tracking-wider text-white/70">
                  {t("notifications.unread", "Unread")}
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
                  {t("notifications.markAllRead", "Mark all read")}
                </button>
              )}
            </div>
          </div>
        </div>
      </FadeUp>

      {/* Tabs — iterator renamed `tabItem` so it doesn't shadow the
         translation function `t` from useT(). */}
      <FadeUp delay={0.05}>
        <div className="-mx-4 overflow-x-auto px-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <div className="inline-flex gap-1 rounded-full border border-line bg-surface-soft p-1">
            {TABS.map((tabItem) => {
              const active = tab === tabItem.key;
              const count =
                tabItem.key === "all"
                  ? items.length
                  : items.filter((n) => n.kind === tabItem.key).length;
              const labelKey =
                tabItem.key === "all"
                  ? "notifications.tab.all"
                  : tabItem.key === "trip"
                    ? "notifications.tab.trips"
                    : tabItem.key === "promo"
                      ? "notifications.tab.promos"
                      : "notifications.tab.system";
              return (
                <button
                  key={tabItem.key}
                  type="button"
                  onClick={() => setTab(tabItem.key)}
                  className={`relative rounded-full px-5 py-2 text-sm font-bold transition-all ${
                    active
                      ? "bg-rajlo-red text-white shadow-md shadow-rajlo-red/30"
                      : "text-muted hover:text-foreground"
                  }`}
                >
                  {t(labelKey, tabItem.label)}
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

      {/* Loading — group header + 5 notification skeletons in the
         same shape the real feed will take. */}
      {loading && (
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <Skeleton className="h-2.5 w-12" rounded="md" />
            <span className="h-px flex-1 bg-line" />
            <Skeleton className="h-2.5 w-12" rounded="md" />
          </div>
          {[0, 1, 2, 3, 4].map((i) => (
            <NotificationSkeleton key={i} />
          ))}
        </div>
      )}

      {error && !loading && (
        <div className="rounded-xl border border-rajlo-red/30 bg-primary-soft px-4 py-3 text-sm font-semibold text-rajlo-red">
          {error}
        </div>
      )}

      {/* Empty state */}
      {!loading && filtered.length === 0 && (
        <FadeUp delay={0.08}>
          <EmptyState
            variant={items.length === 0 ? "hero" : "soft"}
            title={
              items.length === 0 ? "Nothing here yet" : "You're all caught up"
            }
            body={
              items.length === 0
                ? "Once you book or take rides, updates land here."
                : "No notifications in this filter. Switch tabs above."
            }
          />
        </FadeUp>
      )}

      {/* Day-grouped feed */}
      {grouped.map((group, groupIndex) => (
        <FadeUp key={group.label} delay={0.06 + groupIndex * 0.04}>
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

      {/* Load more — only on the All tab; the tabs filter a fixed
         subset of the loaded items, so paging older items inside a
         specific tab would need a server-side kind filter we don't
         have. Switching to All gives the rider the full back-history. */}
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

      {/* Settings hint */}
      <FadeUp delay={0.2}>
        <Link
          href="/rider/settings"
          className="group flex items-center justify-between rounded-2xl border border-dashed border-line bg-surface-soft px-5 py-4 transition-colors hover:border-rajlo-red hover:bg-primary-soft/40"
        >
          <div className="flex items-center gap-3">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-white text-rajlo-red shadow-sm">
              <Icon name="settings" className="h-4 w-4" />
            </span>
            <div>
              <p className="text-sm font-bold">Notification preferences</p>
              <p className="mt-0.5 text-xs text-muted">
                Choose which alerts you receive — push, email, or in-app only.
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
  n: RiderNotification;
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
  items: RiderNotification[],
): { label: string; items: RiderNotification[] }[] {
  const today: RiderNotification[] = [];
  const yesterday: RiderNotification[] = [];
  const earlier: RiderNotification[] = [];
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

  const groups: { label: string; items: RiderNotification[] }[] = [];
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
