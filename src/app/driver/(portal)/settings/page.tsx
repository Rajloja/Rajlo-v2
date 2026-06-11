"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Icon, type IconName } from "@/components/icons";
import { ArcWatermark } from "@/components/arc-pattern";
import { FadeUp } from "@/components/anim";
import { Skeleton, ToggleRowsSkeleton } from "@/components/skeleton";
import { DeleteAccountDialog } from "@/components/delete-account-dialog";
import { createSupabaseBrowserClient } from "@/lib/supabase-browser";
import { usePush } from "@/lib/use-push";
import {
  applyTheme,
  applyLocale,
  writeLocalPrefs,
  type Theme as PrefsTheme,
  type Locale as PrefsLocale,
} from "@/lib/preferences-client";
import { useT } from "@/lib/i18n";
import * as navVoice from "@/lib/nav-voice";

/**
 * Driver settings — appearance, language, and notification preferences
 * for the driver app. Backed by the same `/api/rider/preferences`
 * endpoint as the rider portal (it's role-agnostic — the row is keyed
 * by user_id, the rider-specific fields like auto-share stay at their
 * defaults for drivers since we never surface them here).
 *
 * Save is debounced at 500ms so a rapid-fire toggle session collapses
 * to a single PATCH. Theme + locale are applied to `<html>` instantly
 * via writeLocalPrefs so the change is felt the same frame.
 */

type ServerPrefs = {
  push_enabled: boolean;
  push_trip_updates: boolean;
  push_driver_arrival: boolean; // rider-specific — held at default, not surfaced
  push_promos: boolean;
  push_safety_tips: boolean;
  language: "en" | "patois";
  theme: "system" | "light" | "dark";
  auto_share_enabled: boolean; // rider-specific — not surfaced for drivers
  auto_share_notify_arrival: boolean;
  auto_share_notify_delay: boolean;
};

type WirePrefs = {
  pushEnabled: boolean;
  pushTripUpdates: boolean;
  pushPromos: boolean;
  pushSafetyTips: boolean;
  language: "en" | "patois";
  theme: "system" | "light" | "dark";
};

const fromServer = (p: ServerPrefs): WirePrefs => ({
  pushEnabled: p.push_enabled,
  pushTripUpdates: p.push_trip_updates,
  pushPromos: p.push_promos,
  pushSafetyTips: p.push_safety_tips,
  language: p.language,
  theme: p.theme,
});

type ProfileInfo = {
  fullName: string;
  email: string;
};

