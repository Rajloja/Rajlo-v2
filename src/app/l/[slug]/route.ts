import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase-server";

/**
 * GET /l/[slug]
 *
 * Public read-side of the Rajlo link shortener. Look up the slug,
 * bump the hit counter, and 302 the visitor at their target URL.
 *
 * Failure modes surface as friendly HTML pages instead of raw JSON so
 * a rider who clicks a stale link out of an old email sees something
 * more useful than "404" or "500".
 *
 * Also runs a lazy cleanup — 1 in ~100 hits fires the
 * `purge_expired_link_shortens` RPC so we don't need a scheduled cron
 * to keep the table trim.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const CLEANUP_SAMPLE_RATE = 0.01; // ~1 in 100 hits

function html(status: number, title: string, body: string) {
  return new NextResponse(
    `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${title} · Rajlo</title>
<style>
  :root { color-scheme: light; }
  body {
    margin: 0;
    background: #faf9f5;
    color: #111906;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Helvetica Neue", Arial, sans-serif;
    display: grid;
    place-items: center;
    min-height: 100vh;
    padding: 24px;
  }
  main {
    max-width: 380px;
    text-align: center;
  }
  .mark { color: #f10100; font-weight: 800; letter-spacing: -0.02em; font-size: 22px; margin-bottom: 24px; }
  h1 { font-size: 22px; margin: 0 0 8px; letter-spacing: -0.01em; }
  p { color: #57594e; line-height: 1.55; font-size: 14px; margin: 0 0 20px; }
  a.cta { display: inline-block; background: #f10100; color: #fff; text-decoration: none; font-weight: 700; font-size: 14px; padding: 12px 22px; border-radius: 999px; }
</style>
</head>
<body>
  <main>
    <div class="mark">Rajl<span style="color:#f10100">o</span></div>
    <h1>${title}</h1>
    <p>${body}</p>
    <a class="cta" href="https://rajlo.com/">Back to Rajlo</a>
  </main>
</body>
</html>`,
    {
      status,
      headers: {
        "content-type": "text/html; charset=utf-8",
        // Never let a browser or CDN cache the friendly error pages —
        // status could flip if the slug is provisioned later.
        "cache-control": "no-store",
      },
    },
  );
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;

  if (!slug || slug.length > 32) {
    return html(
      400,
      "Bad link",
      "This link doesn't look right. Check the URL and try again.",
    );
  }

  const supabase = getSupabaseServerClient();
  if (!supabase) {
    return html(
      500,
      "Try again in a moment",
      "We couldn't reach the link store. Please try again.",
    );
  }

  const { data: row, error } = await supabase
    .from("link_shortens")
    .select("target_url, expires_at")
    .eq("slug", slug)
    .maybeSingle();

  if (error) {
    return html(
      500,
      "Try again in a moment",
      "Something went wrong on our side. Please try again.",
    );
  }
  if (!row) {
    return html(
      404,
      "Link not found",
      "This short link has expired or was never issued.",
    );
  }

  const expiresAt = new Date(row.expires_at as string);
  if (Number.isFinite(expiresAt.getTime()) && expiresAt.getTime() < Date.now()) {
    return html(
      410,
      "Link expired",
      "This link has expired. If it came from a Rajlo email, request a fresh one.",
    );
  }

  // Fire the sweep occasionally instead of on every hit — keeps the
  // hot path fast while still trimming the table without a cron.
  if (Math.random() < CLEANUP_SAMPLE_RATE) {
    void supabase.rpc("purge_expired_link_shortens" as never);
  }

  return NextResponse.redirect(row.target_url as string, {
    status: 302,
    headers: {
      // Short caches only — the redirect target could change if the slug
      // is re-provisioned before its expiry window rolls.
      "cache-control": "no-store",
    },
  });
}
