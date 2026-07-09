import { useEffect, useRef, useState } from "react";
import { Logo } from "./logo";

/**
 * Marketing home URL for the Rajlo wordmark shown on auth screens.
 *
 * Every portal subdomain (rider./driver./admin.) treats "/" as its own
 * portal login — the proxy redirects `<portal>.rajlo.com/` to
 * `/auth/<portal>/login`. So a plain `href="/"` on the auth-screen logo
 * would loop back to the login page the user is already on. The
 * expected behaviour is "logo takes me to the Rajlo marketing site" —
 * so on production portal subdomains we resolve to the absolute apex
 * URL. On the apex itself and on dev/preview hosts (no subdomains) "/"
 * already IS the marketing landing, so a relative link is correct.
 */
function useMarketingHomeUrl(): string {
  const [href, setHref] = useState<string>("/");
  useEffect(() => {
    if (typeof window === "undefined") return;
    const host = window.location.hostname;
    if (/^(rider|driver|admin)\.rajlo\.com$/i.test(host)) {
      setHref("https://rajlo.com/");
    }
  }, []);
  return href;
}
import { ArcWatermark } from "./arc-pattern";
import {
  PhoneMockup,
  RiderRequestScreen,
  DriverMatchScreen,
  ComplianceScreen,
} from "./phone-mockup";
import { FadeUp, FloatY, Stagger, StaggerItem, Typewriter } from "./anim";
import {
  COUNTRIES,
  DEFAULT_COUNTRY,
  formatNSN,
  maxNsnLength,
  nsnLengthRange,
  phonePlaceholder,
  validatePhoneDigits,
  type Country,
} from "@/lib/countries";
import { createSupabaseBrowserClient } from "@/lib/supabase-browser";

type AuthShellProps = {
  /** Big page heading shown above the form card */
  title: string;
  /** One-line context shown under the title */
  subtitle?: string;
  /** Branding cue: "rider" or "driver" — drives accent on the side panel */
  audience?: "rider" | "driver" | "admin";
  /** Form / card content */
  children: React.ReactNode;
  /** Optional footer (e.g. "Forgot password?") */
  footer?: React.ReactNode;
};

type Audience = NonNullable<AuthShellProps["audience"]>;

const AUDIENCE_COPY: Record<
  Audience,
  { eyebrow: string; quotes: string[]; mockup: () => React.ReactNode }
> = {
  rider: {
    eyebrow: "For riders",
    quotes: [
      "Book a ride anywhere, anytime.",
      "Verified red-plate drivers, every trip.",
      "Transparent fares before you confirm.",
      "From Half-Way-Tree to Negril, in one tap.",
    ],
    mockup: () => <RiderRequestScreen />,
  },
  driver: {
    eyebrow: "For drivers",
    quotes: [
      "Earn on your terms.",
      "TA compliance, simplified.",
      "Fair pay, transparent payouts.",
      "Drive a verified Rajlo route.",
    ],
    mockup: () => <ComplianceScreen />,
  },
  admin: {
    eyebrow: "Operations",
    quotes: [
      "Run a compliant fleet.",
      "Verify drivers in seconds.",
      "Audit trails, transparent decisions.",
      "Every parish-pair, fully tracked.",
    ],
    mockup: () => <DriverMatchScreen />,
  },
};

/**
 * Shared shell for every auth screen (login, signup, verify, forgot, reset).
 *
 * Left panel (md+ only): Rajlo red, with rotating typewriter brand
 * statements, a floating phone mockup peeking from the bottom-right, and
 * layered arc watermarks for visual depth.
 *
 * Right panel: ambient arc + soft red glow behind the form card,
 * audience eyebrow, larger headline, staggered field entrance, and a trust
 * strip beneath the card.
 */
