"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { Skeleton } from "@/components/skeleton";

/**
 * Driver session QR — shown on the route-taxi session screen so a
 * transfer rider can scan the driver's phone and lock in this exact
 * vehicle for the next leg of their journey.
 *
 * Payload format:
 *   `rajlo://route-taxi/session/<sessionId>`
 *
 * The custom scheme makes the QR explicit about what it represents,
 * and the rider-side scanner extracts the trailing UUID. A plain UUID
 * would also work but mixing in arbitrary other QRs the camera might
 * pick up first is safer with a recognisable prefix.
 *
 * Pure client component — generation happens via the same `qrcode`
 * lib already used by /driver/qr-charge so we don't take a new dep.
 */

export const SESSION_QR_SCHEME = "rajlo://route-taxi/session/";

export function encodeSessionPayload(sessionId: string): string {
  return `${SESSION_QR_SCHEME}${sessionId}`;
}

/**
 * Extract the session UUID from a scanned QR payload. Returns null if
 * the payload isn't a Rajlo session QR. Accepts a couple of legacy
 * encodings so rider apps from different versions still work:
 *
 *   - `rajlo://route-taxi/session/<uuid>`  (canonical)
 *   - `<uuid>`                              (raw — debug/manual entry)
 */
export function extractSessionId(raw: string): string | null {
  const cleaned = raw.trim();
  if (cleaned.startsWith(SESSION_QR_SCHEME)) {
    const candidate = cleaned.slice(SESSION_QR_SCHEME.length);
    return isUuid(candidate) ? candidate : null;
  }
  return isUuid(cleaned) ? cleaned : null;
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function isUuid(s: string): boolean {
  return UUID_RE.test(s);
}

/**
 * Render the driver's session QR. Sized 200px by default; the host
 * page can override via `className` on the wrapper.
 */
export function SessionQr({
  sessionId,
  size = 200,
  label,
}: {
  sessionId: string;
  size?: number;
  label?: string;
}) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const url = await QRCode.toDataURL(encodeSessionPayload(sessionId), {
          margin: 1,
          width: size * 2, // 2× source for retina; CSS scales it down
          color: { dark: "#0a0a0a", light: "#ffffff" },
          errorCorrectionLevel: "M",
        });
        if (!cancelled) setDataUrl(url);
      } catch {
        if (!cancelled) setError("Couldn't render QR.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sessionId, size]);

  return (
    <div className="inline-flex flex-col items-center gap-2">
      <div
        className="grid place-items-center overflow-hidden rounded-2xl border border-line bg-white p-3 shadow-sm"
        style={{ width: size + 24, height: size + 24 }}
      >
        {error ? (
          <p className="px-4 text-center text-[11px] font-semibold text-rajlo-red">
            {error}
          </p>
        ) : dataUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={dataUrl}
            alt="Driver session QR"
            width={size}
            height={size}
            style={{ width: size, height: size, display: "block" }}
          />
        ) : (
          <Skeleton className="h-full w-full" rounded="xl" />
        )}
      </div>
      {label && (
        <p className="text-center text-[11px] font-semibold text-muted">
          {label}
        </p>
      )}
    </div>
  );
}
