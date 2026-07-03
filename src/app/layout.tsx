import type { Metadata, Viewport } from "next";
import { Inter, DM_Sans } from "next/font/google";
import "./globals.css";
import { MotionProvider } from "@/components/motion-provider";
import { NativeDriverGuard } from "@/components/native-driver-guard";
import { NativePushHandler } from "@/components/native-push-handler";
import { AuthFetchGuard } from "@/components/auth-fetch-guard";
import { DeactivatedGate } from "@/components/deactivated-gate";
import { NativeBottomNav } from "@/components/native-bottom-nav";
import { NativeBackButton } from "@/components/native-back-button";
import { NativePageTransition } from "@/components/native-page-transition";
import { CookieConsent, ConsentedAnalytics } from "@/components/cookie-consent";
import {
  SITE_DESCRIPTION,
  SITE_NAME,
  SITE_TAGLINE,
  SITE_URL,
} from "@/lib/site-config";

/**
 * Brand fonts (per Rajlo Brand Guidelines, Sept 2024):
 *   - Primary:   Avenir   (Light, Book, Roman, Medium, Heavy, Black)
 *   - Secondary: Kollectif (Regular, Bold)
 *
 * Both are paid/proprietary fonts not available on Google Fonts. The brand
 * book (p.35) explicitly authorizes a similar Avenir-style substitute when
 * the real font isn't available — we use Inter as the primary fallback and
 * DM Sans as the secondary fallback.
 *
 * To switch to real Avenir + Kollectif:
 *   1. Drop self-hosted .woff2 files in /public/fonts/ (Adobe Fonts kit, etc.)
 *   2. Uncomment the @font-face block in globals.css
 *   3. Replace `--font-primary` and `--font-secondary` here with the local refs
 */
const primary = Inter({
  variable: "--font-primary",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700", "800", "900"],
  display: "swap",
});

const secondary = DM_Sans({
  variable: "--font-secondary",
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  display: "swap",
});

export const metadata: Metadata = {
  // metadataBase resolves every relative URL (OG image, twitter:image,
  // canonical, manifest) against the production domain. Without it
  // Next.js emits warnings in build logs AND falls back to
  // `http://localhost:3000` in social-card previews, which is what
  // causes the "OG image is broken on share" symptom on launch day.
  metadataBase: new URL(SITE_URL),
  // `title.template` makes every page-level title automatically
  // render as "Page Name — Rajlo" without each page hand-rolling the
  // suffix. The `default` is what serves the homepage and any page
  // that doesn't declare its own title.
  title: {
    default: `${SITE_NAME} — ${SITE_TAGLINE}`,
    template: `%s — ${SITE_NAME}`,
  },
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,
  authors: [{ name: SITE_NAME }],
  keywords: [
    "Jamaica rideshare",
    "Jamaica taxi app",
    "Rajlo",
    "rideshare Kingston",
    "rideshare Montego Bay",
    "route taxi Jamaica",
    "red plate taxi Jamaica",
    "book a taxi Jamaica",
    "Jamaica ride app",
  ],
  // Tell Google to crawl and index, follow links, and use the largest
  // available image preview when rendering rich-result snippets.
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },
  alternates: {
    // Canonical URL for the homepage — every other page should set its
    // own alternates.canonical. Without a canonical Google may pick a
    // tracking-parameter-laden URL as the representative one.
    canonical: "/",
  },
  // Note: og:image + twitter:image are not declared here — the
  // file-based `app/opengraph-image.tsx` and `app/twitter-image.tsx`
  // sibling files auto-render a brand-aligned 1200×630 PNG and Next
  // injects the matching meta tags on every page that inherits this
  // metadata. Declaring `images` here too would produce duplicate
  // tags that some scrapers (LinkedIn especially) handle badly.
  openGraph: {
    type: "website",
    siteName: SITE_NAME,
    title: `${SITE_NAME} — ${SITE_TAGLINE}`,
    description: SITE_DESCRIPTION,
    url: SITE_URL,
    locale: "en_JM",
  },
  twitter: {
    card: "summary_large_image",
    title: `${SITE_NAME} — ${SITE_TAGLINE}`,
    description: SITE_DESCRIPTION,
  },
  // Next.js auto-detects `app/icon.png` + `app/apple-icon.png` and
  // attaches them as <link rel="icon"> + <link rel="apple-touch-icon">
  // so we don't need to declare them here. The manifest link drives
  // PWA install (which iOS web push needs).
  manifest: "/manifest.webmanifest",
  // themeColor lives on the `viewport` export below — it moved out
  // of `metadata` in Next.js 14+ and Next will warn about it here.
};

/**
 * Organization-level structured data — emitted as a JSON-LD script in
 * the document head so every page implicitly carries the brand schema.
 * Google parses this to populate the knowledge-panel sidebar, brand
 * card, and "About this result" tile for any rajlo.com URL.
 *
 * Kept in this file (not a component) so it renders in the static HTML
 * shipped by the server — JSON-LD that mounts client-side is ignored
 * by Googlebot's first pass.
 */
