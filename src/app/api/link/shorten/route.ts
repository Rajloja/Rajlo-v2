import { NextResponse } from "next/server";
import { createHash } from "crypto";
import { getSupabaseServerClient } from "@/lib/supabase-server";

/**
 * POST /api/link/shorten
 *
 * Body: { url: string }
 * Returns: { slug, shortUrl }
 *
 * Trades a long Rajlo URL for a short `/l/<slug>` alias. Used from the
 * rider + driver signup flows so the "if the button doesn't work" line
 * in the verification email is a single-line `/l/abcd1234` link instead
 * of a 1 kB double-encoded redirect blob.
 *
 * Anonymous-callable (signup happens before auth exists) but rigidly
 * scoped:
 *
 *   1. The URL MUST parse. Junk 400s.
 *   2. The URL's host MUST be a Rajlo origin — apex, portal subdomain,
 *      or dev/preview host. This is the guard against using the
 *      shortener as an open-redirect vector (e.g. someone convincing a
 *      Rajlo user to click `rajlo.com/l/xxx` that resolves to a phishing
 *      site).
 *   3. Slug is DETERMINISTIC — sha256(url) truncated to 8 base64url
 *      characters (48 bits, ~281 trillion combinations). Same URL always
 *      resolves to the same row, so a pathological caller can't blow up
 *      the table by re-shortening the same link a million times.
 *
 * Rows self-expire in 48 h (see `link_shortens.expires_at`); expired
 * rows are lazily swept by /l/[slug].
 */

// Any URL SHORTER than this is not worth a DB row — return it verbatim.
// Aligned with the client helper's default (src/lib/short-link.ts).
const MIN_URL_LENGTH_TO_SHORTEN = 60;

// Absolute upper bound on what we'll store — anything past this is
// pathological and we'd rather 413 than persist. 4 KB comfortably fits
// any legitimate signup callback.
const MAX_URL_LENGTH = 4096;

const ALLOWED_HOST_PATTERNS: RegExp[] = [
  /^(www\.)?rajlo\.com$/i,
  /^(rider|driver|admin)\.rajlo\.com$/i,
  // Vercel preview deployments (branch previews for QA).
  /^rajlo-v2(-[a-z0-9-]+)?\.vercel\.app$/i,
  // Local dev.
  /^localhost(:\d+)?$/i,
  /^127\.0\.0\.1(:\d+)?$/i,
];

function isRajloOrigin(url: URL): boolean {
  return ALLOWED_HOST_PATTERNS.some((re) => re.test(url.host));
}

/**
 * Build a deterministic 8-char base64url slug from the target URL.
 * sha256 → base64url → truncate. 48 bits of entropy is enough for
 * Rajlo's scale (collision probability ≈ 1 in 281 trillion per pair).
 */
function slugFor(url: string): string {
  return createHash("sha256")
    .update(url)
    .digest("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "")
    .slice(0, 8);
}

export async function POST(request: Request) {
  const supabase = getSupabaseServerClient();
  if (!supabase) {
    return NextResponse.json(
      { error: "service_role_missing" },
      { status: 500 },
    );
  }

  let body: { url?: unknown };
  try {
    body = (await request.json()) as { url?: unknown };
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const rawUrl = typeof body.url === "string" ? body.url : "";
  if (!rawUrl) {
    return NextResponse.json({ error: "url_required" }, { status: 400 });
  }
  if (rawUrl.length > MAX_URL_LENGTH) {
    return NextResponse.json({ error: "url_too_long" }, { status: 413 });
  }

  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return NextResponse.json({ error: "url_invalid" }, { status: 400 });
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return NextResponse.json({ error: "url_scheme" }, { status: 400 });
  }
  if (!isRajloOrigin(parsed)) {
    return NextResponse.json({ error: "url_off_domain" }, { status: 400 });
  }

  // Short-circuit: URL is already tiny, no reason to persist a row.
  if (rawUrl.length < MIN_URL_LENGTH_TO_SHORTEN) {
    return NextResponse.json({ slug: null, shortUrl: rawUrl });
  }

  const slug = slugFor(rawUrl);

  // Upsert semantics: same URL → same slug → we refresh expires_at so a
  // deep-link that's been visited recently gets its window extended.
  // `on_conflict: slug` uses the primary key.
  const nextExpiry = new Date(
    Date.now() + 48 * 60 * 60 * 1000,
  ).toISOString();
  const { error } = await supabase
    .from("link_shortens")
    .upsert(
      {
        slug,
        target_url: rawUrl,
        expires_at: nextExpiry,
      },
      { onConflict: "slug" },
    );
  if (error) {
    return NextResponse.json(
      { error: "store_failed", detail: error.message },
      { status: 500 },
    );
  }

  // Build the visible short URL from the request's origin. Whichever
  // Rajlo host the caller is on (rider./driver./admin./apex) becomes the
  // shortener's host — no cross-origin redirect nonsense in the email.
  const origin = new URL(request.url).origin;
  return NextResponse.json({ slug, shortUrl: `${origin}/l/${slug}` });
}
