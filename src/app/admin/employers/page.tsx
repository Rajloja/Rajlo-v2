"use client";

import { useEffect, useState } from "react";
import { Icon } from "@/components/icons";
import { FadeUp } from "@/components/anim";
import { Skeleton } from "@/components/skeleton";
import { EmptyState } from "@/components/empty-state";

/**
 * /admin/employers
 *
 * Roster of Rajlo staff who onboard drivers at taxi hubs. Provision,
 * deactivate/reactivate, and see per-employer stats. A newly-provisioned
 * employer receives a password-reset email so they can pick their own
 * credentials — the admin never sees or handles the password.
 */

type EmployerRow = {
  id: string;
  fullName: string;
  email: string | null;
  active: boolean;
  lastSignInAt: string | null;
  stats: { total: number; pending: number; approved: number; rejected: number };
};

export default function AdminEmployersPage() {
  const [employers, setEmployers] = useState<EmployerRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);
  const [dialogError, setDialogError] = useState<string | null>(null);

  const load = async () => {
    setError(null);
    try {
      const res = await fetch("/api/admin/employers");
      const json = (await res.json().catch(() => ({}))) as {
        employers?: EmployerRow[];
        error?: string;
      };
      if (!res.ok) throw new Error(json.error ?? "Couldn't load employers");
      setEmployers(json.employers ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't load employers");
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const createEmployer = async () => {
    setCreating(true);
    setDialogError(null);
    try {
      const res = await fetch("/api/admin/employers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: newEmail, fullName: newName }),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? "Couldn't create employer");
      setDialogOpen(false);
      setNewEmail("");
      setNewName("");
      await load();
    } catch (e) {
      setDialogError(
        e instanceof Error ? e.message : "Couldn't create employer",
      );
    } finally {
      setCreating(false);
    }
  };

  const toggleActive = async (id: string, currentActive: boolean) => {
    try {
      await fetch("/api/admin/employers", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, active: !currentActive }),
      });
      await load();
    } catch {
      /* silent — refetch will show stale state */
    }
  };

  return (
    <div className="space-y-6">
      <FadeUp>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="font-secondary text-xs font-bold uppercase tracking-wider text-rajlo-red">
              Employer accounts
            </p>
            <h1 className="mt-1 text-2xl font-extrabold tracking-tight md:text-3xl">
              Field-agent roster
            </h1>
            <p className="mt-1 max-w-2xl text-sm text-muted">
              Provision Rajlo staff who onboard drivers at taxi hubs. Each
              employer sees only the drivers they&apos;ve onboarded.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setDialogOpen(true)}
            className="inline-flex items-center gap-2 rounded-full bg-rajlo-red px-5 py-2.5 text-sm font-bold text-white shadow-lg shadow-rajlo-red/30 hover:-translate-y-0.5 hover:bg-primary-hover"
          >
            <Icon name="users" className="h-4 w-4" />
            Add employer
          </button>
        </div>
      </FadeUp>

      {error && (
        <div className="rounded-xl border border-rajlo-red/20 bg-primary-soft px-4 py-3 text-sm text-rajlo-red">
          {error}
        </div>
      )}

      {employers === null ? (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-20 w-full" rounded="lg" />
          ))}
        </div>
      ) : employers.length === 0 ? (
        <EmptyState
          title="No employers yet"
          body="Add the first employer to kick off field onboarding at the hubs."
        />
      ) : (
        <ul className="space-y-2">
          {employers.map((e) => (
            <li
              key={e.id}
              className="rounded-2xl border border-line bg-surface p-4"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-sm font-extrabold">
                      {e.fullName || "Unnamed"}
                    </p>
                    {!e.active && (
                      <span className="rounded-full bg-rajlo-red/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-rajlo-red">
                        Deactivated
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 truncate text-xs text-muted">
                    {e.email ?? "—"}
                  </p>
                  <p className="mt-0.5 text-[11px] text-muted">
                    Last signed in:{" "}
                    {e.lastSignInAt
                      ? new Date(e.lastSignInAt).toLocaleDateString("en-JM", {
                          year: "numeric",
                          month: "short",
                          day: "numeric",
                          timeZone: "America/Jamaica",
                        })
                      : "never"}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => toggleActive(e.id, e.active)}
                  className="shrink-0 rounded-full border border-line bg-surface px-3 py-1.5 text-xs font-bold hover:bg-surface-soft"
                >
                  {e.active ? "Deactivate" : "Reactivate"}
                </button>
              </div>
              <div className="mt-3 grid grid-cols-4 gap-2 text-center text-xs">
                <StatMini label="Total" value={e.stats.total} tone="neutral" />
                <StatMini label="Pending" value={e.stats.pending} tone="amber" />
                <StatMini
                  label="Approved"
                  value={e.stats.approved}
                  tone="emerald"
                />
                <StatMini label="Rejected" value={e.stats.rejected} tone="red" />
              </div>
            </li>
          ))}
        </ul>
      )}

      {/* Add-employer dialog */}
      {dialogOpen && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-rajlo-black/60 p-4 backdrop-blur-sm"
          onClick={() => (creating ? null : setDialogOpen(false))}
        >
          <div
            className="w-full max-w-sm rounded-3xl border border-line bg-surface p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-extrabold tracking-tight">
              Add employer
            </h2>
            <p className="mt-1 text-xs text-muted">
              They&apos;ll get a password-reset email so they can set their own
              credentials.
            </p>
            {dialogError && (
              <div className="mt-3 rounded-xl border border-rajlo-red/20 bg-primary-soft px-3 py-2 text-xs text-rajlo-red">
                {dialogError}
              </div>
            )}
            <label className="mt-4 block">
              <span className="mb-1.5 block text-sm font-semibold">
                Full name
              </span>
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Ann-Marie Brown"
                className="w-full rounded-xl border border-line bg-surface px-4 py-2.5 text-sm outline-none focus:border-rajlo-red focus:ring-2 focus:ring-rajlo-red/15"
              />
            </label>
            <label className="mt-3 block">
              <span className="mb-1.5 block text-sm font-semibold">Email</span>
              <input
                type="email"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                placeholder="ann@rajlo.com"
                className="w-full rounded-xl border border-line bg-surface px-4 py-2.5 text-sm outline-none focus:border-rajlo-red focus:ring-2 focus:ring-rajlo-red/15"
              />
            </label>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setDialogOpen(false)}
                disabled={creating}
                className="rounded-full border border-line bg-surface px-4 py-2 text-sm font-bold hover:bg-surface-soft"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={createEmployer}
                disabled={creating || !newEmail || !newName}
                className="inline-flex items-center gap-2 rounded-full bg-rajlo-red px-4 py-2 text-sm font-bold text-white shadow-lg shadow-rajlo-red/30 hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-60"
              >
                {creating ? (
                  <>
                    <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                    Creating…
                  </>
                ) : (
                  "Add"
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function StatMini({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "neutral" | "amber" | "emerald" | "red";
}) {
  const toneClass = {
    neutral: "bg-surface-soft text-foreground",
    amber: "bg-amber-50 text-amber-800",
    emerald: "bg-emerald-50 text-emerald-700",
    red: "bg-rajlo-red/10 text-rajlo-red",
  }[tone];
  return (
    <div className={`rounded-lg px-2 py-1.5 ${toneClass}`}>
      <p className="text-lg font-extrabold tabular-nums">{value}</p>
      <p className="text-[10px] font-semibold uppercase tracking-wider">
        {label}
      </p>
    </div>
  );
}