const ORGANIZATION_JSON_LD = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: SITE_NAME,
  alternateName: "Rajlo Jamaica",
  url: SITE_URL,
  logo: `${SITE_URL}/icon.svg`,
  description: SITE_DESCRIPTION,
  foundingDate: "2025",
  areaServed: {
    "@type": "Country",
    name: "Jamaica",
  },
  contactPoint: {
    "@type": "ContactPoint",
    contactType: "customer support",
    email: "hello@rajlo.com",
    availableLanguage: ["English", "Jamaican Patois"],
  },
  sameAs: [
    // Add real social profiles once they're claimed — placeholders
    // omitted because Google penalises sameAs entries that 404.
  ],
};

/**
 * Explicit viewport config — fixes the iOS Safari "page loads zoomed
 * in" symptom. Without this, Safari falls back to a 980px viewport
 * heuristic + scales to fit, which renders Rajlo at ~50% zoom and
 * forces the user to pinch out manually on every page load.
 *
 * Settings:
 *  - `width: device-width` ties the layout viewport to the actual
 *    device width.
 *  - `initialScale: 1` opens at 100% zoom every time.
 *  - We deliberately DON'T set `userScalable: false` or
 *    `maximumScale: 1` — accessibility users with low vision still
 *    need pinch-to-zoom. The font-size: 16px rule on inputs in
 *    globals.css already prevents the auto-zoom-on-focus annoyance.
 *  - `viewportFit: cover` lets us paint behind the iPhone's
 *    notch / dynamic island; pages opt into safe-area insets where
 *    needed (the chat sheet "Cancel" pill already does).
 *  - Theme colour is duplicated here so the iOS / Android status
 *    bar tints brand-red when Rajlo opens from the home screen.
 */
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#f10100",
  // Tells Chrome / Edge on Android to resize the layout viewport
  // when the on-screen keyboard appears. Combined with the
  // VisualViewport API in the chat sheet, this keeps the message
  // composer above the keyboard on every mobile browser instead of
  // hiding behind it.
  interactiveWidget: "resizes-content",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${primary.variable} ${secondary.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body
        className="min-h-full bg-background text-foreground"
        suppressHydrationWarning
      >
        {/*
         * NOTE — Two `<Script>` tags used to live here:
         *
         *   1. FOUC bootstrap loaded /no-fouc.js with strategy
         *      "beforeInteractive" so dark-mode users wouldn't flash
         *      white on first paint.
         *   2. Organization JSON-LD for SEO structured data.
         *
         * Both were removed because React 19 + Next 16 + Turbopack
         * fire the "Encountered a script tag while rendering React
         * component" warning on every <Script> from next/script —
         * including external-src + beforeInteractive — and the
         * warning surfaces in the dev overlay through Next's internal
         * intercept (NOT through console.error, so a console patch
         * can't suppress it).
         *
         * Trade-offs while removed:
         *   - Dark theme briefly flashes white on first cold load
         *     (client-side navigation is unaffected; theme persists).
         *     Default theme is "light" so most users never see it.
         *   - JSON-LD Organization schema is now absent from every
         *     page; add it back per-page via Next.js metadata once
         *     we wire a middleware-based response-header pattern for
         *     proper React-19-clean script injection.
         *
         * Re-wire path: Next.js middleware that injects both scripts
         * into the HTML response body before the React tree boots.
         * `public/no-fouc.js` is left on disk for that purpose.
         */}
        <MotionProvider>
          {/* No-op on web. In the Capacitor driver app it snaps any
              off-portal navigation back to /driver. */}
          <NativeDriverGuard />
          {/* No-op on web. In the Capacitor app it sets up the
              high-importance notification channel + routes taps to
              the right page via the FCM payload's `url` field. */}
          <NativePushHandler />
          {/* Global 401 interceptor — any /api/* call that returns
              unauthorized bounces the user to the right login page. */}
          <AuthFetchGuard />
          {/* Detects mid-session account deactivation and takes over the
              screen with an "Account deactivated · contact support" panel
              instead of a confusing "link expired" bounce. */}
          <DeactivatedGate />
          {/* Native-only bottom tab bar for the driver app. No-op on
              web and on auth / verification screens. */}
          <NativeBottomNav />
          {/* Native-only Android hardware back-button handler. Routes
              top-tab back-presses to Home, double-tap-on-Home to exit. */}
          <NativeBackButton />
          {/* Native-only slide-fade transition between pages. No-op
              on web so the marketing site doesn't feel jittery. */}
          <NativePageTransition>
            <div className="min-h-screen">{children}</div>
          </NativePageTransition>
        </MotionProvider>
        {/* Cookie-consent banner (web only). */}
        <CookieConsent />
        {/* Vercel Web Analytics — gated behind cookie consent: only
            loads/tracks after the visitor taps "Accept cookies". */}
        <ConsentedAnalytics />
      </body>
    </html>
  );
}