export function AuthShell({
  title,
  subtitle,
  audience = "rider",
  children,
  footer,
}: AuthShellProps) {
  const { eyebrow, quotes, mockup: Mockup } = AUDIENCE_COPY[audience];
  const homeHref = useMarketingHomeUrl();

  // Staff sign-in is intentionally minimal — no marketing/brand panel,
  // no rotating taglines, no phone mockup. Internal ops users get a
  // single-column page with the wordmark up top and the form below it.
  // The rider + driver sign-ins still ship the full two-pane marketing
  // shell because those screens are first impressions for outside users.
  const minimal = audience === "admin";

  return (
    <div
      className={`grid min-h-screen ${minimal ? "" : "md:h-screen md:grid-cols-2"}`}
    >
      {/* ──────── Brand panel (md+) ──────── */}
      {!minimal && (
      <aside className="relative hidden overflow-hidden bg-rajlo-red text-white md:flex md:flex-col md:justify-between md:p-12">
        <ArcWatermark
          size={720}
          variant="white"
          className="absolute -right-40 -top-32 opacity-[0.08]"
        />
        <ArcWatermark
          size={420}
          variant="white"
          className="absolute -left-24 top-1/3 opacity-[0.05]"
        />
        <ArcWatermark
          size={580}
          variant="white"
          className="absolute -right-32 -bottom-32 opacity-[0.10]"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-30 mix-blend-overlay"
          style={{
            background:
              "radial-gradient(40% 40% at 30% 25%, rgba(255,255,255,0.35) 0%, transparent 70%)",
          }}
        />

        <FadeUp delay={0.05}>
          <Logo size="md" variant="white" tagline href={homeHref} />
        </FadeUp>

        <div className="relative">
          <FadeUp delay={0.15}>
            <p className="font-secondary text-xs font-bold uppercase tracking-wider text-white/80">
              {eyebrow}
            </p>
          </FadeUp>
          <FadeUp delay={0.25}>
            <h2 className="mt-3 min-h-[4.4em] max-w-[85%] text-3xl font-extrabold leading-[1.1] tracking-tight md:text-[2.6rem] lg:max-w-[20rem] xl:max-w-[26rem]">
              <Typewriter
                texts={quotes}
                srText={`${eyebrow}: ${quotes.join(". ")}`}
              />
            </h2>
          </FadeUp>
        </div>

        <div className="pointer-events-none absolute -right-12 bottom-20 z-10 hidden lg:block">
          <FloatY rotate={-8} amplitude={5} duration={4.5}>
            <div className="origin-bottom-right scale-90 opacity-95 drop-shadow-2xl">
              <PhoneMockup>
                <Mockup />
              </PhoneMockup>
            </div>
          </FloatY>
        </div>

        <FadeUp delay={0.4}>
          <p className="relative text-xs text-white/70">
            &copy; {new Date().getFullYear()} Rajlo · Kingston, Jamaica
          </p>
        </FadeUp>
      </aside>
      )}

      {/* ──────── Form panel ──────── */}
      {/*
       * On md+, the grid is locked to viewport height (md:h-screen above), so
       * this <main> needs `md:overflow-y-auto` to scroll its own content
       * independently of the fixed left brand panel. On mobile it's a single
       * column with normal page flow, so no internal scroll needed.
       */}
      <main className="relative flex flex-col px-6 py-8 md:overflow-y-auto md:px-12 md:py-12">
        {/* Decoration layer — absolutely positioned and overflow-clipped so it
            never extends past the panel, but the form content underneath can
            grow naturally and the page scrolls if needed. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 overflow-hidden"
        >
          <ArcWatermark
            size={380}
            variant="red"
            className="absolute -right-20 -top-20 opacity-[0.045]"
          />
          <ArcWatermark
            size={260}
            variant="red"
            className="absolute -left-16 bottom-8 opacity-[0.04]"
          />
          <div
            className="absolute inset-0"
            style={{
              background:
                "radial-gradient(60% 50% at 100% 0%, rgba(241,1,0,0.04) 0%, transparent 60%)",
            }}
          />
        </div>

        {/* Logo at the top of the form panel.
           - Marketing audiences (rider, driver): mobile-only — the
             desktop layout already carries a big white logo in the
             brand panel.
           - Staff sign-in (admin): visible on every breakpoint since
             there's no brand panel; rendered in the default red+black
             variant so it reads as the Rajlo wordmark immediately. */}
        {minimal ? (
          <div className="flex justify-center pt-2 md:pt-0">
            <Logo size="md" tagline href={homeHref} />
          </div>
        ) : (
          <div className="md:hidden">
            <Logo size="sm" tagline href={homeHref} />
          </div>
        )}

        {/*
         * `my-auto` (in a flex-col parent) vertically centers the form when
         * there's extra space, but collapses to 0 margin when content is
         * taller than the viewport — so the top of the form is never clipped
         * and the right panel can scroll to reveal it.
         */}
        <div className="relative mx-auto w-full max-w-md py-8 md:my-auto md:py-0">
            {/* Eyebrow */}
            <FadeUp delay={0.05}>
              <p className="font-secondary text-xs font-bold uppercase tracking-wider text-rajlo-red">
                {eyebrow}
              </p>
            </FadeUp>

            {/* Big title */}
            <FadeUp delay={0.12}>
              <h1 className="mt-3 text-4xl font-extrabold leading-[1.05] tracking-tight md:text-[3rem]">
                {title}
              </h1>
            </FadeUp>

            {/* Subtitle */}
            {subtitle && (
              <FadeUp delay={0.18}>
                <p className="mt-3 text-base text-muted md:text-lg">{subtitle}</p>
              </FadeUp>
            )}

            {/* Card with soft red glow */}
            <FadeUp delay={0.24}>
              <div className="relative mt-8">
                {/* Glow halo behind card */}
                <div
                  aria-hidden
                  className="absolute -inset-2 rounded-3xl bg-gradient-to-br from-rajlo-red/15 via-transparent to-rajlo-red/10 opacity-70 blur-2xl"
                />
                {/* Top accent stripe */}
                <div className="relative overflow-hidden rounded-2xl border border-line bg-surface shadow-xl shadow-rajlo-red/[0.06]">
                  <div
                    aria-hidden
                    className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-rajlo-red via-rajlo-red/80 to-rajlo-red/40"
                  />
                  <div className="p-6 md:p-8">
                    <Stagger amount={0.05}>{children}</Stagger>
                  </div>
                </div>
              </div>
            </FadeUp>

            {/* Trust strip — render immediately so it's never below-fold-hidden */}
            <div className="mt-6 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-xs text-muted">
              <TrustBadge label="Encrypted in transit">
                <LockIcon />
              </TrustBadge>
              <TrustBadge label="TA-verified drivers">
                <ShieldIcon />
              </TrustBadge>
              <TrustBadge label="Under a minute">
                <BoltIcon />
              </TrustBadge>
            </div>

          {/* Footer — render immediately so it's never below-fold-hidden */}
          {footer && (
            <div className="mt-6 text-center text-sm text-muted">{footer}</div>
          )}
        </div>
      </main>
    </div>
  );
}

