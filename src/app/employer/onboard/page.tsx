"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Icon, type IconName } from "@/components/icons";
import { FadeUp } from "@/components/anim";
import {
  FileUpload,
  type FileState,
} from "@/components/file-upload";
import { VehiclePicker } from "@/components/vehicle-picker";
import { createSupabaseBrowserClient } from "@/lib/supabase-browser";
import {
  uploadEmployerDraftDocument,
  removeDriverDocument,
} from "@/lib/storage";

/**
 * Employer-side driver onboarding wizard.
 *
 * Same 8 steps + same required doc set as the driver's own
 * /driver/onboarding wizard — Rajlo staff sitting at a taxi hub with a
 * real driver, filling out the driver's information + uploading their
 * docs + capturing their bank details.
 *
 * Differences from /driver/onboarding:
 *
 *   1. No legal-consent gate — the driver hasn't logged in yet (they
 *      have no password). Legal consent is enforced at the driver's
 *      FIRST login (LegalConsentGate at /driver/(portal)/layout).
 *
 *   2. Files upload to `driver-documents/employer-drafts/<employer>/
 *      <sessionId>/<docKey>` (RLS-scoped to this employer via the
 *      employers-migration.sql policy). On submit, the API endpoint
 *      moves them into the newly-created driver's own folder using
 *      service_role.
 *
 *   3. `sessionId` is a per-wizard-run UUID stashed in sessionStorage
 *      so a reload doesn't wipe progress mid-onboarding. Closing the
 *      tab loses the draft — that's intentional; an employer walking
 *      away from a hub shouldn't leave a half-completed application
 *      cached for anyone to finish.
 *
 *   4. Submit hits POST /api/employer/drivers/submit rather than
 *      /api/driver/onboarding. On success, the server creates the
 *      auth.users row, moves the uploaded files, and emails the
 *      driver a set-password link — the employer never sees or types
 *      the driver's password.
 */

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

const STEPS: { id: number; title: string; subtitle: string; icon: IconName }[] = [
  { id: 1, title: "Personal info", subtitle: "TRN, NIS, contact", icon: "user" },
  { id: 2, title: "Licence & Badge", subtitle: "Driver's licence + TA badge", icon: "shield-check" },
  { id: 3, title: "Vehicle details", subtitle: "Red plate + COF", icon: "car" },
  { id: 4, title: "TA Franchise", subtitle: "Franchise certificate", icon: "file-text" },
  { id: 5, title: "Insurance", subtitle: "PPV insurance", icon: "shield" },
  { id: 6, title: "Police record", subtitle: "Good conduct + selfie", icon: "clipboard-check" },
  { id: 7, title: "Payout method", subtitle: "Bank account for earnings", icon: "credit-card" },
  { id: 8, title: "Review", subtitle: "Confirm & submit", icon: "check-circle" },
];

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
  payoutBankName: "",
  payoutBranch: "",
  payoutAccountNumber: "",
  payoutAccountHolderName: "",
  payoutAccountType: "savings" as "savings" | "chequing",
  payoutRoutingNumber: "",
};

type FormShape = typeof EMPTY_FORM;

function TextInput({
  label,
  placeholder,
  value,
  onChange,
  hint,
  required,
  type = "text",
}: {
  label: string;
  placeholder?: string;
  value: string;
  onChange: (v: string) => void;
  hint?: string;
  required?: boolean;
  type?: "text" | "email" | "tel" | "date" | "number";
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
        className="w-full rounded-xl border border-line bg-surface px-4 py-3 text-sm outline-none transition-all placeholder:text-muted/70 focus:border-rajlo-red focus:ring-2 focus:ring-rajlo-red/15"
      />
    </label>
  );
}

function isStepComplete(step: number, form: FormShape, files: FileState): boolean {
  const hasFile = (id: string) => Boolean(files[id]?.path);
  const hasText = (...keys: (keyof FormShape)[]) =>
    keys.every((k) => String(form[k]).trim() !== "");
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
      return hasText("franchiseNumber", "franchiseExpiry") && hasFile("franchise_cert");
    case 5:
      return hasFile("insurance");
    case 6:
      return hasFile("police_record") && hasFile("selfie");
    case 7:
      return hasText(
        "payoutBankName",
        "payoutBranch",
        "payoutAccountNumber",
        "payoutAccountHolderName",
      );
    case 8:
      return [1, 2, 3, 4, 5, 6, 7].every((s) => isStepComplete(s, form, files));
    default:
      return false;
  }
}

