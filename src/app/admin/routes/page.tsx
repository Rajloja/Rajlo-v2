"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Icon } from "@/components/icons";
import { ArcWatermark } from "@/components/arc-pattern";
import { FadeUp } from "@/components/anim";
import { ListRowSkeleton } from "@/components/skeleton";
import { formatJMD } from "@/lib/jamaica";

/**
 * /admin/routes — TA route catalogue management.
 *
 * Lists every corridor (active + inactive), supports search + parish
 * filter, lets the admin toggle active/edit/add. The 466 seeded
 * routes cover the bulk demand corridors; this surface is for filling
 * the gaps the parser couldn't extract from the TA PDF and keeping
 * the catalogue current as TA publishes new ones.
 */

type RouteRow = {
  id: string;
  origin: string;
  destination: string;
  parish: string | null;
  distanceKm: number;
  taFareJmd: number;
  formulaFareJmd: number;
  active: boolean;
  slug: string;
  createdAt: string;
  updatedAt: string;
};

type RoutesResponse = {
  routes: RouteRow[];
  totalCount: number;
  activeCount: number;
  pagination?: { hasMore: boolean };
};

const PAGE_SIZE = 200;

export default function AdminRoutesPage() {
  const [data, setData] = useState<RoutesResponse | null>(null);
  const [extra, setExtra] = useState<RouteRow[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadMoreError, setLoadMoreError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [parishFilter, setParishFilter] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState<"all" | "true" | "false">(
    "all",
  );
  const [editing, setEditing] = useState<RouteRow | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [showImport, setShowImport] = useState(false);

  const buildUrl = useCallback(
    (offset: number) => {
      const params = new URLSearchParams();
      if (parishFilter) params.set("parish", parishFilter);
      if (activeFilter !== "all") params.set("active", activeFilter);
      if (search.trim()) params.set("q", search.trim());
      params.set("limit", String(PAGE_SIZE));
      params.set("offset", String(offset));
      return `/api/admin/routes?${params.toString()}`;
    },
    [parishFilter, activeFilter, search],
  );

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(buildUrl(0));
      if (!res.ok) throw new Error("Failed to load routes");
      const json = (await res.json()) as RoutesResponse;
      setData(json);
      setExtra([]);
      setHasMore(json.pagination?.hasMore ?? false);
      setLoadMoreError(null);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't load routes.");
    } finally {
      setLoading(false);
    }
  }, [buildUrl]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const allRoutes: RouteRow[] = useMemo(() => {
    if (!data) return [];
    const firstIds = new Set(data.routes.map((r) => r.id));
    return [...data.routes, ...extra.filter((r) => !firstIds.has(r.id))];
  }, [data, extra]);

  const loadMore = async () => {
    setLoadingMore(true);
    setLoadMoreError(null);
    try {
      const res = await fetch(buildUrl(allRoutes.length));
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as RoutesResponse;
      setExtra((prev) => {
        const seen = new Set([
          ...(data?.routes ?? []).map((r) => r.id),
          ...prev.map((r) => r.id),
        ]);
        return [...prev, ...json.routes.filter((r) => !seen.has(r.id))];
      });
      setHasMore(json.pagination?.hasMore ?? false);
    } catch (e) {
      setLoadMoreError(
        e instanceof Error ? e.message : "Couldn't load more.",
      );
    } finally {
      setLoadingMore(false);
    }
  };

  const parishes = useMemo(() => {
    const set = new Set<string>();
    for (const r of allRoutes) if (r.parish) set.add(r.parish);
    return Array.from(set).sort();
  }, [allRoutes]);

  const grouped = useMemo(() => {
    const groups = new Map<string, RouteRow[]>();
    for (const r of allRoutes) {
      const key = r.parish ?? "Unassigned";
      const arr = groups.get(key) ?? [];
      arr.push(r);
      groups.set(key, arr);
    }
    return Array.from(groups.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([parish, rows]) => ({ parish, rows }));
  }, [allRoutes]);

  return (
    <div className="space-y-6">
      <FadeUp>
        <section className="relative overflow-hidden rounded-3xl bg-rajlo-black p-7 text-white shadow-xl shadow-rajlo-black/30 md:p-10">
          <ArcWatermark
            size={520}
            variant="white"
            className="absolute -right-24 -top-24 opacity-[0.06]"
          />
          <div className="relative flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="font-secondary text-xs font-bold uppercase tracking-wider text-rajlo-red">
                Route catalogue
              </p>
              <h1 className="mt-2 text-3xl font-extrabold tracking-tight md:text-4xl">
                TA-licensed corridors
              </h1>
              <p className="mt-1 text-sm text-white/75">
                {data
                  ? `${data.activeCount} active · ${data.totalCount - data.activeCount} hidden · ${data.totalCount} total`
                  : "Loading catalogue…"}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setShowImport(true)}
                className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-4 py-2.5 text-sm font-bold text-white backdrop-blur transition-all hover:-translate-y-0.5 hover:bg-white/20"
              >
                <Icon name="upload" className="h-4 w-4" />
                Import CSV
              </button>
              <button
                type="button"
                onClick={() => setShowAdd(true)}
                className="inline-flex items-center gap-2 rounded-full bg-rajlo-red px-5 py-2.5 text-sm font-bold text-white shadow-md shadow-rajlo-red/30 hover:-translate-y-0.5 hover:bg-primary-hover"
              >
                <Icon name="plus-circle" className="h-4 w-4" />
                Add route
              </button>
            </div>
          </div>
        </section>
      </FadeUp>

      <FadeUp delay={0.05}>
        <section className="rounded-3xl border border-line bg-surface p-5 md:p-6">
          <div className="flex flex-col gap-3 md:flex-row md:items-center">
            <label className="relative flex-1">
              <span className="sr-only">Search routes</span>
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted">
                <Icon name="search" className="h-4 w-4" />
              </span>
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search origin or destination…"
                className="block w-full rounded-xl border border-line bg-surface-soft py-2.5 pl-10 pr-4 text-sm font-medium outline-none placeholder:text-muted focus:border-rajlo-red focus:ring-2 focus:ring-rajlo-red/20"
              />
            </label>
            <div className="inline-flex overflow-hidden rounded-full border border-line text-[11px] font-bold">
              {(["all", "true", "false"] as const).map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setActiveFilter(v)}
                  className={`px-3 py-2 ${
                    activeFilter === v
                      ? "bg-rajlo-black text-white"
                      : "bg-surface text-muted hover:bg-surface-soft"
                  }`}
                >
                  {v === "all" ? "All" : v === "true" ? "Active" : "Hidden"}
                </button>
              ))}
            </div>
          </div>
          {parishes.length > 0 && (
            <div className="-mx-1 mt-3 flex flex-wrap gap-1.5">
              {parishes.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() =>
                    setParishFilter((cur) => (cur === p ? null : p))
                  }
                  className={`rounded-full px-3 py-1.5 text-xs font-bold transition-colors ${
                    parishFilter === p
                      ? "bg-rajlo-red text-white"
                      : "border border-line bg-surface text-muted hover:border-rajlo-red hover:text-rajlo-red"
                  }`}
                >
                  {p}
                </button>
              ))}
              {parishFilter && (
                <button
                  type="button"
                  onClick={() => setParishFilter(null)}
                  className="rounded-full px-3 py-1.5 text-xs font-bold text-rajlo-red hover:underline"
                >
                  Clear
                </button>
              )}
            </div>
          )}
        </section>
      </FadeUp>

      {error && (
        <div className="rounded-xl border border-rajlo-red/30 bg-primary-soft px-4 py-3 text-sm text-rajlo-red">
          {error}
        </div>
      )}

      {loading && (
        <div className="space-y-2.5">
          {[0, 1, 2, 3, 4].map((i) => (
            <ListRowSkeleton key={i} />
          ))}
        </div>
      )}

      {!loading && grouped.length === 0 && (
        <div className="rounded-2xl border border-dashed border-line bg-surface-soft p-10 text-center">
          <p className="text-sm font-bold">No routes match those filters</p>
          <p className="mt-1 text-xs text-muted">
            Try clearing the filter or adding a new route.
          </p>
        </div>
      )}

      {!loading && grouped.length > 0 && (
        <div className="space-y-6">
          <p className="text-[11px] font-semibold text-muted">
            Showing {allRoutes.length} of {data?.totalCount ?? allRoutes.length} routes
          </p>
          {grouped.map((g) => (
            <section key={g.parish}>
              <p className="font-secondary mb-2 text-[10px] font-bold uppercase tracking-wider text-muted">
                {g.parish} · {g.rows.length}
              </p>
              <ul className="overflow-hidden rounded-2xl border border-line bg-surface">
                {g.rows.map((r, i) => (
                  <li
                    key={r.id}
                    className={`flex flex-wrap items-center gap-3 px-4 py-3 ${
                      i > 0 ? "border-t border-line" : ""
                    } ${r.active ? "" : "bg-surface-soft/40"}`}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p
                          className={`text-sm font-bold ${r.active ? "" : "text-muted line-through"}`}
                        >
                          {r.origin} <span className="text-rajlo-red">→</span>{" "}
                          {r.destination}
                        </p>
                        {!r.active && (
                          <span className="rounded-full bg-rajlo-black/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-muted">
                            Hidden
                          </span>
                        )}
                        {r.taFareJmd !== r.formulaFareJmd && (
                          <span
                            className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-800 ring-1 ring-amber-200"
                            title={`Formula says ${formatJMD(r.formulaFareJmd)}`}
                          >
                            Drift {formatJMD(r.taFareJmd - r.formulaFareJmd)}
                          </span>
                        )}
                      </div>
                      <p className="mt-0.5 text-[11px] text-muted">
                        {r.distanceKm.toFixed(1)} km · TA {formatJMD(r.taFareJmd)} ·
                        formula {formatJMD(r.formulaFareJmd)}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setEditing(r)}
                      className="rounded-full border border-line bg-surface px-3 py-1.5 text-xs font-bold text-muted hover:border-rajlo-red hover:text-rajlo-red"
                    >
                      Edit
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ))}
          {hasMore && (
            <div className="pt-1 text-center">
              <button
                type="button"
                onClick={loadMore}
                disabled={loadingMore}
                className="inline-flex items-center gap-2 rounded-full border border-line bg-surface px-4 py-1.5 text-xs font-bold text-foreground transition-colors hover:bg-surface-soft disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loadingMore ? (
                  <span className="h-3 w-3 animate-spin rounded-full border-2 border-rajlo-red border-t-transparent" />
                ) : null}
                {loadingMore ? "Loading…" : "Load more"}
              </button>
            </div>
          )}
          {loadMoreError && (
            <p className="text-center text-xs font-semibold text-rajlo-red">
              {loadMoreError}
            </p>
          )}
        </div>
      )}

      {editing && (
        <RouteEditor
          route={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            void refresh();
          }}
        />
      )}

      {showAdd && (
        <RouteEditor
          route={null}
          onClose={() => setShowAdd(false)}
          onSaved={() => {
            setShowAdd(false);
            void refresh();
          }}
        />
      )}

      {showImport && (
        <CsvImporter
          onClose={() => setShowImport(false)}
          onImported={() => {
            setShowImport(false);
            void refresh();
          }}
        />
      )}
    </div>
  );
}

