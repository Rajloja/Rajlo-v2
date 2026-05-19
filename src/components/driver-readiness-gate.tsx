"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from "react";
import { Icon } from "./icons";
import { ArcWatermark } from "./arc-pattern";
import { usePush } from "@/lib/use-push";
import { isIOS, isSafari, isStandalone } from "@/lib/platform-detect";
import {
  isNativeApp,
  registerNativePush,
  requestNativeLocationPermission,
  hasNativeLocationBeenGranted,
  checkNativePushPermission,
} from "@/lib/native";

/**
 * Driver readiness gate.
 *
 * Drivers can only catch hails if (a) the app is installed to their
 * home screen as a PWA — otherwise they lose the tab, lose push, and
 * never see incoming work — and (b) push notifications are enabled.
 * This component enforces both before the driver can flip themselves
 * online.
 *
 * It renders one of four states:
 *   1. NOT_INSTALLED   — show install instructions per platform.
 *                        Chromium fires `beforeinstallprompt` which we
 *                        capture and turn into a one-tap install
 *                        button. iOS Safari has no such API so we
 *                        render the Share→Add to Home Screen guide.
 *   2. NEEDS_PUSH      — installed but push permission not granted.
 *                        One-tap "Enable notifications" via the
 *                        existing `usePush` hook.
 *   3. PUSH_DENIED     — permission permanently blocked. Show OS-
 *                        specific recovery path.
 *   4. READY           — both done. Render the caller's actual online
 *                        toggle.
 *
 * The caller wraps this around their existing online-toggle UI:
 *
 *   <DriverReadinessGate>
 *     <OnlineToggle ... />
 *   </DriverReadinessGate>
 *
 * Server-side, `/api/driver/online` also refuses to flip the flag if
 * no push subscription exists — so a tampered client can't sneak past
 * the UI.
 */

/** Shape of the Chromium `beforeinstallprompt` event. */
type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

/**
 * useSyncExternalStore-backed install detector. Subscribes to the
 * display-mode media query AND the `appinstalled` event so React
 * re-renders the moment the user adds Rajlo to their home screen.
 *
 * Why useSyncExternalStore and not a useState/useEffect pair? React
 * 19's lint flags any setState inside an effect body (it can cascade
 * renders); the external-store pattern is the canonical fix and
 * works for SSR too (server snapshot returns false).
 */
function subscribeInstallState(callback: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const mq = window.matchMedia?.("(display-mode: standalone)");
  const onChange = () => callback();
  const onInstall = () => callback();
  mq?.addEventListener?.("change", onChange);
  window.addEventListener("appinstalled", onInstall);
  return () => {
    mq?.removeEventListener?.("change", onChange);
    window.removeEventListener("appinstalled", onInstall);
  };
}

export function DriverReadinessGate({ children }: { children: React.ReactNode }) {
  // When the driver is running inside the Capacitor native app, the
  // "install as PWA + enable web push" dance is irrelevant — they
  // already have the app installed from the Play Store and push is
  // handled natively via FCM. Branch to a much simpler permission
  // prompter that asks the OS for location + notifications, registers
  // an FCM token with the server (satisfying the push-required gate),
  // and gets out of the way.
  if (isNativeApp()) {
    return <NativeReadinessGate>{children}</NativeReadinessGate>;
  }

  return <WebReadinessGate>{children}</WebReadinessGate>;
}

