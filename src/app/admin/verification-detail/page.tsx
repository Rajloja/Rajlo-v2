"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Icon } from "@/components/icons";
import { HeroSkeleton, Skeleton } from "@/components/skeleton";
import { requiredTADocuments } from "@/lib/mock-data";

// Doc keys that are NOT actual file uploads — they're plain form fields stored
// directly on the drivers table. Should never appear in the documents list.
const NON_DOCUMENT_KEYS = new Set(["trn", "nis"]);
const VALID_DOC_KEYS = new Set(requiredTADocuments.map((d) => d.id));

type ReviewState = "approved" | "pending" | "rejected" | "resubmit";

type ReviewedDoc = {
  id: string;
  label: string;
  description: string;
  status: ReviewState;
  note: string;
  fileName: string | null;
  filePath: string | null;
  previouslyApproved: boolean;
  /** ISO date (YYYY-MM-DD) the doc currently expires on, or null if
   *  it's a permanent doc / not yet stamped. The single source of truth
   *  for renewal countdowns + expiry alerts on the driver side. */
  expiresOn: string | null;
  /** > 0 → this doc renews on a schedule (annual, biennial, etc).
   *  The driver enters the expiry on upload — admin only displays it. */
  renewalPeriodDays: number;
};

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

const STATUS_STYLES: Record<ReviewState, { bg: string; text: string; ring: string; label: string }> = {
  approved: { bg: "bg-emerald-50", text: "text-emerald-700", ring: "ring-emerald-200", label: "Approved" },
  rejected: { bg: "bg-primary-soft", text: "text-rajlo-red", ring: "ring-rajlo-red/30", label: "Rejected" },
  resubmit: { bg: "bg-amber-50", text: "text-amber-800", ring: "ring-amber-200", label: "Resubmit" },
  pending: { bg: "bg-surface-soft", text: "text-muted", ring: "ring-line", label: "Pending" },
};

function VerificationDetailLoading() {
  return (
    <div className="mx-auto max-w-6xl space-y-5 px-2 py-6 md:px-3 md:py-10">
      <HeroSkeleton />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-28 w-full" rounded="xl" />
        ))}
      </div>
      <Skeleton className="h-64 w-full" rounded="xl" />
      <Skeleton className="h-72 w-full" rounded="xl" />
    </div>
  );
}

export default function AdminVerificationDetailPage() {
  // Suspense boundary required by Next.js 16 because the inner component uses
  // useSearchParams — without this, the prerender step fails with the
  // "Missing Suspense boundary with useSearchParams" error.
  return (
    <Suspense fallback={<VerificationDetailLoading />}>
      <VerificationDetailInner />
    </Suspense>
  );
}