/* ════════════ Editor (modal) ════════════ */

function RouteEditor({
  route,
  onClose,
  onSaved,
}: {
  route: RouteRow | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isNew = route == null;
  const [origin, setOrigin] = useState(route?.origin ?? "");
  const [destination, setDestination] = useState(route?.destination ?? "");
  const [parish, setParish] = useState(route?.parish ?? "");
  const [distanceKm, setDistanceKm] = useState(
    route ? route.distanceKm.toString() : "",
  );
  const [taFareJmd, setTaFareJmd] = useState(
    route ? route.taFareJmd.toString() : "",
  );
  const [active, setActive] = useState(route?.active ?? true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async () => {
    setSaving(true);
    setErr(null);
    try {
      const body = {
        origin: origin.trim(),
        destination: destination.trim(),
        parish: parish.trim() || null,
        distanceKm: Number(distanceKm),
        taFareJmd: taFareJmd ? Number(taFareJmd) : undefined,
        active,
      };
      const res = isNew
        ? await fetch("/api/admin/routes", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          })
        : await fetch(`/api/admin/routes/${route.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          });
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
      };
      if (!res.ok || !json.ok) {
        throw new Error(json.error ?? "Save failed");
      }
      onSaved();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 grid place-items-center bg-black/60 px-4 py-8 backdrop-blur-sm"
    >
      <div className="w-full max-w-lg overflow-hidden rounded-3xl border border-line bg-surface shadow-2xl">
        <div className="flex items-start justify-between border-b border-line bg-surface-soft px-6 py-5">
          <div>
            <p className="font-secondary text-xs font-bold uppercase tracking-wider text-rajlo-red">
              {isNew ? "Add route" : "Edit route"}
            </p>
            <h2 className="mt-1 text-lg font-extrabold tracking-tight">
              {isNew ? "Create a TA-licensed corridor" : "Update corridor"}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="grid h-8 w-8 place-items-center rounded-md text-muted hover:bg-surface hover:text-foreground"
            aria-label="Close"
          >
            <Icon name="x" className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-4 px-6 py-5">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Origin">
              <input
                type="text"
                value={origin}
                onChange={(e) => setOrigin(e.target.value)}
                placeholder="Half Way Tree"
                className="w-full rounded-xl border border-line bg-surface-soft px-3 py-2 text-sm font-medium outline-none focus:border-rajlo-red focus:ring-2 focus:ring-rajlo-red/15"
              />
            </Field>
            <Field label="Destination">
              <input
                type="text"
                value={destination}
                onChange={(e) => setDestination(e.target.value)}
                placeholder="Papine"
                className="w-full rounded-xl border border-line bg-surface-soft px-3 py-2 text-sm font-medium outline-none focus:border-rajlo-red focus:ring-2 focus:ring-rajlo-red/15"
              />
            </Field>
          </div>

          <Field label="Parish">
            <input
              type="text"
              value={parish}
              onChange={(e) => setParish(e.target.value)}
              placeholder="Kingston and St. Andrew"
              className="w-full rounded-xl border border-line bg-surface-soft px-3 py-2 text-sm font-medium outline-none focus:border-rajlo-red focus:ring-2 focus:ring-rajlo-red/15"
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Distance (km)">
              <input
                type="number"
                step="0.1"
                min={0}
                value={distanceKm}
                onChange={(e) => setDistanceKm(e.target.value)}
                placeholder="5.5"
                className="w-full rounded-xl border border-line bg-surface-soft px-3 py-2 text-sm font-medium outline-none focus:border-rajlo-red focus:ring-2 focus:ring-rajlo-red/15"
              />
            </Field>
            <Field
              label="TA fare (JMD)"
              hint="Leave blank to default to formula"
            >
              <input
                type="number"
                step="10"
                min={0}
                value={taFareJmd}
                onChange={(e) => setTaFareJmd(e.target.value)}
                placeholder="auto"
                className="w-full rounded-xl border border-line bg-surface-soft px-3 py-2 text-sm font-medium outline-none focus:border-rajlo-red focus:ring-2 focus:ring-rajlo-red/15"
              />
            </Field>
          </div>

          <label className="flex items-center gap-2 text-sm font-medium">
            <input
              type="checkbox"
              checked={active}
              onChange={(e) => setActive(e.target.checked)}
              className="h-4 w-4 accent-rajlo-red"
            />
            Active (drivers can run sessions on this route)
          </label>

          {err && (
            <p className="rounded-xl border border-rajlo-red/30 bg-primary-soft px-3 py-2 text-sm text-rajlo-red">
              {err}
            </p>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-line bg-surface-soft px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="rounded-full border border-line bg-surface px-4 py-2 text-xs font-bold text-muted hover:bg-surface disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-full bg-rajlo-red px-5 py-2 text-xs font-bold text-white shadow-md shadow-rajlo-red/25 hover:-translate-y-0.5 hover:bg-primary-hover disabled:opacity-50"
          >
            {saving ? (
              <>
                <span className="h-3 w-3 animate-spin rounded-full border-2 border-white border-t-transparent" />
                Saving…
              </>
            ) : (
              <>{isNew ? "Create route" : "Save changes"}</>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="font-secondary text-[11px] font-bold uppercase tracking-wider text-muted">
        {label}
      </span>
      <div className="mt-1.5">{children}</div>
      {hint && <p className="mt-1 text-[10px] text-muted">{hint}</p>}
    </label>
  );
}

/* ════════════ CSV import (modal) ════════════ */

type ImportOutcome = {
  line: number;
  origin?: string;
  destination?: string;
  outcome: "added" | "updated" | "skipped" | "failed";
  reason?: string;
};

type ImportSummary = {
  added: number;
  updated: number;
  failed: number;
  skipped: number;
};

const CSV_TEMPLATE =
  "origin,destination,parish,distance_km,ta_fare_jmd\nHalf Way Tree,Papine,Kingston and St. Andrew,5.5,140\nMandeville,Christiana,Manchester,18,240\n";

function CsvImporter({
  onClose,
  onImported,
}: {
  onClose: () => void;
  onImported: () => void;
}) {
  const [csv, setCsv] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{
    summary: ImportSummary;
    outcomes: ImportOutcome[];
  } | null>(null);

  const handleFile = async (file: File) => {
    if (file.size > 256 * 1024) {
      setError(
        `File is ${(file.size / 1024).toFixed(1)} KB; max 256 KB. Split into smaller batches.`,
      );
      return;
    }
    setError(null);
    const text = await file.text();
    setCsv(text);
  };

  const submit = async () => {
    if (!csv.trim()) {
      setError("Paste CSV or pick a file first.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/routes/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ csv }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        summary?: ImportSummary;
        outcomes?: ImportOutcome[];
        error?: string;
      };
      if (!res.ok || !json.ok || !json.summary) {
        throw new Error(json.error ?? "Import failed");
      }
      setResult({ summary: json.summary, outcomes: json.outcomes ?? [] });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Import failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 grid place-items-center bg-black/60 px-4 py-8 backdrop-blur-sm"
    >
      <div className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-3xl border border-line bg-surface shadow-2xl">
        <div className="flex items-start justify-between border-b border-line bg-surface-soft px-6 py-5">
          <div>
            <p className="font-secondary text-xs font-bold uppercase tracking-wider text-rajlo-red">
              Bulk import
            </p>
            <h2 className="mt-1 text-lg font-extrabold tracking-tight">
              CSV import — fill route catalogue gaps
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="grid h-8 w-8 place-items-center rounded-md text-muted hover:bg-surface hover:text-foreground"
            aria-label="Close"
          >
            <Icon name="x" className="h-4 w-4" />
          </button>
        </div>

        {!result ? (
          <div className="flex-1 space-y-4 overflow-y-auto px-6 py-5">
            <p className="text-xs text-muted">
              Header row required:{" "}
              <code className="rounded bg-surface-soft px-1.5 py-0.5 font-mono text-[11px]">
                origin, destination, parish, distance_km, ta_fare_jmd
              </code>
              . <strong>parish</strong> and <strong>ta_fare_jmd</strong> are
              optional — when fare is blank we fill from the formula. Existing
              rows match by slug and update in place.
            </p>

            <div className="flex flex-wrap items-center gap-2">
              <label className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-line bg-surface px-4 py-2 text-xs font-bold text-foreground hover:border-rajlo-red hover:text-rajlo-red">
                <Icon name="upload" className="h-3.5 w-3.5" />
                Choose file
                <input
                  type="file"
                  accept=".csv,text/csv,text/plain"
                  className="sr-only"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void handleFile(f);
                  }}
                />
              </label>
              <button
                type="button"
                onClick={() => setCsv(CSV_TEMPLATE)}
                className="rounded-full border border-line bg-surface px-3 py-1.5 text-xs font-bold text-muted hover:border-rajlo-red hover:text-rajlo-red"
              >
                Load template
              </button>
            </div>

            <label className="block">
              <span className="sr-only">CSV body</span>
              <textarea
                value={csv}
                onChange={(e) => setCsv(e.target.value)}
                rows={10}
                placeholder="origin,destination,parish,distance_km,ta_fare_jmd&#10;Half Way Tree,Papine,Kingston and St. Andrew,5.5,140"
                className="block w-full rounded-xl border border-line bg-surface-soft px-3 py-3 font-mono text-[11px] outline-none focus:border-rajlo-red focus:ring-2 focus:ring-rajlo-red/15"
                spellCheck={false}
              />
            </label>

            {error && (
              <p className="rounded-xl border border-rajlo-red/30 bg-primary-soft px-3 py-2 text-sm text-rajlo-red">
                {error}
              </p>
            )}
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto px-6 py-5">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <SummaryStat label="Added" value={result.summary.added} tone="emerald" />
              <SummaryStat label="Updated" value={result.summary.updated} tone="black" />
              <SummaryStat label="Failed" value={result.summary.failed} tone="red" />
              <SummaryStat label="Skipped" value={result.summary.skipped} tone="muted" />
            </div>

            {result.outcomes.filter((o) => o.outcome === "failed").length > 0 && (
              <div className="mt-5">
                <p className="font-secondary text-[10px] font-bold uppercase tracking-wider text-rajlo-red">
                  Failed rows
                </p>
                <ul className="mt-2 max-h-60 space-y-1 overflow-y-auto">
                  {result.outcomes
                    .filter((o) => o.outcome === "failed")
                    .map((o) => (
                      <li
                        key={`${o.line}-${o.origin}`}
                        className="rounded-lg border border-rajlo-red/20 bg-primary-soft px-3 py-2 text-[11px]"
                      >
                        <span className="font-mono font-bold text-rajlo-red">
                          line {o.line}
                        </span>{" "}
                        <span className="text-rajlo-black/80">
                          {o.origin && o.destination
                            ? `${o.origin} → ${o.destination}`
                            : ""}
                        </span>
                        <span className="block text-rajlo-black/70">
                          {o.reason}
                        </span>
                      </li>
                    ))}
                </ul>
              </div>
            )}
          </div>
        )}

        <div className="flex items-center justify-end gap-2 border-t border-line bg-surface-soft px-6 py-4">
          {result ? (
            <button
              type="button"
              onClick={onImported}
              className="inline-flex items-center gap-2 rounded-full bg-rajlo-red px-5 py-2 text-xs font-bold text-white shadow-md shadow-rajlo-red/25 hover:-translate-y-0.5 hover:bg-primary-hover"
            >
              Done
              <Icon name="check-circle" className="h-3.5 w-3.5" />
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={onClose}
                disabled={busy}
                className="rounded-full border border-line bg-surface px-4 py-2 text-xs font-bold text-muted hover:bg-surface disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={submit}
                disabled={busy || !csv.trim()}
                className="inline-flex items-center gap-2 rounded-full bg-rajlo-red px-5 py-2 text-xs font-bold text-white shadow-md shadow-rajlo-red/25 hover:-translate-y-0.5 hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50"
              >
                {busy ? (
                  <>
                    <span className="h-3 w-3 animate-spin rounded-full border-2 border-white border-t-transparent" />
                    Importing…
                  </>
                ) : (
                  <>
                    Import
                    <Icon name="arrow-right" className="h-3.5 w-3.5" />
                  </>
                )}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function SummaryStat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "emerald" | "black" | "red" | "muted";
}) {
  const classes =
    tone === "emerald"
      ? "border-emerald-200 bg-emerald-50 text-emerald-900"
      : tone === "red"
        ? "border-rajlo-red/30 bg-primary-soft text-rajlo-red"
        : tone === "black"
          ? "border-line bg-surface text-foreground"
          : "border-line bg-surface-soft text-muted";
  return (
    <div className={`rounded-xl border p-3 text-center ${classes}`}>
      <p className="font-secondary text-[10px] font-bold uppercase tracking-wider opacity-70">
        {label}
      </p>
      <p className="mt-0.5 text-2xl font-extrabold tracking-tight">{value}</p>
    </div>
  );
}
