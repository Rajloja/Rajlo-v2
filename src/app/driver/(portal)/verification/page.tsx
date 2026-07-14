"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Icon } from "@/components/icons";
import { ArcWatermark } from "@/components/arc-pattern";
import { FadeUp } from "@/components/anim";
import { HeroSkeleton, Skeleton } from "@/components/skeleton";
import {
  complianceThresholds,
  type DocStatus,
  type TADocument,
} from "@/lib/mock-data";

/**
 * Driver TA verification page — production version.
 *
 * Loads the SIGNED-IN driver's compliance payload from the auth-aware
 * `/api/driver/compliance` endpoint (no more hard-coded DRV-1031). The
 * page renders:
 *
 *   1. Hero with the headline compliance verdict (all good / X expired
 *      / Y renew within 7 days etc.) — driven by the same `summary`
 *      the dashboard reads
 *   2. Filter pills (All / Action needed / Expiring / Approved)
 *   3. One card per required TA document, with status pill, expiry
 *      countdown, admin note (if any), and a quick link to the
 *      onboarding/resubmit flow when something needs uploading
 *   4. "Renew at TA" reference link block
 *
 * Replaces the old hand-rolled mock-driven version that used emoji
 * status icons and a select-from-list editor — that pattern was a
 * leftover from early scaffolding and didn't fit the current brand.
 */

type CompliancePayload = {
  driverId: string;
  docs: TADocument[];
  summary: { expired: number; urgent: number; upcoming: number };
  source: "supabase" | "mock";
};

type Tab = "all" | "action" | "soon" | "ok";