/* ──────── Form primitives ──────── */

export type AuthIconName = "email" | "password" | "user" | "phone" | "plate";

/** Form field with label, optional inline icon, and password show/hide toggle. */
export function AuthField({
  label,
  type = "text",
  placeholder,
  value,
  onChange,
  autoComplete,
  required,
  icon,
}: {
  label: string;
  type?: string;
  placeholder?: string;
  value: string;
  onChange: (v: string) => void;
  autoComplete?: string;
  required?: boolean;
  icon?: AuthIconName;
}) {
  const isPassword = type === "password";
  const [revealed, setRevealed] = useState(false);
  const actualType = isPassword && revealed ? "text" : type;

  return (
    <StaggerItem>
      <label className="block">
        <span className="mb-2 block text-sm font-semibold">{label}</span>
        <div className="relative">
          {icon && (
            <span
              aria-hidden
              className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-muted [&>svg]:h-4 [&>svg]:w-4"
            >
              {iconFor(icon)}
            </span>
          )}
          <input
            type={actualType}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder}
            autoComplete={autoComplete}
            required={required}
            className={`w-full rounded-xl border border-line bg-surface py-3 text-sm outline-none transition-all focus:border-rajlo-red focus:ring-2 focus:ring-rajlo-red/15 ${icon ? "pl-11" : "pl-4"} ${isPassword ? "pr-11" : "pr-4"}`}
          />
          {isPassword && (
            <button
              type="button"
              onClick={() => setRevealed((r) => !r)}
              aria-label={revealed ? "Hide password" : "Show password"}
              aria-pressed={revealed}
              className="absolute right-3 top-1/2 -translate-y-1/2 grid h-8 w-8 place-items-center rounded-md text-muted transition-colors hover:bg-surface-soft hover:text-foreground"
            >
              {revealed ? <EyeOffIcon /> : <EyeIcon />}
            </button>
          )}
        </div>
      </label>
    </StaggerItem>
  );
}