export default function DriverSettingsPage() {
  const [profile, setProfile] = useState<ProfileInfo | null>(null);
  const [prefs, setPrefs] = useState<WirePrefs | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const push = usePush();
  const { t, setLocale: setLocaleI18n } = useT();

  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savePayload = useRef<Partial<WirePrefs>>({});

  /* ─── Initial load ─── */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const supabase = createSupabaseBrowserClient();
      const [{ data: { user } }, prefsRes] = await Promise.all([
        supabase.auth.getUser(),
        fetch("/api/rider/preferences").then((r) =>
          r.ok ? (r.json() as Promise<{ preferences: ServerPrefs }>) : null,
        ),
      ]);
      if (cancelled) return;
      setProfile({
        fullName:
          (user?.user_metadata?.full_name as string | undefined) ??
          user?.email ??
          "Driver",
        email: user?.email ?? "",
      });
      if (prefsRes) {
        const wire = fromServer(prefsRes.preferences);
        setPrefs(wire);
        applyTheme(wire.theme);
        applyLocale(wire.language);
        writeLocalPrefs({ theme: wire.theme, locale: wire.language });
        window.dispatchEvent(new Event("rajlo:prefs-changed"));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(
    () => () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    },
    [],
  );

  /* ─── Patch + debounce ─── */
  const patch = (next: Partial<WirePrefs>) => {
    if (!prefs) return;
    const merged = { ...prefs, ...next };
    setPrefs(merged);
    savePayload.current = { ...savePayload.current, ...next };

    if (next.theme !== undefined) {
      applyTheme(next.theme as PrefsTheme);
      writeLocalPrefs({ theme: next.theme });
    }
    if (next.language !== undefined) {
      applyLocale(next.language as PrefsLocale);
      writeLocalPrefs({ locale: next.language });
      setLocaleI18n(next.language);
    }

    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(flushSave, 500);
  };

  const flushSave = async () => {
    const body = savePayload.current;
    savePayload.current = {};
    if (Object.keys(body).length === 0) return;
    try {
      const res = await fetch("/api/rider/preferences", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setSavedAt(Date.now());
      setError(null);
      setTimeout(() => setSavedAt(null), 2000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save preferences.");
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
          <div className="relative flex items-start justify-between gap-4">
            <div>
              <p className="font-secondary text-xs font-bold uppercase tracking-wider text-rajlo-red">
                {t("driver.settings.eyebrow", "Driver")}
              </p>
              <h1 className="mt-2 text-3xl font-extrabold leading-tight tracking-tight md:text-4xl">
                {t("driver.settings.title", "Settings")}
              </h1>
              <p className="mt-1 text-sm text-white/75">
                {t(
                  "driver.settings.subtitle",
                  "Appearance, language, and notification preferences.",
                )}
              </p>
            </div>
            <span
              className={`shrink-0 rounded-full bg-emerald-500/20 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-emerald-200 transition-opacity ${
                savedAt ? "opacity-100" : "opacity-0"
              }`}
            >
              {t("driver.settings.saved", "Saved")}
            </span>
          </div>
        </div>
      </FadeUp>

      {error && (
        <div className="rounded-xl border border-rajlo-red/30 bg-primary-soft px-4 py-3 text-sm font-semibold text-rajlo-red">
          {error}
        </div>
      )}

      {/* Account snippet (read-only — full edit lives at /driver/profile) */}
      <FadeUp delay={0.04}>
        <Section title={t("driver.settings.account", "Account")} icon="user">
          {profile ? (
            <div className="space-y-2 text-sm">
              <div className="flex items-center justify-between gap-3">
                <span className="text-muted">
                  {t("driver.settings.account.name", "Name")}
                </span>
                <span className="truncate font-bold">{profile.fullName}</span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-muted">
                  {t("driver.settings.account.email", "Email")}
                </span>
                <span className="truncate font-bold">{profile.email}</span>
              </div>
              <Link
                href="/driver/profile"
                className="mt-2 inline-flex items-center gap-1.5 text-xs font-bold text-rajlo-red hover:underline"
              >
                {t("driver.settings.account.manage", "Manage profile")}
                <Icon name="arrow-right" className="h-3 w-3" />
              </Link>
            </div>
          ) : (
            <div className="space-y-2">
              <Skeleton className="h-4 w-40" rounded="md" />
              <Skeleton className="h-4 w-56" rounded="md" />
            </div>
          )}
        </Section>
      </FadeUp>

      {/* Appearance */}
      <FadeUp delay={0.06}>
        <Section
          title={t("driver.settings.appearance", "Appearance")}
          icon="settings"
        >
          {prefs ? (
            <SegmentedRow
              label={t("driver.settings.appearance.theme", "Theme")}
              description={t(
                "driver.settings.appearance.themeDesc",
                "Match your system, or pin to light or dark.",
              )}
              value={prefs.theme}
              onChange={(v) => patch({ theme: v as "system" | "light" | "dark" })}
              options={[
                { value: "system", label: t("settings.app.theme.system", "System") },
                { value: "light", label: t("settings.app.theme.light", "Light") },
                { value: "dark", label: t("settings.app.theme.dark", "Dark") },
              ]}
            />
          ) : (
            <ToggleRowsSkeleton rows={1} />
          )}
        </Section>
      </FadeUp>

      {/* Language */}
      <FadeUp delay={0.08}>
        <Section
          title={t("driver.settings.language", "Language")}
          icon="flag"
        >
          {prefs ? (
            <SegmentedRow
              label={t("driver.settings.language.label", "Display language")}
              description={t(
                "driver.settings.language.desc",
                "Switches in-app copy. Patois translations cover the core driver flow.",
              )}
              value={prefs.language}
              onChange={(v) => patch({ language: v as "en" | "patois" })}
              options={[
                { value: "en", label: t("settings.app.language.en", "English") },
                {
                  value: "patois",
                  label: t("settings.app.language.patois", "Patois"),
                },
              ]}
            />
          ) : (
            <ToggleRowsSkeleton rows={1} />
          )}
        </Section>
      </FadeUp>

      {/* Navigation voice — smoke test for the turn-by-turn TTS
         engine. Lets the driver verify "is voice working at all" in
         5 seconds without needing to be mid-trip. The same code path
         that fires the real turn-by-turn prompts runs here (Capacitor
         TTS plugin on native, Web Speech fallback on web). */}
      <FadeUp delay={0.085}>
        <Section
          title={t(
            "driver.settings.nav_voice.title",
            "Navigation voice",
          )}
          icon="phone"
        >
          <NavVoiceTestRow />
        </Section>
      </FadeUp>

      {/* Notifications */}
      <FadeUp delay={0.10}>
        <Section
          title={t("driver.settings.notifications.title", "Notifications")}
          icon="bell"
        >
          {prefs ? (
            <>
              {push.ready && push.support && push.permission === "denied" && (
                <div className="mb-3 rounded-xl border border-rajlo-red/30 bg-primary-soft px-3 py-2.5 text-xs leading-relaxed text-rajlo-red">
                  {t(
                    "driver.settings.notifications.blocked",
                    "Notifications are blocked at the OS level. Open your phone's Settings → Apps → Rajlo Driver → Notifications and turn them on, then come back here.",
                  )}
                </div>
              )}
              <ToggleRow
                label={t(
                  "driver.settings.notifications.master",
                  "Allow push notifications",
                )}
                description={
                  push.subscribed
                    ? t(
                        "driver.settings.notifications.master.on",
                        "On for this device. Other devices stay independent.",
                      )
                    : t(
                        "driver.settings.notifications.master.off",
                        "Master switch — turn off to mute everything below.",
                      )
                }
                value={prefs.pushEnabled && push.subscribed}
                disabled={push.working || !push.support}
                onChange={async (next) => {
                  if (next) {
                    await push.enable();
                  } else {
                    await push.disable();
                  }
                  patch({ pushEnabled: next });
                }}
              />
              <Divider />
              <ToggleRow
                label={t(
                  "driver.settings.notifications.tripUpdates",
                  "Ride updates",
                )}
                description={t(
                  "driver.settings.notifications.tripUpdates.desc",
                  "Pings for new ride requests, rider chats, and trip status changes.",
                )}
                value={prefs.pushTripUpdates}
                disabled={!prefs.pushEnabled}
                onChange={(next) => patch({ pushTripUpdates: next })}
              />
              <Divider />
              <ToggleRow
                label={t("driver.settings.notifications.safety", "Safety alerts")}
                description={t(
                  "driver.settings.notifications.safety.desc",
                  "SOS, location-off, and other safety-system messages.",
                )}
                value={prefs.pushSafetyTips}
                disabled={!prefs.pushEnabled}
                onChange={(next) => patch({ pushSafetyTips: next })}
              />
              <Divider />
              <ToggleRow
                label={t(
                  "driver.settings.notifications.promos",
                  "Promos & announcements",
                )}
                description={t(
                  "driver.settings.notifications.promos.desc",
                  "Bonus programmes, new features, occasional news. Rare.",
                )}
                value={prefs.pushPromos}
                disabled={!prefs.pushEnabled}
                onChange={(next) => patch({ pushPromos: next })}
              />
            </>
          ) : (
            <ToggleRowsSkeleton rows={4} />
          )}
        </Section>
      </FadeUp>

      {/* Connected pages */}
      <FadeUp delay={0.14}>
        <Section
          title={t("driver.settings.quickLinks", "Quick links")}
          icon="grid"
        >
          <LinkRow
            label={t("driver.settings.quickLinks.help", "Help & safety")}
            description={t(
              "driver.settings.quickLinks.help.desc",
              "SOS, support contacts, safety tips.",
            )}
            href="/driver/help-safety"
            icon="shield"
          />
          <LinkRow
            label={t(
              "driver.settings.quickLinks.verification",
              "Verification status",
            )}
            description={t(
              "driver.settings.quickLinks.verification.desc",
              "TA documents on file + renewal dates.",
            )}
            href="/driver/verification"
            icon="shield-check"
          />
          <LinkRow
            label={t("driver.settings.quickLinks.wallet", "Wallet")}
            description={t(
              "driver.settings.quickLinks.wallet.desc",
              "Balance, transactions, payout setup.",
            )}
            href="/driver/wallet"
            icon="wallet"
          />
        </Section>
      </FadeUp>

      {/* Danger zone */}
      <FadeUp delay={0.18}>
        <div className="rounded-2xl border border-rajlo-red/40 bg-surface p-5">
          <p className="font-secondary text-xs font-bold uppercase tracking-wider text-rajlo-red">
            Account
          </p>
          <p className="mt-2 text-sm font-bold">Delete your driver account</p>
          <p className="mt-1 text-xs leading-relaxed text-muted">
            Permanently removes your profile, ride history, ratings, wallet,
            and verification record. You can&apos;t recover this — to come
            back you&apos;ll have to sign up + verify with the TA again.
          </p>
          <button
            type="button"
            onClick={() => setDeleteDialogOpen(true)}
            className="mt-4 inline-flex items-center gap-2 rounded-full border border-rajlo-red bg-surface px-5 py-2.5 text-xs font-bold text-rajlo-red transition-colors hover:bg-primary-soft"
          >
            <Icon name="alert-triangle" className="h-3.5 w-3.5" />
            Delete account
          </button>
        </div>
      </FadeUp>

      <DeleteAccountDialog
        open={deleteDialogOpen}
        role="driver"
        onClose={() => setDeleteDialogOpen(false)}
      />

      {/* i18n parity with rider settings — keeps the page title in
          the hero localizable when Patois copy lands. Unused
          immediately but threading t() through any new copy added
          here later is one less refactor. */}
      <span hidden aria-hidden>
        {t("settings.title", "Settings")}
      </span>
    </div>
  );
}

/* ─────────── Helpers (mirrored from rider settings for consistency) ─────────── */

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

function Divider() {
  return <div className="my-1 h-px bg-line" />;
}

function ToggleRow({
  label,
  description,
  value,
  onChange,
  disabled,
}: {
  label: string;
  description: string;
  value: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div
      className={`flex items-start justify-between gap-4 ${
        disabled ? "opacity-50" : ""
      }`}
    >
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold">{label}</p>
        <p className="mt-0.5 text-xs text-muted">{description}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={value}
        disabled={disabled}
        onClick={() => onChange(!value)}
        className={`relative inline-flex h-7 w-12 shrink-0 cursor-pointer items-center rounded-full transition-colors ${
          value ? "bg-rajlo-red" : "bg-line"
        } ${disabled ? "cursor-not-allowed" : ""}`}
      >
        <span
          className={`inline-block h-5 w-5 transform rounded-full bg-white shadow-sm transition-all ${
            value ? "translate-x-6" : "translate-x-1"
          }`}
        />
      </button>
    </div>
  );
}

function SegmentedRow({
  label,
  description,
  value,
  onChange,
  options,
}: {
  label: string;
  description: string;
  value: string;
  onChange: (next: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div>
      <div className="mb-3">
        <p className="text-sm font-bold">{label}</p>
        <p className="mt-0.5 text-xs text-muted">{description}</p>
      </div>
      <div className="inline-flex rounded-full border border-line bg-surface-soft p-1">
        {options.map((o) => {
          const active = value === o.value;
          return (
            <button
              key={o.value}
              type="button"
              onClick={() => onChange(o.value)}
              className={`cursor-pointer rounded-full px-4 py-1.5 text-xs font-bold transition-all ${
                active
                  ? "bg-rajlo-red text-white shadow-md"
                  : "text-muted hover:text-foreground"
              }`}
            >
              {o.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function LinkRow({
  label,
  description,
  href,
  icon,
}: {
  label: string;
  description: string;
  href: string;
  icon: IconName;
}) {
  return (
    <Link
      href={href}
      className="group flex items-center gap-3 rounded-xl border border-line bg-surface-soft px-4 py-3 transition-colors hover:border-rajlo-red/30 hover:bg-primary-soft"
    >
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-white text-rajlo-red">
        <Icon name={icon} className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold">{label}</p>
        <p className="mt-0.5 text-xs text-muted">{description}</p>
      </div>
      <Icon
        name="arrow-right"
        className="h-4 w-4 text-muted transition-transform group-hover:translate-x-0.5 group-hover:text-rajlo-red"
      />
    </Link>
  );
}

/**
 * One-tap voice smoke test. Mirrors the live turn-by-turn voice
 * path: same `navVoice.speak()` call, same Capacitor TTS plugin
 * resolution + Web Speech fallback. If this button produces audio,
 * the engine itself is fine and any silence during a real trip is a
 * data problem (no route loaded, no GPS, distance threshold not hit,
 * carpool gate) rather than a TTS plumbing problem.
 *
 * Also surfaces the persisted mute state — tapping the speaker icon
 * toggles `localStorage.rajlo_nav_voice_muted` exactly like the
 * in-trip NavControls button does, so the driver can clear a stuck
 * mute from a quiet screen without booking a fake trip.
 */
function NavVoiceTestRow() {
  const [muted, setMuted] = useState(() => navVoice.isMuted());
  const [lastResult, setLastResult] = useState<string | null>(null);

  const toggleMute = () => {
    const next = !muted;
    navVoice.setMuted(next);
    setMuted(next);
    setLastResult(next ? "Voice muted." : "Voice unmuted.");
  };

  const test = async () => {
    if (muted) {
      setLastResult("Currently muted — tap Unmute first.");
      return;
    }
    setLastResult("Starting test…");
    const started = Date.now();

    // Race the engine against a 6s timeout. If `speak()` hangs (the
    // most common failure mode on a phone whose Android TTS engine
    // isn't configured), we surface that as the actual symptom
    // instead of leaving "Speaking…" stuck on screen forever.
    const TIMEOUT_MS = 6000;
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
    }, TIMEOUT_MS);

    try {
      await navVoice.warmup();

      // ── Path A: Capacitor TTS plugin (preferred on native) ──
      const wrapper = await navVoice.debugGetCapacitorTts();
      if (wrapper) {
        setLastResult("Speaking via Android TTS engine…");
        try {
          await Promise.race([
            wrapper.tts.speak({
              text: "Voice navigation is working. In 250 meters, turn right onto Hope Road.",
              lang: "en-US",
              rate: 1.05,
              pitch: 1.0,
              volume: 1.0,
            }),
            new Promise((_, rej) =>
              setTimeout(
                () => rej(new Error("native_timeout")),
                TIMEOUT_MS,
              ),
            ),
          ]);
          clearTimeout(timer);
          const dur = Date.now() - started;
          setLastResult(
            `✓ Played via Android TTS in ${dur}ms. If you heard nothing, check (1) media volume on the phone, (2) Settings → Accessibility → Text-to-speech output → preferred engine has an English voice installed.`,
          );
          return;
        } catch (err) {
          // Native path failed — fall through to Web Speech below so
          // the driver gets *some* audio while we report the failure.
          // eslint-disable-next-line no-console
          console.warn(
            "[settings] Capacitor TTS speak failed, falling back to Web Speech:",
            err,
          );
        }
      }

      // ── Path B: Web Speech API (works on web + as a fallback) ──
      setLastResult("Speaking via Web Speech…");
      const synth =
        typeof window !== "undefined" ? window.speechSynthesis : null;
      if (!synth) {
        clearTimeout(timer);
        setLastResult(
          "No TTS available on this device. Install Google Text-to-Speech from the Play Store, then retry.",
        );
        return;
      }
      synth.cancel();
      await new Promise<void>((resolve, reject) => {
        const u = new SpeechSynthesisUtterance(
          "Voice navigation is working. In 250 meters, turn right onto Hope Road.",
        );
        u.lang = "en-US";
        u.rate = 1.05;
        u.volume = 1.0;
        u.onend = () => resolve();
        u.onerror = (e) => reject(new Error(e.error ?? "web_speech_error"));
        synth.speak(u);
        setTimeout(() => {
          if (!timedOut) reject(new Error("web_speech_timeout"));
        }, TIMEOUT_MS);
      });
      clearTimeout(timer);
      const dur = Date.now() - started;
      setLastResult(
        `⚠ Played via Web Speech in ${dur}ms (fallback). The Capacitor TTS plugin didn't respond — likely no Android TTS engine installed. Phone Settings → Accessibility → Text-to-speech output → install Google TTS.`,
      );
    } catch (e) {
      clearTimeout(timer);
      const msg = e instanceof Error ? e.message : String(e);
      setLastResult(
        timedOut || msg.includes("timeout")
          ? "Timed out — TTS engine on this phone isn't responding. Open Settings → Accessibility → Text-to-speech output, set 'Preferred engine' to Google Text-to-Speech, then tap the gear icon next to it → Install voice data → English. Re-run the test."
          : `Failed: ${msg}`,
      );
    }
  };

  return (
    <div className="flex items-start gap-3 px-4 py-3">
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-primary-soft text-rajlo-red">
        <Icon name={muted ? "mic-off" : "mic"} className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold">Test voice prompt</p>
        <p className="mt-0.5 text-xs text-muted">
          Plays one canned turn-by-turn prompt through the same engine
          the live nav uses. Use this to verify the TTS plugin is
          working on this phone before depending on it for a real trip.
        </p>
        {lastResult && (
          <p className="mt-2 rounded-lg bg-surface-soft px-2.5 py-1.5 text-[11px] leading-snug text-muted">
            {lastResult}
          </p>
        )}
        <div className="mt-2 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={test}
            className="inline-flex items-center gap-1.5 rounded-full bg-rajlo-red px-3.5 py-1.5 text-xs font-extrabold text-white shadow-sm shadow-rajlo-red/30 transition-all hover:-translate-y-0.5 hover:bg-primary-hover"
          >
            <Icon name="phone" className="h-3 w-3" />
            Test voice
          </button>
          <button
            type="button"
            onClick={toggleMute}
            className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-extrabold transition-all hover:-translate-y-0.5 ${
              muted
                ? "bg-rajlo-red text-white shadow-sm shadow-rajlo-red/30 hover:bg-primary-hover"
                : "border border-line bg-surface text-foreground hover:bg-surface-soft"
            }`}
          >
            <Icon name={muted ? "mic-off" : "mic"} className="h-3 w-3" />
            {muted ? "Unmute" : "Mute"}
          </button>
        </div>
      </div>
    </div>
  );
}
