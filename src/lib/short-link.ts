/**
 * Rajlo link shortener — client helper.
 *
 * Wraps POST /api/link/shorten with two guarantees the callers care about:
 *
 *   1. It is safe to call with a URL that's already short. `shortenLink`
 *      returns the input unchanged when it's below the size threshold
 *      (default 120 chars). No round-trip, no DB write.
 *
 *   2. When the network is down, it returns the input URL as a fallback
 *      instead of throwing. Signup + email flows must NEVER fail because
 *      of a shortener hiccup — the raw URL still works, it's just ugly.
 *
 * The threshold is deliberately generous: a URL that's already ~120 chars
 * or less won't blow up the "if the button doesn't work" line in a
 * transactional email, so there's no point burning DB rows on it.
 */

const DEFAULT_SHORTEN_THRESHOLD = 120;

export async function shortenLink(
  url: string,
  threshold = DEFAULT_SHORTEN_THRESHOLD,
): Promise<string> {
  if (typeof url !== "string" || url.length === 0) return url;
  if (url.length <= threshold) return url;
  try {
    const res = await fetch("/api/link/shorten", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url }),
    });
    if (!res.ok) return url;
    const json = (await res.json().catch(() => null)) as
      | { shortUrl?: string }
      | null;
    return json?.shortUrl && typeof json.shortUrl === "string"
      ? json.shortUrl
      : url;
  } catch {
    // Network blew up mid-signup — return the raw URL so the flow
    // continues. Uglier email, but the user still gets confirmed.
    return url;
  }
}
