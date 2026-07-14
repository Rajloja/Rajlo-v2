"use client";

import Link from "next/link";
import { Icon } from "@/components/icons";
import { ArcWatermark } from "@/components/arc-pattern";

/**
 * Landing screen shown when a verified driver lands on the web portal.
 * The full driver experience lives in the native app (background GPS,
 * push notifications, the fleet broadcaster) — the web is intentionally
 * a no-op for them.
 */
export default function DriverDownloadAppPage() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-8 md:py-16">
      <div className="relative overflow-hidden rounded-3xl bg-linear-to-br from-rajlo-red via-[#c00d0c] to-rajlo-black p-8 text-white shadow-2xl md:p-12">
        <ArcWatermark
          size={420}
          variant="white"
          className="pointer-events-none absolute -right-20 -bottom-32 opacity-[0.10]"
        />
        <div className="relative space-y-5">
          <span className="inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1 text-xs font-bold uppercase tracking-wider backdrop-blur">
            <Icon name="check-circle" className="h-3.5 w-3.5" />
            Verified driver
          </span>
          <h1 className="text-3xl font-extrabold leading-tight tracking-tight md:text-4xl">
            Welcome to Rajlo — drive with the app.
          </h1>
          <p className="text-base leading-relaxed text-white/90">
            Your verification is approved. The driver workflow lives in
            the Rajlo Driver app — background GPS, ride alerts when your
            phone is locked, and one-tap navigation. The web portal won&apos;t
            ring you when a rider hails, so we&apos;ve made it download-only.
          </p>

          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <a
              href="https://play.google.com/store/apps/details?id=com.rajlodriversapp"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center justify-center gap-2 rounded-2xl bg-white px-5 py-4 text-sm font-bold text-rajlo-black shadow-lg transition-transform hover:-translate-y-0.5"
            >
              <Icon name="upload" className="h-5 w-5" />
              <span>Get it on Google Play</span>
            </a>
            <a
              href="#"
              aria-disabled="true"
              className="inline-flex items-center justify-center gap-2 rounded-2xl bg-white/20 px-5 py-4 text-sm font-bold text-white/85 backdrop-blur"
              onClick={(e) => e.preventDefault()}
            >
              <Icon name="upload" className="h-5 w-5" />
              <span>App Store · coming soon</span>
            </a>
          </div>

          <div className="mt-6 rounded-2xl border border-white/15 bg-white/5 p-4 backdrop-blur">
            <p className="text-xs font-bold uppercase tracking-wider text-white/80">
              Already installed?
            </p>
            <p className="mt-1 text-sm text-white/85">
              Open the Rajlo Driver app on your phone and sign in with
              the same email. Your verified status carries over
              automatically.
            </p>
          </div>
        </div>
      </div>

      <div className="mt-6 flex items-center justify-between text-xs text-muted">
        <span>Need help? Email ops@rajlo.com</span>
        <Link
          href="/auth/driver/login"
          className="font-semibold text-rajlo-red hover:underline"
        >
          Sign out & back to login
        </Link>
      </div>
    </div>
  );
}
