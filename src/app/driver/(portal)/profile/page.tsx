"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { Icon, type IconName } from "@/components/icons";
import { ArcWatermark } from "@/components/arc-pattern";
import { FadeUp } from "@/components/anim";
import { HeroSkeleton, Skeleton } from "@/components/skeleton";
import { usePush } from "@/lib/use-push";
import { isNativeApp } from "@/lib/native";
import { DeleteAccountDialog } from "@/components/delete-account-dialog";
import {
  getCachedDriverData,
  setCachedDriverData,
} from "@/lib/driver-prefetch";

const DRIVER_ME_URL = "/api/driver/me";
const AVATAR_URL = "/api/me/avatar";

type CachedAvatar = { avatarUrl: string | null; source: "selfie" | "oauth" };

/**
 * Driver self-edit profile page. Drivers update the fields they own:
 *
 *   - First / last name
 *   - Phone
 *   - Vehicle: make, model, year, colour
 *
 * Plate number, licence number, badge number, and franchise number are
 * shown read-only with a "to change, contact support" hint — those are
 * TA-tied identifiers that must re-trigger compliance review when
 * edited. The PATCH endpoint enforces the same policy server-side.
 */

type DriverMe = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  email: string | null;
  plate_number: string | null;
  licence_number: string | null;
  badge_number: string | null;
  franchise_number: string | null;
  vehicle_make: string | null;
  vehicle_model: string | null;
  vehicle_year: number | null;
  vehicle_color: string | null;
};