/**
 * Phone field with country-code dropdown.
 * The combined value (e.g. "+18765550123") is passed to onChange.
 */
export function AuthPhoneField({
  label,
  value,
  onChange,
  placeholder = "Phone number",
  required,
  defaultCountry = DEFAULT_COUNTRY,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  required?: boolean;
  defaultCountry?: Country;
}) {
  const [country, setCountry] = useState<Country>(defaultCountry);
  // Raw digits ONLY — spacing/dashes from the country template are
  // rendered by formatNSN() at display time so `digits` stays cleanly
  // machine-comparable and the onChange payload stays `${dial}${digits}`.
  const [digits, setDigits] = useState(() => {
    if (value.startsWith(defaultCountry.dial)) {
      return value.slice(defaultCountry.dial.length).replace(/\D/g, "");
    }
    return value.replace(/\D/g, "");
  });
  // Whether the visitor has interacted with the field. We only surface
  // the "too short / too long" error AFTER they've either blurred it or
  // typed enough characters to plausibly be done — nagging someone with
  // "wrong length" the moment they type the first digit is hostile UX.
  const [touched, setTouched] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const update = (c: Country, d: string) => {
    // Trim to the country's max NSN length so we don't render extra
    // digits the format template can't accommodate. On a country
    // change with existing digits, this may DROP trailing digits if
    // the visitor switched to a country with a shorter numbering plan
    // — that's fine, they'll re-enter what's actually correct for
    // their new country.
    const capped = d.slice(0, maxNsnLength(c));
    setCountry(c);
    setDigits(capped);
    onChange(`${c.dial}${capped}`);
  };

  // Compute validity + placeholder from the country. Placeholder always
  // uses the country's template when known ("### ### ####" for JM/US/CA
  // etc.) — the prop-supplied string is the fallback for countries
  // without a registered format.
  const validity = validatePhoneDigits(country, digits);
  const range = nsnLengthRange(country);
  const derivedPlaceholder = phonePlaceholder(country);
  const activePlaceholder = derivedPlaceholder ?? placeholder;

  // "Too short / too long" error text. Only shown when the visitor has
  // touched the field AND typed at least one digit (empty state is
  // handled by the parent form's own required check).
  let errorText: string | null = null;
  if (touched && digits.length > 0 && range) {
    if (validity === "short") {
      const need = range.min - digits.length;
      errorText =
        range.min === range.max
          ? `Enter ${range.min} digits (${need} more to go).`
          : `Enter at least ${range.min} digits (${need} more).`;
    } else if (validity === "long") {
      errorText = `Too many digits — ${country.name} numbers are ${
        range.min === range.max ? range.min : `${range.min}–${range.max}`
      } digits.`;
    }
  }

  return (
    <StaggerItem>
      <label className="block">
        <span className="mb-2 block text-sm font-semibold">{label}</span>
        <div className="flex gap-2">
          <CountryPicker
            selected={country}
            onChange={(c) => {
              update(c, digits);
              // Auto-focus the number input after the visitor picks a
              // country. Fires in a rAF so the picker's own state
              // updates (setOpen(false) + setSearch("")) finish their
              // teardown first — mobile browsers can drop a
              // programmatic focus() call if it lands mid-unmount of
              // the previously-focused element (the picker's search
              // box). Also flips `touched` so the picker acting as a
              // "commit" gesture makes any format error immediately
              // visible against the newly-selected country.
              requestAnimationFrame(() => {
                inputRef.current?.focus();
              });
              setTouched(true);
            }}
          />
          <input
            ref={inputRef}
            type="tel"
            // Formatted display value — the raw digits get run through
            // the country's template on every render, so the visitor
            // sees "876 555 0123" (JM) or "555 123 4567" (US) as they
            // type. Unknown-format countries fall through to raw
            // digits, which is what the field did before.
            value={formatNSN(country, digits)}
            onChange={(e) => {
              // Strip everything that isn't a digit — the visitor's
              // browser may auto-insert dashes / spaces (iOS
              // suggests formatted phone numbers), but we only care
              // about the underlying digits.
              const raw = e.target.value.replace(/\D/g, "");
              update(country, raw);
            }}
            onBlur={() => setTouched(true)}
            placeholder={activePlaceholder}
            inputMode="tel"
            autoComplete="tel-national"
            required={required}
            aria-invalid={errorText !== null}
            aria-describedby={errorText ? "phone-error" : undefined}
            className={`w-full min-w-0 flex-1 rounded-xl border bg-surface px-4 py-3 text-sm outline-none transition-all focus:ring-2 ${
              errorText
                ? "border-rajlo-red/70 focus:border-rajlo-red focus:ring-rajlo-red/25"
                : "border-line focus:border-rajlo-red focus:ring-rajlo-red/15"
            }`}
          />
        </div>
        {errorText && (
          <p
            id="phone-error"
            className="mt-1.5 text-xs font-semibold text-rajlo-red"
          >
            {errorText}
          </p>
        )}
      </label>
    </StaggerItem>
  );
}