function WebReadinessGate({ children }: { children: React.ReactNode }) {
  const push = usePush();
  const [deferredPrompt, setDeferredPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);

  const installed = useSyncExternalStore(
    subscribeInstallState,
    () => isStandalone(),
    () => false, // SSR snapshot — assume not installed
  );

  // The Chromium-only `beforeinstallprompt` is captured separately
  // so we can fire `.prompt()` later from a user gesture.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const onBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };
    const onAppInstalled = () => setDeferredPrompt(null);
    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    window.addEventListener("appinstalled", onAppInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      window.removeEventListener("appinstalled", onAppInstalled);
    };
  }, []);

  const platform = useMemo<"ios" | "android-chromium" | "android-other" | "desktop">(
    () => {
      if (isIOS()) return "ios";
      if (typeof window === "undefined") return "desktop";
      const ua = window.navigator.userAgent || "";
      const isAndroid = /Android/i.test(ua);
      if (isAndroid) {
        // Chromium fires beforeinstallprompt; non-Chromium (Firefox,
        // Samsung Internet on older versions) doesn't.
        return deferredPrompt || /Chrome|Edg|Brave|OPR/.test(ua)
          ? "android-chromium"
          : "android-other";
      }
      return "desktop";
    },
    [deferredPrompt],
  );

  const triggerInstall = useCallback(async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    // We don't have to manually flip `installed` — the appinstalled
    // event from the browser triggers the useSyncExternalStore
    // subscription and React re-renders automatically.
    await deferredPrompt.userChoice;
    setDeferredPrompt(null);
  }, [deferredPrompt]);

  // Loading state while we wait for the push hook to finish its
  // first detection pass. Avoids a flash of "not ready" then "ready"
  // when push is already subscribed.
  if (!push.ready) {
    return (
      <ReadinessShell tone="loading">
        <div className="space-y-3">
          <div className="h-3 w-32 animate-pulse rounded bg-white/20" />
          <div className="h-3 w-48 animate-pulse rounded bg-white/15" />
        </div>
      </ReadinessShell>
    );
  }

  // STATE 1 — not installed on the home screen.
  if (!installed) {
    return (
      <ReadinessShell tone="action">
        <StepHeader
          number={1}
          title="Install Rajlo on your home screen"
          subtitle="Drivers must run Rajlo as an app — that's the only way you'll get push notifications when a rider hails. Otherwise you'd have to leave the browser open and stare at it all day."
        />
        {platform === "ios" ? (
          <IosInstallGuide />
        ) : platform === "android-chromium" ? (
          <AndroidChromiumInstallGuide
            onInstall={triggerInstall}
            canPrompt={!!deferredPrompt}
          />
        ) : platform === "android-other" ? (
          <AndroidGenericInstallGuide />
        ) : (
          <DesktopInstallGuide
            onInstall={triggerInstall}
            canPrompt={!!deferredPrompt}
          />
        )}
        <PendingStep number={2} text="Enable notifications" />
      </ReadinessShell>
    );
  }

  // STATE 2 — push permanently blocked.
  if (push.permission === "denied") {
    return (
      <ReadinessShell tone="warn">
        <DoneStep number={1} text="Rajlo installed on home screen" />
        <StepHeader
          number={2}
          title="Notifications are blocked"
          subtitle="You blocked notifications earlier — your phone won't ring for new hails. Re-enable them in your device settings to keep working."
        />
        <PushDeniedRecovery />
      </ReadinessShell>
    );
  }

  // STATE 3 — installed but push not yet granted / not subscribed.
  if (!push.subscribed) {
    return (
      <ReadinessShell tone="action">
        <DoneStep number={1} text="Rajlo installed on home screen" />
        <StepHeader
          number={2}
          title="Turn on push notifications"
          subtitle="Your phone will ring when a rider hails a route taxi or requests a private ride. Without this, you only see new work if Rajlo is open on screen."
        />
        <div className="mt-4 flex flex-col gap-3 sm:flex-row">
          <button
            type="button"
            onClick={() => void push.enable()}
            disabled={push.working}
            className="inline-flex items-center justify-center gap-2 rounded-full bg-white px-6 py-3 text-sm font-bold text-rajlo-black shadow-lg transition-all hover:-translate-y-0.5 disabled:opacity-60"
          >
            {push.working ? (
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-rajlo-red border-t-transparent" />
            ) : (
              <Icon name="bell" className="h-4 w-4" />
            )}
            {push.working ? "Enabling…" : "Enable notifications"}
          </button>
          <p className="text-xs text-white/70 sm:max-w-xs">
            Your phone will ask permission. Tap <strong>Allow</strong>.
          </p>
        </div>
        {push.error && (
          <p className="mt-3 rounded-xl border border-amber-300/40 bg-amber-300/10 p-3 text-sm font-medium text-amber-100">
            {push.error}
          </p>
        )}
      </ReadinessShell>
    );
  }

  // STATE 4 — ready. Render the caller's actual online toggle.
  return <>{children}</>;
}

/* ──────────────────────── Shell + step pieces ──────────────────────── */

