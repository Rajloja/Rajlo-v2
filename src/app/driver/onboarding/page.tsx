"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Logo } from "@/components/logo";
import { ArcWatermark } from "@/components/arc-pattern";
import { Icon, type IconName } from "@/components/icons";
import { FadeUp } from "@/components/anim";
import { FileUpload, type FileState, type UploadedFile } from "@/components/file-upload";
import { Skeleton } from "@/components/skeleton";
import { VehiclePicker } from "@/components/vehicle-picker";
import { createSupabaseBrowserClient } from "@/lib/supabase-browser";
import {
  uploadDriverDocument,
  removeDriverDocument,
  createDriverDocumentSignedUrl,
} from "@/lib/storage";
import { NativeUnverifiedRedirect } from "@/components/native-unverified-redirect";
import { LegalConsentGate } from "@/components/legal-consent-gate";

/** YYYY-MM-DD sanity check for date-input values before formatting.
 *  Guards against `new Date("something invalid")` printing "Invalid
 *  Date" into the review sheet. */
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

// Prefix used to build a per-user draft key. Keeping drafts scoped to
// the authenticated Supabase user id is critical: a shared, unscoped
// key like the old `rajlo-driver-onboarding-draft` meant that any new
// driver signing up on a browser where a previous applicant had saved
// a draft got shown the PREVIOUS applicant's name, TRN, phone number
// etc. as "your restored draft" — leaking PII and pre-filling the wrong
// person's data into a fresh account. The per-user key isolates drafts.
const DRAFT_KEY_PREFIX = "rajlo-driver-onboarding-draft";
const LEGACY_DRAFT_KEY = DRAFT_KEY_PREFIX; // the old unscoped key we now purge on sight
const draftKeyFor = (uid: string) => `${DRAFT_KEY_PREFIX}:${uid}`;

const STEPS: {
  id: number;
  title: string;
  subtitle: string;
  icon: IconName;
}[] = [
  { id: 1, title: "Personal info", subtitle: "TRN, NIS, contact", icon: "user" },
  { id: 2, title: "Licence & Badge", subtitle: "Driver's licence + TA badge", icon: "shield-check" },
  { id: 3, title: "Vehicle details", subtitle: "Red plate + COF", icon: "car" },
  { id: 4, title: "TA Franchise", subtitle: "Franchise certificate", icon: "file-text" },
  { id: 5, title: "Insurance", subtitle: "PPV insurance", icon: "shield" },
  { id: 6, title: "Police record", subtitle: "Good conduct + selfie", icon: "clipboard-check" },
  { id: 7, title: "Review", subtitle: "Confirm & submit", icon: "check-circle" },
];

/* ═══════════════════════════════════════════════════════════════
   Form primitives
   ═══════════════════════════════════════════════════════════════ */

function TextInput({
  label,
  placeholder,
  value,
  onChange,
  hint,
  required,
  type = "text",
  min,
  max,
  readOnly,
}: {
  label: string;
  placeholder?: string;
  value: string;
  onChange: (v: string) => void;
  hint?: string;
  required?: boolean;
  type?: "text" | "email" | "tel" | "date" | "number";
  min?: string;
  max?: string;
  /** Locks the field — used for values the driver can't change, e.g.
   *  the email they registered with. */
  readOnly?: boolean;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-semibold">
        {label}
        {required && <span className="ml-0.5 text-rajlo-red">*</span>}
      </span>
      {hint && <p className="mb-2 text-xs text-muted">{hint}</p>}
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        min={min}
        max={max}
        readOnly={readOnly}
        aria-readonly={readOnly}
        tabIndex={readOnly ? -1 : undefined}
        className={`w-full rounded-xl border border-line px-4 py-3 text-sm outline-none transition-all placeholder:text-muted/70 ${
          readOnly
            ? "cursor-not-allowed bg-surface-soft text-muted focus:border-line focus:ring-0"
            : "bg-surface focus:border-rajlo-red focus:ring-2 focus:ring-rajlo-red/15"
        }`}
      />
    </label>
  );
}

/**
 * Type-friendly date input. Driver types the digits straight from their
 * licence (e.g. `15082030`) and we auto-format as `15/08/2030`. The form
 * state stays in ISO `YYYY-MM-DD` so the API/DB don't have to change.
 *
 * Why not <input type="date">? On mobile, picking a year 5+ years out
 * means tapping through page after page of the calendar — annoying for
 * licence/franchise expiry dates which are always in the future.
 */