/** Country dropdown with search. Click outside to close. */
function CountryPicker({
  selected,
  onChange,
}: {
  selected: Country;
  onChange: (c: Country) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setSearch("");
      }
    };
    const onEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        setSearch("");
      }
    };
    document.addEventListener("mousedown", onClickOutside);
    document.addEventListener("keydown", onEscape);
    // Auto-focus the search box when opened
    setTimeout(() => searchRef.current?.focus(), 50);
    return () => {
      document.removeEventListener("mousedown", onClickOutside);
      document.removeEventListener("keydown", onEscape);
    };
  }, [open]);

  const q = search.trim().toLowerCase();
  const filtered = q
    ? COUNTRIES.filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          c.dial.includes(q) ||
          c.code.toLowerCase() === q,
      )
    : COUNTRIES;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="flex h-full items-center gap-2 rounded-xl border border-line bg-surface px-3 py-3 text-sm font-semibold outline-none transition-all hover:bg-surface-soft focus:border-rajlo-red focus:ring-2 focus:ring-rajlo-red/15"
      >
        <span className="text-base leading-none" aria-hidden>
          {selected.flag}
        </span>
        <span>{selected.dial}</span>
        <svg
          aria-hidden
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={`h-3 w-3 text-muted transition-transform ${open ? "rotate-180" : ""}`}
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>

      {open && (
        <div
          role="listbox"
          aria-label="Country code"
          className="absolute left-0 top-full z-50 mt-2 w-72 max-w-[calc(100vw-2rem)] overflow-hidden rounded-2xl border border-line bg-surface shadow-2xl"
        >
          <div className="border-b border-line p-2">
            <div className="relative">
              <span
                aria-hidden
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted [&>svg]:h-4 [&>svg]:w-4"
              >
                <SearchIcon />
              </span>
              <input
                ref={searchRef}
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search country or code…"
                className="w-full rounded-lg border border-line bg-surface-soft py-2 pl-9 pr-3 text-sm outline-none focus:border-rajlo-red focus:ring-2 focus:ring-rajlo-red/15"
              />
            </div>
          </div>
          <ul className="max-h-72 overflow-y-auto py-1">
            {filtered.length === 0 ? (
              <li className="px-4 py-6 text-center text-sm text-muted">
                No countries match &ldquo;{search}&rdquo;.
              </li>
            ) : (
              filtered.map((c) => {
                const isSelected = c.code === selected.code;
                return (
                  <li key={c.code}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={isSelected}
                      onClick={() => {
                        onChange(c);
                        setOpen(false);
                        setSearch("");
                      }}
                      className={`flex w-full items-center gap-3 px-4 py-2 text-left text-sm transition-colors hover:bg-surface-soft ${
                        isSelected ? "bg-primary-soft text-rajlo-red" : ""
                      }`}
                    >
                      <span className="text-base leading-none" aria-hidden>
                        {c.flag}
                      </span>
                      <span className="font-semibold tabular-nums">{c.dial}</span>
                      <span className="truncate text-muted">{c.name}</span>
                      {isSelected && (
                        <svg
                          aria-hidden
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="3"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          className="ml-auto h-3.5 w-3.5"
                        >
                          <path d="M20 6 9 17l-5-5" />
                        </svg>
                      )}
                    </button>
                  </li>
                );
              })
            )}
          </ul>
        </div>
      )}
    </div>
  );
}