function ReadinessShell({
  children,
  tone,
}: {
  children: React.ReactNode;
  tone: "action" | "warn" | "loading";
}) {
  const palette =
    tone === "warn"
      ? "from-amber-700 via-rajlo-black to-rajlo-black"
      : tone === "loading"
        ? "from-rajlo-black via-rajlo-black to-[#1a1d10]"
        : "from-rajlo-red via-[#c00d0c] to-rajlo-black";

  return (
    <div
      className={`relative overflow-hidden rounded-3xl bg-linear-to-br p-6 text-white shadow-2xl md:p-8 ${palette}`}
      role="region"
      aria-label="Driver readiness"
    >
      <ArcWatermark
        size={420}
        variant="white"
        className="pointer-events-none absolute -right-20 -bottom-32 opacity-[0.08]"
      />
      <div className="relative space-y-5">
        <div className="flex items-start gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-white/15 backdrop-blur">
            <Icon name="bell" className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase tracking-wider text-white/70">
              Get ready to go online
            </p>
            <h2 className="mt-1 text-2xl font-extrabold leading-tight tracking-tight md:text-3xl">
              Two steps before your first hail
            </h2>
          </div>
        </div>
        {children}
      </div>
    </div>
  );
}

function StepHeader({
  number,
  title,
  subtitle,
}: {
  number: number;
  title: string;
  subtitle: string;
}) {
  return (
    <div className="rounded-2xl border border-white/15 bg-white/5 p-5 backdrop-blur">
      <div className="flex items-start gap-3">
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-white text-sm font-black text-rajlo-red">
          {number}
        </span>
        <div className="min-w-0">
          <p className="text-base font-extrabold tracking-tight md:text-lg">
            {title}
          </p>
          <p className="mt-1 text-sm text-white/80">{subtitle}</p>
        </div>
      </div>
    </div>
  );
}

function PendingStep({ number, text }: { number: number; text: string }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.03] px-5 py-3 opacity-70">
      <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-white/15 text-xs font-bold">
        {number}
      </span>
      <span className="text-sm font-semibold text-white/75">{text}</span>
      <span className="ml-auto text-xs text-white/55">Next</span>
    </div>
  );
}

function DoneStep({ number, text }: { number: number; text: string }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-emerald-300/30 bg-emerald-400/10 px-5 py-3">
      <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-emerald-400 text-xs font-black text-emerald-900">
        {number}
      </span>
      <span className="text-sm font-semibold text-emerald-50">{text}</span>
      <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-emerald-400 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-emerald-900">
        <Icon name="check-circle" className="h-3 w-3" />
        Done
      </span>
    </div>
  );
}

/* ──────────────────────── Platform-specific guides ──────────────────────── */

function IosInstallGuide() {
  // iOS Safari is the only place "Add to Home Screen" makes sense via
  // the Share menu. Chrome / Firefox / Edge on iOS don't expose AHS at
  // all in non-Safari views, so we have to push the user to Safari first.
  const onSafari = isSafari();
  return (
    <div className="mt-4 space-y-3 rounded-2xl border border-white/10 bg-rajlo-black/40 p-5 backdrop-blur">
      {!onSafari && (
        <div className="rounded-xl border border-amber-300/40 bg-amber-400/10 p-4 text-sm text-amber-100">
          <p className="font-bold">Open Rajlo in Safari first</p>
          <p className="mt-1 text-amber-100/85">
            You&apos;re currently in another browser (Chrome, Firefox, etc.) which
            can&apos;t install apps to your iPhone home screen. Copy the URL,
            open Safari, paste it, then follow the steps below.
          </p>
        </div>
      )}
      <ol className="space-y-3 text-sm">
        <IosStep
          number="1"
          text={
            <>
              Tap the{" "}
              <span className="inline-flex items-center gap-1 rounded-md bg-white/10 px-2 py-0.5 font-mono text-xs">
                Share
              </span>{" "}
              button at the bottom of Safari (looks like a square with an
              up-arrow).
            </>
          }
        />
        <IosStep
          number="2"
          text={
            <>
              Scroll down in the share sheet and tap{" "}
              <strong>Add to Home Screen</strong>.
            </>
          }
        />
        <IosStep
          number="3"
          text={
            <>
              Tap <strong>Add</strong> in the top right. The Rajlo icon will
              appear on your home screen.
            </>
          }
        />
        <IosStep
          number="4"
          text={
            <>
              <strong>Open Rajlo from the new icon</strong> (not from Safari).
              Then come back to this screen and you&apos;ll move to step 2.
            </>
          }
        />
      </ol>
    </div>
  );
}

