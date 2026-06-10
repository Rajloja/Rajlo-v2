"use client";

/**
 * Tiny in-memory cache so the driver app can show its tab content
 * instantly on subsequent visits instead of a skeleton every time.
 *
 * The bottom-nav fires `prefetch()` for the common endpoints when it
 * mounts and again when a tab is tapped. Each page reads `getCached()`
 * on first render — if it hits, the skeleton is skipped and a
 * background re-fetch keeps the view fresh.
 *
 * Lives in module scope (per WebView instance) so it survives client
 * navigation but resets on app relaunch — that's the right trade-off
 * for a driver shift: warm during a session, fresh after a restart.
 */

type CacheEntry<T = unknown> = {
  promise: Promise<T | null>;
  data: T | null;
  fetchedAt: number;
};

const cache = new Map<string, CacheEntry>();
const FRESH_FOR_MS = 30_000;

export function prefetchDriverData<T = unknown>(url: string): Promise<T | null> {
  const existing = cache.get(url);
  if (existing && Date.now() - existing.fetchedAt < FRESH_FOR_MS) {
    return existing.promise as Promise<T | null>;
  }
  const promise = (async () => {
    try {
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) return null;
      const data = (await res.json()) as T;
      const entry = cache.get(url);
      if (entry) entry.data = data;
      return data;
    } catch {
      return null;
    }
  })();
  cache.set(url, { promise, data: null, fetchedAt: Date.now() });
  return promise;
}

export function getCachedDriverData<T = unknown>(url: string): T | null {
  return (cache.get(url)?.data as T | null) ?? null;
}

/** Manually populate the cache from a page's own fetch result, so the
 *  next visit to that page reads the data instantly. */
export function setCachedDriverData<T = unknown>(
  url: string,
  data: T,
): void {
  cache.set(url, {
    promise: Promise.resolve(data),
    data,
    fetchedAt: Date.now(),
  });
}

export function invalidateDriverData(url: string): void {
  cache.delete(url);
}

/** Endpoints that should be warm whenever the driver opens the app.
 *  Listed in priority order — the dashboard (where the driver lands)
 *  needs `stats`, `compliance`, `inbox`, and `rides/active` to render
 *  without skeletons; the `Me` tab needs `driver/me` + `me/avatar`;
 *  the rest cover the bottom-nav + drawer targets so every page in
 *  the portal opens with cached data on first paint instead of a
 *  loading spinner. Prefetch is cheap and dedup'd, so over-listing
 *  is fine — the only ones to leave out are POST-only or per-id URLs
 *  that can't be warmed without context. */
export const DRIVER_PREFETCH_URLS = [
  // Dashboard
  "/api/driver/stats",
  "/api/driver/compliance",
  "/api/driver/inbox",
  "/api/me/profile",
  // Trip tab — also used by the dashboard to show the "Active trip" banner
  "/api/driver/rides/active",
  // Earnings + history tabs share the same first-page URL — both use
  // limit=50, so a single prefetch warms both pages' first paint.
  "/api/driver/rides/history?limit=50&offset=0",
  // Profile (Me) tab
  "/api/driver/me",
  "/api/me/avatar",
  // Drawer pages
  "/api/wallet?limit=40",
  "/api/wallet/withdraw",
  "/api/driver/ratings",
  "/api/driver/notifications",
];