function DateInput({
  label,
  value,
  onChange,
  hint,
  required,
}: {
  label: string;
  /** ISO date `YYYY-MM-DD` (or empty string when unset). */
  value: string;
  /** Called with an ISO date when the input is a valid full date,
   *  or the empty string when the user hasn't finished typing. */
  onChange: (iso: string) => void;
  hint?: string;
  required?: boolean;
}) {
  // Local state holds the visible "DD/MM/YYYY" string. We seed it from the
  // ISO `value` prop so pre-filled forms show the expected format.
  const isoToDisplay = (iso: string): string => {
    if (!iso) return "";
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
    if (!m) return "";
    return `${m[3]}/${m[2]}/${m[1]}`;
  };

  const [display, setDisplay] = useState<string>(() => isoToDisplay(value));
  // Track the last-synced value via a ref so the effect can skip
  // setState entirely when the prop hasn't changed — avoids the
  // React 19 "setState in effect" warning that fires on synchronous
  // updates inside useEffect.
  const lastSyncedRef = useRef(value);

  // Re-sync when the form-level value flips (e.g. resubmission pre-fill or
  // localStorage draft restore). Skipping the sync while the user is mid-type
  // would erase their input on every render.
  useEffect(() => {
    if (lastSyncedRef.current === value) return;
    lastSyncedRef.current = value;
    const next = isoToDisplay(value);
    const nextDigits = next.replace(/\D/g, "");
    const prevDigits = display.replace(/\D/g, "");
    if (prevDigits === nextDigits) return;
    // Defer setState off the synchronous effect body so the lint
    // rule's cascading-render check passes. Semantically identical
    // to a direct setDisplay(next) call — just on the next microtask.
    queueMicrotask(() => setDisplay(next));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const formatDigits = (digits: string): string => {
    const d = digits.slice(0, 8);
    if (d.length <= 2) return d;
    if (d.length <= 4) return `${d.slice(0, 2)}/${d.slice(2)}`;
    return `${d.slice(0, 2)}/${d.slice(2, 4)}/${d.slice(4)}`;
  };

  // Treat the visible string as valid when it parses to a real Gregorian
  // date. Anything else stays as raw text and reports "" upward so the
  // continue-button stays disabled until the date is complete.
  const validateAndEmit = (next: string) => {
    const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(next);
    if (!m) {
      onChange("");
      return;
    }
    const day = Number(m[1]);
    const month = Number(m[2]);
    const year = Number(m[3]);
    if (
      year < 1900 ||
      year > 2100 ||
      month < 1 ||
      month > 12 ||
      day < 1 ||
      day > 31
    ) {
      onChange("");
      return;
    }
    // Detect impossible days (Feb 30, Apr 31 etc.) by round-tripping.
    const dt = new Date(Date.UTC(year, month - 1, day));
    if (
      dt.getUTCFullYear() !== year ||
      dt.getUTCMonth() !== month - 1 ||
      dt.getUTCDate() !== day
    ) {
      onChange("");
      return;
    }
    const iso = `${year.toString().padStart(4, "0")}-${month
      .toString()
      .padStart(2, "0")}-${day.toString().padStart(2, "0")}`;
    onChange(iso);
  };

  const handleChange = (raw: string) => {
    const digits = raw.replace(/\D/g, "");
    const formatted = formatDigits(digits);
    setDisplay(formatted);
    validateAndEmit(formatted);
  };

  // Show a subtle inline warning when the user has entered enough digits
  // to form a complete date but it failed validation — e.g. 31/02/2030.
  const looksComplete = display.replace(/\D/g, "").length === 8;
  const isInvalid = looksComplete && !value;

  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-semibold">
        {label}
        {required && <span className="ml-0.5 text-rajlo-red">*</span>}
      </span>
      {hint && <p className="mb-2 text-xs text-muted">{hint}</p>}
      <input
        type="text"
        inputMode="numeric"
        autoComplete="off"
        value={display}
        onChange={(e) => handleChange(e.target.value)}
        placeholder="DD/MM/YYYY"
        maxLength={10}
        className={`w-full rounded-xl border bg-surface px-4 py-3 text-sm tracking-wide outline-none transition-all placeholder:text-muted/70 focus:ring-2 focus:ring-rajlo-red/15 ${
          isInvalid
            ? "border-rajlo-red focus:border-rajlo-red"
            : "border-line focus:border-rajlo-red"
        }`}
      />
      {isInvalid && (
        <p className="mt-1.5 text-xs font-medium text-rajlo-red">
          That doesn&apos;t look like a real date. Use DD/MM/YYYY.
        </p>
      )}
    </label>
  );
}

/* ═══════════════════════════════════════════════════════════════
   Main page
   ═══════════════════════════════════════════════════════════════ */

const EMPTY_FORM = {
  firstName: "",
  lastName: "",
  phone: "",
  email: "",
  trn: "",
  nis: "",
  licenceNumber: "",
  licenceExpiry: "",
  badgeNumber: "",
  plateNumber: "",
  vehicleType: "",
  vehicleMake: "",
  vehicleModel: "",
  vehicleYear: "",
  vehicleColor: "",
  franchiseNumber: "",
  franchiseExpiry: "",
};

/** Maps a document key (e.g. "drivers_licence_back") to a human label. */
function humanizeDocKey(key: string): string {
  const map: Record<string, string> = {
    drivers_licence_front: "Driver's licence (front)",
    drivers_licence_back: "Driver's licence (back)",
    driver_badge: "TA Driver Badge",
    franchise_cert: "TA Franchise Certificate",
    cof: "Certificate of Fitness",
    insurance: "PPV Insurance",
    police_record: "Police Record",
    selfie: "Identity selfie",
    red_plate_reg: "Red plate registration",
    trn: "TRN",
    nis: "NIS",
  };
  return map[key] ?? key.replace(/_/g, " ");
}

/**
 * Single row in the "Documents ready" summary on the review step.
 * Shows what the file is for (doc label), the raw file name + size,
 * and an eye button that opens an in-page modal preview of the file.
 *
 * The signed URL is fetched on demand (per-click) rather than on
 * mount, so we don't burn Supabase egress on every doc the driver
 * never actually previews. Preview MUST render inline — an earlier
 * version called `window.open(signedUrl)` after awaiting the fetch,
 * but that no longer counts as a direct user gesture on iOS Safari
 * / Chrome Android so the popup was silently blocked. Rendering the
 * modal in the DOM sidesteps the popup blocker entirely.
 */
function DocumentReadyRow({
  docKey,
  file,
}: {
  docKey: string;
  file: UploadedFile;
}) {
  const [previewing, setPreviewing] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);

  const isPdf = /\.pdf$/i.test(file.name);

  const openPreview = async () => {
    if (!file.path || previewing) return;
    setPreviewError(null);
    // Second+ tap on the same row — signed URL is already cached, just
    // reopen the modal without re-fetching (Supabase-side rate limits
    // + the extra network round-trip both add up if the driver flips
    // between docs during review).
    if (previewUrl) {
      setModalOpen(true);
      return;
    }
    setPreviewing(true);
    try {
      const url = await createDriverDocumentSignedUrl(file.path);
      if (!url) {
        setPreviewError("Couldn't load preview. Try again.");
        return;
      }
      setPreviewUrl(url);
      setModalOpen(true);
    } catch {
      setPreviewError("Couldn't load preview. Try again.");
    } finally {
      setPreviewing(false);
    }
  };

  return (
    <>
      <li className="flex items-center gap-3 overflow-hidden rounded-lg bg-surface px-3 py-2.5">
        <Icon
          name="check-circle"
          className="h-5 w-5 shrink-0 text-emerald-600"
        />
        <div className="min-w-0 flex-1 overflow-hidden">
          <p className="truncate text-sm font-semibold">
            {humanizeDocKey(docKey)}
          </p>
          <p className="truncate text-[11px] text-muted">
            {file.name} · {(file.size / 1024).toFixed(0)} KB
          </p>
          {previewError && (
            <p className="mt-0.5 truncate text-[11px] font-semibold text-rajlo-red">
              {previewError}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={openPreview}
          disabled={previewing}
          aria-label={`Preview ${humanizeDocKey(docKey)}`}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-line bg-surface px-2.5 py-1.5 text-xs font-semibold text-muted transition-colors hover:border-rajlo-red/40 hover:bg-primary-soft hover:text-rajlo-red disabled:cursor-not-allowed disabled:opacity-60"
        >
          {previewing ? (
            <span className="h-3.5 w-3.5 animate-spin rounded-full border-[1.5px] border-current border-t-transparent" />
          ) : (
            <Icon name="eye" className="h-3.5 w-3.5" />
          )}
          <span className="hidden sm:inline">Preview</span>
        </button>
      </li>

      {modalOpen && previewUrl && (
        <DocumentPreviewModal
          url={previewUrl}
          label={humanizeDocKey(docKey)}
          fileName={file.name}
          isPdf={isPdf}
          onClose={() => setModalOpen(false)}
        />
      )}
    </>
  );
}

/**
 * Fullscreen modal that renders a Supabase-signed document preview.
 * Images render as a fitted `<img>`; PDFs render inside an `<iframe>`
 * (browsers handle PDF display natively). The modal traps body scroll
 * while open and closes on Escape / backdrop tap / the X button.
 */
function DocumentPreviewModal({
  url,
  label,
  fileName,
  isPdf,
  onClose,
}: {
  url: string;
  label: string;
  fileName: string;
  isPdf: boolean;
  onClose: () => void;
}) {
  const [mounted, setMounted] = useState(false);

  // Escape key + body-scroll lock while the modal is open. Restored to
  // the previous overflow on cleanup so we don't leak the lock across
  // unmounts (e.g. if the driver submits the application while it's up).
  // `mounted` gates the portal so we don't attempt to render into
  // document.body during SSR (document doesn't exist there).
  useEffect(() => {
    setMounted(true);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose]);

  if (!mounted) return null;

  // Render through a portal to document.body. Without the portal the
  // modal <div> was a sibling of <li> inside the "Documents ready"
  // <ul>, which is invalid HTML — some browsers silently drop DOM
  // children of a <ul> that aren't <li>, which is why "nothing
  // happened" when the eye button was tapped. The portal lifts the
  // modal out of every parent stacking / overflow context to sit
  // directly on document.body.
  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Preview: ${label}`}
      className="fixed inset-0 z-[60] flex flex-col bg-rajlo-black/80 backdrop-blur-sm"
      onClick={onClose}
    >
      {/* Header — label + close. `stopPropagation` on the inner shell
          so tapping controls doesn't bubble up to the backdrop's
          onClick and immediately dismiss the modal. */}
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex items-center justify-between gap-3 border-b border-white/10 bg-rajlo-black/70 px-4 py-3 text-white"
      >
        <div className="min-w-0 flex-1 overflow-hidden">
          <p className="truncate text-sm font-bold">{label}</p>
          <p className="truncate text-[11px] text-white/70">{fileName}</p>
        </div>
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-white/20 bg-white/5 px-2.5 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-white/15"
        >
          Open in new tab
        </a>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close preview"
          className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-white/20 bg-white/10 text-white transition-colors hover:bg-white/20"
        >
          <Icon name="x" className="h-4 w-4" />
        </button>
      </div>

      {/* Content area — image or PDF. Clicking the backdrop OUTSIDE
          the image/iframe still closes the modal (via parent onClick).
          Clicking the image itself stops propagation so the driver can
          tap the image to zoom without dismissing the preview. */}
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex flex-1 items-center justify-center overflow-auto p-3 sm:p-6"
      >
        {isPdf ? (
          <iframe
            src={url}
            title={`Preview of ${label}`}
            className="h-full w-full max-w-4xl rounded-lg border border-white/10 bg-white"
          />
        ) : (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={url}
            alt={`Preview of ${label}`}
            className="max-h-full max-w-full rounded-lg object-contain shadow-2xl"
          />
        )}
      </div>
    </div>,
    document.body,
  );
}

/**
 * Which step in the wizard owns each document key. Used to deep-link the
 * resubmission pills so a tap takes the driver straight to the relevant step.
 */
const DOC_TO_STEP: Record<string, number> = {
  drivers_licence_front: 2,
  drivers_licence_back: 2,
  driver_badge: 2,
  red_plate_reg: 3,
  cof: 3,
  franchise_cert: 4,
  insurance: 5,
  police_record: 6,
  selfie: 6,
};

/**
 * Returns true if every required field/upload for the given step is filled.
 * Step 7 (review) requires steps 1–6 to all be complete.
 */
function isStepComplete(
  step: number,
  form: typeof EMPTY_FORM,
  files: FileState,
): boolean {
  const hasFile = (id: string) => Boolean(files[id]?.path);
  const hasText = (...keys: (keyof typeof form)[]) =>
    keys.every((k) => form[k].trim() !== "");

  switch (step) {
    case 1:
      return hasText("firstName", "lastName", "phone", "email", "trn", "nis");
    case 2:
      return (
        hasText("licenceNumber", "licenceExpiry", "badgeNumber") &&
        hasFile("drivers_licence_front") &&
        hasFile("drivers_licence_back") &&
        hasFile("driver_badge")
      );
    case 3:
      return (
        hasText(
          "plateNumber",
          "vehicleType",
          "vehicleMake",
          "vehicleModel",
          "vehicleYear",
          "vehicleColor",
        ) &&
        hasFile("red_plate_reg") &&
        hasFile("cof")
      );
    case 4:
      return (
        hasText("franchiseNumber", "franchiseExpiry") &&
        hasFile("franchise_cert")
      );
    case 5:
      return hasFile("insurance");
    case 6:
      return hasFile("police_record") && hasFile("selfie");
    case 7:
      return [1, 2, 3, 4, 5, 6].every((s) => isStepComplete(s, form, files));
    default:
      return false;
  }
}

/** Server-fetched driver state for resubmissions. */
type ServerDocument = {
  doc_key: string;
  status: string;
  file_name: string | null;
  file_path: string | null;
  note: string | null;
};
type ServerDriver = {
  external_id: string;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  email: string | null;
  trn: string | null;
  nis: string | null;
  licence_number: string | null;
  licence_expiry: string | null;
  badge_number: string | null;
  plate_number: string | null;
  vehicle_type: string | null;
  vehicle_make: string | null;
  vehicle_model: string | null;
  vehicle_year: number | null;
  vehicle_color: string | null;
  franchise_number: string | null;
  franchise_expiry: string | null;
  admin_note: string | null;
  onboarding_status: string;
};

function LoadingScreen() {
  // Match the onboarding wizard's real shape: top logo bar, hero with
  // step indicator, then a tall card representing the active step's
  // body. Same vertical rhythm as the live form so there's no jump
  // when the real wizard mounts.
  return (
    <div className="min-h-screen bg-surface-soft">
      <header className="border-b border-line bg-surface px-4 py-3 md:px-6">
        <div className="mx-auto flex max-w-3xl items-center justify-between">
          <Logo size="sm" tagline />
          <Skeleton className="h-6 w-24" rounded="full" />
        </div>
      </header>
      <div className="mx-auto max-w-3xl space-y-4 px-4 py-8 md:px-6">
        <div className="space-y-3 rounded-3xl bg-rajlo-black p-7 md:p-9">
          <Skeleton variant="dark" className="h-3 w-32" rounded="full" />
          <Skeleton variant="dark" className="h-9 w-2/3 max-w-md" rounded="lg" />
          <Skeleton variant="dark" className="h-4 w-3/4 max-w-md" rounded="md" />
        </div>
        <Skeleton className="h-72 w-full" rounded="2xl" />
        <div className="flex items-center justify-between">
          <Skeleton className="h-10 w-24" rounded="full" />
          <Skeleton className="h-10 w-32" rounded="full" />
        </div>
      </div>
    </div>
  );
}

export default function DriverOnboardingPage() {
  // Suspense boundary required by Next.js 16 because the inner component uses
  // useSearchParams — without this, production builds fail with the
  // "Missing Suspense boundary with useSearchParams" error.
  return (
    <Suspense fallback={<LoadingScreen />}>
      <DriverOnboardingWizard />
    </Suspense>
  );
}

function DriverOnboardingWizard() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const editMode = searchParams.get("edit") === "1";
  const [userId, setUserId] = useState<string | null>(null);
  // The email the driver registered/signed in with. This is the source
  // of truth for the email field — it's locked (read-only) so a driver
  // can't submit an application under a different address than the one
  // their account + notifications are tied to.
  const [authEmail, setAuthEmail] = useState<string>("");
  const authEmailRef = useRef<string>("");
  const [step, setStep] = useState(1);
  const [files, setFiles] = useState<FileState>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [hasDraft, setHasDraft] = useState(false);
  const [restored, setRestored] = useState(false);
  const [isResubmission, setIsResubmission] = useState(false);
  const [adminNote, setAdminNote] = useState<string | null>(null);
  const [rejectedDocKeys, setRejectedDocKeys] = useState<Set<string>>(new Set());

  // Loads the signed-in user's id (needed to scope storage paths) AND checks
  // whether they've already submitted onboarding. Routing logic:
  //  - active           → /driver
  //  - pending_review   → /driver/pending (locked: can't edit a pending app)
  //  - rejected (default) → /driver/resubmit (focused upload-only flow)
  //  - rejected + ?edit=1 → STAY on this wizard so the driver can fix form data
  //  - needs_onboarding → STAY on onboarding (first-time)
  const [checkingAccess, setCheckingAccess] = useState(true);
  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        router.push("/auth/driver/login");
        return;
      }
      setUserId(user.id);
      // Lock the email field to the account's email. Set the ref first
      // so anything that runs later in this effect (loadResubmissionData)
      // can preserve it instead of overwriting with a stale DB value.
      if (user.email) {
        authEmailRef.current = user.email;
        setAuthEmail(user.email);
      }

      try {
        const res = await fetch("/api/driver/status");
        if (res.ok) {
          const json = (await res.json()) as { state: string };
          if (json.state === "active") {
            router.push("/driver");
            return;
          }
          if (
            json.state === "pending_verification" ||
            json.state === "deactivated"
          ) {
            router.push("/driver/pending");
            return;
          }
          if (json.state === "rejected") {
            if (!editMode) {
              router.push("/driver/resubmit");
              return;
            }
            // ?edit=1 — let the driver edit form data via the full wizard.
            await loadResubmissionData();
            setIsResubmission(true);
          }
        }
      } catch {
        /* on error, fall through and let the user see the wizard */
      }

      setCheckingAccess(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router, editMode]);

  // Keep the email field pinned to the account email no matter what a
  // draft-restore or resubmission pre-fill tried to set. This is the
  // final authority, so the field always reflects the registered email.
  useEffect(() => {
    if (!authEmail) return;
    setForm((prev) => (prev.email === authEmail ? prev : { ...prev, email: authEmail }));
  }, [authEmail]);

  /**
   * Pulls existing driver + documents and pre-fills the form for a rejected
   * driver who's resubmitting.
   */
  const loadResubmissionData = async () => {
    try {
      const res = await fetch("/api/driver/me");
      if (!res.ok) return;
      const json = (await res.json()) as {
        driver: ServerDriver | null;
        documents: ServerDocument[];
      };
      if (!json.driver) return;
      const d = json.driver;

      // Merge instead of overwrite: prefer the DB value, but keep whatever
      // the user already had in the form (from a localStorage draft) when the
      // DB returns null/empty. Without this, a field the DB never managed to
      // store (e.g. submitted before the columns existed) would wipe the
      // user's saved draft on every load.
      setForm((prev) => {
        const pick = (
          db: string | null | undefined,
          local: string,
        ): string => {
          if (db !== null && db !== undefined && db !== "") return db;
          return local;
        };
        return {
          firstName: pick(d.first_name, prev.firstName),
          lastName: pick(d.last_name, prev.lastName),
          phone: pick(d.phone, prev.phone),
          // Email is locked to the account email — never let the DB value
          // override it (the enforce effect also guards this).
          email: authEmailRef.current || pick(d.email, prev.email),
          trn: pick(d.trn, prev.trn),
          nis: pick(d.nis, prev.nis),
          licenceNumber: pick(d.licence_number, prev.licenceNumber),
          licenceExpiry: pick(d.licence_expiry, prev.licenceExpiry),
          badgeNumber: pick(d.badge_number, prev.badgeNumber),
          plateNumber: pick(d.plate_number, prev.plateNumber),
          vehicleType: pick(d.vehicle_type, prev.vehicleType),
          vehicleMake: pick(d.vehicle_make, prev.vehicleMake),
          vehicleModel: pick(d.vehicle_model, prev.vehicleModel),
          vehicleYear: d.vehicle_year ? String(d.vehicle_year) : prev.vehicleYear,
          vehicleColor: pick(d.vehicle_color, prev.vehicleColor),
          franchiseNumber: pick(d.franchise_number, prev.franchiseNumber),
          franchiseExpiry: pick(d.franchise_expiry, prev.franchiseExpiry),
        };
      });

      setAdminNote(d.admin_note);

      // Merge the DB-known docs with whatever's already in the local files
      // state (which would have been hydrated from localStorage by the
      // earlier useEffect — this is the bridge from /driver/resubmit, where
      // the driver may have already uploaded a replacement before clicking
      // "Edit my details").
      //
      // Rules per doc:
      //   - DB rejected + local fresh upload  → use the local upload, do NOT
      //     mark it in `rejectedDocKeys` (the user has already replaced it)
      //   - DB rejected + nothing local       → mark rejected, no file
      //   - DB approved/pending with file_path → DB wins, attach `approved`
      //     flag so the UI shows the green "Approved" badge
      //   - No DB file but local has one      → keep the local upload
      setFiles((prev) => {
        const merged: FileState = {};
        const rejectedDocs = new Set<string>();

        json.documents.forEach((doc) => {
          const localUpload = prev[doc.doc_key];
          if (doc.status === "rejected") {
            // ALWAYS force re-upload for a rejected doc. Previously we
            // preserved a local upload when one existed, assuming it
            // was a fresh replacement — but the localStorage draft is
            // typically the ORIGINAL upload (the one that got rejected),
            // so keeping it made the wizard render the rejected file
            // as if still valid. When the driver actually uploads a
            // replacement via the resubmit flow, that goes through
            // /api/driver/documents/:key/replace which flips DB status
            // to "pending" — so the block below picks up the new file.
            rejectedDocs.add(doc.doc_key);
            return;
          }
          if (doc.file_path && doc.file_name) {
            merged[doc.doc_key] = {
              name: doc.file_name,
              size: 0,
              path: doc.file_path,
              approved: doc.status === "approved",
            };
          } else if (localUpload?.path) {
            merged[doc.doc_key] = localUpload;
          }
        });

        // setRejectedDocKeys inside setFiles' updater is intentional: we need
        // the closure access to `prev` for the pending-check above. React
        // batches both updates.
        setRejectedDocKeys(rejectedDocs);

        // Jump the wizard to the step that contains the FIRST rejected
        // doc (lowest step number in DOC_TO_STEP) so the driver lands
        // exactly where they need to re-upload — not on step 1
        // (Personal info) which they don't need to touch. Guarded on
        // editMode + rejectedDocs > 0 so we only fire this in the
        // resubmission flow.
        if (editMode && rejectedDocs.size > 0) {
          const steps = Array.from(rejectedDocs)
            .map((k) => DOC_TO_STEP[k])
            .filter((s): s is number => typeof s === "number");
          if (steps.length > 0) {
            setStep(Math.min(...steps));
          }
        }

        return merged;
      });
    } catch {
      /* fail silent — user can re-fill */
    }
  };

  // ────────── Auto-save draft to localStorage ──────────
  // Restore on mount ONCE per userId (form + step + uploaded file
  // metadata). Waits for userId — restoring without it would either
  // read the wrong user's data or force us back to a shared key.
  const restoredForUserRef = useRef<string | null>(null);
  useEffect(() => {
    // Purge the legacy unscoped key so a previous applicant's PII
    // can't be inherited by a fresh account on this device. Do this
    // regardless of whether we've resolved userId yet — the legacy
    // key has no owner so nobody misses it.
    try {
      localStorage.removeItem(LEGACY_DRAFT_KEY);
    } catch {
      /* localStorage disabled — nothing to purge */
    }

    if (!userId) return;
    if (restoredForUserRef.current === userId) return;
    restoredForUserRef.current = userId;

    try {
      const raw = localStorage.getItem(draftKeyFor(userId));
      if (!raw) return;
      const draft = JSON.parse(raw) as {
        form?: typeof EMPTY_FORM;
        step?: number;
        files?: FileState;
      };
      if (draft.form) {
        setForm({ ...EMPTY_FORM, ...draft.form });
        setHasDraft(true);
      }
      // In resubmission edit mode, loadResubmissionData is authoritative
      // for `step` — it jumps to the first rejected doc's step. Restoring
      // the draft's step here would overwrite that with wherever the
      // driver was when they last saved (usually step 7 = Review), which
      // isn't where they need to be for a resubmit.
      if (
        !editMode &&
        typeof draft.step === "number" &&
        draft.step >= 1 &&
        draft.step <= STEPS.length
      ) {
        setStep(draft.step);
      }
      if (draft.files) {
        // Strip any in-progress uploads — they were lost on page exit
        const restored: FileState = {};
        Object.entries(draft.files).forEach(([k, v]) => {
          if (v?.path) {
            restored[k] = {
              name: v.name,
              size: v.size,
              path: v.path,
              approved: v.approved,
            };
          }
        });
        setFiles(restored);
      }
      setRestored(true);
    } catch {
      /* corrupted draft — ignore */
    }
  }, [userId]);

  // Save on every form/step/files change (only after userId resolves —
  // otherwise we'd have no key to write under).
  useEffect(() => {
    if (done) return;
    if (!userId) return;
    const isEmpty =
      Object.values(form).every((v) => v === "") &&
      Object.keys(files).length === 0;
    if (isEmpty) return; // don't store an empty draft on first load
    try {
      // Don't persist `uploading` or `error` states — only completed uploads
      const persistableFiles: FileState = {};
      Object.entries(files).forEach(([k, v]) => {
        if (v?.path) {
          persistableFiles[k] = {
            name: v.name,
            size: v.size,
            path: v.path,
            approved: v.approved,
          };
        }
      });
      localStorage.setItem(
        draftKeyFor(userId),
        JSON.stringify({ form, step, files: persistableFiles, savedAt: Date.now() }),
      );
      setHasDraft(true);
    } catch {
      /* localStorage full or disabled */
    }
  }, [form, step, files, done, userId]);

  const clearDraft = () => {
    if (!userId) return;
    try {
      localStorage.removeItem(draftKeyFor(userId));
    } catch {
      /* */
    }
    setHasDraft(false);
  };

  /**
   * Wipe everything and restart the application from a clean slate.
   * Beyond clearing the draft, this ALSO drops the resubmission context
   * (isResubmission / flagged docs / admin note) so the red "Some
   * documents need attention" banner disappears — the driver has chosen
   * to redo the whole thing rather than patch the flagged docs. Used by
   * both the "draft restored" banner and the resubmission banner.
   */
  const startOver = () => {
    clearDraft();
    // Keep the locked account email — everything else resets to blank.
    setForm({ ...EMPTY_FORM, email: authEmailRef.current });
    setFiles({});
    setStep(1);
    setRestored(false);
    setIsResubmission(false);
    setRejectedDocKeys(new Set());
    setAdminNote(null);
    setSubmitError(null);
  };

  /**
   * Picks a file: shows an "Uploading…" state, uploads to Supabase Storage,
   * then updates with the final path. If a previous file was uploaded for the
   * same docKey, replaces it (deletes the old object first).
   */
  const handlePickFile = async (docKey: string, file: File) => {
    if (!userId) {
      setFiles((prev) => ({
        ...prev,
        [docKey]: { name: file.name, size: file.size, error: "Not signed in" },
      }));
      return;
    }

    // Track the previous path (if any) so we can clean it up after success
    const previousPath = files[docKey]?.path;

    // Optimistic state: uploading
    setFiles((prev) => ({
      ...prev,
      [docKey]: { name: file.name, size: file.size, uploading: true },
    }));

    const result = await uploadDriverDocument({ userId, docKey, file });

    if ("error" in result) {
      setFiles((prev) => ({
        ...prev,
        [docKey]: { name: file.name, size: file.size, error: result.error },
      }));
      return;
    }

    setFiles((prev) => ({
      ...prev,
      [docKey]: { name: file.name, size: file.size, path: result.path },
    }));

    // Clean up the previous file (best effort; safe to ignore failure)
    if (previousPath && previousPath !== result.path) {
      removeDriverDocument(previousPath).catch(() => {});
    }
  };

  const handleRemoveFile = async (docKey: string) => {
    const current = files[docKey];
    if (current?.path) {
      removeDriverDocument(current.path).catch(() => {});
    }
    setFiles((prev) => {
      const next = { ...prev };
      delete next[docKey];
      return next;
    });
  };

  const setField = (key: keyof typeof form) => (v: string) =>
    setForm((prev) => ({ ...prev, [key]: v }));

  const next = () => setStep((s) => Math.min(s + 1, STEPS.length));
  const back = () => setStep((s) => Math.max(s - 1, 1));

  const signOut = async () => {
    // Form + uploaded files auto-save on every change, so we can clear
    // the session and bounce to the login screen. The driver can pick
    // up where they left off next sign-in.
    const supabase = createSupabaseBrowserClient();
    await supabase.auth.signOut();
    router.push("/auth/driver/login");
    router.refresh();
  };

  const submit = async () => {
    setSubmitting(true);
    setSubmitError(null);
    try {
      // Refuse if any file is still uploading
      const pendingUpload = Object.values(files).some((f) => f?.uploading);
      if (pendingUpload) {
        setSubmitError("Please wait for all uploads to finish.");
        setSubmitting(false);
        return;
      }

      const uploadedDocs = Object.entries(files)
        .filter(([, file]) => file?.path)
        .map(([id, file]) => ({
          id,
          fileName: file!.name,
          filePath: file!.path,
        }));

      const res = await fetch("/api/driver/onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ form, uploadedDocs }),
      });
      if (!res.ok) throw new Error("Failed");
      clearDraft();
      setDone(true);
    } catch {
      setSubmitError("Submission failed. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  /* ───────────────── Loading (gating check) ───────────────── */
  if (checkingAccess) {
    return <LoadingScreen />;
  }

  /* ───────────────── Done state ───────────────── */
  if (done) {
    return (
      <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-surface-soft px-6 py-12 text-center">
        <ArcWatermark size={620} variant="red" className="absolute -right-32 -top-20 opacity-[0.05]" />
        <ArcWatermark size={520} variant="red" className="absolute -bottom-32 -left-20 opacity-[0.04]" />
        <FadeUp>
          <div className="mx-auto grid h-20 w-20 place-items-center rounded-full bg-rajlo-red text-white shadow-2xl shadow-rajlo-red/30">
            <Icon name="check-circle" className="h-10 w-10" />
          </div>
        </FadeUp>
        <FadeUp delay={0.1}>
          <h1 className="mt-8 text-4xl font-extrabold tracking-tight md:text-5xl">
            Application submitted!
          </h1>
        </FadeUp>
        <FadeUp delay={0.2}>
          <p className="mx-auto mt-4 max-w-md text-base text-muted">
            Your documents are under review by Rajlo operations against Jamaica
            Transport Authority records. You&apos;ll be notified by email and SMS within 1–2 business days.
          </p>
        </FadeUp>
        <FadeUp delay={0.3}>
          <button
            onClick={() => router.push("/driver/pending")}
            className="mt-8 inline-flex items-center gap-2 rounded-full bg-rajlo-red px-7 py-3.5 text-sm font-bold text-white shadow-lg shadow-rajlo-red/30 transition-all hover:-translate-y-0.5 hover:bg-primary-hover"
          >
            Track verification status
            <Icon name="arrow-right" className="h-4 w-4" />
          </button>
        </FadeUp>
      </div>
    );
  }

  const current = STEPS[step - 1];
  // Treat each step as 1/N of the journey — at step 7 of 7 the bar is full.
  const progressPct = Math.round((step / STEPS.length) * 100);
  const stepComplete = isStepComplete(step, form, files);

  /* ───────────────── Wizard ───────────────── */
  return (
    <div className="flex min-h-screen flex-col bg-surface-soft">
      {/* Native unverified → kick to the verify-on-web screen so they
          finish onboarding in a real browser. No-op on web. */}
      <NativeUnverifiedRedirect />
      {/* Legal-consent gate — a driver must accept every required
         policy (Driver Agreement, earnings disclaimer, etc.) at the
         start of onboarding. Renders a blocking modal until the
         consent is recorded; renders nothing once they're consented. */}
      <LegalConsentGate />
      {/* ────── Top bar ────── */}
      <header className="sticky top-0 z-30 border-b border-line bg-surface/90 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-2 py-3 md:px-3 md:py-4">
          <Logo size="sm" tagline />
          <div className="flex items-center gap-2">
            {hasDraft && (
              <span className="hidden items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-[11px] font-semibold text-emerald-700 ring-1 ring-emerald-100 sm:inline-flex">
                <span className="relative flex h-1.5 w-1.5">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-60" />
                  <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500" />
                </span>
                Draft saved
              </span>
            )}
            <button
              type="button"
              onClick={signOut}
              className="inline-flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-1.5 text-xs font-semibold text-muted hover:bg-surface-soft hover:text-foreground md:text-sm"
            >
              <Icon name="log-out" className="h-3.5 w-3.5" />
              <span>Sign out</span>
            </button>
          </div>
        </div>

        {/* Progress bar */}
        <div className="h-1 w-full bg-line">
          <div
            className="h-1 bg-gradient-to-r from-rajlo-red via-rajlo-red to-[#ff4d4d] transition-all duration-500 ease-out"
            style={{ width: `${progressPct}%` }}
          />
        </div>
      </header>

      {/* ────── Wizard body ────── */}
      <div className="mx-auto w-full max-w-5xl flex-1 px-2 py-8 md:px-3 md:py-12">
        {/* Draft restored banner */}
        {restored && (
          <FadeUp>
            <div className="mb-6 flex flex-col items-start justify-between gap-3 rounded-2xl border border-rajlo-red/15 bg-primary-soft/50 px-5 py-4 sm:flex-row sm:items-center">
              <div className="flex items-start gap-3">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-rajlo-red text-white">
                  <Icon name="check-circle" className="h-4 w-4" />
                </span>
                <div>
                  <p className="text-sm font-bold text-rajlo-black">Welcome back</p>
                  <p className="text-xs text-muted">
                    We restored your draft — every field and uploaded document is exactly where you left it.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  if (
                    confirm(
                      "Discard your draft and start over? This cannot be undone.",
                    )
                  ) {
                    startOver();
                  }
                }}
                className="shrink-0 rounded-full border border-rajlo-red/30 bg-white px-4 py-1.5 text-xs font-bold text-rajlo-red hover:bg-rajlo-red hover:text-white"
              >
                Discard & start over
              </button>
            </div>
          </FadeUp>
        )}

        {/* Resubmission banner */}
        {isResubmission && (
          <FadeUp>
            <div className="mb-6 overflow-hidden rounded-2xl border border-rajlo-red/30 bg-primary-soft">
              <div className="flex items-start gap-3 p-5">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-rajlo-red text-white">
                  <Icon name="alert-triangle" className="h-5 w-5" />
                </span>
                <div className="flex-1">
                  <p className="font-secondary text-xs font-bold uppercase tracking-wider text-rajlo-red">
                    Resubmission
                  </p>
                  <p className="mt-1 text-base font-extrabold tracking-tight">
                    Some documents need attention
                  </p>
                  {adminNote ? (
                    <div className="mt-3 rounded-xl bg-white px-4 py-3">
                      <p className="text-[11px] font-bold uppercase tracking-wider text-muted">
                        Note from operations
                      </p>
                      <p className="mt-1 text-sm leading-relaxed text-rajlo-black">
                        {adminNote}
                      </p>
                    </div>
                  ) : (
                    <p className="mt-2 text-sm text-rajlo-black/80">
                      Re-upload the highlighted documents below. Your previously-approved files and form fields are preserved.
                    </p>
                  )}
                  {rejectedDocKeys.size > 0 && (
                    <div className="mt-3">
                      <p className="text-[11px] font-bold uppercase tracking-wider text-muted">
                        Tap a document to jump to it ({rejectedDocKeys.size})
                      </p>
                      <ul className="mt-1.5 flex flex-wrap gap-1.5">
                        {Array.from(rejectedDocKeys).map((key) => {
                          const targetStep = DOC_TO_STEP[key];
                          return (
                            <li key={key}>
                              <button
                                type="button"
                                onClick={() => {
                                  if (targetStep) setStep(targetStep);
                                }}
                                disabled={!targetStep}
                                className="inline-flex items-center gap-1.5 rounded-full bg-white px-2.5 py-1 text-[11px] font-bold text-rajlo-red ring-1 ring-rajlo-red/30 transition-all hover:-translate-y-0.5 hover:bg-rajlo-red hover:text-white disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0 disabled:hover:bg-white disabled:hover:text-rajlo-red"
                              >
                                <span className="h-1.5 w-1.5 rounded-full bg-current" />
                                {humanizeDocKey(key)}
                                {targetStep && (
                                  <Icon name="arrow-right" className="h-3 w-3" />
                                )}
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  )}

                  {/* Escape hatch: redo the whole application instead of
                     patching the flagged docs. Clears the draft + this
                     resubmission banner so the wizard reads as a fresh
                     first-time application. */}
                  <div className="mt-4 border-t border-rajlo-red/15 pt-3">
                    <button
                      type="button"
                      onClick={() => {
                        if (
                          confirm(
                            "Start your whole application over? This clears your saved draft and the flagged-document list so you can fill everything in fresh.",
                          )
                        ) {
                          startOver();
                        }
                      }}
                      className="text-[11px] font-bold text-rajlo-red/80 underline underline-offset-2 hover:text-rajlo-red"
                    >
                      Prefer to start over? Restart the application
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </FadeUp>
        )}

        {/* Step pills (desktop) */}
        <div className="mb-8 hidden gap-2 overflow-x-auto pb-1 md:flex">
          {STEPS.map((s) => {
            const isCurrent = s.id === step;
            const isDone = s.id < step;
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => isDone && setStep(s.id)}
                disabled={!isDone && !isCurrent}
                className={`flex flex-1 items-center gap-2.5 rounded-xl border px-3 py-2 text-left text-xs font-semibold transition-all ${
                  isCurrent
                    ? "border-rajlo-red bg-rajlo-red text-white shadow-md shadow-rajlo-red/20"
                    : isDone
                      ? "border-line bg-surface text-foreground hover:border-rajlo-red hover:bg-primary-soft/40"
                      : "cursor-not-allowed border-line bg-surface-soft text-muted/70"
                }`}
              >
                <span
                  className={`grid h-7 w-7 shrink-0 place-items-center rounded-lg ${
                    isCurrent
                      ? "bg-white/20 text-white"
                      : isDone
                        ? "bg-primary-soft text-rajlo-red"
                        : "bg-line text-muted"
                  }`}
                >
                  {isDone ? (
                    <Icon name="check-circle" className="h-3.5 w-3.5" />
                  ) : (
                    <span className="text-[11px] font-extrabold">{s.id}</span>
                  )}
                </span>
                <span className="truncate">{s.title}</span>
              </button>
            );
          })}
        </div>

        {/* Step header (mobile + desktop) */}
        <FadeUp key={step}>
          <div className="mb-6 flex items-center gap-4 md:mb-10">
            <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-rajlo-red text-white shadow-lg shadow-rajlo-red/25 md:hidden">
              <Icon name={current.icon} className="h-5 w-5" />
            </span>
            <div className="flex-1">
              <p className="font-secondary text-xs font-bold uppercase tracking-wider text-rajlo-red">
                Step {step} of {STEPS.length}
              </p>
              <h1 className="mt-1 text-3xl font-extrabold tracking-tight md:text-4xl">
                {current.title}
              </h1>
              <p className="mt-1 text-sm text-muted md:text-base">{current.subtitle}</p>
            </div>
          </div>
        </FadeUp>

        {/* Card */}
        <FadeUp key={`card-${step}`} delay={0.1}>
          <div className="relative overflow-hidden rounded-3xl border border-line bg-surface p-6 shadow-xl shadow-rajlo-red/[0.04] md:p-10">
            <div
              aria-hidden
              className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-rajlo-red via-rajlo-red/80 to-rajlo-red/40"
            />

            {step === 1 && (
              <div className="space-y-5">
                <div className="grid gap-5 md:grid-cols-2">
                  <TextInput label="First name" placeholder="Andre" value={form.firstName} onChange={setField("firstName")} required />
                  <TextInput label="Last name" placeholder="Thompson" value={form.lastName} onChange={setField("lastName")} required />
                </div>
                <TextInput label="Mobile number" placeholder="876-XXX-XXXX" value={form.phone} onChange={setField("phone")} hint="Must match the number on your TA Badge application" required />
                <TextInput label="Email address" type="email" value={authEmail || form.email} onChange={() => {}} hint="The email you registered with — used for all verification updates" required readOnly />
                <div className="grid gap-5 md:grid-cols-2">
                  <TextInput label="TRN" placeholder="9-digit TRN" value={form.trn} onChange={setField("trn")} hint="Required for all TA fee processing" required />
                  <TextInput label="NIS number" placeholder="NIS number" value={form.nis} onChange={setField("nis")} hint="National Insurance Scheme" required />
                </div>
              </div>
            )}

            {step === 2 && (
              <div className="space-y-5">
                <TextInput label="Driver's licence number" placeholder="DL-123456" value={form.licenceNumber} onChange={setField("licenceNumber")} hint="Class that permits PPV / taxi operation" required />
                <DateInput label="Licence expiry date" value={form.licenceExpiry} onChange={setField("licenceExpiry")} hint="As shown on your driver's licence" required />
                <div className="grid gap-5 md:grid-cols-2">
                  <FileUpload field={{ id: "drivers_licence_front", label: "Driver's licence — front", hint: "Clear photo of the front of the licence", required: true }} files={files} onPick={handlePickFile} onRemove={handleRemoveFile} />
                  <FileUpload field={{ id: "drivers_licence_back", label: "Driver's licence — back", hint: "Clear photo of the back of the licence", required: true }} files={files} onPick={handlePickFile} onRemove={handleRemoveFile} />
                </div>
                <TextInput label="TA Driver Badge number" placeholder="Badge number" value={form.badgeNumber} onChange={setField("badgeNumber")} hint="Annual badge issued by the TA — must be displayed in vehicle" required />
                <FileUpload field={{ id: "driver_badge", label: "TA Driver Badge (front)", hint: "Must be current, in-date, and renewed annually at the TA", required: true }} files={files} onPick={handlePickFile} onRemove={handleRemoveFile} />
              </div>
            )}

            {step === 3 && (
              <div className="space-y-5">
                <div className="rounded-2xl bg-primary-soft px-5 py-4 text-sm">
                  <p className="font-bold text-rajlo-red">Red plate only</p>
                  <p className="mt-1 text-rajlo-black/80">
                    Rajlo is exclusively for vehicles carrying official Jamaican red (Public Passenger Vehicle) plates. Private and commercial white-plate vehicles are not eligible.
                  </p>
                </div>
                <TextInput label="Red plate number" placeholder="5812 GK" value={form.plateNumber} onChange={setField("plateNumber")} hint="Must be a registered PPV red plate as shown on your TA docs" required />
                <FileUpload field={{ id: "red_plate_reg", label: "Vehicle registration (PPV red plate)", hint: "Official registration document confirming red plate status", required: true }} files={files} onPick={handlePickFile} onRemove={handleRemoveFile} />
                {/* Vehicle spec — pulled from a controlled catalog so
                   make/model can't be misspelt or mismatched. Once
                   the driver is verified, this can only change via
                   a vehicle-change request (which re-collects docs). */}
                <div>
                  <p className="font-secondary text-xs font-bold uppercase tracking-wider text-rajlo-red">
                    Vehicle details
                  </p>
                  <p className="mt-1 mb-3 text-xs text-muted">
                    Pick from the list — these get verified against your
                    registration document above.
                  </p>
                  <VehiclePicker
                    value={{
                      type: form.vehicleType,
                      brand: form.vehicleMake,
                      model: form.vehicleModel,
                      year: form.vehicleYear,
                      color: form.vehicleColor,
                    }}
                    onChange={(spec) =>
                      setForm((f) => ({
                        ...f,
                        vehicleType: spec.type,
                        vehicleMake: spec.brand,
                        vehicleModel: spec.model,
                        vehicleYear: spec.year,
                        vehicleColor: spec.color,
                      }))
                    }
                  />
                </div>
                <FileUpload field={{ id: "cof", label: "Certificate of Fitness (COF)", hint: "Annual vehicle fitness inspection. Book at transportauthority.gov.jm or 876-926-9937.", required: true }} files={files} onPick={handlePickFile} onRemove={handleRemoveFile} />
              </div>
            )}

            {step === 4 && (
              <div className="space-y-5">
                <p className="text-sm leading-relaxed text-muted">
                  The TA Franchise Certificate grants the right to operate on a specific route or zone. It&apos;s renewed annually and is the primary authorization for PPV operation in Jamaica.
                </p>
                <TextInput label="Franchise certificate number" placeholder="FC-2025-XXXXXX" value={form.franchiseNumber} onChange={setField("franchiseNumber")} required />
                <DateInput label="Franchise expiry date" value={form.franchiseExpiry} onChange={setField("franchiseExpiry")} hint="Annual renewal — we'll remind you 60 days before expiry" required />
                <FileUpload field={{ id: "franchise_cert", label: "TA Franchise Certificate", hint: "Upload the certificate as issued by the Jamaica Transport Authority", required: true }} files={files} onPick={handlePickFile} onRemove={handleRemoveFile} />
              </div>
            )}

            {step === 5 && (
              <div className="space-y-5">
                <div className="rounded-2xl bg-amber-50 px-5 py-4 text-sm ring-1 ring-amber-100">
                  <p className="font-bold text-amber-900">Important</p>
                  <p className="mt-1 text-amber-900/85">
                    Your insurance must explicitly cover Public Passenger Vehicle (PPV) / commercial use. Standard private motor vehicle insurance is not acceptable and will be rejected.
                  </p>
                </div>
                <FileUpload field={{ id: "insurance", label: "Comprehensive PPV insurance certificate", hint: "Upload your current insurance policy or cover note showing PPV/commercial coverage", required: true }} files={files} onPick={handlePickFile} onRemove={handleRemoveFile} />
              </div>
            )}

            {step === 6 && (
              <div className="space-y-5">
                <FileUpload field={{ id: "police_record", label: "Police record / Good Conduct Certificate", hint: "Obtained from any police station in Jamaica. Required at first application; periodically thereafter.", required: true }} files={files} onPick={handlePickFile} onRemove={handleRemoveFile} />
                <FileUpload field={{ id: "selfie", label: "Live identity selfie", hint: "Clear photo of your face against a plain background. JPG or PNG. Used to match against your licence and TA badge.", required: true, previewAsAvatar: true }} files={files} onPick={handlePickFile} onRemove={handleRemoveFile} />
              </div>
            )}

            {step === 7 && (
              <div className="space-y-6">
                <p className="text-sm leading-relaxed text-muted">
                  Review your submission below. Once submitted, our operations team will verify your documents against Jamaica Transport Authority records — typically within 1–2 business days.
                </p>

                <div>
                  <p className="mb-3 text-xs font-bold uppercase tracking-wider text-muted">
                    Personal & vehicle details
                  </p>
                  <div className="grid gap-2 rounded-2xl border border-line bg-surface-soft p-3">
                    {/* Each row is [label, value, expiry?] — expiry is
                        rendered underneath the value in muted text so
                        the driver can sanity-check they typed the
                        right expiry alongside the doc number. Only the
                        two docs the driver actually enters expiries
                        for (licence + franchise) carry a third tuple
                        entry; everything else stays single-line. */}
                    {([
                      ["Full name", `${form.firstName} ${form.lastName}`.trim() || "—"],
                      ["Mobile", form.phone || "—"],
                      ["TRN", form.trn || "—"],
                      ["NIS", form.nis || "—"],
                      ["Driver's licence", form.licenceNumber || "—", form.licenceExpiry],
                      ["TA badge", form.badgeNumber || "—"],
                      ["Red plate", form.plateNumber || "—"],
                      ["Vehicle", form.vehicleMake && form.vehicleModel ? `${form.vehicleYear} ${form.vehicleMake} ${form.vehicleModel}` : "—"],
                      ["Franchise cert", form.franchiseNumber || "—", form.franchiseExpiry],
                    ] as Array<[string, string, string?]>).map(([label, value, expiry]) => (
                      <div key={label} className="flex items-start justify-between gap-3 rounded-lg bg-surface px-3 py-2">
                        <span className="mt-0.5 text-xs font-medium text-muted">{label}</span>
                        <div className="text-right">
                          <span className="text-sm font-semibold">{value}</span>
                          {expiry && ISO_DATE.test(expiry) && (
                            <p className="mt-0.5 text-[11px] font-medium text-muted">
                              Expires{" "}
                              {new Date(expiry).toLocaleDateString("en-JM", {
                                year: "numeric",
                                month: "short",
                                day: "numeric",
                              })}
                            </p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <p className="mb-3 text-xs font-bold uppercase tracking-wider text-muted">
                    Documents ready ({Object.values(files).filter((f) => f?.path).length})
                  </p>
                  <div className="rounded-2xl border border-line bg-surface-soft p-3">
                    {Object.entries(files).filter(([, f]) => f?.path).length === 0 ? (
                      <p className="rounded-lg bg-surface px-3 py-2 text-sm text-rajlo-red">
                        ⚠ No documents uploaded yet — go back and add them.
                      </p>
                    ) : (
                      <ul className="space-y-1.5">
                        {Object.entries(files)
                          .filter(([, f]) => f?.path)
                          .map(([key, file]) => (
                            <DocumentReadyRow
                              key={key}
                              docKey={key}
                              file={file!}
                            />
                          ))}
                      </ul>
                    )}
                  </div>
                </div>

                <p className="rounded-2xl border border-line bg-surface-soft px-4 py-3 text-xs leading-relaxed text-muted">
                  By submitting, you confirm that all information and documents are authentic. Providing false information will result in permanent account suspension and may be reported to the Jamaica Transport Authority.
                </p>

                {submitError && (
                  <div className="rounded-xl border border-rajlo-red/20 bg-primary-soft px-4 py-3 text-sm text-rajlo-red">
                    {submitError}
                  </div>
                )}
              </div>
            )}
          </div>
        </FadeUp>
      </div>

      {/* ────── Sticky action bar ────── */}
      <footer className="sticky bottom-0 z-20 border-t border-line bg-surface/90 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-2 py-3 md:px-3 md:py-4">
          <button
            type="button"
            onClick={back}
            disabled={step === 1}
            className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface px-5 py-2.5 text-sm font-semibold text-foreground transition-all hover:bg-surface-soft disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Icon name="chevron-left" className="h-4 w-4" />
            Back
          </button>

          <p className="hidden text-xs text-muted md:block">
            {step}/{STEPS.length} · {progressPct}% complete
          </p>

          {step < STEPS.length ? (
            <button
              type="button"
              onClick={next}
              disabled={!stepComplete}
              title={!stepComplete ? "Fill in all required fields to continue" : undefined}
              className="group inline-flex items-center gap-1.5 rounded-full bg-rajlo-red px-6 py-2.5 text-sm font-semibold text-white shadow-md shadow-rajlo-red/20 transition-all hover:-translate-y-0.5 hover:bg-primary-hover hover:shadow-lg hover:shadow-rajlo-red/30 disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none disabled:hover:-translate-y-0 disabled:hover:bg-rajlo-red"
            >
              Continue
              <Icon name="arrow-right" className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </button>
          ) : (
            <button
              type="button"
              onClick={submit}
              disabled={submitting || !stepComplete}
              title={!stepComplete ? "Complete every step before submitting" : undefined}
              className="inline-flex items-center gap-1.5 rounded-full bg-rajlo-red px-6 py-2.5 text-sm font-semibold text-white shadow-md shadow-rajlo-red/20 transition-all hover:-translate-y-0.5 hover:bg-primary-hover hover:shadow-lg disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none disabled:hover:-translate-y-0"
            >
              {submitting ? "Submitting…" : "Submit application"}
              {!submitting && <Icon name="check-circle" className="h-4 w-4" />}
            </button>
          )}
        </div>
      </footer>

      {/* Anchor link to legal — small print at bottom */}
      <div className="border-t border-line/50 bg-surface px-4 py-3 text-center text-[11px] text-muted">
        Need help? Visit the{" "}
        <Link href="/help" className="font-semibold text-rajlo-red hover:underline">
          Help Center
        </Link>{" "}
        or{" "}
        <Link href="/contact" className="font-semibold text-rajlo-red hover:underline">
          contact support
        </Link>
        .
      </div>
    </div>
  );
}