function IosStep({
  number,
  text,
}: {
  number: string;
  text: React.ReactNode;
}) {
  return (
    <li className="flex items-start gap-3">
      <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-white/15 text-[11px] font-bold">
        {number}
      </span>
      <span className="text-white/90">{text}</span>
    </li>
  );
}

function AndroidChromiumInstallGuide({
  onInstall,
  canPrompt,
}: {
  onInstall: () => void;
  canPrompt: boolean;
}) {
  return (
    <div className="mt-4 space-y-4 rounded-2xl border border-white/10 bg-rajlo-black/40 p-5 backdrop-blur">
      {canPrompt ? (
        <>
          <p className="text-sm text-white/90">
            One tap to install. The icon will land on your home screen and you
            can launch Rajlo like any other app.
          </p>
          <button
            type="button"
            onClick={onInstall}
            className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-white px-6 py-3 text-sm font-bold text-rajlo-black shadow-lg transition-transform hover:-translate-y-0.5 sm:w-auto"
          >
            <Icon name="upload" className="h-4 w-4" />
            Install Rajlo
          </button>
        </>
      ) : (
        <>
          <p className="text-sm text-white/90">
            Your browser will offer to install after you&apos;ve been on the
            page for a few seconds. If you don&apos;t see the prompt:
          </p>
          <ol className="space-y-3 text-sm">
            <IosStep
              number="1"
              text={<>Tap the <strong>⋮</strong> menu icon (top right of Chrome).</>}
            />
            <IosStep
              number="2"
              text={
                <>
                  Tap <strong>Install app</strong> or <strong>Add to Home screen</strong>.
                </>
              }
            />
            <IosStep
              number="3"
              text={<>Confirm. Open Rajlo from your home screen and come back.</>}
            />
          </ol>
        </>
      )}
    </div>
  );
}

function AndroidGenericInstallGuide() {
  return (
    <div className="mt-4 rounded-2xl border border-white/10 bg-rajlo-black/40 p-5 backdrop-blur">
      <p className="text-sm text-white/90">
        Open the browser menu (usually <strong>⋮</strong> or the three-line
        icon) and look for <strong>Add to Home screen</strong> or{" "}
        <strong>Install app</strong>. Tap it, confirm, then open Rajlo from the
        new icon on your home screen.
      </p>
      <p className="mt-3 text-xs text-white/65">
        Chrome on Android gives you a one-tap install button. If you&apos;re on
        Firefox or Samsung Internet, the steps may vary slightly — the option
        is always under the browser&apos;s main menu.
      </p>
    </div>
  );
}

function DesktopInstallGuide({
  onInstall,
  canPrompt,
}: {
  onInstall: () => void;
  canPrompt: boolean;
}) {
  return (
    <div className="mt-4 space-y-4 rounded-2xl border border-white/10 bg-rajlo-black/40 p-5 backdrop-blur">
      <p className="text-sm text-white/90">
        Rajlo is built for phones — drivers work from the road. If you&apos;re
        on desktop just for testing, you can still install:
      </p>
      {canPrompt ? (
        <button
          type="button"
          onClick={onInstall}
          className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-white px-6 py-3 text-sm font-bold text-rajlo-black shadow-lg transition-transform hover:-translate-y-0.5 sm:w-auto"
        >
          <Icon name="upload" className="h-4 w-4" />
          Install Rajlo on this computer
        </button>
      ) : (
        <p className="text-sm text-white/80">
          Look for an install icon at the right end of the browser&apos;s
          address bar (looks like a screen with a down-arrow). Click it, then
          confirm.
        </p>
      )}
    </div>
  );
}

