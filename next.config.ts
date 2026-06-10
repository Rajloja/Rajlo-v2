import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  /**
   * next/image globally serves AVIF first, then webp, then the
   * original. AVIF is ~50% smaller than JPEG at the same visual
   * quality, webp ~30%; clients that support neither still get the
   * original. `minimumCacheTTL` raises the CDN cache lifetime so a
   * cold edge doesn't re-transcode the same photo for every region.
   *
   * `deviceSizes` is the set of widths Next will pre-generate when
   * a component uses `sizes`. Default starts at 640 — we drop the
   * 384 + 256 thumbs in because the landing cards / phone mockups
   * render below 384 CSS px on mobile.
   */
  images: {
    formats: ["image/avif", "image/webp"],
    minimumCacheTTL: 60 * 60 * 24 * 30, // 30 days
    deviceSizes: [256, 384, 640, 750, 828, 1080, 1200, 1920, 2048],
  },
};

/**
 * Sentry wrapper. Notes on what each option does:
 *
 *   - `org` / `project` — match the Sentry dashboard. Used at build
 *     time for source-map upload.
 *   - `silent` — quiet Sentry's CI output unless CI is set (Vercel
 *     sets it, local builds don't).
 *   - `widenClientFileUpload` — uploads source maps for every JS
 *     chunk including dynamically-imported ones. Slightly larger
 *     upload but every stack trace becomes readable.
 *   - `tunnelRoute` — route through `/monitoring` so ad-blockers /
 *     privacy extensions don't drop the requests. Without this,
 *     ~30% of users have errors silently swallowed.
 *   - `sourcemaps.filesToDeleteAfterUpload` — uploads source maps to
 *     Sentry then deletes them from the production bundle. Stack
 *     traces are readable in Sentry, but a curious user inspecting
 *     the page can't grab the original source.
 *
 * Source-map upload requires `SENTRY_AUTH_TOKEN` set on Vercel. If
 * the token isn't there, source maps simply aren't uploaded — Sentry
 * still receives every error, just with minified stack traces. Set
 * up the token at Sentry → Settings → Account → Auth Tokens.
 */
export default withSentryConfig(nextConfig, {
 // For all available options, see:
 // https://www.npmjs.com/package/@sentry/webpack-plugin#options

 org: "rajlo",

 project: "rajlo-prod",

 // Only print logs for uploading source maps in CI
 silent: !process.env.CI,

 // For all available options, see:
 // https://docs.sentry.io/platforms/javascript/guides/nextjs/manual-setup/

 // Upload a larger set of source maps for prettier stack traces (increases build time)
 widenClientFileUpload: true,

 // Route browser requests to Sentry through a Next.js rewrite to circumvent ad-blockers.
 // This can increase your server load as well as your hosting bill.
 // Note: Check that the configured route will not match with your Next.js middleware, otherwise reporting of client-
 // side errors will fail.
 tunnelRoute: "/monitoring",

 webpack: {
   // Enables automatic instrumentation of Vercel Cron Monitors. (Does not yet work with App Router route handlers.)
   // See the following for more information:
   // https://docs.sentry.io/product/crons/
   // https://vercel.com/docs/cron-jobs
   automaticVercelMonitors: true,

   // Tree-shaking options for reducing bundle size
   treeshake: {
     // Automatically tree-shake Sentry logger statements to reduce bundle size
     removeDebugLogging: true,
   },
 }
});