const DRAFT_KEY = "rajlo-employer-onboarding-draft";

export default function EmployerOnboardPage() {
  const router = useRouter();
  const [employerUserId, setEmployerUserId] = useState<string | null>(null);
  const sessionIdRef = useRef<string>("");

  const [step, setStep] = useState(1);
  const [form, setForm] = useState<FormShape>(EMPTY_FORM);
  const [files, setFiles] = useState<FileState>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [done, setDone] = useState<{ driverExternalId: string; driverEmail: string } | null>(null);

  // Resolve employer's own user id — needed for the storage upload
  // path prefix. Also generates a per-onboarding session UUID that
  // scopes the uploaded files under `employer-drafts/<uid>/<session>/`.
  useEffect(() => {
    (async () => {
      const supabase = createSupabaseBrowserClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      setEmployerUserId(user?.id ?? null);
    })();
    // sessionStorage-persisted session id — survives a reload but a
    // brand-new tab starts a fresh onboarding.
    if (typeof window !== "undefined") {
      let sid = window.sessionStorage.getItem(`${DRAFT_KEY}:session-id`);
      if (!sid) {
        sid =
          typeof crypto !== "undefined" && "randomUUID" in crypto
            ? crypto.randomUUID()
            : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
        window.sessionStorage.setItem(`${DRAFT_KEY}:session-id`, sid);
      }
      sessionIdRef.current = sid;
      // Restore form + files from sessionStorage
      try {
        const raw = window.sessionStorage.getItem(DRAFT_KEY);
        if (raw) {
          const parsed = JSON.parse(raw) as {
            form?: Partial<FormShape>;
            files?: FileState;
            step?: number;
          };
          if (parsed.form) setForm((f) => ({ ...f, ...parsed.form }));
          if (parsed.files) setFiles(parsed.files);
          if (parsed.step) setStep(parsed.step);
        }
      } catch {
        /* corrupted draft — start fresh */
      }
    }
  }, []);

  // Persist draft on every change
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.sessionStorage.setItem(
        DRAFT_KEY,
        JSON.stringify({ form, files, step }),
      );
    } catch {
      /* full storage / private mode — silent */
    }
  }, [form, files, step]);

  const clearDraft = () => {
    if (typeof window === "undefined") return;
    window.sessionStorage.removeItem(DRAFT_KEY);
    window.sessionStorage.removeItem(`${DRAFT_KEY}:session-id`);
  };

  const handlePickFile = async (docKey: string, file: File) => {
    if (!employerUserId) {
      setSubmitError("Session expired — please sign in again.");
      return;
    }
    setFiles((prev) => ({
      ...prev,
      [docKey]: { name: file.name, size: file.size, uploading: true },
    }));
    const result = await uploadEmployerDraftDocument({
      employerUserId,
      sessionId: sessionIdRef.current,
      docKey,
      file,
    });
    if ("error" in result) {
      setFiles((prev) => ({
        ...prev,
        [docKey]: {
          name: file.name,
          size: file.size,
          uploading: false,
          error: result.error,
        },
      }));
      return;
    }
    setFiles((prev) => ({
      ...prev,
      [docKey]: {
        name: file.name,
        size: file.size,
        uploading: false,
        path: result.path,
      },
    }));
  };

  const handleRemoveFile = async (docKey: string) => {
    const path = files[docKey]?.path;
    if (path) {
      await removeDriverDocument(path);
    }
    setFiles((prev) => {
      const next = { ...prev };
      delete next[docKey];
      return next;
    });
  };

  const stepComplete = useMemo(
    () => isStepComplete(step, form, files),
    [step, form, files],
  );

  const progressPct = Math.round((step / STEPS.length) * 100);
  const current = STEPS[step - 1];

  const submit = async () => {
    setSubmitting(true);
    setSubmitError(null);
    try {
      const pending = Object.values(files).some((f) => f?.uploading);
      if (pending) {
        setSubmitError("Please wait for all uploads to finish.");
        setSubmitting(false);
        return;
      }
      const uploadedDocs = Object.entries(files)
        .filter(([, f]) => f?.path)
        .map(([id, f]) => ({ id, fileName: f!.name, filePath: f!.path! }));

      const res = await fetch("/api/employer/drivers/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          form,
          uploadedDocs,
          sessionId: sessionIdRef.current,
        }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        error?: string;
        driverExternalId?: string;
      };
      if (!res.ok) {
        throw new Error(json.error ?? `Server returned ${res.status}`);
      }
      clearDraft();
      setDone({
        driverExternalId: json.driverExternalId ?? "",
        driverEmail: form.email,
      });
    } catch (e) {
      setSubmitError(
        e instanceof Error ? e.message : "Submission failed. Try again.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  if (done) {
    return (
      <div className="mx-auto max-w-2xl space-y-6 px-4 py-12">
        <FadeUp>
          <div className="text-center">
            <div className="mx-auto grid h-20 w-20 place-items-center rounded-full bg-emerald-600 text-white shadow-2xl shadow-emerald-600/40">
              <Icon name="check-circle" className="h-10 w-10" />
            </div>
            <h1 className="mt-6 text-3xl font-extrabold tracking-tight">
              Submitted for review
            </h1>
            <p className="mx-auto mt-3 max-w-md text-sm text-muted">
              Driver id <span className="font-bold">{done.driverExternalId}</span> is in the admin queue. We&apos;ve emailed{" "}
              <span className="font-bold">{done.driverEmail}</span> a link to
              set their own password — no expiry, so they can do it whenever
              they get to their phone.
            </p>
            <div className="mt-6 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
              <Link
                href="/employer"
                className="inline-flex items-center gap-2 rounded-full bg-rajlo-red px-6 py-3 text-sm font-bold text-white shadow-lg shadow-rajlo-red/30 hover:-translate-y-0.5 hover:bg-primary-hover"
              >
                Back to dashboard
                <Icon name="arrow-right" className="h-4 w-4" />
              </Link>
              <button
                type="button"
                onClick={() => {
                  setDone(null);
                  setStep(1);
                  setForm(EMPTY_FORM);
                  setFiles({});
                  clearDraft();
                  router.refresh();
                }}
                className="inline-flex items-center gap-2 rounded-full border border-line bg-surface px-6 py-3 text-sm font-bold text-foreground hover:bg-surface-soft"
              >
                Onboard another driver
              </button>
            </div>
          </div>
        </FadeUp>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl">
      {/* Progress bar + step label */}
      <div className="sticky top-0 z-10 -mx-4 mb-6 border-b border-line bg-surface/95 px-4 py-3 backdrop-blur md:mx-0 md:rounded-b-2xl md:border md:border-t-0">
        <div className="flex items-center justify-between">
          <p className="text-xs font-bold uppercase tracking-wider text-muted">
            Step {step} of {STEPS.length}
          </p>
          <p className="text-xs font-semibold text-muted">{progressPct}%</p>
        </div>
        <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-line">
          <div
            className="h-full bg-rajlo-red transition-all"
            style={{ width: `${progressPct}%` }}
          />
        </div>
        <div className="mt-3 flex items-center gap-3">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-primary-soft text-rajlo-red">
            <Icon name={current.icon} className="h-4 w-4" />
          </span>
          <div>
            <p className="text-sm font-extrabold">{current.title}</p>
            <p className="text-xs text-muted">{current.subtitle}</p>
          </div>
        </div>
      </div>

      <div className="space-y-5 pb-24">
        {step === 1 && (
          <div className="space-y-4">
            <div className="rounded-2xl border border-amber-300 bg-amber-50 p-4 text-amber-950">
              <p className="text-xs font-bold uppercase tracking-wider text-amber-800">
                Onboarding on behalf of a driver
              </p>
              <p className="mt-1 text-xs leading-relaxed text-amber-900/90">
                Type the driver&apos;s real information — do NOT enter your
                own. Rajlo will email THIS email address a link for the
                driver to set their own password.
              </p>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <TextInput
                label="First name"
                value={form.firstName}
                onChange={(v) => setForm((f) => ({ ...f, firstName: v }))}
                required
              />
              <TextInput
                label="Last name"
                value={form.lastName}
                onChange={(v) => setForm((f) => ({ ...f, lastName: v }))}
                required
              />
            </div>
            <TextInput
              label="Driver's email"
              type="email"
              hint="The set-password link goes here. Must be an email the driver actually has access to."
              value={form.email}
              onChange={(v) => setForm((f) => ({ ...f, email: v.trim() }))}
              required
            />
            <TextInput
              label="Mobile phone"
              type="tel"
              placeholder="876 555 0123"
              value={form.phone}
              onChange={(v) => setForm((f) => ({ ...f, phone: v }))}
              required
            />
            <div className="grid gap-4 md:grid-cols-2">
              <TextInput
                label="TRN"
                hint="Tax Registration Number, 9 digits"
                value={form.trn}
                onChange={(v) => setForm((f) => ({ ...f, trn: v.replace(/\D/g, "") }))}
                required
              />
              <TextInput
                label="NIS"
                hint="National Insurance Scheme number"
                value={form.nis}
                onChange={(v) => setForm((f) => ({ ...f, nis: v }))}
                required
              />
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <TextInput
              label="Driver's licence number"
              value={form.licenceNumber}
              onChange={(v) => setForm((f) => ({ ...f, licenceNumber: v }))}
              required
            />
            <TextInput
              label="Licence expiry"
              type="date"
              value={form.licenceExpiry}
              onChange={(v) => setForm((f) => ({ ...f, licenceExpiry: v }))}
              required
            />
            <TextInput
              label="TA badge number"
              value={form.badgeNumber}
              onChange={(v) => setForm((f) => ({ ...f, badgeNumber: v }))}
              required
            />
            <FileUpload
              field={{
                id: "drivers_licence_front",
                label: "Driver's licence — front",
                hint: "Class must permit PPV/taxi operation.",
                required: true,
              }}
              files={files}
              onPick={handlePickFile}
              onRemove={handleRemoveFile}
            />
            <FileUpload
              field={{
                id: "drivers_licence_back",
                label: "Driver's licence — back",
                required: true,
              }}
              files={files}
              onPick={handlePickFile}
              onRemove={handleRemoveFile}
            />
            <FileUpload
              field={{
                id: "driver_badge",
                label: "TA Driver Badge",
                required: true,
              }}
              files={files}
              onPick={handlePickFile}
              onRemove={handleRemoveFile}
            />
          </div>
        )}

        {step === 3 && (
          <div className="space-y-4">
            <TextInput
              label="Red plate number"
              value={form.plateNumber}
              onChange={(v) =>
                setForm((f) => ({ ...f, plateNumber: v.toUpperCase() }))
              }
              required
            />
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
            <FileUpload
              field={{
                id: "red_plate_reg",
                label: "Red plate vehicle registration",
                required: true,
              }}
              files={files}
              onPick={handlePickFile}
              onRemove={handleRemoveFile}
            />
            <FileUpload
              field={{
                id: "cof",
                label: "Certificate of Fitness (COF)",
                required: true,
              }}
              files={files}
              onPick={handlePickFile}
              onRemove={handleRemoveFile}
            />
          </div>
        )}

        {step === 4 && (
          <div className="space-y-4">
            <TextInput
              label="Franchise certificate number"
              value={form.franchiseNumber}
              onChange={(v) => setForm((f) => ({ ...f, franchiseNumber: v }))}
              required
            />
            <TextInput
              label="Franchise expiry"
              type="date"
              value={form.franchiseExpiry}
              onChange={(v) => setForm((f) => ({ ...f, franchiseExpiry: v }))}
              required
            />
            <FileUpload
              field={{
                id: "franchise_cert",
                label: "TA Franchise Certificate",
                required: true,
              }}
              files={files}
              onPick={handlePickFile}
              onRemove={handleRemoveFile}
            />
          </div>
        )}

        {step === 5 && (
          <div className="space-y-4">
            <FileUpload
              field={{
                id: "insurance",
                label: "Comprehensive PPV insurance",
                hint: "Must cover public passenger vehicle / commercial use.",
                required: true,
              }}
              files={files}
              onPick={handlePickFile}
              onRemove={handleRemoveFile}
            />
          </div>
        )}

        {step === 6 && (
          <div className="space-y-4">
            <FileUpload
              field={{
                id: "police_record",
                label: "Police record / Good Conduct Certificate",
                required: true,
              }}
              files={files}
              onPick={handlePickFile}
              onRemove={handleRemoveFile}
            />
            <FileUpload
              field={{
                id: "selfie",
                label: "Identity selfie",
                hint: "Live selfie of the driver — matched against licence + badge photos.",
                required: true,
                previewAsAvatar: true,
              }}
              files={files}
              onPick={handlePickFile}
              onRemove={handleRemoveFile}
            />
          </div>
        )}

        {step === 7 && (
          <div className="space-y-4">
            <div className="rounded-2xl border border-line bg-surface-soft p-4">
              <p className="text-xs font-bold uppercase tracking-wider text-muted">
                Payout account
              </p>
              <p className="mt-1 text-xs leading-relaxed text-muted">
                Rajlo settles weekly on Mondays via bank batch. Enter the
                driver&apos;s Jamaican bank account exactly as it appears on
                their bank card / statement.
              </p>
            </div>
            <TextInput
              label="Bank name"
              placeholder="National Commercial Bank"
              value={form.payoutBankName}
              onChange={(v) => setForm((f) => ({ ...f, payoutBankName: v }))}
              required
            />
            <TextInput
              label="Branch"
              placeholder="Half Way Tree"
              value={form.payoutBranch}
              onChange={(v) => setForm((f) => ({ ...f, payoutBranch: v }))}
              required
            />
            <TextInput
              label="Account holder name"
              hint="Must match the driver's licence + TRN. Mismatches bounce payouts."
              value={form.payoutAccountHolderName}
              onChange={(v) => setForm((f) => ({ ...f, payoutAccountHolderName: v }))}
              required
            />
            <TextInput
              label="Account number"
              value={form.payoutAccountNumber}
              onChange={(v) => setForm((f) => ({ ...f, payoutAccountNumber: v.replace(/\D/g, "") }))}
              required
            />
            <label className="block">
              <span className="mb-1.5 block text-sm font-semibold">
                Account type <span className="text-rajlo-red">*</span>
              </span>
              <div className="grid grid-cols-2 gap-2">
                {(["savings", "chequing"] as const).map((t) => {
                  const active = form.payoutAccountType === t;
                  return (
                    <button
                      key={t}
                      type="button"
                      onClick={() =>
                        setForm((f) => ({ ...f, payoutAccountType: t }))
                      }
                      className={`rounded-xl border px-4 py-3 text-sm font-semibold capitalize transition-colors ${
                        active
                          ? "border-rajlo-red bg-primary-soft text-rajlo-red"
                          : "border-line bg-surface hover:bg-surface-soft"
                      }`}
                    >
                      {t}
                    </button>
                  );
                })}
              </div>
            </label>
            <TextInput
              label="Routing / ABM number"
              hint="Optional — leave blank if not applicable."
              value={form.payoutRoutingNumber}
              onChange={(v) => setForm((f) => ({ ...f, payoutRoutingNumber: v }))}
            />
          </div>
        )}

        {step === 8 && (
          <div className="space-y-5">
            <p className="text-sm leading-relaxed text-muted">
              Review each field. Once you tap Submit, the driver&apos;s
              application enters the admin verification queue and we email
              them a set-password link.
            </p>
            <div>
              <p className="mb-2 text-xs font-bold uppercase tracking-wider text-muted">
                Driver
              </p>
              <div className="grid gap-2 rounded-2xl border border-line bg-surface-soft p-3">
                {([
                  ["Full name", `${form.firstName} ${form.lastName}`.trim()],
                  ["Email", form.email],
                  ["Mobile", form.phone],
                  ["TRN", form.trn],
                  ["NIS", form.nis],
                  ["Licence", form.licenceNumber, form.licenceExpiry],
                  ["Badge", form.badgeNumber],
                  ["Plate", form.plateNumber],
                  [
                    "Vehicle",
                    form.vehicleMake && form.vehicleModel
                      ? `${form.vehicleYear} ${form.vehicleMake} ${form.vehicleModel} (${form.vehicleColor})`
                      : "—",
                  ],
                  ["Franchise", form.franchiseNumber, form.franchiseExpiry],
                ] as Array<[string, string, string?]>).map(([label, value, expiry]) => (
                  <div key={label} className="flex items-start justify-between gap-3 rounded-lg bg-surface px-3 py-2">
                    <span className="mt-0.5 text-xs font-medium text-muted">{label}</span>
                    <div className="text-right">
                      <span className="text-sm font-semibold">{value || "—"}</span>
                      {expiry && ISO_DATE.test(expiry) && (
                        <p className="mt-0.5 text-[11px] text-muted">
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
              <p className="mb-2 text-xs font-bold uppercase tracking-wider text-muted">
                Payout account
              </p>
              <div className="grid gap-2 rounded-2xl border border-line bg-surface-soft p-3">
                {([
                  ["Bank", form.payoutBankName],
                  ["Branch", form.payoutBranch],
                  ["Account holder", form.payoutAccountHolderName],
                  [
                    "Account #",
                    form.payoutAccountNumber
                      ? `•••• ${form.payoutAccountNumber.slice(-4)}`
                      : "—",
                  ],
                  ["Type", form.payoutAccountType],
                ] as Array<[string, string]>).map(([label, value]) => (
                  <div key={label} className="flex items-start justify-between gap-3 rounded-lg bg-surface px-3 py-2">
                    <span className="text-xs font-medium text-muted">{label}</span>
                    <span className="text-sm font-semibold">{value || "—"}</span>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <p className="mb-2 text-xs font-bold uppercase tracking-wider text-muted">
                Documents ({Object.values(files).filter((f) => f?.path).length} of 8)
              </p>
              <ul className="space-y-1.5 rounded-2xl border border-line bg-surface-soft p-3">
                {Object.entries(files)
                  .filter(([, f]) => f?.path)
                  .map(([key, file]) => (
                    <li
                      key={key}
                      className="flex items-center justify-between gap-3 rounded-lg bg-surface px-3 py-2 text-sm"
                    >
                      <span className="font-semibold">{key.replace(/_/g, " ")}</span>
                      <span className="truncate text-xs text-muted">{file!.name}</span>
                    </li>
                  ))}
              </ul>
            </div>
            {submitError && (
              <div className="rounded-xl border border-rajlo-red/20 bg-primary-soft px-4 py-3 text-sm text-rajlo-red">
                {submitError}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Sticky action bar */}
      <footer className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-surface/95 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-3">
          <button
            type="button"
            onClick={() => setStep((s) => Math.max(1, s - 1))}
            disabled={step === 1}
            className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface px-5 py-2.5 text-sm font-semibold hover:bg-surface-soft disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Icon name="chevron-left" className="h-4 w-4" />
            Back
          </button>
          {step < STEPS.length ? (
            <button
              type="button"
              onClick={() => setStep((s) => Math.min(STEPS.length, s + 1))}
              disabled={!stepComplete}
              className="inline-flex items-center gap-1.5 rounded-full bg-rajlo-red px-6 py-2.5 text-sm font-bold text-white shadow-lg shadow-rajlo-red/30 hover:-translate-y-0.5 hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0"
            >
              Next
              <Icon name="chevron-right" className="h-4 w-4" />
            </button>
          ) : (
            <button
              type="button"
              onClick={submit}
              disabled={!stepComplete || submitting}
              className="inline-flex items-center gap-2 rounded-full bg-rajlo-red px-6 py-2.5 text-sm font-bold text-white shadow-lg shadow-rajlo-red/30 hover:-translate-y-0.5 hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0"
            >
              {submitting ? (
                <>
                  <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  Submitting…
                </>
              ) : (
                <>
                  Submit for admin review
                  <Icon name="arrow-right" className="h-4 w-4" />
                </>
              )}
            </button>
          )}
        </div>
      </footer>
    </div>
  );
}
