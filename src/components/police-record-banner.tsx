"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Icon } from "@/components/icons";

/**
 * Persistent banner shown on the driver dashboard when the signed-in
 * driver has NOT uploaded a police record yet.
 *
 * Rendered above the hero so it's the first thing the driver sees on
 * login. Deep-links to the resubmit page which handles single-doc
 * re-uploads. The banner auto-dismisses once the doc is on file
 * (status: pending / approved / expiring_soon / expiring / expired —
 * anything not "missing").
 *
 * Ties to a matching runtime gate in
 * `src/lib/driver-eligibility.ts` — the driver can't go online until
 * `police_record` is present. This banner is the friendly nudge that
 * makes that gate feel expected rather than confusing.
 */

type ComplianceDoc = { id: string; status?: string };

export function PoliceRecordBanner() {
  const [status, setStatus] = useState<"loading" | "missing" | "present">(
    "loading",
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/driver/compliance", {
          cache: "no-store",
        });
        if (!res.ok) {
          // Not signed in yet, or driver row not created — either way we
          // don't want to nag from the banner. Fail silent.
          if (!cancelled) setStatus("present");
          return;
        }
        const body = (await res.json()) as { docs?: ComplianceDoc[] };
        const police = (body.docs ?? []).find((d) => d.id === "police_record");
        if (cancelled) return;
        // "missing" here means the driver has never uploaded it. Any
        // other status ("pending", "approved", "expiring_soon", etc.)
        // means it's on file — even if admin hasn't approved yet, the
        // nudge no longer needs to nag.
        setStatus(!police || police.status === "missing" ? "missing" : "present");
      } catch {
        if (!cancelled) setStatus("present");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (status !== "missing") return null;

  return (
    <div className="rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 sm:px-5 sm:py-4">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-full bg-amber-500 text-white">
          <Icon name="alert-triangle" className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-amber-900">
            Upload your police record to start accepting rides
          </p>
          <p className="mt-0.5 text-xs leading-relaxed text-amber-900/85">
            You can sign in and view the app, but Rajlo can&apos;t
            dispatch rides to you until your Good Conduct Certificate is
            on file. Grab one from any Jamaica police station and upload
            it here.
          </p>
          <Link
            href="/driver/resubmit?doc=police_record"
            className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-amber-500 px-3 py-1.5 text-xs font-bold text-white transition-colors hover:bg-amber-600"
          >
            <Icon name="upload" className="h-3.5 w-3.5" />
            Upload police record
          </Link>
        </div>
      </div>
    </div>
  );
}