// NOTE: the old lightweight `AgreementCheckbox` (Terms + Privacy only)
// has been replaced by the full `<LegalConsent>` component
// (src/components/legal-consent.tsx), which lists every applicable
// policy plus the GPS / payment / OTP disclosures. Signup pages import
// that directly.

/**
 * "Continue with Google" button. Used on rider + driver login/signup pages.
 *
 * On click, kicks off Supabase's Google OAuth flow. The intent (`rider` or
 * `driver`) is forwarded via the redirectTo query string so the callback
 * route can promote a brand-new user from the default `rider` role to
 * `driver` when they signed up via the driver page. For an existing user
 * the intent is ignored — they keep whatever role they already had.
 *
 * `next` overrides the post-login destination (e.g. `/driver/onboarding`
 * directly, vs. the default which routes to /driver and lets the portal
 * layout decide).
 */
export function GoogleAuthButton({
  intent,
  next,
  label,
}: {
  intent: "rider" | "driver";
  next?: string;
  label?: string;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Un-stick "Redirecting…" when the visitor comes back from the OAuth
  // page without completing (usually a back-tap). Supabase's OAuth call
  // triggers an in-tab navigation to Google — we deliberately never
  // reset `loading` in handleClick's success path because there's
  // nothing to render (the tab is about to unmount). But iOS Safari and
  // most modern browsers RESTORE the page from BFCache on back-nav,
  // React state included, so `loading` stays true and the button stays
  // disabled with "Redirecting…" — the exact bug Raj reported. We
  // listen for two independent signals so either kind of "returned to
  // this page" resets the button:
  //   - pageshow with persisted=true → BFCache restore (iOS Safari back)
  //   - visibilitychange → covers cases where the OAuth surface was a
  //     popup / SFSafariViewController the visitor dismissed without
  //     a page navigation ever happening
  useEffect(() => {
    const reset = () => setLoading(false);
    const onPageShow = (e: PageTransitionEvent) => {
      // On a fresh navigation `pageshow` also fires but `persisted` is
      // false and the component just mounted, so setLoading(false) is
      // a no-op anyway. Gating on persisted keeps the intent explicit.
      if (e.persisted) reset();
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") reset();
    };
    window.addEventListener("pageshow", onPageShow);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("pageshow", onPageShow);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  const handleClick = async () => {
    setLoading(true);
    setError(null);
    const supabase = createSupabaseBrowserClient();
    const params = new URLSearchParams({ role_intent: intent });
    if (next) params.set("next", next);
    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback?${params.toString()}`,
        queryParams: {
          // Always show the account chooser so users on shared devices can
          // pick a different Google account.
          prompt: "select_account",
        },
      },
    });
    if (oauthError) {
      setError(oauthError.message);
      setLoading(false);
    }
    // On success, the browser is redirected to Google — no further action.
  };

  return (
    <StaggerItem>
      <div className="space-y-2">
        <button
          type="button"
          onClick={handleClick}
          disabled={loading}
          className="group flex w-full items-center justify-center gap-3 rounded-full border border-line bg-surface px-6 py-3 text-sm font-semibold text-foreground transition-all hover:border-rajlo-red/30 hover:bg-surface-soft hover:shadow-md disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loading ? (
            <span className="h-4 w-4 animate-spin rounded-full border-[2px] border-rajlo-red border-t-transparent" />
          ) : (
            <GoogleLogoIcon />
          )}
          <span>{loading ? "Redirecting…" : (label ?? "Continue with Google")}</span>
        </button>
        {error && (
          <p className="text-center text-xs text-rajlo-red">{error}</p>
        )}
      </div>
    </StaggerItem>
  );
}

/**
 * "Continue with Apple" button — mirrors GoogleAuthButton.
 *
 * Apple requires "Sign in with Apple" any time an app offers a
 * third-party sign-in option (in our case Google). Submitting an iOS
 * app with Google sign-in but no Apple sign-in is an automatic
 * guideline-4.8 rejection. The same button is shown on the web for
 * symmetry — Apple OAuth via Supabase works the same as Google.
 *
 * Apple OAuth only returns the user's name on the FIRST authorization
 * — subsequent sign-ins don't include it. Supabase stores whatever
 * Apple sends; our profile rows pick up the name from user_metadata
 * the same way they do for Google.
 */
export function AppleAuthButton({
  intent,
  next,
  label,
}: {
  intent: "rider" | "driver";
  next?: string;
  label?: string;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Same BFCache-restore + return-to-tab handling as GoogleAuthButton —
  // without this, an aborted Apple flow leaves the button stuck on
  // "Redirecting…" and the visitor can't retry without a full refresh.
  // Hook is declared BEFORE the feature-flag return so React's hook
  // order stays stable across renders regardless of the env flag.
  useEffect(() => {
    const reset = () => setLoading(false);
    const onPageShow = (e: PageTransitionEvent) => {
      if (e.persisted) reset();
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") reset();
    };
    window.addEventListener("pageshow", onPageShow);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("pageshow", onPageShow);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  // Hidden until Apple Sign In is wired up end-to-end: the Apple
  // Services ID configured at developer.apple.com AND the Apple
  // provider enabled in Supabase Auth. Without those, the button
  // would render but Supabase returns "provider not enabled" the
  // moment a user taps it — broken UX for every visitor. Flip
  // `NEXT_PUBLIC_APPLE_AUTH_ENABLED=1` on Vercel once configuration
  // is complete and the button comes back on the next deploy.
  if (process.env.NEXT_PUBLIC_APPLE_AUTH_ENABLED !== "1") {
    return null;
  }

  const handleClick = async () => {
    setLoading(true);
    setError(null);
    const supabase = createSupabaseBrowserClient();
    const params = new URLSearchParams({ role_intent: intent });
    if (next) params.set("next", next);
    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider: "apple",
      options: {
        redirectTo: `${window.location.origin}/auth/callback?${params.toString()}`,
      },
    });
    if (oauthError) {
      setError(oauthError.message);
      setLoading(false);
    }
    // On success the browser is redirected to Apple — no further action.
  };

  return (
    <StaggerItem>
      <div className="space-y-2">
        <button
          type="button"
          onClick={handleClick}
          disabled={loading}
          className="group flex w-full items-center justify-center gap-3 rounded-full border border-line bg-surface px-6 py-3 text-sm font-semibold text-foreground transition-all hover:border-rajlo-red/30 hover:bg-surface-soft hover:shadow-md disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loading ? (
            <span className="h-4 w-4 animate-spin rounded-full border-[2px] border-rajlo-red border-t-transparent" />
          ) : (
            <AppleLogoIcon />
          )}
          <span>
            {loading ? "Redirecting…" : (label ?? "Continue with Apple")}
          </span>
        </button>
        {error && (
          <p className="text-center text-xs text-rajlo-red">{error}</p>
        )}
      </div>
    </StaggerItem>
  );
}

/**
 * Horizontal "or continue with email" divider — pairs with GoogleAuthButton.
 */
export function AuthDivider({ label = "or" }: { label?: string }) {
  return (
    <StaggerItem>
      <div className="relative flex items-center">
        <span aria-hidden className="h-px flex-1 bg-line" />
        <span className="px-3 text-[11px] font-bold uppercase tracking-wider text-muted">
          {label}
        </span>
        <span aria-hidden className="h-px flex-1 bg-line" />
      </div>
    </StaggerItem>
  );
}

/** Standardized primary submit button — sliding arrow on hover. */
export function AuthSubmit({
  loading,
  disabled,
  children,
  onClick,
}: {
  loading?: boolean;
  disabled?: boolean;
  children: React.ReactNode;
  onClick?: () => void;
}) {
  return (
    <StaggerItem>
      <button
        type={onClick ? "button" : "submit"}
        onClick={onClick}
        disabled={disabled || loading}
        className="group relative w-full overflow-hidden rounded-full bg-rajlo-red px-6 py-3.5 text-sm font-semibold text-white transition-all hover:bg-primary-hover hover:shadow-lg hover:shadow-rajlo-red/30 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <span className="inline-flex items-center justify-center gap-2">
          <span>{loading ? "Just a moment…" : children}</span>
          {!loading && (
            <span
              aria-hidden
              className="inline-block transition-transform duration-300 group-hover:translate-x-1"
            >
              →
            </span>
          )}
        </span>
        {/* Subtle shine on hover */}
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/15 to-transparent transition-transform duration-700 group-hover:translate-x-full"
        />
      </button>
    </StaggerItem>
  );
}

/* ──────── Icon set (inline SVG, ~0.5KB each) ──────── */

function iconFor(name: AuthIconName) {
  switch (name) {
    case "email":
      return <EmailIcon />;
    case "password":
      return <LockIcon />;
    case "user":
      return <UserIcon />;
    case "phone":
      return <PhoneIcon />;
    case "plate":
      return <PlateIcon />;
  }
}

function EmailIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect width="20" height="16" x="2" y="4" rx="2" />
      <path d="m22 7-10 5L2 7" />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect width="18" height="11" x="3" y="11" rx="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  );
}

function UserIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  );
}

function PhoneIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.91.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.9.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z" />
    </svg>
  );
}

function EyeIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
      <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
      <path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" />
      <path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68" />
      <path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61" />
      <line x1="2" x2="22" y1="2" y2="22" />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.3-4.3" />
    </svg>
  );
}

function PlateIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect width="20" height="12" x="2" y="6" rx="2" />
      <path d="M7 12h.01M12 12h.01M17 12h.01" />
    </svg>
  );
}

function ShieldIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  );
}

function BoltIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5">
      <path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z" />
    </svg>
  );
}

function TrustBadge({
  children,
  label,
}: {
  children: React.ReactNode;
  label: string;
}) {
  return (
    <span className="inline-flex items-center gap-1.5 font-medium">
      <span className="text-rajlo-red">{children}</span>
      {label}
    </span>
  );
}

/** Multi-color Google "G" logo. */
function AppleLogoIcon() {
  // Standard Apple logomark. Inherits the surrounding text color
  // (foreground), so on a light button it renders near-black and on
  // dark themes it flips automatically.
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-5 w-5 text-foreground"
      fill="currentColor"
      aria-hidden
    >
      <path d="M17.05 12.04c-.03-2.78 2.27-4.11 2.37-4.18-1.29-1.89-3.31-2.15-4.03-2.18-1.71-.17-3.34 1-4.21 1-.87 0-2.21-.98-3.64-.95-1.87.03-3.6 1.09-4.56 2.77-1.94 3.36-.5 8.34 1.39 11.07.93 1.34 2.04 2.84 3.5 2.79 1.4-.05 1.93-.91 3.62-.91 1.69 0 2.17.91 3.64.88 1.51-.03 2.46-1.36 3.38-2.7 1.07-1.55 1.51-3.05 1.54-3.13-.03-.01-2.95-1.13-2.99-4.47zM14.69 4.5c.77-.94 1.29-2.24 1.15-3.54-1.11.04-2.46.74-3.26 1.67-.71.83-1.34 2.16-1.18 3.43 1.24.1 2.51-.63 3.29-1.56z" />
    </svg>
  );
}

function GoogleLogoIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-5 w-5"
      aria-hidden
    >
      <path
        d="M23.49 12.27c0-.79-.07-1.54-.19-2.27H12v4.51h6.44c-.28 1.49-1.13 2.75-2.4 3.6v3h3.88c2.27-2.09 3.57-5.17 3.57-8.84z"
        fill="#4285F4"
      />
      <path
        d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.11-6.71-4.94H1.29v3.09C3.26 21.3 7.31 24 12 24z"
        fill="#34A853"
      />
      <path
        d="M5.29 14.31c-.24-.72-.38-1.49-.38-2.31s.14-1.59.38-2.31V6.6H1.29C.47 8.24 0 10.07 0 12s.47 3.76 1.29 5.4l4-3.09z"
        fill="#FBBC05"
      />
      <path
        d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.6l4 3.09c.94-2.83 3.59-4.94 6.71-4.94z"
        fill="#EA4335"
      />
    </svg>
  );
}