function VerificationDetailInner() {
  const searchParams = useSearchParams();
  const queryDriverId = searchParams.get("driverId");

  const [driverId, setDriverId] = useState<string | null>(null);
  const [driverName, setDriverName] = useState<string>("");
  const [plateNumber, setPlateNumber] = useState<string>("");
  const [contact, setContact] = useState<{ email: string | null; phone: string | null }>({
    email: null,
    phone: null,
  });
  const [identity, setIdentity] = useState<{
    trn: string | null;
    nis: string | null;
    licenceNumber: string | null;
  }>({ trn: null, nis: null, licenceNumber: null });
  const [vehicle, setVehicle] = useState<{
    make: string | null;
    model: string | null;
    year: number | null;
  }>({ make: null, model: null, year: null });
  const [submittedAt, setSubmittedAt] = useState<string | null>(null);
  const [activated, setActivated] = useState(false);
  const [onboardedByEmployer, setOnboardedByEmployer] = useState<{
    id: string;
    fullName: string;
  } | null>(null);
  const [docs, setDocs] = useState<ReviewedDoc[]>([]);
  const [empty, setEmpty] = useState(false);
  const [emptyMessage, setEmptyMessage] = useState<string>("");
  const [deactivateOpen, setDeactivateOpen] = useState(false);
  const [deactivating, setDeactivating] = useState(false);

  const [initialDocs, setInitialDocs] = useState<ReviewedDoc[]>([]);
  const [adminNote, setAdminNote] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [auditTrail, setAuditTrail] = useState<string[]>([]);
  const [previewDocId, setPreviewDocId] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      setLoading(true);
      setStatusMessage(null);
      try {
        const url = queryDriverId
          ? `/api/admin/verification?driverId=${encodeURIComponent(queryDriverId)}`
          : `/api/admin/verification`;
        // Bypass browser HTTP cache so a stale response can't hide
        // a fresh doc/expiry update from the admin. Verification data
        // is per-driver moderation state — always want the current row.
        const res = await fetch(url, { cache: "no-store" });
        if (!res.ok) throw new Error("Failed to load verification details");
        const payload = (await res.json()) as {
          source: "supabase" | "mock";
          empty?: boolean;
          message?: string;
          driverId?: string;
          driverName?: string;
          plateNumber?: string;
          submittedAt?: string;
          activated?: boolean;
          contact?: { email: string | null; phone: string | null };
          identity?: {
            trn: string | null;
            nis: string | null;
            licenceNumber: string | null;
          };
          vehicle?: {
            make: string | null;
            model: string | null;
            year: number | null;
          };
          docs: ReviewedDoc[];
          auditTrail: string[];
          onboardedByEmployer?: { id: string; fullName: string } | null;
        };
        if (!mounted) return;

        if (payload.empty) {
          setEmpty(true);
          setEmptyMessage(payload.message ?? "No driver found.");
          return;
        }

        setDriverId(payload.driverId ?? null);
        setDriverName(payload.driverName ?? "");
        setPlateNumber(payload.plateNumber ?? "");
        setOnboardedByEmployer(payload.onboardedByEmployer ?? null);
        setSubmittedAt(payload.submittedAt ?? null);
        setActivated(payload.activated ?? false);
        setContact({
          email: payload.contact?.email ?? null,
          phone: payload.contact?.phone ?? null,
        });
        setIdentity({
          trn: payload.identity?.trn ?? null,
          nis: payload.identity?.nis ?? null,
          licenceNumber: payload.identity?.licenceNumber ?? null,
        });
        setVehicle({
          make: payload.vehicle?.make ?? null,
          model: payload.vehicle?.model ?? null,
          year: payload.vehicle?.year ?? null,
        });
        // Belt-and-suspenders: drop any non-document rows (trn/nis) AND any
        // doc keys not in the canonical list, in case stale rows leak through.
        const cleanDocs = (payload.docs ?? []).filter(
          (d) => !NON_DOCUMENT_KEYS.has(d.id) && VALID_DOC_KEYS.has(d.id),
        );
        setDocs(cleanDocs);
        // Snapshot the loaded state so we can detect unsaved changes.
        setInitialDocs(cleanDocs.map((d) => ({ ...d })));
        setAuditTrail(payload.auditTrail);

        if (payload.source === "mock") {
          setStatusMessage("Showing template data. Submit an onboarding application to populate live data.");
        }
      } catch {
        if (mounted) setStatusMessage("Could not load verification details.");
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [queryDriverId]);

  const allApproved = useMemo(() => docs.every((d) => d.status === "approved"), [docs]);
  const previewDoc = previewDocId ? docs.find((d) => d.id === previewDocId) ?? null : null;

  // Track which docs have changed since initial load — drives the action bar.
  // Expiry is intentionally NOT in the dirty check: only the driver sets
  // the expiry date (during upload / renewal). The admin can SEE it on
  // each doc card but can't edit it, so it never changes here.
  const changeStats = useMemo(() => {
    const initialById = new Map(initialDocs.map((d) => [d.id, d]));
    let changed = 0;
    const counts = { approved: 0, rejected: 0, resubmit: 0, pending: 0 };
    docs.forEach((d) => {
      counts[d.status]++;
      const initial = initialById.get(d.id);
      if (
        !initial ||
        initial.status !== d.status ||
        initial.note !== d.note
      ) {
        changed++;
      }
    });
    return { changed, counts };
  }, [docs, initialDocs]);

  const hasChanges =
    changeStats.changed > 0 || (adminNote.trim().length > 0 && !saving);

  /* ─── Silent live-refresh (~30 s) ───
   *
   * Before this poll the detail page fetched once on mount and never
   * again. If a driver resubmitted documents while an admin had the
   * page open, the admin saw the STALE pre-resubmission state — and
   * would only discover the fresh docs on a hard reload.
   *
   * Ground rules:
   *   - Skip the poll if the admin has unsaved changes OR is mid-save.
   *     Clobbering their in-flight review is worse than a slightly
   *     stale view — the queue's own poll will surface the resubmission
   *     for a fresh open.
   *   - Skip while the initial load is in flight — spinner covers it.
   *   - Silent: no loading spinner, no status message flip. If the
   *     fetch fails, we swallow it; the next tick tries again.
   *   - Refs for hasChanges / saving so a mid-edit toggle doesn't
   *     tear down + rebuild the interval on every keystroke.
   */
  const hasChangesRef = useRef(false);
  const savingRef = useRef(false);
  useEffect(() => {
    hasChangesRef.current = hasChanges;
  }, [hasChanges]);
  useEffect(() => {
    savingRef.current = saving;
  }, [saving]);

  useEffect(() => {
    if (loading || empty || !queryDriverId) return;
    let cancelled = false;
    const refresh = async () => {
      if (cancelled) return;
      if (hasChangesRef.current || savingRef.current) return;
      try {
        const res = await fetch(
          `/api/admin/verification?driverId=${encodeURIComponent(queryDriverId)}`,
          { cache: "no-store" },
        );
        if (!res.ok) return;
        const payload = (await res.json()) as {
          empty?: boolean;
          activated?: boolean;
          docs?: ReviewedDoc[];
          auditTrail?: string[];
        };
        if (cancelled) return;
        // Re-check the guards — the admin may have started typing
        // between our fetch fire and the response landing.
        if (hasChangesRef.current || savingRef.current) return;
        if (payload.empty) return;
        setActivated(payload.activated ?? false);
        const cleanDocs = (payload.docs ?? []).filter(
          (d) => !NON_DOCUMENT_KEYS.has(d.id) && VALID_DOC_KEYS.has(d.id),
        );
        setDocs(cleanDocs);
        setInitialDocs(cleanDocs.map((d) => ({ ...d })));
        setAuditTrail(payload.auditTrail ?? []);
      } catch {
        /* silent — next tick tries again */
      }
    };
    const timer = setInterval(refresh, 30_000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [loading, empty, queryDriverId]);

  const updateStatus = (id: string, status: ReviewState) => {
    setDocs((prev) => prev.map((d) => (d.id === id ? { ...d, status } : d)));
    const label = docs.find((d) => d.id === id)?.label ?? id;
    setAuditTrail((prev) => [
      `${new Date().toISOString().slice(0, 16).replace("T", " ")} • ${label} marked ${status.toUpperCase()}`,
      ...prev,
    ]);
  };

  const updateNote = (id: string, note: string) => {
    setDocs((prev) => prev.map((d) => (d.id === id ? { ...d, note } : d)));
  };

  const submitDecision = async () => {
    setSaving(true);
    setStatusMessage(null);
    try {
      // Trim the docs payload to just the fields the decision endpoint
      // cares about. We deliberately DO NOT send `expiresOn` — the
      // driver owns that field via the onboarding / renewal upload
      // forms. The server preserves the existing value when the field
      // is absent (it's `undefined` rather than `null`).
      const payloadDocs = docs.map((d) => ({
        id: d.id,
        status: d.status,
        note: d.note,
      }));

      const res = await fetch("/api/admin/verification/decision", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          driverId,
          adminNote,
          docs: payloadDocs,
          activateDriver: allApproved,
        }),
      });
      if (!res.ok) {
        const errBody = (await res.json().catch(() => null)) as
          | { error?: string }
          | null;
        throw new Error(errBody?.error ?? `Server returned ${res.status}`);
      }
      const okBody = (await res.json().catch(() => ({}))) as {
        email?: { status: "sent" | "skipped" | "failed"; error: string | null };
      };
      setAuditTrail((prev) => [
        `${new Date().toISOString().slice(0, 16).replace("T", " ")} • Admin decision submitted: ${allApproved ? "APPROVED" : "PENDING CORRECTIONS"}`,
        ...prev,
      ]);
      setAdminNote("");
      // Reset the snapshot so the action bar shows zero pending changes again
      setInitialDocs(docs.map((d) => ({ ...d })));

      // Honest toast: only say "notified" if email actually went out.
      const emailSent = okBody.email?.status === "sent";
      const decisionLabel = allApproved
        ? "Driver approved & activated."
        : "Decision saved.";
      const channelLabel = emailSent
        ? " Email sent to driver."
        : okBody.email?.status === "failed"
          ? ` Email send failed: ${okBody.email.error}`
          : " They'll see it next time they open Rajlo.";
      setToast(decisionLabel + channelLabel);
      // Auto-dismiss the toast after 5s (longer for failed-email warnings)
      setTimeout(
        () => setToast(null),
        okBody.email?.status === "failed" ? 9000 : 5000,
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to save decision";
      setStatusMessage(msg);
    } finally {
      setSaving(false);
    }
  };

  const discardChanges = () => {
    setDocs(initialDocs.map((d) => ({ ...d })));
    setAdminNote("");
  };

  const submitDeactivate = async (reason: string) => {
    if (!driverId) return;
    setDeactivating(true);
    setStatusMessage(null);
    try {
      const res = await fetch("/api/admin/verification/deactivate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ driverId, reason: reason.trim() || undefined }),
      });
      if (!res.ok) {
        const errBody = (await res.json().catch(() => null)) as
          | { error?: string }
          | null;
        throw new Error(errBody?.error ?? `Server returned ${res.status}`);
      }
      const okBody = (await res.json().catch(() => ({}))) as {
        email?: { status: "sent" | "skipped" | "failed"; error: string | null };
      };
      // Reflect the new state locally so the page redraws as
      // "pending review" without a hard reload. Mirrors what the deactivate
      // API just wrote: every doc → pending + previously_approved=true.
      setActivated(false);
      setDocs((prev) =>
        prev.map((d) => ({
          ...d,
          status: "pending" as ReviewState,
          previouslyApproved: true,
        })),
      );
      setInitialDocs((prev) =>
        prev.map((d) => ({
          ...d,
          status: "pending" as ReviewState,
          previouslyApproved: true,
        })),
      );
      setAuditTrail((prev) => [
        `${new Date().toISOString().slice(0, 16).replace("T", " ")} • Driver deactivated; full re-verification required`,
        ...prev,
      ]);
      const emailSent = okBody.email?.status === "sent";
      setToast(
        emailSent
          ? "Driver deactivated. Email sent."
          : okBody.email?.status === "failed"
            ? `Driver deactivated. Email send failed: ${okBody.email.error}`
            : "Driver deactivated.",
      );
      setTimeout(
        () => setToast(null),
        okBody.email?.status === "failed" ? 9000 : 5000,
      );
      setDeactivateOpen(false);
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Failed to deactivate driver";
      setStatusMessage(msg);
    } finally {
      setDeactivating(false);
    }
  };

  // ─── Empty state (no driver to review) ───
  if (empty) {
    return (
      <div className="mx-auto max-w-3xl px-2 py-10 md:px-3 md:py-16">
        <div className="rounded-3xl border border-line bg-surface p-10 text-center">
          <span className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-emerald-50 text-emerald-600">
            <Icon name="check-circle" className="h-7 w-7" />
          </span>
          <h1 className="mt-5 text-3xl font-extrabold tracking-tight">All caught up</h1>
          <p className="mx-auto mt-2 max-w-md text-sm text-muted">{emptyMessage}</p>
          <Link
            href="/admin/verification-queue"
            className="mt-6 inline-flex items-center gap-2 rounded-full bg-rajlo-red px-5 py-2.5 text-sm font-bold text-white hover:bg-primary-hover"
          >
            <Icon name="chevron-left" className="h-4 w-4" />
            Back to queue
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-5 overflow-x-hidden px-2 py-6 md:px-3 md:py-8">
      {/* ─── Back to queue ─── */}
      <Link
        href="/admin/verification-queue"
        className="inline-flex items-center gap-1.5 text-xs font-bold text-muted hover:text-rajlo-red"
      >
        <Icon name="chevron-left" className="h-3.5 w-3.5" />
        Back to verification queue
      </Link>

      {/* ─── Hero header ─── */}
      <div className="flex flex-col gap-3 rounded-3xl border border-line bg-surface p-6 md:flex-row md:items-center md:justify-between md:p-8">
        <div className="min-w-0">
          <p className="font-secondary text-xs font-bold uppercase tracking-wider text-rajlo-red">
            Driver verification
          </p>
          <h1 className="mt-1 truncate text-2xl font-extrabold tracking-tight md:text-3xl">
            {driverName || "—"}
          </h1>
          <p className="mt-0.5 text-sm text-muted">
            {driverId ?? "—"}
            {plateNumber ? ` · Red plate ${plateNumber}` : ""}
          </p>
          {onboardedByEmployer && (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <p className="inline-flex items-center gap-1.5 rounded-full bg-primary-soft px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-rajlo-red">
                <Icon name="users" className="h-3 w-3" />
                Onboarded by {onboardedByEmployer.fullName}
              </p>
              <RegeneratePasswordLinkButton driverExternalId={driverId} />
            </div>
          )}
        </div>
        <span
          className={`shrink-0 self-start rounded-full px-3 py-1.5 text-xs font-bold ring-1 ${
            activated
              ? "bg-emerald-600 text-white ring-emerald-700"
              : allApproved
                ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
                : "bg-amber-50 text-amber-800 ring-amber-200"
          }`}
        >
          {activated
            ? "Active driver"
            : allApproved
              ? "Eligible for activation"
              : "Pending document actions"}
        </span>
      </div>

      {/* ─── Deactivation panel — only shown when driver is currently active ─── */}
      {activated && (
        <div className="overflow-hidden rounded-3xl border border-rajlo-red/20 bg-primary-soft/40">
          <div className="flex flex-col gap-4 p-6 md:flex-row md:items-center md:justify-between md:p-7">
            <div className="flex items-start gap-4">
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-rajlo-red text-white">
                <Icon name="alert-triangle" className="h-5 w-5" />
              </span>
              <div>
                <p className="font-secondary text-xs font-bold uppercase tracking-wider text-rajlo-red">
                  Active driver actions
                </p>
                <p className="mt-1 text-base font-extrabold tracking-tight">
                  Pull this driver back into review
                </p>
                <p className="mt-1 max-w-xl text-sm text-muted">
                  Deactivating sets every document back to pending and stops
                  the driver from accepting ride requests. Use this when a
                  document expires, compliance flags arise, or anything else
                  needs re-verification.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setDeactivateOpen(true)}
              className="inline-flex shrink-0 items-center gap-2 self-start rounded-full bg-rajlo-red px-5 py-2.5 text-sm font-bold text-white shadow-md shadow-rajlo-red/20 transition-all hover:-translate-y-0.5 hover:bg-primary-hover hover:shadow-lg md:self-auto"
            >
              <Icon name="alert-triangle" className="h-4 w-4" />
              Deactivate driver
            </button>
          </div>
        </div>
      )}

      {/* ─── Re-uploaded-after-approval alert ─── */}
      {(() => {
        const reuploaded = docs.filter(
          (d) =>
            d.previouslyApproved &&
            (d.status === "pending" || d.status === "resubmit"),
        );
        if (reuploaded.length === 0) return null;
        return (
          <div className="overflow-hidden rounded-2xl border border-amber-300 bg-amber-50 p-5">
            <div className="flex items-start gap-3">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-amber-500 text-white">
                <Icon name="alert-triangle" className="h-4 w-4" />
              </span>
              <div className="flex-1">
                <p className="font-secondary text-xs font-bold uppercase tracking-wider text-amber-900">
                  Heads up · {reuploaded.length} previously-approved document
                  {reuploaded.length === 1 ? "" : "s"} re-uploaded
                </p>
                <p className="mt-1 text-sm text-amber-900/85">
                  The driver replaced {reuploaded.length === 1 ? "a file" : "files"} you&apos;d already approved. Re-review {reuploaded.length === 1 ? "it" : "them"} below — the rest of the application is unchanged.
                </p>
                <ul className="mt-3 flex flex-wrap gap-1.5">
                  {reuploaded.map((d) => (
                    <li
                      key={d.id}
                      className="inline-flex items-center gap-1.5 rounded-full bg-white px-2.5 py-1 text-[11px] font-bold text-amber-900 ring-1 ring-amber-300"
                    >
                      <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                      {d.label}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        );
      })()}

      {statusMessage && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-xs text-amber-900">
          {statusMessage}
        </div>
      )}

      {loading && (
        <div className="space-y-3 rounded-xl border border-line bg-surface p-4">
          <Skeleton className="h-3 w-40" rounded="md" />
          <Skeleton className="h-4 w-2/3 max-w-md" rounded="md" />
          <Skeleton className="h-3 w-1/2 max-w-sm" rounded="md" />
        </div>
      )}

      {/* ─── Driver details panel ─── */}
      {!loading && (
        <div className="grid gap-3 rounded-3xl border border-line bg-surface p-6 md:p-7">
          <div className="flex items-center justify-between">
            <p className="font-secondary text-xs font-bold uppercase tracking-wider text-rajlo-red">
              Driver details
            </p>
            {submittedAt && (
              <p className="text-[11px] font-medium text-muted">
                Submitted{" "}
                {new Date(submittedAt).toLocaleDateString("en-US", {
                  year: "numeric",
                  month: "short",
                  day: "numeric",
                })}
              </p>
            )}
          </div>

          <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
            <DetailGroup icon="user" title="Contact">
              <DetailRow label="Email" value={contact.email} />
              <DetailRow label="Phone" value={contact.phone} />
            </DetailGroup>

            <DetailGroup icon="shield-check" title="Identity">
              <DetailRow label="TRN" value={identity.trn} mono />
              <DetailRow label="NIS" value={identity.nis} mono />
              <DetailRow label="Licence #" value={identity.licenceNumber} mono />
            </DetailGroup>

            <DetailGroup icon="car" title="Vehicle">
              <DetailRow label="Plate" value={plateNumber} mono />
              <DetailRow
                label="Make / Model"
                value={
                  vehicle.make && vehicle.model
                    ? `${vehicle.make} ${vehicle.model}`
                    : null
                }
              />
              <DetailRow label="Year" value={vehicle.year ? String(vehicle.year) : null} />
            </DetailGroup>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[2fr_1fr]">
        {/* ─── Documents list ─── */}
        <section className="space-y-3">
          {docs.map((doc) => {
            const styles = STATUS_STYLES[doc.status];
            return (
              <div
                key={doc.id}
                className="rounded-2xl border border-line bg-surface p-5 transition-shadow hover:shadow-sm"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-bold">{doc.label}</p>
                      {doc.previouslyApproved &&
                        (doc.status === "pending" || doc.status === "resubmit") && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-900 ring-1 ring-amber-300">
                            <Icon name="alert-triangle" className="h-2.5 w-2.5" />
                            Was approved · re-uploaded
                          </span>
                        )}
                    </div>
                    <p className="mt-0.5 text-xs leading-relaxed text-muted">{doc.description}</p>
                    {doc.fileName && (
                      <div className="mt-3 flex items-center gap-2 rounded-xl bg-surface-soft px-3 py-2 text-xs">
                        <Icon name="file-text" className="h-4 w-4 text-muted" />
                        <span className="flex-1 truncate font-medium">{doc.fileName}</span>
                        {doc.filePath && (
                          <button
                            type="button"
                            onClick={() => setPreviewDocId(doc.id)}
                            className="rounded-full bg-rajlo-red px-3 py-1 text-[11px] font-bold text-white hover:bg-primary-hover"
                          >
                            Preview →
                          </button>
                        )}
                      </div>
                    )}
                    {!doc.fileName && (
                      <div className="mt-3 flex items-center gap-2 rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-800 ring-1 ring-amber-200">
                        <Icon name="alert-triangle" className="h-4 w-4" />
                        <span className="font-medium">No file uploaded yet</span>
                      </div>
                    )}
                  </div>
                  <span
                    className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ring-1 ${styles.bg} ${styles.text} ${styles.ring}`}
                  >
                    {styles.label}
                  </span>
                </div>

                {/* Decision controls + doc note — hidden when the driver is
                    already activated. The only action available in that state
                    is "Deactivate driver" (panel at the top of the page). */}
                {!activated && (
                  <>
                    <div className="mt-4 flex flex-wrap gap-2">
                      <DecisionButton current={doc.status} target="approved" onClick={() => updateStatus(doc.id, "approved")}>
                        Approve
                      </DecisionButton>
                      <DecisionButton current={doc.status} target="rejected" onClick={() => updateStatus(doc.id, "rejected")}>
                        Reject
                      </DecisionButton>
                      <DecisionButton current={doc.status} target="resubmit" onClick={() => updateStatus(doc.id, "resubmit")}>
                        Request resubmission
                      </DecisionButton>
                      <DecisionButton current={doc.status} target="pending" onClick={() => updateStatus(doc.id, "pending")}>
                        Mark pending
                      </DecisionButton>
                    </div>

                    {/* Read-only expiry display — shown ONLY when the
                       driver has actually supplied an expiry for this
                       doc. Correlates 1:1 with the driver portal: the
                       onboarding form only asks for licence + franchise
                       expiries, so those are the only docs where this
                       block appears at initial submission. Once a doc
                       is renewed / resubmitted with a fresh expiry,
                       this block appears for that doc too.
                       Rendering off `expiresOn` (not `renewalPeriodDays`)
                       avoids showing empty "— not provided by driver —"
                       slots for docs the driver was never asked about. */}
                    {doc.expiresOn && ISO_DATE.test(doc.expiresOn) && (
                      <div className="mt-4 rounded-xl border border-line bg-surface-soft px-3 py-3">
                        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted">
                          Expiry on document
                        </p>
                        <p className="mt-1.5 text-sm font-bold text-foreground">
                          {new Date(doc.expiresOn).toLocaleDateString("en-JM", {
                            year: "numeric",
                            month: "long",
                            day: "numeric",
                          })}
                        </p>
                        <p className="mt-1 text-[10px] leading-relaxed text-muted">
                          Entered by the driver at upload. If it&apos;s
                          wrong, mark the document <strong>Resubmit</strong>{" "}
                          and the driver will re-upload with a corrected
                          date.
                        </p>
                      </div>
                    )}

                    <div className="mt-4">
                      <label className="block">
                        <span className="text-[11px] font-semibold uppercase tracking-wider text-muted">
                          Document note
                        </span>
                        <textarea
                          rows={2}
                          value={doc.note}
                          onChange={(e) => updateNote(doc.id, e.target.value)}
                          placeholder="Reason or guidance for this document decision"
                          className="mt-1.5 w-full rounded-xl border border-line bg-surface-soft px-3 py-2 text-xs outline-none transition-all focus:border-rajlo-red focus:ring-2 focus:ring-rajlo-red/15"
                        />
                      </label>
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </section>

        {/* ─── Side panel ─── */}
        <aside className="space-y-4">
          {/* Activation status banner — informational only; submit happens in
              the sticky bottom bar */}
          <div className="overflow-hidden rounded-2xl border border-line bg-surface">
            <div
              className={`p-5 text-white ${
                activated
                  ? "bg-emerald-600"
                  : allApproved
                    ? "bg-emerald-600"
                    : "bg-rajlo-black"
              }`}
            >
              <p className="font-secondary text-xs font-bold uppercase tracking-wider text-white/80">
                Activation status
              </p>
              <p className="mt-1 text-lg font-extrabold tracking-tight">
                {activated
                  ? "Active driver"
                  : allApproved
                    ? "Ready to activate"
                    : "Hold for review"}
              </p>
            </div>
            <div className="p-5">
              <p className="text-xs leading-relaxed text-muted">
                {activated
                  ? "This driver is approved and accepting ride requests. To pull them back into review, use the deactivate panel at the top of the page."
                  : "Driver activates automatically when every document is approved. Use the action bar at the bottom to send your decision."}
              </p>
            </div>
          </div>

          {/* Audit trail */}
          <div className="rounded-2xl border border-line bg-surface p-5">
            <div className="flex items-center justify-between">
              <p className="font-secondary text-xs font-bold uppercase tracking-wider text-rajlo-red">
                Audit trail
              </p>
              <span className="text-[10px] font-bold uppercase tracking-wide text-muted">
                {auditTrail.length} entries
              </span>
            </div>
            <ol className="mt-3 max-h-72 space-y-1.5 overflow-auto pr-1">
              {auditTrail.map((entry) => (
                <li
                  key={entry}
                  className="rounded-lg border border-line/60 bg-surface-soft px-3 py-2 text-[11px] leading-relaxed break-words text-muted"
                >
                  {entry}
                </li>
              ))}
            </ol>
          </div>
        </aside>
      </div>

      {/* Spacer so sticky action bar doesn't cover the last content. Only
          rendered when the action bar itself is — for an activated driver
          there's no decision flow, so no spacer is needed. */}
      {!activated && <div className="h-32" />}

      {/* ─── Sticky action bar — hidden for already-activated drivers since
          the only action that makes sense for them is deactivation, which
          lives in the panel at the top of the page. ─── */}
      {!activated && (
        <DecisionActionBar
          hasChanges={hasChanges}
          changeCount={changeStats.changed}
          counts={changeStats.counts}
          allApproved={allApproved}
          adminNote={adminNote}
          onAdminNoteChange={setAdminNote}
          onDiscard={discardChanges}
          onSubmit={submitDecision}
          saving={saving}
        />
      )}

      {/* ─── Toast on success ─── */}
      {toast && (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-32 left-1/2 z-50 flex -translate-x-1/2 items-center gap-3 rounded-full bg-emerald-600 px-5 py-3 text-sm font-bold text-white shadow-2xl"
        >
          <Icon name="check-circle" className="h-4 w-4" />
          {toast}
          <button
            type="button"
            onClick={() => setToast(null)}
            aria-label="Dismiss"
            className="ml-2 grid h-6 w-6 place-items-center rounded-full text-white/80 hover:bg-white/15 hover:text-white"
          >
            <Icon name="x" className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* ─── File preview modal ─── */}
      {previewDoc && (
        <FilePreviewModal
          doc={previewDoc}
          onClose={() => setPreviewDocId(null)}
        />
      )}

      {/* ─── Deactivation confirmation modal ─── */}
      {deactivateOpen && (
        <DeactivateModal
          driverName={driverName}
          onClose={() => setDeactivateOpen(false)}
          onConfirm={submitDeactivate}
          submitting={deactivating}
        />
      )}
    </div>
  );
}

function DeactivateModal({
  driverName,
  onClose,
  onConfirm,
  submitting,
}: {
  driverName: string;
  onClose: () => void;
  onConfirm: (reason: string) => void;
  submitting: boolean;
}) {
  const [reason, setReason] = useState("");
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="deactivate-title"
      className="fixed inset-0 z-50 grid place-items-center bg-black/60 px-4 py-8 backdrop-blur-sm"
    >
      <div className="w-full max-w-lg overflow-hidden rounded-3xl border border-line bg-surface shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-line bg-primary-soft/60 px-6 py-5">
          <div className="flex items-start gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-rajlo-red text-white">
              <Icon name="alert-triangle" className="h-5 w-5" />
            </span>
            <div>
              <p
                id="deactivate-title"
                className="text-lg font-extrabold tracking-tight"
              >
                Deactivate {driverName || "this driver"}?
              </p>
              <p className="mt-1 text-xs leading-relaxed text-muted">
                They&apos;ll lose access to the active driver portal and every
                document will reset to pending review. This is reversible —
                approve the documents again to reactivate.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="grid h-8 w-8 place-items-center rounded-md text-muted hover:bg-surface hover:text-foreground"
          >
            <Icon name="x" className="h-4 w-4" />
          </button>
        </div>

        <div className="px-6 py-5">
          <label className="block">
            <span className="text-[11px] font-bold uppercase tracking-wider text-muted">
              Reason for deactivation
            </span>
            <p className="mt-1 text-xs text-muted">
              Optional but recommended. Will be sent to the driver in the
              notification email and saved on the audit trail.
            </p>
            <textarea
              rows={4}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. PPV insurance expired on 2026-02-12. Please upload a renewed policy."
              className="mt-2 w-full rounded-xl border border-line bg-surface-soft px-3 py-2 text-sm outline-none transition-all focus:border-rajlo-red focus:ring-2 focus:ring-rajlo-red/15"
              autoFocus
            />
          </label>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-line bg-surface-soft/60 px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="rounded-full border border-line bg-surface px-4 py-2 text-xs font-bold text-muted hover:bg-surface-soft hover:text-foreground disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => onConfirm(reason)}
            disabled={submitting}
            className="inline-flex items-center gap-1.5 rounded-full bg-rajlo-red px-5 py-2 text-xs font-bold text-white shadow-md shadow-rajlo-red/20 transition-all hover:-translate-y-0.5 hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0"
          >
            {submitting ? (
              <>
                <span className="h-3 w-3 animate-spin rounded-full border-[2px] border-white border-t-transparent" />
                Deactivating…
              </>
            ) : (
              <>
                <Icon name="alert-triangle" className="h-3.5 w-3.5" />
                Deactivate driver
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

function DecisionActionBar({
  hasChanges,
  changeCount,
  counts,
  allApproved,
  adminNote,
  onAdminNoteChange,
  onDiscard,
  onSubmit,
  saving,
}: {
  hasChanges: boolean;
  changeCount: number;
  counts: { approved: number; rejected: number; resubmit: number; pending: number };
  allApproved: boolean;
  adminNote: string;
  onAdminNoteChange: (v: string) => void;
  onDiscard: () => void;
  onSubmit: () => void;
  saving: boolean;
}) {
  const [noteOpen, setNoteOpen] = useState(false);
  const totalDecided = counts.approved + counts.rejected + counts.resubmit;

  // `md:left-[280px]` clears the 280px portal sidebar so the bar sits
  // inside the main content column instead of spanning the whole
  // viewport. On mobile the sidebar is an off-canvas drawer, so the
  // bar stays full-width there.
  return (
    <div className="fixed inset-x-0 bottom-0 z-40 md:left-[280px]">
      {/* Optional expandable note */}
      {noteOpen && (
        <div className="border-t border-line bg-surface px-2 py-4 shadow-lg md:px-3">
          <div className="mx-auto max-w-6xl">
            <div className="flex items-center justify-between">
              <label
                htmlFor="admin-note-bar"
                className="font-secondary text-xs font-bold uppercase tracking-wider text-rajlo-red"
              >
                Note to driver
              </label>
              <button
                type="button"
                onClick={() => setNoteOpen(false)}
                aria-label="Close note"
                className="grid h-7 w-7 place-items-center rounded-md text-muted hover:bg-surface-soft hover:text-foreground"
              >
                <Icon name="x" className="h-3.5 w-3.5" />
              </button>
            </div>
            <textarea
              id="admin-note-bar"
              rows={3}
              value={adminNote}
              onChange={(e) => onAdminNoteChange(e.target.value)}
              placeholder="What does the driver need to fix? This message will be sent with the decision."
              className="mt-2 w-full rounded-xl border border-line bg-surface-soft px-3 py-2 text-sm outline-none focus:border-rajlo-red focus:ring-2 focus:ring-rajlo-red/15"
              autoFocus
            />
          </div>
        </div>
      )}

      {/* Main bar */}
      <div className="border-t border-line bg-surface/95 px-2 py-3 shadow-[0_-8px_24px_-12px_rgba(0,0,0,0.15)] backdrop-blur md:px-3 md:py-4">
        <div className="mx-auto flex max-w-6xl flex-col items-stretch gap-3 md:flex-row md:items-center md:justify-between">
          {/* Left: counters */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-secondary text-xs font-bold uppercase tracking-wider text-rajlo-red">
              Pending decision
            </span>
            <DecisionPill
              tone="emerald"
              icon="check-circle"
              label={`${counts.approved} approved`}
            />
            {counts.rejected > 0 && (
              <DecisionPill
                tone="red"
                icon="alert-triangle"
                label={`${counts.rejected} rejected`}
              />
            )}
            {counts.resubmit > 0 && (
              <DecisionPill
                tone="amber"
                icon="clipboard-check"
                label={`${counts.resubmit} resubmit`}
              />
            )}
            {counts.pending > 0 && (
              <DecisionPill
                tone="muted"
                icon="clock"
                label={`${counts.pending} pending`}
              />
            )}
            {hasChanges && (
              <span className="ml-1 inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-bold text-amber-800 ring-1 ring-amber-200">
                <span className="relative flex h-1.5 w-1.5">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-500 opacity-60" />
                  <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-amber-500" />
                </span>
                {changeCount} unsaved
              </span>
            )}
          </div>

          {/* Right: actions */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setNoteOpen((o) => !o)}
              className={`hidden items-center gap-1.5 rounded-full border px-3 py-2 text-xs font-bold transition-colors sm:inline-flex ${
                adminNote.trim()
                  ? "border-rajlo-red bg-primary-soft text-rajlo-red"
                  : "border-line bg-surface text-muted hover:bg-surface-soft"
              }`}
            >
              <Icon name="mail" className="h-3.5 w-3.5" />
              {adminNote.trim() ? "Note attached" : "Add note"}
            </button>

            {hasChanges && (
              <button
                type="button"
                onClick={onDiscard}
                disabled={saving}
                className="rounded-full border border-line bg-surface px-4 py-2 text-xs font-bold text-muted hover:bg-surface-soft hover:text-foreground"
              >
                Discard
              </button>
            )}

            <button
              type="button"
              onClick={onSubmit}
              disabled={saving || !hasChanges}
              className={`group inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-bold text-white shadow-md transition-all hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:-translate-y-0 ${
                allApproved && totalDecided > 0
                  ? "bg-emerald-600 shadow-emerald-600/30 hover:bg-emerald-700"
                  : "bg-rajlo-red shadow-rajlo-red/30 hover:bg-primary-hover"
              }`}
            >
              {saving ? (
                <>
                  <span className="h-3.5 w-3.5 animate-spin rounded-full border-[2px] border-white border-t-transparent" />
                  Sending…
                </>
              ) : (
                <>
                  {allApproved && totalDecided > 0
                    ? "Approve & activate driver"
                    : "Send decision to driver"}
                  <Icon
                    name="arrow-right"
                    className="h-4 w-4 transition-transform group-hover:translate-x-0.5"
                  />
                </>
              )}
            </button>
          </div>
        </div>

        {/* Sub-line: what happens when you click send */}
        <p className="mx-auto mt-2 max-w-6xl text-[11px] text-muted">
          {allApproved && totalDecided > 0
            ? "All documents approved. Sending will activate the driver and they'll be notified by email."
            : counts.rejected > 0 || counts.resubmit > 0
              ? "Driver will be notified of the documents needing changes and prompted to resubmit."
              : "Mark each document approved, rejected, or resubmit, then send the decision."}
        </p>
      </div>
    </div>
  );
}

function DecisionPill({
  tone,
  icon,
  label,
}: {
  tone: "emerald" | "red" | "amber" | "muted";
  icon: "check-circle" | "alert-triangle" | "clipboard-check" | "clock";
  label: string;
}) {
  const styles =
    tone === "emerald"
      ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
      : tone === "red"
        ? "bg-primary-soft text-rajlo-red ring-rajlo-red/30"
        : tone === "amber"
          ? "bg-amber-50 text-amber-800 ring-amber-200"
          : "bg-surface-soft text-muted ring-line";
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold ring-1 ${styles}`}
    >
      <Icon name={icon} className="h-3 w-3" />
      {label}
    </span>
  );
}

function DetailGroup({
  icon,
  title,
  children,
}: {
  icon: "user" | "shield-check" | "car";
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="mb-3 flex items-center gap-2">
        <span className="grid h-7 w-7 place-items-center rounded-lg bg-primary-soft text-rajlo-red">
          <Icon name={icon} className="h-3.5 w-3.5" />
        </span>
        <p className="text-xs font-bold uppercase tracking-wider text-foreground">
          {title}
        </p>
      </div>
      <dl className="space-y-1.5">{children}</dl>
    </div>
  );
}

function DetailRow({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string | null;
  mono?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 rounded-lg bg-surface-soft px-3 py-2">
      <dt className="text-[11px] font-semibold uppercase tracking-wide text-muted">
        {label}
      </dt>
      <dd
        className={`min-w-0 truncate text-right text-sm font-semibold ${
          mono ? "font-mono tracking-tight" : ""
        } ${value ? "text-foreground" : "text-muted/60"}`}
      >
        {value ?? "—"}
      </dd>
    </div>
  );
}

function DecisionButton({
  current,
  target,
  onClick,
  children,
}: {
  current: ReviewState;
  target: ReviewState;
  onClick: () => void;
  children: React.ReactNode;
}) {
  const isActive = current === target;
  const tone = STATUS_STYLES[target];
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full px-3 py-1.5 text-xs font-bold transition-all ${
        isActive
          ? `${tone.bg} ${tone.text} ring-1 ${tone.ring}`
          : "border border-line bg-surface text-muted hover:bg-surface-soft hover:text-foreground"
      }`}
    >
      {children}
    </button>
  );
}

function FilePreviewModal({
  doc,
  onClose,
}: {
  doc: ReviewedDoc;
  onClose: () => void;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!doc.filePath) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          `/api/admin/document-url?path=${encodeURIComponent(doc.filePath!)}`,
        );
        if (!res.ok) throw new Error("Failed to load preview URL");
        const json = (await res.json()) as { url?: string; error?: string };
        if (cancelled) return;
        if (json.url) setUrl(json.url);
        else setError(json.error ?? "Preview unavailable");
      } catch {
        if (!cancelled) setError("Could not load preview");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [doc.filePath]);

  const isImage = /\.(jpe?g|png|gif|webp)$/i.test(doc.fileName ?? "");
  const isPdf = /\.pdf$/i.test(doc.fileName ?? "");

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl bg-surface shadow-2xl"
      >
        <header className="flex items-center justify-between gap-3 border-b border-line bg-surface px-5 py-3">
          <div className="min-w-0">
            <p className="text-sm font-bold">{doc.label}</p>
            <p className="truncate text-xs text-muted">{doc.fileName}</p>
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
                <span aria-hidden className="block text-4xl leading-none">😢</span>
                <p className="mt-3 text-sm font-semibold">{error}</p>
                <p className="mt-1 text-xs text-muted">The file may have been deleted or moved.</p>
              </div>
            </div>
          ) : !url ? (
            <div className="grid h-full place-items-center p-8">
              <Skeleton className="h-full max-h-[480px] w-full max-w-2xl" rounded="2xl" />
            </div>
          ) : isImage ? (
            <img
              src={url}
              alt={doc.label}
              className="mx-auto h-full w-auto object-contain"
            />
          ) : isPdf ? (
            <iframe
              src={url}
              title={doc.label}
              className="h-full w-full"
            />
          ) : (
            <div className="grid h-full place-items-center p-8 text-center">
              <div>
                <Icon name="file-text" className="mx-auto h-8 w-8 text-muted" />
                <p className="mt-3 text-sm font-semibold">Preview not supported for this file type</p>
                <a
                  href={url}
                  download
                  className="mt-3 inline-flex rounded-full bg-rajlo-red px-4 py-2 text-xs font-bold text-white hover:bg-primary-hover"
                >
                  Download to view
                </a>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Regenerate password link — admin escape hatch when an employer-
 * onboarded driver never used their setup email (deleted, spam-
 * filtered, wrong address). Supersedes all existing tokens for the
 * driver and emails a fresh one. Only rendered for employer-onboarded
 * drivers because a self-onboarded driver has a password by
 * definition (they set it during signup).
 */
function RegeneratePasswordLinkButton({
  driverExternalId,
}: {
  driverExternalId: string | null;
}) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const regenerate = async () => {
    if (!driverExternalId) return;
    if (
      !confirm(
        "Send this driver a fresh set-password link? Any previous links stop working immediately.",
      )
    ) {
      return;
    }
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch(
        "/api/admin/employers/regenerate-password-link",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ driverExternalId }),
        },
      );
      const json = (await res.json().catch(() => ({}))) as {
        error?: string;
      };
      if (!res.ok) throw new Error(json.error ?? "Couldn't regenerate.");
      setMessage("Fresh link sent.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't regenerate.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="inline-flex items-center gap-2">
      <button
        type="button"
        onClick={regenerate}
        disabled={busy || !driverExternalId}
        className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface px-3 py-1 text-[11px] font-bold hover:bg-surface-soft disabled:cursor-not-allowed disabled:opacity-60"
      >
        <Icon name="mail" className="h-3 w-3" />
        {busy ? "Sending…" : "Regenerate password link"}
      </button>
      {message && (
        <span className="text-[11px] font-semibold text-emerald-700">
          {message}
        </span>
      )}
      {error && (
        <span className="text-[11px] font-semibold text-rajlo-red">
          {error}
        </span>
      )}
    </div>
  );
}