function PushDeniedRecovery() {
  const ios = isIOS();
  return (
    <div className="mt-4 rounded-2xl border border-white/10 bg-rajlo-black/40 p-5 backdrop-blur">
      {ios ? (
        <ol className="space-y-3 text-sm">
          <IosStep
            number="1"
            text={
              <>
                Open <strong>Settings</strong> on your iPhone.
              </>
            }
          />
          <IosStep
            number="2"
            text={
              <>
                Scroll down to <strong>Notifications</strong> →{" "}
                <strong>Rajlo</strong>.
              </>
            }
          />
          <IosStep
            number="3"
            text={
              <>
                Turn <strong>Allow Notifications</strong> on. Come back here
                and you&apos;ll be able to go online.
              </>
            }
          />
        </ol>
      ) : (
        <ol className="space-y-3 text-sm">
          <IosStep
            number="1"
            text={
              <>
                Tap the lock icon next to the address bar (Chrome, Edge) or
                open <strong>Site settings</strong> from the browser menu.
              </>
            }
          />
          <IosStep
            number="2"
            text={
              <>
                Find <strong>Notifications</strong> and set it to{" "}
                <strong>Allow</strong>.
              </>
            }
          />
          <IosStep
            number="3"
            text={<>Refresh this page and try Enable again.</>}
          />
        </ol>
      )}
    </div>
  );
}

/* ──────────────────────── Native readiness gate ──────────────────────── */

/**
 * Capacitor-app version of the readiness gate.
 *
 * The web gate has two steps (install PWA + enable push). Both are
 * meaningless inside the native shell — the driver got the app from
 * the Play Store, and push is delivered via FCM. So this gate is
 * just a single-screen "tap to grant permissions" prompt that:
 *
 *   1. Requests location permission (background-capable on Android 14+)
 *   2. Requests push permission + registers an FCM token with the
 *      server (writes to push_subscriptions so the "must have push"
 *      gate on /api/driver/online passes)
 *
 * Once both are granted, the children (the actual online toggle) render.
 *
 * If a driver denies either, they see a brief explainer and a "Try
 * again" button. Permanent denial is recovered via the OS Settings
 * app — we show the path.
 */
