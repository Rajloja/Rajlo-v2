"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ArcWatermark } from "@/components/arc-pattern";
import { Icon } from "@/components/icons";
import { FadeUp } from "@/components/anim";
import { Skeleton } from "@/components/skeleton";
import { LiveIndicator } from "@/components/live-indicator";
import { useLiveQuery } from "@/lib/use-live-query";

/**
 * /admin/users — single search-and-act table for every account on
 * the platform (riders, drivers, admins).
 *
 * The list mixes Supabase auth metadata (email, last sign-in, banned)
 * with the profile row (full_name, role) and driver row (external_id,
 * activated state) so an admin doesn't have to bounce between three
 * tabs to understand who someone is.
 *
 * Per-row actions:
 *   - View detail              → /admin/users/[id]
 *   - Deactivate / reactivate  → bans the auth user + flips the driver
 *                                 row if applicable
 *   - Delete                   → hard-delete (cascades through rides etc)
 *
 * Page-level actions:
 *   - Invite admin / rider     → magic-link invite via auth.admin.inviteUserByEmail
 */

type UserRow = {
  id: string;
  fullName: string;
  email: string | null;
  role: "rider" | "driver" | "admin";
  phone: string | null;
  createdAt: string;
  lastSignInAt: string | null;
  driverExternalId: string | null;
  driverPlate: string | null;
  driverActivated: boolean | null;
  driverOnboardingStatus: string | null;
  deactivatedAt: string | null;
  banned: boolean;
  deletedAt: string | null;
  ridesCount: number;
};

// Role filter is hardcoded — drivers live on /admin/drivers now,
// admins are separate. This page is rider-focused only.
type RoleFilter = "rider";
type StatusFilter = "all" | "active" | "deactivated" | "deleted";

