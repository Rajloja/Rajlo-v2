"use client";

import { useState } from "react";
import { Icon } from "@/components/icons";
import { Skeleton } from "@/components/skeleton";
import { useLiveQuery } from "@/lib/use-live-query";
import {
  ADMIN_ROLES,
  ADMIN_ROLE_LABEL,
  ADMIN_ROLE_DESCRIPTION,
  type AdminRole,
} from "@/lib/admin-rbac";

/**
 * /admin/security — internal admin governance console.
 *
 * Shows the admin roster (with RBAC tier + suspension control), the
 * recent access history, and the security event feed. Visible to
 * technical admins + super admins; only super admins can actually
 * change a role or suspend an admin (the API enforces it).
 */

type Admin = {
  id: string;
  name: string;
  adminRole: AdminRole | null;
  suspended: boolean;
};
type AccessLog = {
  id: string;
  admin: string;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
};
type SecurityEvent = {
  id: string;
  admin: string;
  eventType: string;
  severity: "info" | "warning" | "critical";
  description: string;
  createdAt: string;
};
type Payload = {
  admins: Admin[];
  accessLogs: AccessLog[];
  securityEvents: SecurityEvent[];
  pagination?: {
    hasMoreAccessLogs: boolean;
    hasMoreSecurityEvents: boolean;
  };
};