function NativeReadinessGate({ children }: { children: React.ReactNode }) {
  // null = still checking on mount, true/false = known state.
  // Starting as `null` so we render a brief loading shell instead of
  // flashing the "Allow location" CTA for a driver who already granted
  // permissions on a previous run.
  const [locationGranted, setLocationGranted] = useState<boolean | null>(null);
  const [pushGranted, setPushGranted] = useState<boolean | null>(null);
  const [working, setWorking] = useState<"location" | "push" | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Re-hydrate from OS state on mount. Location uses a localStorage
  // cache (the background-geolocation plugin has no checkPermissions);
  // push reads the live OS permission via the plugin's checkPermissions
  // call. If OS-level push permission is granted we ALSO re-run the
  // FCM registration silently — a previous run can fail to land the
  // token on the server (race condition, network blip), and we don't
  // want the user permanently stranded with OS-granted but server-
  // unregistered push. The register call is idempotent server-side.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const pushOk = await checkNativePushPermission();
      if (cancelled) return;
      setLocationGranted(hasNativeLocationBeenGranted());
      setPushGranted(pushOk);
      if (pushOk) {
        // Fire-and-forget — re-register the FCM token. If we already
        // have one server-side the upsert is a no-op. If we don't (the
        // common case after a failed first registration), this lands it.
        void registerNativePush();
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const askLocation = useCallback(async () => {
    setWorking("location");
    setError(null);
    const ok = await requestNativeLocationPermission();
    setLocationGranted(ok);
    setWorking(null);
    if (!ok) {
      setError(
        "Location is required for Rajlo — riders can't be matched to a driver without it.",
      );
    }
  }, []);

  const askPush = useCallback(async () => {
    setWorking("push");
    setError(null);
    const result = await registerNativePush();
    const ok = !!result;
    setPushGranted(ok);
    setWorking(null);
    if (!ok) {
      setError(
        "Notifications are required so we can wake you up when a rider hails.",
      );
    }
  }, []);

  // Initial mount check still pending — show a loading shell so we
  // don't flash the gate at a driver who's already onboarded.
  if (locationGranted === null || pushGranted === null) {
    return (
      <ReadinessShell tone="loading">
        <div className="space-y-3">
          <div className="h-3 w-32 animate-pulse rounded bg-white/20" />
          <div className="h-3 w-48 animate-pulse rounded bg-white/15" />
        </div>
      </ReadinessShell>
    );
  }

  // Both granted → render the actual online toggle.
  if (locationGranted && pushGranted) {
    return <>{children}</>;
  }

  return (
    <ReadinessShell tone="action">
      <StepHeader
        number={1}
        title="Allow location"
        subtitle="Before we ask the system for permission, here is exactly what Rajlo does with your location."
      />

      {/* Prominent disclosure — required by Google Play policy for
          background location. Must be shown BEFORE the runtime
          permission prompt (which fires from askLocation →
          requestNativeLocationPermission), must name the data, must
          explicitly state background / "closed or not in use"
          collection, must describe the features it powers, and must
          be gated behind an affirmative action (the button below).
          Do not soften this copy without re-checking the policy. */}
      {!locationGranted && (
        <div className="rounded-2xl border border-white/15 bg-white/5 p-5 backdrop-blur">
          <div className="flex items-start gap-3">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-white/15">
              <Icon name="map-pin" className="h-5 w-5" />
            </span>
            <div className="min-w-0 space-y-3">
              <p className="text-sm font-extrabold tracking-tight">
                How Rajlo Driver uses your location
              </p>
              <p className="text-sm leading-relaxed text-white/85">
                Rajlo Driver collects location data to:
              </p>
              <ul className="space-y-1.5 text-sm text-white/85">
                <li className="flex gap-2">
                  <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-white/60" />
                  <span>Match you with riders requesting trips near you.</span>
                </li>
                <li className="flex gap-2">
                  <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-white/60" />
                  <span>
                    Share your live position with your rider so they can see
                    you approaching during a trip.
                  </span>
                </li>
              </ul>
              <p className="text-sm font-semibold leading-relaxed text-white">
                Rajlo collects this location data in the background — even
                when the app is closed or not in use, and while your screen
                is locked — so tracking continues while you drive.
              </p>
              <p className="text-sm leading-relaxed text-white/85">
                Location is collected only while you are online or on an
                active trip, and stops the moment you go offline.
              </p>
              <a
                href="/legal/privacy-policy"
                className="inline-block text-sm font-bold text-white underline underline-offset-2"
              >
                See our Privacy Policy
              </a>
            </div>
          </div>
        </div>
      )}
      <div className="mt-3 mb-4 flex flex-col gap-3 sm:flex-row">
        {locationGranted ? (
          <DoneStep number={1} text="Location allowed" />
        ) : (
          <button
            type="button"
            onClick={askLocation}
            disabled={working !== null}
            className="inline-flex items-center justify-center gap-2 rounded-full bg-white px-6 py-3 text-sm font-bold text-rajlo-black shadow-lg transition-all hover:-translate-y-0.5 disabled:opacity-60"
          >
            {working === "location" ? (
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-rajlo-red border-t-transparent" />
            ) : (
              <Icon name="map-pin" className="h-4 w-4" />
            )}
            {working === "location" ? "Asking…" : "Allow location"}
          </button>
        )}
      </div>

      {locationGranted ? (
        <StepHeader
          number={2}
          title="Allow notifications"
          subtitle="Your phone will ring when a rider hails. Without this, you'd have to keep Rajlo open on screen to see new work."
        />
      ) : (
        <PendingStep number={2} text="Allow notifications" />
      )}

      {locationGranted && (
        <div className="mt-3 flex flex-col gap-3 sm:flex-row">
          {pushGranted ? (
            <DoneStep number={2} text="Notifications allowed" />
          ) : (
            <button
              type="button"
              onClick={askPush}
              disabled={working !== null}
              className="inline-flex items-center justify-center gap-2 rounded-full bg-white px-6 py-3 text-sm font-bold text-rajlo-black shadow-lg transition-all hover:-translate-y-0.5 disabled:opacity-60"
            >
              {working === "push" ? (
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-rajlo-red border-t-transparent" />
              ) : (
                <Icon name="bell" className="h-4 w-4" />
              )}
              {working === "push" ? "Asking…" : "Allow notifications"}
            </button>
          )}
        </div>
      )}

      {error && (
        <p className="mt-4 rounded-xl border border-amber-300/40 bg-amber-300/10 p-3 text-sm font-medium text-amber-100">
          {error}{" "}
          <span className="block mt-1 text-amber-100/85 text-xs">
            If you denied by accident, open your phone&apos;s{" "}
            <strong>Settings → Apps → Rajlo Driver → Permissions</strong>{" "}
            and turn them on, then come back.
          </span>
        </p>
      )}
    </ReadinessShell>
  );
}