export default function DriverProfilePage() {
  // Seed every piece of state from the bottom-nav's prefetch cache so
  // tapping the "Me" tab lands on a fully-painted profile instead of
  // a shimmer. The fetch below still runs to refresh, but the user
  // only sees the latest values, never the empty/loading states.
  const cachedDriver =
    getCachedDriverData<{ driver: DriverMe | null }>(DRIVER_ME_URL)?.driver ??
    null;
  const cachedAvatar = getCachedDriverData<CachedAvatar>(AVATAR_URL);

  const [driver, setDriver] = useState<DriverMe | null>(cachedDriver);
  const [loading, setLoading] = useState(cachedDriver == null);
  const [error, setError] = useState<string | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const push = usePush();
  // SSR-safe native detection — the web-push section below is hidden
  // inside the Capacitor app (push there is native FCM, not web push).
  const native = useSyncExternalStore(
    () => () => {},
    () => isNativeApp(),
    () => false,
  );

  // Editable form state — kept separate from the loaded `driver` so we
  // can detect dirty fields and let the rider revert with a refresh.
  const [firstName, setFirstName] = useState(cachedDriver?.first_name ?? "");
  const [lastName, setLastName] = useState(cachedDriver?.last_name ?? "");
  const [phone, setPhone] = useState(cachedDriver?.phone ?? "");
  const [vehicleMake, setVehicleMake] = useState(
    cachedDriver?.vehicle_make ?? "",
  );
  const [vehicleModel, setVehicleModel] = useState(
    cachedDriver?.vehicle_model ?? "",
  );
  const [vehicleYear, setVehicleYear] = useState<string>(
    cachedDriver?.vehicle_year?.toString() ?? "",
  );
  const [vehicleColor, setVehicleColor] = useState(
    cachedDriver?.vehicle_color ?? "",
  );
  // Driver's profile picture IS the verified TA selfie — there's no
  // separate "everyday avatar". `/api/me/avatar` already prefers the
  // selfie for drivers and falls back to OAuth picture if the selfie
  // hasn't been uploaded/approved yet (rare in the portal since the
  // layout gates on activation, but defensive).
  const [avatarUrl, setAvatarUrl] = useState<string | null>(
    cachedAvatar?.avatarUrl ?? null,
  );
  const [avatarSource, setAvatarSource] = useState<"selfie" | "oauth" | null>(
    cachedAvatar?.source ?? null,
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [driverRes, avatarRes] = await Promise.all([
          fetch(DRIVER_ME_URL),
          fetch(AVATAR_URL),
        ]);
        if (!driverRes.ok) throw new Error(`HTTP ${driverRes.status}`);
        const json = (await driverRes.json()) as { driver: DriverMe | null };
        if (cancelled) return;
        if (!json.driver) {
          setError(
            "Couldn't load your profile. Make sure you're signed in as a driver.",
          );
          return;
        }
        setDriver(json.driver);
        setCachedDriverData(DRIVER_ME_URL, json);
        // Only overwrite editable form fields the user hasn't started
        // typing into. Since seeding from cache already populated them
        // with the most recent server values, this catches the rare
        // case where the background refresh resolved with a newer
        // value while the user was reading the page.
        setFirstName(json.driver.first_name ?? "");
        setLastName(json.driver.last_name ?? "");
        setPhone(json.driver.phone ?? "");
        setVehicleMake(json.driver.vehicle_make ?? "");
        setVehicleModel(json.driver.vehicle_model ?? "");
        setVehicleYear(json.driver.vehicle_year?.toString() ?? "");
        setVehicleColor(json.driver.vehicle_color ?? "");

        if (avatarRes.ok) {
          const ajson = (await avatarRes.json()) as CachedAvatar;
          setAvatarUrl(ajson.avatarUrl);
          setAvatarSource(ajson.source);
          setCachedDriverData(AVATAR_URL, ajson);
        }
      } catch (e) {
        if (!cancelled)
          setError(e instanceof Error ? e.message : "Couldn't load profile.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    // Profile layout skeleton: hero + info banner + 3 sections
    // (personal, vehicle, compliance), each with field placeholders.
    return (
      <div className="mx-auto max-w-3xl space-y-5  py-2 md:px-3 md:py-8">
        <HeroSkeleton />
        <div className="rounded-2xl border border-rajlo-red/20 bg-primary-soft/40 p-4">
          <div className="flex items-start gap-3">
            <Skeleton className="h-9 w-9" rounded="xl" />
            <div className="flex-1 space-y-1.5">
              <Skeleton className="h-3 w-44" rounded="md" />
              <Skeleton className="h-2.5 w-full max-w-md" rounded="md" />
            </div>
          </div>
        </div>
        {[0, 1, 2].map((s) => (
          <div
            key={s}
            className="rounded-2xl border border-line bg-surface p-5"
          >
            <div className="mb-4 flex items-center gap-2">
              <Skeleton className="h-7 w-7" rounded="lg" />
              <Skeleton className="h-2.5 w-20" rounded="md" />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {[0, 1, 2, 3].map((f) => (
                <div key={f} className="space-y-1.5">
                  <Skeleton className="h-2.5 w-16" rounded="md" />
                  <Skeleton className="h-12 w-full" rounded="xl" />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (error && !driver) {
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center">
        <span className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-primary-soft">
          <span aria-hidden className="text-3xl leading-none">
            😢
          </span>
        </span>
        <h1 className="mt-5 text-2xl font-extrabold tracking-tight">
          Profile unavailable
        </h1>
        <p className="mt-2 text-sm text-muted">{error}</p>
      </div>
    );
  }

  if (!driver) return null;

  const fullName = [firstName, lastName].filter(Boolean).join(" ") || "Driver";
  const vehicleLine = [vehicleYear, vehicleColor, vehicleMake, vehicleModel]
    .filter(Boolean)
    .join(" ");

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
          <div className="relative">
            <p className="font-secondary text-xs font-bold uppercase tracking-wider text-rajlo-red">
              Your profile
            </p>
            <h1 className="mt-2 text-3xl font-extrabold leading-tight tracking-tight md:text-4xl">
              {fullName}
            </h1>
            <p className="mt-1 text-sm text-white/75">
              {vehicleLine
                ? vehicleLine
                : "Add your vehicle details so riders know what to look for."}
              {driver.plate_number ? ` · ${driver.plate_number}` : ""}
            </p>
          </div>
        </div>
      </FadeUp>

      {/* Info banner */}
      <FadeUp delay={0.04}>
        <div className="flex items-start gap-3 rounded-2xl border border-rajlo-red/20 bg-primary-soft/40 p-4">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-rajlo-red/15 text-rajlo-red">
            <Icon name="users" className="h-4 w-4" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold leading-snug">
              These details show to your riders
            </p>
            <p className="mt-0.5 text-xs text-muted">
              Vehicle colour, plate, and your name appear on the rider&apos;s
              live-trip view, share links, and ride history. Keep them accurate
              so riders can find you at pickup.
            </p>
          </div>
        </div>
      </FadeUp>

      {/* Avatar — driver's everyday profile picture (sidebar etc.).
         Different from the verified TA selfie that riders see on
         trips: that one stays compliance-managed via the
         verification flow. */}
      <FadeUp delay={0.06}>
        <Section title="Profile picture" icon="user">
          <div className="flex flex-col items-start gap-5 sm:flex-row sm:items-start">
            <div className="relative shrink-0">
              <div className="grid h-24 w-24 place-items-center overflow-hidden rounded-full bg-primary-soft text-2xl font-extrabold text-rajlo-red ring-2 ring-rajlo-red/20">
                {avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={avatarUrl}
                    alt="Your verified TA selfie"
                    referrerPolicy="no-referrer"
                    className="h-full w-full object-cover"
                  />
                ) : (
                  [firstName, lastName]
                    .filter(Boolean)
                    .map((s) => s[0]?.toUpperCase() ?? "")
                    .join("") || "D"
                )}
              </div>
              {avatarSource === "selfie" && (
                <span
                  aria-label="Verified"
                  title="Verified TA selfie"
                  className="absolute bottom-0 right-0 grid h-7 w-7 place-items-center rounded-full border-2 border-white bg-emerald-600 text-white shadow-md"
                >
                  <Icon name="shield-check" className="h-3.5 w-3.5" />
                </span>
              )}
            </div>
            <div className="min-w-0 flex-1 space-y-2">
              <p className="text-sm font-bold">
                {avatarSource === "selfie"
                  ? "Your verified TA selfie"
                  : "Profile picture"}
              </p>
              <p className="text-xs text-muted">
                {avatarSource === "selfie"
                  ? "This photo identifies you to riders, fellow drivers, and operations. It's the same selfie the Transport Authority verified during onboarding."
                  : "Once your verification is approved, your TA selfie will become your profile picture across the app."}
              </p>
              <p className="rounded-xl bg-primary-soft px-3 py-2 text-[11px] leading-relaxed text-foreground">
                <span className="font-bold text-rajlo-red">
                  Need to change it?
                </span>{" "}
                Contact support to re-submit your verification documents — a
                fresh selfie has to go through TA review before it replaces this
                one.
              </p>
            </div>
          </div>
        </Section>
      </FadeUp>

      {/* Personal — read-only.
         Name and phone are tied to the verified TA record and the
         masked-call routing system, so a silent self-edit isn't
         allowed. Riders see the name on every trip share-link and
         live-trip view; the phone is the number our masked-call
         layer routes through. Changes need re-verification, same
         path as email + compliance IDs — contact support. */}
      <FadeUp delay={0.08}>
        <Section title="Personal" icon="user">
          <p className="text-xs text-muted">
            These details are tied to your TA verification. To update them,
            contact support.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <ReadOnlyField label="First name" value={firstName || "—"} />
            <ReadOnlyField label="Last name" value={lastName || "—"} />
          </div>
          <ReadOnlyField
            label="Phone"
            value={phone || "—"}
            help="Riders call this number through Rajlo's masked-call system."
          />
          <ReadOnlyField
            label="Email"
            value={driver.email ?? "—"}
            help="Email changes need re-verification — contact support."
          />
        </Section>
      </FadeUp>

      {/* Vehicle — read-only.
         Vehicle data ties to verified compliance documents
         (registration, COF, insurance), so silent self-edit isn't
         allowed — a driver registering a Probox can't quietly start
         operating a Hilux. Changes go through the vehicle-change
         request flow (collects new docs, admin reviews). */}
      <FadeUp delay={0.12}>
        <Section title="Vehicle" icon="car">
          <div className="grid gap-3 sm:grid-cols-2">
            <ReadOnlyField
              label="Type"
              value={
                (driver as DriverMe & { vehicle_type?: string | null })
                  .vehicle_type ?? "—"
              }
            />
            <ReadOnlyField label="Brand" value={driver.vehicle_make ?? "—"} />
            <ReadOnlyField label="Model" value={driver.vehicle_model ?? "—"} />
            <ReadOnlyField
              label="Year"
              value={driver.vehicle_year ? String(driver.vehicle_year) : "—"}
            />
            <ReadOnlyField label="Colour" value={driver.vehicle_color ?? "—"} />
            <ReadOnlyField label="Plate" value={driver.plate_number ?? "—"} />
          </div>

          {/* Live preview — what the rider will see */}
          <div className="rounded-2xl border border-line bg-surface-soft p-4">
            <p className="font-secondary text-[10px] font-bold uppercase tracking-wider text-muted">
              Rider preview
            </p>
            <p className="mt-1 text-sm font-bold">
              {vehicleLine || "Vehicle not registered yet"}
            </p>
            {driver.plate_number && (
              <p className="mt-0.5 text-xs text-muted">
                Red plate · {driver.plate_number}
              </p>
            )}
          </div>

          {/* Change request CTA. On mobile we stack the row so the
             icon + copy get the full width and the button drops to a
             new full-width line — way less squeezed than packing
             three columns into 320px. */}
          <div className="rounded-2xl border border-rajlo-red/20 bg-primary-soft/40 p-4">
            <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-center">
              <div className="flex items-start gap-3 sm:flex-1">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-rajlo-red/15 text-rajlo-red">
                  <Icon name="car" className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-extrabold tracking-tight">
                    Got a different car?
                  </p>
                  <p className="mt-0.5 text-xs text-muted">
                    Vehicle changes need fresh registration, COF, and insurance
                    documents. Submit a request and our team will review them
                    within 1–2 business days.
                  </p>
                </div>
              </div>
              <Link
                href="/driver/vehicle-change"
                className="inline-flex shrink-0 items-center justify-center rounded-full bg-rajlo-red px-4 py-2.5 text-xs font-bold text-white transition-all hover:-translate-y-0.5 hover:bg-primary-hover sm:py-2"
              >
                Request change
              </Link>
            </div>
          </div>
        </Section>
      </FadeUp>

      {/* Compliance / read-only IDs */}
      <FadeUp delay={0.16}>
        <Section title="Compliance" icon="shield-check">
          <p className="text-xs text-muted">
            These TA-tied identifiers can&apos;t be self-edited — changing them
            requires re-verification. Contact support if you need an update.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <ReadOnlyField
              label="Plate number"
              value={driver.plate_number ?? "—"}
            />
            <ReadOnlyField
              label="Licence number"
              value={driver.licence_number ?? "—"}
            />
            <ReadOnlyField
              label="TA badge number"
              value={driver.badge_number ?? "—"}
            />
            <ReadOnlyField
              label="Franchise number"
              value={driver.franchise_number ?? "—"}
            />
          </div>
          <Link
            href="/driver/verification"
            className="group inline-flex items-center gap-1.5 rounded-full border border-line bg-surface px-4 py-2 text-xs font-bold text-foreground transition-colors hover:bg-surface-soft hover:text-rajlo-red"
          >
            View compliance dashboard
            <Icon
              name="arrow-right"
              className="h-3 w-3 transition-transform group-hover:translate-x-0.5"
            />
          </Link>
        </Section>
      </FadeUp>

      {/* Push notifications — WEB-push controls. Hidden in the native
         app: there, push is delivered via native FCM and the
         permission is granted through the OS (the readiness gate
         handles it on first launch), so the web-push toggle and the
         "this browser doesn't support push" notice are both wrong and
         non-functional inside the Capacitor WebView. Native drivers
         manage notifications in their phone's Settings. */}
      {!native && (
      <FadeUp delay={0.18}>
        <Section title="Push notifications" icon="bell">
          <p className="text-xs text-muted">
            Get a buzz on this device the second a new ride request comes in.
            We&apos;ll also push verification + vehicle decisions and rider
            cancellations so you can stand down quickly.
          </p>

          {/* iOS-specific install banner — push only works after PWA
             install on iOS, regardless of browser permission state. */}
          {push.ready && push.iosNeedsInstall && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs leading-relaxed text-amber-900">
              <p className="font-bold">
                Install Rajlo first to enable push on iPhone
              </p>
              <ol className="mt-1.5 list-decimal space-y-0.5 pl-4">
                <li>
                  Tap the <strong>Share button</strong> at the bottom of Safari
                  (square with an up arrow)
                </li>
                <li>
                  Choose <strong>Add to Home Screen</strong> → Add
                </li>
                <li>
                  Open Rajlo from the new icon on your home screen, then come
                  back here
                </li>
              </ol>
            </div>
          )}
          {push.ready && !push.support && !push.iosNeedsInstall && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs leading-relaxed text-amber-900">
              This browser doesn&apos;t support push notifications. Try Chrome,
              Safari, Edge, or Firefox.
            </div>
          )}
          {push.ready && push.support && push.permission === "denied" && (
            <div className="rounded-xl border border-rajlo-red/30 bg-primary-soft px-3 py-2.5 text-xs leading-relaxed text-rajlo-red">
              {push.iosHint ? (
                <>
                  <p className="font-bold">
                    Notifications are blocked for Rajlo on iOS
                  </p>
                  <p className="mt-1">
                    Open <strong>Settings → Notifications → Rajlo</strong> and
                    turn <strong>Allow Notifications</strong> on.
                  </p>
                </>
              ) : (
                <>
                  Notifications are blocked. Open your browser&apos;s site
                  settings and allow notifications for Rajlo, then refresh.
                </>
              )}
            </div>
          )}
          {push.error && (
            <div className="rounded-xl border border-rajlo-red/30 bg-primary-soft px-3 py-2.5 text-xs leading-relaxed text-rajlo-red">
              {push.error}
            </div>
          )}

          <div className="flex items-center justify-between gap-3 rounded-2xl border border-line bg-surface-soft px-4 py-3">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold">
                {push.subscribed
                  ? "Push is on for this device"
                  : "Enable push for this device"}
              </p>
              <p className="mt-0.5 text-xs text-muted">
                {push.subscribed
                  ? "Other devices stay independent — toggle each one separately."
                  : "Browser will ask for permission. Required to receive ride pings."}
              </p>
            </div>
            <button
              type="button"
              onClick={async () => {
                if (push.subscribed) {
                  await push.disable();
                } else {
                  await push.enable();
                }
              }}
              disabled={
                !push.support || push.working || push.permission === "denied"
              }
              className={`shrink-0 rounded-full px-4 py-2 text-xs font-bold transition-all disabled:cursor-not-allowed disabled:opacity-50 ${
                push.subscribed
                  ? "border border-line bg-surface text-foreground hover:bg-surface-soft"
                  : "bg-rajlo-red text-white shadow-lg shadow-rajlo-red/30 hover:-translate-y-0.5 hover:bg-primary-hover"
              }`}
            >
              {push.working
                ? "Working…"
                : push.subscribed
                ? "Turn off"
                : "Enable push"}
            </button>
          </div>

          {push.subscribed && (
            <button
              type="button"
              onClick={push.sendTest}
              className="inline-flex items-center gap-2 rounded-full bg-rajlo-black px-4 py-2 text-xs font-bold text-white transition-opacity hover:opacity-90"
            >
              Send a test push
              <Icon name="bell" className="h-3.5 w-3.5" />
            </button>
          )}
        </Section>
      </FadeUp>
      )}

      {/* Nothing on this page is self-editable anymore — every field is
         locked to verified TA / compliance data and changes need
         support. The save bar that used to live here was removed
         along with the editable Personal fields. Errors from the
         initial fetch surface above via the `error && !driver` early
         return. */}

      {/* Delete account — required by Google Play. Permanent. The
          dialog handles the two-step confirmation + API call. Sitting
          BELOW the save-changes block so it's never the first thing
          a driver reaches for. */}
      <FadeUp delay={0.3}>
        <div className="rounded-2xl border border-rajlo-red/40 bg-surface p-5">
          <div className="flex items-start gap-3">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-rajlo-red text-white">
              <Icon name="alert-triangle" className="h-4 w-4" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-extrabold tracking-tight">
                Delete account
              </p>
              <p className="mt-0.5 text-xs text-muted">
                Permanently removes your driver record, uploaded TA documents,
                trip history, ratings, and wallet. Can&apos;t be undone. Make
                sure no trip is in progress first.
              </p>
            </div>
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                setDeleteDialogOpen(true);
              }}
              className="rounded-full border border-rajlo-red bg-surface px-5 py-2 text-xs font-bold text-rajlo-red transition-all hover:-translate-y-0.5 hover:bg-rajlo-red hover:text-white"
            >
              Delete
            </button>
          </div>
        </div>
      </FadeUp>

      <DeleteAccountDialog
        open={deleteDialogOpen}
        role="driver"
        onClose={() => setDeleteDialogOpen(false)}
      />
    </div>
  );
}

/* ─────────── Helpers ─────────── */

function Section({
  title,
  icon,
  children,
}: {
  title: string;
  icon: IconName;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-line bg-surface p-5">
      <div className="mb-4 flex items-center gap-2">
        <span className="grid h-7 w-7 place-items-center rounded-lg bg-primary-soft text-rajlo-red">
          <Icon name={icon} className="h-3.5 w-3.5" />
        </span>
        <p className="font-secondary text-xs font-bold uppercase tracking-wider text-rajlo-red">
          {title}
        </p>
      </div>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
  required,
  help,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  required?: boolean;
  help?: string;
}) {
  return (
    <label className="block">
      <span className="text-xs font-semibold text-muted">
        {label}
        {required && <span className="ml-0.5 text-rajlo-red">*</span>}
      </span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        type={type}
        required={required}
        className="mt-1 w-full rounded-xl border border-line bg-surface px-4 py-3 text-sm outline-none transition-all placeholder:text-muted/70 focus:border-rajlo-red focus:ring-2 focus:ring-rajlo-red/15"
      />
      {help && <p className="mt-1 text-[11px] text-muted">{help}</p>}
    </label>
  );
}

function ReadOnlyField({
  label,
  value,
  help,
}: {
  label: string;
  value: string;
  help?: string;
}) {
  return (
    <div>
      <p className="text-xs font-semibold text-muted">{label}</p>
      <p className="mt-1 rounded-xl border border-dashed border-line bg-surface-soft px-4 py-3 text-sm font-bold">
        {value}
      </p>
      {help && <p className="mt-1 text-[11px] text-muted">{help}</p>}
    </div>
  );
}

/**
 * Vehicle colour picker. A free-text input plus a row of swatches for
 * the most common Jamaica taxi colours — a tap on a swatch sets the
 * field. Free-text supports anything not in the swatch row.
 */
const COMMON_COLOURS = [
  { name: "White", hex: "#ffffff" },
  { name: "Silver", hex: "#c8c9cc" },
  { name: "Black", hex: "#1a1a1a" },
  { name: "Grey", hex: "#6b7077" },
  { name: "Red", hex: "#f10100" },
  { name: "Blue", hex: "#1d4ed8" },
  { name: "Green", hex: "#15803d" },
  { name: "Beige", hex: "#d6c8a8" },
];

function ColourField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <p className="text-xs font-semibold text-muted">{label}</p>
      <div className="mt-1">
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Silver"
          className="w-full rounded-xl border border-line bg-surface px-4 py-3 text-sm outline-none transition-all placeholder:text-muted/70 focus:border-rajlo-red focus:ring-2 focus:ring-rajlo-red/15"
        />
        <div className="mt-2 flex flex-wrap gap-2">
          {COMMON_COLOURS.map((c) => {
            const active = value.toLowerCase() === c.name.toLowerCase();
            return (
              <button
                key={c.name}
                type="button"
                onClick={() => onChange(c.name)}
                className={`group inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-bold transition-colors ${
                  active
                    ? "border-rajlo-red bg-rajlo-red text-white"
                    : "border-line bg-surface text-muted hover:border-rajlo-red/40 hover:text-foreground"
                }`}
              >
                <span
                  className="grid h-4 w-4 place-items-center rounded-full border border-line"
                  style={{ backgroundColor: c.hex }}
                  aria-hidden
                />
                {c.name}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