function daysUntil(dateStr?: string): number | null {
  if (!dateStr) return null;
  const diff = new Date(dateStr).getTime() - Date.now();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

function severityRank(doc: TADocument): number {
  // Lower = needs attention sooner. Used to sort the list so the
  // most-urgent doc lands at the top of every filter view.
  const days = daysUntil(doc.expiryDate);
  if (doc.status === "expired" || (days !== null && days < 0)) return 0;
  if (doc.status === "missing") return 1;
  if (doc.status === "rejected") return 2;
  if (doc.status === "pending") return 3;
  if (days !== null && days <= complianceThresholds.criticalDays) return 4;
  if (days !== null && days <= complianceThresholds.urgentDays) return 5;
  if (days !== null && days <= complianceThresholds.warningDays) return 6;
  return 9;
}

function statusBadge(doc: TADocument): {
  label: string;
  tone: "danger" | "warning" | "info" | "good";
} {
  const days = daysUntil(doc.expiryDate);
  if (doc.status === "expired" || (days !== null && days < 0))
    return { label: "Expired", tone: "danger" };
  if (doc.status === "missing")
    return { label: "Not uploaded", tone: "danger" };
  if (doc.status === "rejected")
    return { label: "Rejected — resubmit", tone: "danger" };
  if (doc.status === "pending")
    return { label: "Pending review", tone: "info" };
  if (days !== null && days <= complianceThresholds.urgentDays)
    return { label: `Renew · ${days}d left`, tone: "warning" };
  if (days !== null && days <= complianceThresholds.warningDays)
    return { label: `Renew · ${days}d left`, tone: "info" };
  return { label: "Approved", tone: "good" };
}

function tonePalette(tone: "danger" | "warning" | "info" | "good") {
  switch (tone) {
    case "danger":
      return {
        pill: "bg-primary-soft text-rajlo-red border-rajlo-red/30",
        accent: "border-l-rajlo-red",
      };
    case "warning":
      return {
        pill: "bg-amber-50 text-amber-800 border-amber-300",
        accent: "border-l-amber-500",
      };
    case "info":
      return {
        pill: "bg-emerald-50 text-emerald-800 border-emerald-300",
        accent: "border-l-emerald-500",
      };
    case "good":
      return {
        pill: "bg-emerald-50 text-emerald-800 border-emerald-300",
        accent: "border-l-emerald-500",
      };
  }
}

function renewalLabel(periodDays: number): string {
  if (periodDays === 0) return "Permanent";
  if (periodDays <= 365) return "Renew yearly";
  if (periodDays <= 730) return "Renew every 2 years";
  if (periodDays <= 1825) return "Renew every 5 years";
  return `Renew every ${Math.round(periodDays / 365)} years`;
}

const TABS: { key: Tab; label: string }[] = [
  { key: "all", label: "All" },
  { key: "action", label: "Action needed" },
  { key: "soon", label: "Expiring" },
  { key: "ok", label: "Approved" },
];

const ACTION_STATES: DocStatus[] = ["expired", "missing", "rejected"];

export default function DriverVerificationPage() {
  const [data, setData] = useState<CompliancePayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("all");
  const [previewDoc, setPreviewDoc] = useState<TADocument | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/driver/compliance");
        if (!res.ok) {
          const j = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(j.error ?? `HTTP ${res.status}`);
        }
        const json = (await res.json()) as CompliancePayload;
        if (!cancelled) setData(json);
      } catch (e) {
        if (!cancelled)
          setError(
            e instanceof Error ? e.message : "Couldn't load compliance.",
          );
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const sortedDocs = useMemo(
    () =>
      data
        ? [...data.docs].sort((a, b) => severityRank(a) - severityRank(b))
        : [],
    [data],
  );

  const filtered = useMemo(() => {
    if (tab === "all") return sortedDocs;
    return sortedDocs.filter((d) => {
      const days = daysUntil(d.expiryDate);
      if (tab === "action") {
        if (ACTION_STATES.includes(d.status)) return true;
        return days !== null && days < 0;
      }
      if (tab === "soon") {
        if (ACTION_STATES.includes(d.status)) return false;
        if (d.status === "pending") return false;
        return (
          days !== null && days >= 0 && days <= complianceThresholds.warningDays
        );
      }
      if (tab === "ok") {
        if (ACTION_STATES.includes(d.status)) return false;
        if (d.status === "pending") return false;
        return days === null || days > complianceThresholds.warningDays;
      }
      return true;
    });
  }, [sortedDocs, tab]);

  if (loading) {
    return (
      <div className="mx-auto max-w-3xl space-y-5 px-2 py-2 md:px-3 md:py-8">
        <HeroSkeleton />
        {[0, 1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-28 w-full" rounded="xl" />
        ))}
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center">
        <span className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-primary-soft">
          <span aria-hidden className="text-3xl leading-none">
            😢
          </span>
        </span>
        <h1 className="mt-5 text-2xl font-extrabold tracking-tight">
          Couldn&apos;t load compliance
        </h1>
        <p className="mt-2 text-sm text-muted">
          {error ?? "Something went wrong. Please try again."}
        </p>
      </div>
    );
  }

  const { summary } = data;
  const heroTone =
    summary.expired > 0
      ? "danger"
      : summary.urgent > 0
      ? "warning"
      : summary.upcoming > 0
      ? "info"
      : "good";

  const heroTitle =
    heroTone === "danger"
      ? "Action needed"
      : heroTone === "warning"
      ? "Renewals due soon"
      : heroTone === "info"
      ? "Stay ahead of renewals"
      : "All compliance up to date";
  const heroSubtitle =
    heroTone === "danger"
      ? "One or more documents are expired or missing. Your account stays inactive until they're back in good standing."
      : heroTone === "warning"
      ? "Documents need renewal within 7 days. Get them in before they expire to avoid suspension."
      : heroTone === "info"
      ? "Some documents are coming up for renewal. We'll keep you posted as expiry approaches."
      : "Every Transport Authority requirement on file is approved and current. Keep it up.";

  return (
    <div className="mx-auto max-w-3xl space-y-5 py-2 md:px-3 md:py-8">
      {/* Hero */}
      <FadeUp>
        <div
          className={`relative overflow-hidden rounded-3xl p-7 text-white shadow-2xl md:p-9 ${
            heroTone === "danger"
              ? "bg-rajlo-red shadow-rajlo-red/30"
              : heroTone === "warning"
              ? "bg-rajlo-black shadow-rajlo-black/30"
              : "bg-emerald-700 shadow-emerald-700/30"
          }`}
        >
          <ArcWatermark
            size={420}
            variant={heroTone === "warning" ? "red" : "white"}
            className="absolute -right-20 -bottom-32 opacity-[0.18]"
          />
          <div className="relative">
            <p className="font-secondary text-xs font-bold uppercase tracking-wider text-white/85">
              TA compliance · {data.driverId}
            </p>
            <h1 className="mt-2 text-3xl font-extrabold leading-tight tracking-tight md:text-4xl">
              {heroTitle}
            </h1>
            <p className="mt-2 max-w-md text-sm text-white/85">
              {heroSubtitle}
            </p>

            {/* Stat strip — counts of each severity bucket */}
            <div className="mt-5 grid grid-cols-3 gap-3 border-t border-white/15 pt-4">
              <HeroCount
                value={summary.expired}
                label="Expired or missing"
                hot={summary.expired > 0}
              />
              <HeroCount
                value={summary.urgent}
                label="≤ 7 days"
                hot={summary.urgent > 0}
              />
              <HeroCount
                value={summary.upcoming}
                label="≤ 60 days"
                hot={false}
              />
            </div>
          </div>
        </div>
      </FadeUp>

      {/* Filter tabs */}
      <FadeUp delay={0.05}>
        <div className="-mx-4 overflow-x-auto px-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <div className="inline-flex gap-1 rounded-full border border-line bg-surface-soft p-1">
            {TABS.map((t) => {
              const active = tab === t.key;
              const count =
                t.key === "all"
                  ? sortedDocs.length
                  : t.key === "action"
                  ? sortedDocs.filter((d) => {
                      const days = daysUntil(d.expiryDate);
                      return (
                        ACTION_STATES.includes(d.status) ||
                        (days !== null && days < 0)
                      );
                    }).length
                  : t.key === "soon"
                  ? sortedDocs.filter((d) => {
                      if (ACTION_STATES.includes(d.status)) return false;
                      if (d.status === "pending") return false;
                      const days = daysUntil(d.expiryDate);
                      return (
                        days !== null &&
                        days >= 0 &&
                        days <= complianceThresholds.warningDays
                      );
                    }).length
                  : sortedDocs.filter((d) => {
                      if (ACTION_STATES.includes(d.status)) return false;
                      if (d.status === "pending") return false;
                      const days = daysUntil(d.expiryDate);
                      return (
                        days === null || days > complianceThresholds.warningDays
                      );
                    }).length;
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

      {/* Doc cards */}
      {filtered.length === 0 ? (
        <FadeUp delay={0.08}>
          <div className="rounded-2xl border border-dashed border-line bg-surface-soft p-10 text-center">
            <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-emerald-100 text-emerald-700">
              <Icon name="check-circle" className="h-5 w-5" />
            </span>
            <p className="mt-3 text-sm font-extrabold tracking-tight">
              Nothing in this view
            </p>
            <p className="mx-auto mt-1 max-w-sm text-xs text-muted">
              No documents match this filter. Switch tab above.
            </p>
          </div>
        </FadeUp>
      ) : (
        <div className="space-y-3">
          {filtered.map((doc, i) => {
            const badge = statusBadge(doc);
            const palette = tonePalette(badge.tone);
            const days = daysUntil(doc.expiryDate);
            const needsAction =
              ACTION_STATES.includes(doc.status) || (days !== null && days < 0);

            return (
              <FadeUp key={doc.id} delay={0.06 + i * 0.02}>
                <div
                  className={`rounded-2xl border border-l-4 border-line bg-surface p-5 ${palette.accent}`}
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
                      className={`shrink-0 rounded-full border px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wider ${palette.pill}`}
                    >
                      {badge.label}
                    </span>
                  </div>

                  <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted">
                    <span className="flex items-center gap-1.5">
                      <Icon name="clock" className="h-3 w-3" />
                      {renewalLabel(doc.renewalPeriodDays)}
                    </span>
                    {doc.expiryDate && (
                      <span className="flex items-center gap-1.5">
                        <Icon name="check-circle" className="h-3 w-3" />
                        Expires{" "}
                        {new Date(doc.expiryDate).toLocaleDateString("en-JM", {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        })}
                      </span>
                    )}
                  </div>

                  {doc.note && (
                    <div className="mt-3 rounded-xl bg-primary-soft px-3 py-2 text-[11px] leading-relaxed text-foreground">
                      <p className="font-bold text-rajlo-red">
                        Note from operations
                      </p>
                      <p className="mt-0.5">{doc.note}</p>
                    </div>
                  )}

                  {(needsAction || badge.tone === "warning" || doc.hasFile) && (
                    <div className="mt-4 flex flex-wrap gap-2">
                      {(needsAction || badge.tone === "warning") && (
                        <Link
                          href={`/driver/renew/${doc.id}`}
                          className="inline-flex items-center gap-1.5 rounded-full bg-rajlo-red px-4 py-2 text-xs font-bold text-white transition-all hover:-translate-y-0.5 hover:bg-primary-hover"
                        >
                          {needsAction ? "Upload / resubmit" : "Renew now"}
                          <Icon name="arrow-right" className="h-3 w-3" />
                        </Link>
                      )}
                      {doc.hasFile && (
                        <button
                          type="button"
                          onClick={() => setPreviewDoc(doc)}
                          className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface px-4 py-2 text-xs font-bold text-foreground transition-all hover:-translate-y-0.5 hover:border-rajlo-red hover:text-rajlo-red"
                        >
                          <Icon name="file-text" className="h-3.5 w-3.5" />
                          View document
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </FadeUp>
            );
          })}
        </div>
      )}

      {/* External renewal references */}
      <FadeUp delay={0.18}>
        <div className="rounded-2xl border border-line bg-surface p-5">
          <p className="font-secondary text-[10px] font-bold uppercase tracking-wider text-muted">
            Where to renew
          </p>
          <ul className="mt-3 space-y-2 text-sm">
            <RenewalLink
              label="Transport Authority"
              detail="Franchise + driver badge renewals · 119 Maxfield Avenue"
              href="https://www.ta.org.jm/"
            />
            <RenewalLink
              label="Island Traffic Authority"
              detail="Driver's licence + COF inspections"
              href="https://www.ita.gov.jm/"
            />
            <RenewalLink
              label="Tax Administration Jamaica"
              detail="TRN records"
              href="https://www.jamaicatax.gov.jm/"
            />
          </ul>
        </div>
      </FadeUp>

      {previewDoc && (
        <DocPreviewModal
          doc={previewDoc}
          onClose={() => setPreviewDoc(null)}
        />
      )}
    </div>
  );
}

/**
 * Full-screen viewer for an approved document. Fetches a short-lived
 * signed URL for the driver's OWN file from /api/driver/document-url
 * and renders the image inline (or the PDF in an iframe). Mirrors the
 * admin verification preview so it feels consistent.
 */
function DocPreviewModal({
  doc,
  onClose,
}: {
  doc: TADocument;
  onClose: () => void;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(doc.fileName ?? null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          `/api/driver/document-url?docKey=${encodeURIComponent(doc.id)}`,
        );
        const json = (await res.json().catch(() => ({}))) as {
          url?: string;
          fileName?: string | null;
          error?: string;
        };
        if (cancelled) return;
        if (!res.ok || !json.url) {
          setError(json.error ?? "Preview unavailable");
          return;
        }
        setUrl(json.url);
        if (json.fileName) setFileName(json.fileName);
      } catch {
        if (!cancelled) setError("Could not load preview");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [doc.id]);

  // Lock page scroll while the viewer is open.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  const isImage = /\.(jpe?g|png|gif|webp|heic)$/i.test(fileName ?? "");
  const isPdf = /\.pdf$/i.test(fileName ?? "");

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-rajlo-black/70 p-3 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={`${doc.label} preview`}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex h-[88vh] w-full max-w-3xl flex-col overflow-hidden rounded-3xl bg-surface shadow-2xl"
      >
        <header className="flex items-center justify-between gap-3 border-b border-line px-5 py-3">
          <div className="min-w-0">
            <p className="text-sm font-extrabold tracking-tight">{doc.label}</p>
            {fileName && (
              <p className="truncate text-xs text-muted">{fileName}</p>
            )}
          </div>
          <div className="flex items-center gap-2">
            {url && (
              <a
                href={url}
                download
                className="rounded-full border border-line bg-surface px-3 py-1.5 text-xs font-bold hover:bg-surface-soft"
              >
                Download
              </a>
            )}
            <button
              type="button"
              onClick={onClose}
              aria-label="Close preview"
              className="grid h-8 w-8 place-items-center rounded-lg text-muted hover:bg-surface-soft"
            >
              <Icon name="x" className="h-4 w-4" />
            </button>
          </div>
        </header>

        <div className="flex-1 overflow-auto bg-surface-soft">
          {error ? (
            <div className="grid h-full place-items-center p-8 text-center">
              <div>
                <span aria-hidden className="block text-4xl leading-none">
                  😢
                </span>
                <p className="mt-3 text-sm font-semibold">{error}</p>
                <p className="mt-1 text-xs text-muted">
                  The file may have been removed. Try again later.
                </p>
              </div>
            </div>
          ) : !url ? (
            <div className="grid h-full place-items-center p-8">
              <Skeleton
                className="h-full max-h-[480px] w-full max-w-lg"
                rounded="2xl"
              />
            </div>
          ) : isImage ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={url}
              alt={doc.label}
              className="mx-auto h-full w-auto object-contain"
            />
          ) : isPdf ? (
            <iframe src={url} title={doc.label} className="h-full w-full" />
          ) : (
            <div className="grid h-full place-items-center p-8 text-center">
              <div>
                <Icon name="file-text" className="mx-auto h-8 w-8 text-muted" />
                <p className="mt-3 text-sm font-semibold">
                  Preview not supported for this file type
                </p>
                <a
                  href={url}
                  download
                  className="mt-3 inline-block rounded-full bg-rajlo-red px-4 py-2 text-xs font-bold text-white hover:bg-primary-hover"
                >
                  Download instead
                </a>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function HeroCount({
  value,
  label,
  hot,
}: {
  value: number;
  label: string;
  hot: boolean;
}) {
  return (
    <div>
      <p className="text-[10px] font-bold uppercase tracking-wider text-white/55">
        {label}
      </p>
      <p
        className={`mt-0.5 text-2xl font-extrabold tracking-tight ${
          hot ? "text-white" : "text-white/85"
        }`}
      >
        {value}
      </p>
    </div>
  );
}

function RenewalLink({
  label,
  detail,
  href,
}: {
  label: string;
  detail: string;
  href: string;
}) {
  return (
    <li>
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="group flex items-start justify-between gap-3 rounded-xl px-3 py-2 transition-colors hover:bg-surface-soft"
      >
        <div className="min-w-0">
          <p className="text-sm font-bold">{label}</p>
          <p className="mt-0.5 text-xs text-muted">{detail}</p>
        </div>
        <Icon
          name="arrow-right"
          className="mt-1 h-4 w-4 text-muted transition-transform group-hover:translate-x-0.5 group-hover:text-rajlo-red"
        />
      </a>
    </li>
  );
}