const SEVERITY_STYLE: Record<string, string> = {
  info: "bg-surface-soft text-muted",
  warning: "bg-amber-50 text-amber-800",
  critical: "bg-primary-soft text-rajlo-red",
};

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.floor(ms / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export default function AdminSecurityPage() {
  const query = useLiveQuery<Payload>("/api/admin/security", {
    interval: 30_000,
  });
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // "Add admin" form state.
  const [addEmail, setAddEmail] = useState("");
  const [addName, setAddName] = useState("");
  const [addRole, setAddRole] = useState<AdminRole>("moderator");
  const [adding, setAdding] = useState(false);
  const [addNotice, setAddNotice] = useState<string | null>(null);

  const addAdmin = async () => {
    setAdding(true);
    setError(null);
    setAddNotice(null);
    try {
      const res = await fetch("/api/admin/admins", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: addEmail.trim(),
          fullName: addName.trim() || undefined,
          adminRole: addRole,
        }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        error?: string;
        promoted?: boolean;
      };
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      setAddNotice(
        json.promoted
          ? "Existing account promoted to admin."
          : "Invite sent — they become an admin once they accept.",
      );
      setAddEmail("");
      setAddName("");
      await query.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't add the admin.");
    } finally {
      setAdding(false);
    }
  };

  const patchAdmin = async (
    id: string,
    body: { adminRole?: AdminRole; suspended?: boolean },
  ) => {
    setBusyId(id);
    setError(null);
    try {
      const res = await fetch(`/api/admin/admins/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      await query.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Update failed.");
    } finally {
      setBusyId(null);
    }
  };

  const data = query.data;

  return (
    <div className="mx-auto max-w-3xl px-2 py-2 md:px-3 md:py-8">
      <div className="mb-6">
        <p className="font-secondary text-xs font-bold uppercase tracking-wider text-rajlo-red">
          Security
        </p>
        <h1 className="mt-1 text-2xl font-extrabold tracking-tight md:text-3xl">
          Admin access &amp; security
        </h1>
        <p className="mt-2 text-sm text-muted">
          Manage admin roles, review who has accessed the admin console,
          and watch the security event feed. Role changes and
          suspensions are logged immutably.
        </p>
      </div>

      {error && (
        <p className="mb-4 rounded-xl border border-rajlo-red/20 bg-primary-soft px-4 py-3 text-sm text-rajlo-red">
          {error}
        </p>
      )}

      {/* ── Add admin ── */}
      <section className="mb-8 rounded-2xl border border-line bg-surface p-5">
        <h2 className="text-sm font-extrabold uppercase tracking-wider text-muted">
          Add an admin
        </h2>
        <p className="mt-1 text-xs text-muted">
          Enter an email. If the person already has a RAJLO account it&apos;s
          promoted to admin; otherwise they get a magic-link invite. Pick
          the tier that fits their job — keep access to the minimum.
        </p>
        <div className="mt-3 space-y-2.5">
          <input
            type="email"
            value={addEmail}
            onChange={(e) => setAddEmail(e.target.value)}
            placeholder="Email address"
            className="w-full rounded-xl border border-line bg-background px-3.5 py-2.5 text-sm focus:border-rajlo-red focus:outline-none"
          />
          <input
            value={addName}
            onChange={(e) => setAddName(e.target.value)}
            placeholder="Full name (required for a new invite)"
            className="w-full rounded-xl border border-line bg-background px-3.5 py-2.5 text-sm focus:border-rajlo-red focus:outline-none"
          />
          <select
            value={addRole}
            onChange={(e) => setAddRole(e.target.value as AdminRole)}
            className="w-full rounded-xl border border-line bg-background px-3.5 py-2.5 text-sm focus:border-rajlo-red focus:outline-none"
          >
            {ADMIN_ROLES.map((role) => (
              <option key={role} value={role}>
                {ADMIN_ROLE_LABEL[role]}
              </option>
            ))}
          </select>
          <p className="text-[11px] leading-relaxed text-muted">
            {ADMIN_ROLE_DESCRIPTION[addRole]}
          </p>
          {addNotice && (
            <p className="text-xs font-semibold text-emerald-700">
              {addNotice}
            </p>
          )}
          <button
            type="button"
            disabled={!addEmail.trim() || adding}
            onClick={addAdmin}
            className="inline-flex w-full items-center justify-center rounded-full bg-rajlo-red px-5 py-2.5 text-sm font-bold text-white transition-all hover:-translate-y-0.5 hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0"
          >
            {adding ? "Adding…" : "Add admin"}
          </button>
        </div>
      </section>

      {/* ── Admin roster ── */}
      <section className="mb-8">
        <h2 className="mb-3 text-sm font-extrabold uppercase tracking-wider text-muted">
          Admin roster
        </h2>
        {query.loading ? (
          <Skeleton className="h-40 w-full" rounded="lg" />
        ) : (
          <ul className="space-y-3">
            {(data?.admins ?? []).map((admin) => (
              <li
                key={admin.id}
                className="rounded-2xl border border-line bg-surface p-4"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-extrabold">
                      {admin.name}
                    </p>
                    {admin.suspended && (
                      <span className="text-[11px] font-bold uppercase tracking-wider text-rajlo-red">
                        Suspended
                      </span>
                    )}
                  </div>
                  <button
                    type="button"
                    disabled={busyId === admin.id}
                    onClick={() =>
                      patchAdmin(admin.id, { suspended: !admin.suspended })
                    }
                    className="shrink-0 rounded-full border border-line bg-background px-3 py-1.5 text-xs font-bold hover:bg-surface-2 disabled:opacity-50"
                  >
                    {admin.suspended ? "Reinstate" : "Suspend"}
                  </button>
                </div>
                <label className="mt-3 block">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-muted">
                    RBAC tier
                  </span>
                  <select
                    value={admin.adminRole ?? ""}
                    disabled={busyId === admin.id}
                    onChange={(e) =>
                      patchAdmin(admin.id, {
                        adminRole: e.target.value as AdminRole,
                      })
                    }
                    className="mt-1 w-full rounded-xl border border-line bg-background px-3 py-2 text-sm focus:border-rajlo-red focus:outline-none disabled:opacity-50"
                  >
                    {admin.adminRole === null && (
                      <option value="">— unassigned —</option>
                    )}
                    {ADMIN_ROLES.map((role) => (
                      <option key={role} value={role}>
                        {ADMIN_ROLE_LABEL[role]}
                      </option>
                    ))}
                  </select>
                </label>
                {admin.adminRole && (
                  <p className="mt-1.5 text-[11px] leading-relaxed text-muted">
                    {ADMIN_ROLE_DESCRIPTION[admin.adminRole]}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ── Security events ── */}
      <section className="mb-8">
        <h2 className="mb-3 text-sm font-extrabold uppercase tracking-wider text-muted">
          Security events
        </h2>
        {query.loading ? (
          <Skeleton className="h-32 w-full" rounded="lg" />
        ) : (data?.securityEvents ?? []).length === 0 ? (
          <p className="rounded-xl border border-line bg-surface px-4 py-3 text-sm text-muted">
            No security events recorded yet.
          </p>
        ) : (
          <ul className="space-y-2">
            {data!.securityEvents.map((ev) => (
              <li
                key={ev.id}
                className="rounded-xl border border-line bg-surface p-3.5"
              >
                <div className="flex items-center justify-between gap-2">
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                      SEVERITY_STYLE[ev.severity] ?? SEVERITY_STYLE.info
                    }`}
                  >
                    {ev.severity}
                  </span>
                  <span className="text-[11px] text-muted">
                    {timeAgo(ev.createdAt)}
                  </span>
                </div>
                <p className="mt-1.5 text-sm">{ev.description}</p>
              </li>
            ))}
            {data?.pagination?.hasMoreSecurityEvents && (
              <li className="px-4 py-2 text-center text-[11px] font-semibold text-muted">
                Older security events not shown — see the audit log for
                the full history.
              </li>
            )}
          </ul>
        )}
      </section>

      {/* ── Access history ── */}
      <section>
        <h2 className="mb-3 text-sm font-extrabold uppercase tracking-wider text-muted">
          Recent admin access
        </h2>
        {query.loading ? (
          <Skeleton className="h-32 w-full" rounded="lg" />
        ) : (data?.accessLogs ?? []).length === 0 ? (
          <p className="rounded-xl border border-line bg-surface px-4 py-3 text-sm text-muted">
            No access entries yet.
          </p>
        ) : (
          <ul className="space-y-1.5">
            {data!.accessLogs.map((log) => (
              <li
                key={log.id}
                className="flex items-center justify-between gap-3 rounded-xl border border-line bg-surface px-3.5 py-2.5"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold">{log.admin}</p>
                  <p className="truncate text-[11px] text-muted">
                    {log.ipAddress ?? "no IP"}
                  </p>
                </div>
                <span className="shrink-0 text-[11px] text-muted">
                  {timeAgo(log.createdAt)}
                </span>
              </li>
            ))}
            {data?.pagination?.hasMoreAccessLogs && (
              <li className="px-4 py-2 text-center text-[11px] font-semibold text-muted">
                Older access entries not shown — see the audit log for
                the full history.
              </li>
            )}
          </ul>
        )}
      </section>
    </div>
  );
}