export default function AdminUsersPage() {
  const [roleFilter] = useState<RoleFilter>("rider");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  const [showInvite, setShowInvite] = useState(false);
  const [busyAction, setBusyAction] = useState<string | null>(null);

  // Debounce the search input
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 250);
    return () => clearTimeout(t);
  }, [search]);

  const PAGE_SIZE = 100;
  const usersUrl = (() => {
    const params = new URLSearchParams();
    params.set("role", roleFilter);
    if (statusFilter !== "all") params.set("status", statusFilter);
    if (debouncedSearch) params.set("q", debouncedSearch);
    params.set("limit", String(PAGE_SIZE));
    params.set("offset", "0");
    return `/api/admin/users?${params.toString()}`;
  })();

  // Live-poll every 30s. New signups + sign-ins surface within one
  // polling cycle without the admin needing to reload.
  const usersQuery = useLiveQuery<{ users: UserRow[]; total: number }>(
    usersUrl,
    { interval: 30_000 },
  );

  // Pagination — `usersQuery` owns the live first page; older rows
  // loaded via "Load more" accumulate in `extraUsers` so the 30-second
  // refresh doesn't wipe them. Reset whenever the underlying URL
  // (filters, search) changes — those are a different result set.
  const [extraUsers, setExtraUsers] = useState<UserRow[]>([]);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadMoreError, setLoadMoreError] = useState<string | null>(null);
  useEffect(() => {
    setExtraUsers([]);
    setLoadMoreError(null);
  }, [usersUrl]);

  // Merge live first-page + accumulated extras, dedupe by id in case
  // a refresh shifts a boundary row into both halves.
  const firstPage = usersQuery.data?.users ?? [];
  const users = useMemo(() => {
    const firstIds = new Set(firstPage.map((u) => u.id));
    return [...firstPage, ...extraUsers.filter((u) => !firstIds.has(u.id))];
    // Recompute when the live first page or the extras change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [usersQuery.data?.users, extraUsers]);
  const total = usersQuery.data?.total ?? users.length;
  const hasMore = users.length < total;
  const loading = usersQuery.loading;
  const error = usersQuery.error;
  const reload = usersQuery.refresh;

  const loadMore = async () => {
    setLoadingMore(true);
    setLoadMoreError(null);
    try {
      const next = new URL(usersUrl, window.location.origin);
      next.searchParams.set("offset", String(users.length));
      const res = await fetch(next.toString());
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as { users: UserRow[] };
      setExtraUsers((prev) => {
        const seen = new Set([
          ...firstPage.map((u) => u.id),
          ...prev.map((u) => u.id),
        ]);
        return [...prev, ...json.users.filter((u) => !seen.has(u.id))];
      });
    } catch (e) {
      setLoadMoreError(
        e instanceof Error ? e.message : "Couldn't load more.",
      );
    } finally {
      setLoadingMore(false);
    }
  };

  const counts = useMemo(() => {
    return {
      total: users.length,
      riders: users.filter((u) => u.role === "rider").length,
      drivers: users.filter((u) => u.role === "driver").length,
      admins: users.filter((u) => u.role === "admin").length,
      banned: users.filter(
        (u) => u.banned || (u.role === "driver" && u.deactivatedAt),
      ).length,
    };
  }, [users]);

  const handleDeactivate = async (
    user: UserRow,
    reactivate: boolean,
  ) => {
    if (!reactivate) {
      const reason = window.prompt(
        `Reason for deactivating ${user.fullName}? (optional, shown in audit log)`,
        "",
      );
      if (reason === null) return; // user cancelled
      setBusyAction(user.id);
      try {
        const res = await fetch(`/api/admin/users/${user.id}/deactivate`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reason }),
        });
        if (!res.ok) {
          const j = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(j.error ?? `HTTP ${res.status}`);
        }
        await reload();
      } catch (e) {
        alert(e instanceof Error ? e.message : "Couldn't deactivate user");
      } finally {
        setBusyAction(null);
      }
      return;
    }

    if (!confirm(`Reactivate ${user.fullName}? They'll be able to sign in again.`))
      return;
    setBusyAction(user.id);
    try {
      const res = await fetch(
        `/api/admin/users/${user.id}/deactivate?action=reactivate`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        },
      );
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(j.error ?? `HTTP ${res.status}`);
      }
      await reload();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Couldn't reactivate user");
    } finally {
      setBusyAction(null);
    }
  };

  const handleDelete = async (user: UserRow) => {
    if (
      !confirm(
        `Delete ${user.fullName}'s account?\n\nTheir name, phone, gov IDs, saved addresses, and ID documents are wiped and they can no longer sign in. Their rides, wallet transactions, and audit logs are RETAINED (anonymised) so the safety + finance team keeps the trail. There is no undo.`,
      )
    )
      return;
    setBusyAction(user.id);
    try {
      const res = await fetch(`/api/admin/users/${user.id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(j.error ?? `HTTP ${res.status}`);
      }
      await reload();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Couldn't delete user");
    } finally {
      setBusyAction(null);
    }
  };

  return (
    <div className="mx-auto max-w-7xl space-y-5 px-2 py-4 md:px-3 md:py-8">
      {/* ─── Hero ─── */}
      <FadeUp>
        <div className="relative overflow-hidden rounded-3xl bg-rajlo-black p-7 text-white shadow-xl md:p-9">
          <ArcWatermark
            size={460}
            variant="red"
            className="absolute -right-20 -bottom-20 opacity-[0.12]"
          />
          <div className="relative flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-secondary text-xs font-bold uppercase tracking-wider text-rajlo-red">
                  People
                </p>
                <LiveIndicator
                  variant="dark"
                  lastUpdated={usersQuery.lastUpdated}
                  refreshing={usersQuery.refreshing}
                  onRefresh={reload}
                />
              </div>
              <h1 className="mt-2 text-3xl font-extrabold leading-tight tracking-tight md:text-4xl">
                Riders
              </h1>
              <p className="mt-1 text-sm text-white/70 md:text-base">
                Every rider on the platform. Drivers live on the dedicated{" "}
                <Link
                  href="/admin/drivers"
                  className="font-bold text-rajlo-red underline-offset-2 hover:underline"
                >
                  Drivers page
                </Link>
                .
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowInvite(true)}
              className="inline-flex items-center gap-2 rounded-full bg-rajlo-red px-5 py-2.5 text-sm font-bold text-white shadow-lg shadow-rajlo-red/30 transition-all hover:-translate-y-0.5 hover:bg-primary-hover"
            >
              <Icon name="plus-circle" className="h-4 w-4" />
              Invite user
            </button>
          </div>
        </div>
      </FadeUp>

      {/* ─── Stats ─── */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <Stat label="On this page" value={counts.total} />
        <Stat label="Riders" value={counts.riders} tone="red" />
        <Stat label="Deactivated" value={counts.banned} tone="warning" />
      </div>

      {/* ─── Filters ─── */}
      <FadeUp delay={0.05}>
        <div className="rounded-2xl border border-line bg-surface p-4 md:p-5">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="flex flex-wrap gap-2">
              {(
                [
                  { key: "all", label: "Any status" },
                  { key: "active", label: "Active" },
                  { key: "deactivated", label: "Deactivated" },
                  { key: "deleted", label: "Deleted" },
                ] as const
              ).map((t) => (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => setStatusFilter(t.key)}
                  className={`rounded-full px-4 py-2 text-xs font-bold transition-all ${
                    statusFilter === t.key
                      ? "bg-rajlo-black text-white"
                      : "bg-surface-soft text-muted hover:text-foreground"
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
            <label className="relative">
              <Icon
                name="search"
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted"
              />
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Name, email, plate, driver ID…"
                className="w-full rounded-full border border-line bg-surface-soft py-2.5 pl-9 pr-4 text-sm font-semibold focus:border-rajlo-red focus:outline-none md:w-72"
              />
            </label>
          </div>
        </div>
      </FadeUp>

      {/* ─── Table ─── */}
      <FadeUp delay={0.08}>
        <div className="overflow-hidden rounded-2xl border border-line bg-surface">
          {loading ? (
            <div className="space-y-1 p-3">
              {[0, 1, 2, 3, 4, 5].map((i) => (
                <Skeleton key={i} className="h-16 w-full" rounded="xl" />
              ))}
            </div>
          ) : error ? (
            <div className="grid place-items-center py-16 text-center">
              <Icon name="alert-triangle" className="h-8 w-8 text-rajlo-red" />
              <p className="mt-3 text-sm font-bold">{error}</p>
              <button
                type="button"
                onClick={reload}
                className="mt-3 text-xs font-bold text-rajlo-red hover:underline"
              >
                Try again
              </button>
            </div>
          ) : users.length === 0 ? (
            <div className="grid place-items-center py-16 text-center">
              <Icon name="users" className="h-8 w-8 text-muted" />
              <p className="mt-3 text-sm font-bold">No users match these filters</p>
            </div>
          ) : (
            <ul className="divide-y divide-line">
              {users.map((u) => (
                <UserRowItem
                  key={u.id}
                  user={u}
                  busy={busyAction === u.id}
                  onDeactivate={handleDeactivate}
                  onDelete={handleDelete}
                />
              ))}
            </ul>
          )}
          {!loading && users.length > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line bg-surface-soft px-5 py-3 text-xs font-semibold text-muted">
              <span>
                Showing {users.length} of {total} matching users
              </span>
              {hasMore && (
                <button
                  type="button"
                  onClick={loadMore}
                  disabled={loadingMore}
                  className="inline-flex items-center gap-2 rounded-full border border-line bg-surface px-4 py-1.5 text-xs font-bold text-foreground transition-colors hover:bg-surface-soft disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {loadingMore ? (
                    <span className="h-3 w-3 animate-spin rounded-full border-2 border-rajlo-red border-t-transparent" />
                  ) : null}
                  {loadingMore ? "Loading…" : "Load more"}
                </button>
              )}
            </div>
          )}
          {loadMoreError && (
            <p className="border-t border-line bg-primary-soft px-5 py-2 text-xs font-semibold text-rajlo-red">
              {loadMoreError}
            </p>
          )}
        </div>
      </FadeUp>

      {showInvite && (
        <InviteModal
          onClose={() => setShowInvite(false)}
          onSuccess={() => {
            setShowInvite(false);
            reload();
          }}
        />
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: "red" | "emerald" | "warning";
}) {
  const numColor =
    tone === "red"
      ? "text-rajlo-red"
      : tone === "emerald"
        ? "text-emerald-600"
        : tone === "warning"
          ? "text-amber-600"
          : "text-foreground";
  return (
    <div className="rounded-2xl border border-line bg-surface p-4">
      <p className="font-secondary text-[10px] font-bold uppercase tracking-wider text-muted">
        {label}
      </p>
      <p
        className={`mt-1 text-2xl font-extrabold tracking-tight md:text-3xl ${numColor}`}
      >
        {value}
      </p>
    </div>
  );
}

function UserRowItem({
  user,
  busy,
  onDeactivate,
  onDelete,
}: {
  user: UserRow;
  busy: boolean;
  onDeactivate: (u: UserRow, reactivate: boolean) => void;
  onDelete: (u: UserRow) => void;
}) {
  const isDeactivated =
    user.banned || (user.role === "driver" && user.deactivatedAt);
  const initials = user.fullName
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0])
    .join("")
    .toUpperCase();

  return (
    <li className="grid grid-cols-1 items-center gap-3 px-3 py-3 transition-colors hover:bg-surface-soft md:grid-cols-[2fr,1fr,1fr,auto] md:px-5 md:py-4">
      <Link
        href={`/admin/users/${user.id}`}
        className="flex min-w-0 items-center gap-3"
      >
        <span
          className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl text-sm font-extrabold text-white ${
            user.role === "driver"
              ? "bg-rajlo-red"
              : user.role === "admin"
                ? "bg-rajlo-black"
                : "bg-emerald-600"
          }`}
        >
          {initials || "?"}
        </span>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <p className="truncate text-sm font-extrabold tracking-tight">
              {user.fullName}
            </p>
            <RoleBadge role={user.role} />
            {user.deletedAt ? (
              // Self-deleted account. Identity is anonymised but the
              // rides / wallet / audit trail is retained — the row is
              // still clickable so the admin can review that history.
              <span className="rounded-full border border-slate-400/40 bg-slate-100 px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wider text-slate-600">
                Deleted
              </span>
            ) : (
              isDeactivated && (
                <span className="rounded-full border border-rajlo-red/30 bg-primary-soft px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wider text-rajlo-red">
                  Deactivated
                </span>
              )
            )}
            {user.role === "driver" &&
              user.driverOnboardingStatus === "rejected" && (
                <span className="rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wider text-amber-800">
                  Rejected
                </span>
              )}
          </div>
          <p className="truncate text-xs text-muted">
            {user.email ?? "no email"}
            {user.driverExternalId && ` · ${user.driverExternalId}`}
            {user.driverPlate && ` · ${user.driverPlate}`}
          </p>
        </div>
      </Link>
      <div className="text-xs text-muted md:text-right">
        <p className="font-bold text-foreground">
          {user.ridesCount} ride{user.ridesCount === 1 ? "" : "s"}
        </p>
        <p>Joined {ago(user.createdAt)}</p>
      </div>
      <div className="text-xs text-muted md:text-right">
        <p className="font-semibold">
          {user.lastSignInAt ? `Active ${ago(user.lastSignInAt)}` : "Never signed in"}
        </p>
        <p>{user.phone ?? ""}</p>
      </div>
      <div className="flex flex-wrap items-center gap-2 md:justify-end">
        <Link
          href={`/admin/users/${user.id}`}
          className="rounded-full border border-line bg-surface px-3 py-1.5 text-[11px] font-extrabold text-foreground hover:border-rajlo-red hover:text-rajlo-red"
        >
          View
        </Link>
        {/* Deleted users are terminal — no reactivate, no re-delete. The
            audit trail is intact; the only meaningful action left is
            "View" (which opens the anonymised profile + retained
            rides/wallet/audit history). Suppress Deactivate + Delete
            so the admin isn't offered actions that would either fail
            or make no sense. */}
        {!user.deletedAt && (
          <>
            {isDeactivated ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => onDeactivate(user, true)}
                className="rounded-full border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-[11px] font-extrabold text-emerald-800 transition-colors hover:bg-emerald-100 disabled:opacity-50"
              >
                Reactivate
              </button>
            ) : (
              <button
                type="button"
                disabled={busy}
                onClick={() => onDeactivate(user, false)}
                className="rounded-full border border-amber-300 bg-amber-50 px-3 py-1.5 text-[11px] font-extrabold text-amber-800 transition-colors hover:bg-amber-100 disabled:opacity-50"
              >
                Deactivate
              </button>
            )}
            <button
              type="button"
              disabled={busy}
              onClick={() => onDelete(user)}
              className="rounded-full border border-rajlo-red/30 bg-primary-soft px-3 py-1.5 text-[11px] font-extrabold text-rajlo-red transition-colors hover:bg-rajlo-red hover:text-white disabled:opacity-50"
            >
              Delete
            </button>
          </>
        )}
      </div>
    </li>
  );
}

function RoleBadge({ role }: { role: string }) {
  const cfg =
    role === "driver"
      ? { label: "Driver", className: "bg-rajlo-red text-white" }
      : role === "admin"
        ? { label: "Admin", className: "bg-rajlo-black text-white" }
        : { label: "Rider", className: "bg-emerald-100 text-emerald-800" };
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wider ${cfg.className}`}
    >
      {cfg.label}
    </span>
  );
}

