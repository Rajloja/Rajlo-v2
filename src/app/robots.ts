import type { MetadataRoute } from "next";
import { headers } from "next/headers";
import { SITE_URL } from "@/lib/site-config";

/**
 * Dynamic robots.txt.
 *
 * Two regimes depending on the host the request came in on:
 *
 *   - **Production (rajlo.com / www.rajlo.com)** — normal SEO rules.
 *     Public marketing pages are crawlable; auth-gated portals
 *     (/rider, /driver, /admin, /api, /auth, /trip share-links) are
 *     disallowed because Googlebot can't sign in, and indexing those
 *     creates dead-end results.
 *
 *   - **Anywhere else (rajlo-v2.vercel.app preview, *.vercel.app
 *     branch previews, ngrok dev tunnels, localhost)** — fully
 *     disallowed. We absolutely do NOT want Google to index the
 *     preview URL: if it did, on launch day rajlo.com would compete
 *     with rajlo-v2.vercel.app for the same content and lose ranking
 *     signals to duplicate content. The host check + Disallow: / is
 *     the canonical fix.
 *
 * Both regimes still point Sitemap: at the production URL so an
 * accidentally-fetched preview robots.txt doesn't poison Google's
 * sitemap cache. Once DNS is live, the preview file becomes
 * irrelevant.
 */
export default async function robots(): Promise<MetadataRoute.Robots> {
  const headerList = await headers();
  const host = (headerList.get("host") ?? "").toLowerCase();
  // Treat the production domain (and its www. alias) as the only host
  // that should be indexed. Everything else (Vercel previews, local
  // dev, ngrok) returns a full Disallow.
  const isProductionHost =
    host === "rajlo.com" || host === "www.rajlo.com";

  if (!isProductionHost) {
    return {
      rules: [{ userAgent: "*", disallow: "/" }],
      sitemap: `${SITE_URL}/sitemap.xml`,
    };
  }

  return {
    rules: [
      {
        userAgent: "*",
        // Allow the marketing surface + a few common public pages.
        allow: [
          "/",
          "/how-it-works",
          "/fare-estimator",
          "/driver-join",
          "/help",
          "/contact",
          "/download",
          "/legal/",
          // SEO landing-page families:
          "/rideshare-in/",
          "/rideshare-in/*",
          "/driver-jobs-in/",
          "/driver-jobs-in/*",
        ],
        // Block the portals + API. Googlebot can't sign in so indexing
        // these creates rotted search results that always 401/redirect.
        disallow: [
          "/admin",
          "/admin/",
          "/api/",
          "/auth/",
          "/driver/", // portal — separate from /driver-join + /driver-jobs-in/*
          "/rider/",
          "/trip/", // single-trip share links (private to the trip recipient)
          "/dev/",
          "/maintenance",
          "/403",
        ],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
