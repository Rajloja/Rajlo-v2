"use client";

import Link from "next/link";
import { Icon } from "@/components/icons";
import { Skeleton } from "@/components/skeleton";
import { useLiveQuery } from "@/lib/use-live-query";

/**
 * /admin/fraud — fraud & risk dashboard.
 *
 * Surfaces every moderate+ risk account, the open fraud flags, and the
 * open investigations. Each user links to their full fraud profile.
 * Gated by `view_fraud` at the API.
 */

type RiskUser = {
  userId: string;
  name: string;
  role: string | null;
  riskScore: number;
  riskLevel: "low" | "moderate" | "high" | "critical";
  lastCalculatedAt: string;
};
type Flag = {
  id: string;
  userId: string;
  name: string;
  flagType: string;
  severity: string;
  description: string;
  createdAt: string;
};
type Investigation = {
  id: string;
  userId: string;
  name: string;
  status: string;
  summary: string;
  createdAt: string;
};
type Payload = {
  riskUsers: RiskUser[];
  openFlags: Flag[];
  openInvestigations: Investigation[];
  pagination?: {
    hasMoreRiskUsers: boolean;
    hasMoreFlags: boolean;
    hasMoreInvestigations: boolean;
  };
};

const LEVEL_STYLE: Record<string, string> = {
  low: "bg-surface-soft text-muted",
  moderate: "bg-amber-50 text-amber-800",
  high: "bg-orange-100 text-orange-800",
  critical: "bg-primary-soft text-rajlo-red",
};

export default function AdminFraudPage() {
  const query = useLiveQuery<Payload>("/api/admin/fraud", {
    interval: 30_000,
  });
  const data = query.data;

  return (
    <div className="mx-auto max-w-3xl px-2 py-2 md:px-3 md:py-8">
      <div className="mb-6">
        <p className="font-secondary text-xs font-bold uppercase tracking-wider text-rajlo-red">
          Fraud &amp; risk
        </p>
        <h1 className="mt-1 text-2xl font-extrabold tracking-tight md:text-3xl">
          Fraud monitoring
        </h1>
        <p className="mt-2 text-sm text-muted">
          Accounts scored moderate-risk or above, open fraud flags, and
          live investigations. Tap any account for its full fraud
          profile.
        </p>
      </div>

      {/* ── High-risk accounts ── */}
      <section className="mb-8">
        <h2 className="mb-3 text-sm font-extrabold uppercase tracking-wider text-muted">
          Risk accounts
        </h2>
        {query.loading ? (
          <Skeleton className="h-40 w-full" rounded="lg" />
        ) : (data?.riskUsers ?? []).length === 0 ? (
          <p className="rounded-xl border border-line bg-surface px-4 py-3 text-sm text-muted">
            No accounts above low risk. Good.
          </p>
        ) : (
          <ul className="space-y-2">
            {data!.riskUsers.map((u) => (
              <li key={u.userId}>
                <Link
                  href={`/admin/fraud/${u.userId}`}
                  className="flex items-center justify-between gap-3 rounded-xl border border-line bg-surface px-4 py-3 transition-colors hover:border-rajlo-red"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-extrabold">
                      {u.name}
                    </p>
                    <p className="text-[11px] uppercase tracking-wider text-muted">
                      {u.role ?? "user"}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                        LEVEL_STYLE[u.riskLevel] ?? LEVEL_STYLE.low
                      }`}
                    >
                      {u.riskLevel}
                    </span>
                    <span className="text-lg font-extrabold tabular-nums">
                      {u.riskScore}
                    </span>
                  </div>
                </Link>
              </li>
            ))}
            {data?.pagination?.hasMoreRiskUsers && (
              <li className="px-4 py-2 text-center text-[11px] font-semibold text-muted">
                More risk accounts not shown — resolve some to surface
                next batch.
              </li>
            )}
          </ul>
        )}
      </section>

      {/* ── Open flags ── */}
      <section className="mb-8">
        <h2 className="mb-3 text-sm font-extrabold uppercase tracking-wider text-muted">
          Open fraud flags
        </h2>
        {query.loading ? (
          <Skeleton className="h-28 w-full" rounded="lg" />
        ) : (data?.openFlags ?? []).length === 0 ? (
          <p className="rounded-xl border border-line bg-surface px-4 py-3 text-sm text-muted">
            No open flags.
          </p>
        ) : (
          <ul className="space-y-2">
            {data!.openFlags.map((f) => (
              <li key={f.id}>
                <Link
                  href={`/admin/fraud/${f.userId}`}
                  className="block rounded-xl border border-line bg-surface px-4 py-3 transition-colors hover:border-rajlo-red"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-bold">{f.name}</span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                        LEVEL_STYLE[f.severity] ?? LEVEL_STYLE.low
                      }`}
                    >
                      {f.severity}
                    </span>
                  </div>
                  <p className="mt-1 text-xs font-semibold text-rajlo-red">
                    {f.flagType}
                  </p>
                  <p className="mt-0.5 text-xs text-muted">{f.description}</p>
                </Link>
              </li>
            ))}
            {data?.pagination?.hasMoreFlags && (
              <li className="px-4 py-2 text-center text-[11px] font-semibold text-muted">
                More open flags not shown — resolve some to surface
                next batch.
              </li>
            )}
          </ul>
        )}
      </section>

      {/* ── Open investigations ── */}
      <section>
        <h2 className="mb-3 text-sm font-extrabold uppercase tracking-wider text-muted">
          Open investigations
        </h2>
        {query.loading ? (
          <Skeleton className="h-24 w-full" rounded="lg" />
        ) : (data?.openInvestigations ?? []).length === 0 ? (
          <p className="rounded-xl border border-line bg-surface px-4 py-3 text-sm text-muted">
            No open investigations.
          </p>
        ) : (
          <ul className="space-y-2">
            {data!.openInvestigations.map((i) => (
              <li key={i.id}>
                <Link
                  href={`/admin/fraud/${i.userId}`}
                  className="block rounded-xl border border-line bg-surface px-4 py-3 transition-colors hover:border-rajlo-red"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-bold">{i.name}</span>
                    <span className="rounded-full bg-surface-soft px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-muted">
                      {i.status}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-muted">{i.summary}</p>
                </Link>
              </li>
            ))}
            {data?.pagination?.hasMoreInvestigations && (
              <li className="px-4 py-2 text-center text-[11px] font-semibold text-muted">
                More open investigations not shown — resolve some to
                surface next batch.
              </li>
            )}
          </ul>
        )}
      </section>
    </div>
  );
}