function InviteModal({
  onClose,
  onSuccess,
}: {
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [role, setRole] = useState<"rider" | "admin">("admin");
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, fullName, role, phone }),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(j.error ?? `HTTP ${res.status}`);
      }
      onSuccess();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't invite user");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-rajlo-black/60 px-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <form
        onSubmit={submit}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md space-y-4 rounded-2xl border border-line bg-surface p-6 shadow-2xl"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="font-secondary text-[10px] font-bold uppercase tracking-wider text-rajlo-red">
              New user
            </p>
            <h2 className="mt-1 text-xl font-extrabold tracking-tight">
              Invite by email
            </h2>
            <p className="mt-1 text-xs text-muted">
              Sends a magic-link invite. Drivers self-register through the
              public onboarding flow — only riders and admins go through here.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="grid h-8 w-8 place-items-center rounded-lg text-muted hover:bg-surface-soft hover:text-foreground"
          >
            <Icon name="x" className="h-4 w-4" />
          </button>
        </div>

        <Field label="Full name">
          <input
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            required
            className="w-full rounded-xl border border-line bg-surface-soft px-3 py-2 text-sm focus:border-rajlo-red focus:outline-none"
          />
        </Field>
        <Field label="Email">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="w-full rounded-xl border border-line bg-surface-soft px-3 py-2 text-sm focus:border-rajlo-red focus:outline-none"
          />
        </Field>
        <Field label="Phone (optional)">
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="w-full rounded-xl border border-line bg-surface-soft px-3 py-2 text-sm focus:border-rajlo-red focus:outline-none"
          />
        </Field>
        <Field label="Role">
          <div className="grid grid-cols-2 gap-2">
            {(["rider", "admin"] as const).map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setRole(r)}
                className={`rounded-xl border px-3 py-2 text-sm font-bold transition-all ${
                  role === r
                    ? "border-rajlo-red bg-primary-soft text-rajlo-red"
                    : "border-line bg-surface-soft text-muted hover:text-foreground"
                }`}
              >
                {r === "admin" ? "Admin" : "Rider"}
              </button>
            ))}
          </div>
        </Field>

        {error && (
          <div className="rounded-xl border border-rajlo-red/20 bg-primary-soft px-3 py-2 text-xs font-semibold text-rajlo-red">
            {error}
          </div>
        )}

        <div className="flex items-center justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-line bg-surface px-4 py-2 text-sm font-bold text-foreground hover:bg-surface-soft"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={busy}
            className="inline-flex items-center gap-1.5 rounded-full bg-rajlo-red px-5 py-2 text-sm font-bold text-white shadow-md shadow-rajlo-red/20 transition-all hover:-translate-y-0.5 hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-40"
          >
            {busy ? "Sending…" : "Send invite"}
            {!busy && <Icon name="arrow-right" className="h-4 w-4" />}
          </button>
        </div>
      </form>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <p className="mb-1.5 text-xs font-bold text-foreground">{label}</p>
      {children}
    </label>
  );
}

function ago(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.floor(ms / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  const months = Math.floor(d / 30);
  return `${months}mo ago`;
}
