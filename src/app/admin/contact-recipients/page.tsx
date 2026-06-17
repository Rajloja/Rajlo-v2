"use client";

import { useEffect, useState } from "react";
import { Icon } from "@/components/icons";

/**
 * Admin — Contact-form recipient roster.
 *
 * Lets a staff admin add, remove, and toggle-active the email
 * addresses that receive submissions from the public /contact form.
 *
 * Defaults seeded by the migration are: raj@rajlo.com, daniel@rajlo.com,
 * support@rajlo.com. Admins can deactivate any of these without deleting
 * (toggle-active keeps the row for audit while suppressing the email).
 *
 * Mutations all flow through /api/admin/contact-recipients which is
 * gated by requireAdmin() — RLS on the table mirrors that gate, so a
 * non-admin can't read this list even with a direct SQL client.
 */

type Recipient = {
  id: string;
  email: string;
  active: boolean;
  note: string | null;
  createdAt: string;
};

export default function ContactRecipientsPage() {
  const [recipients, setRecipients] = useState<Recipient[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Add-form state
  const [newEmail, setNewEmail] = useState("");
  const [newNote, setNewNote] = useState("");
  const [adding, setAdding] = useState(false);

  const refresh = async () => {
    setError(null);
    try {
      const res = await fetch("/api/admin/contact-recipients", {
        cache: "no-store",
      });
      const json = (await res.json()) as {
        recipients?: Recipient[];
        error?: string;
      };
      if (!res.ok) throw new Error(json.error ?? "Failed to load.");
      setRecipients(json.recipients ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  const onAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    const email = newEmail.trim();
    if (!email) return;
    setAdding(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/contact-recipients", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, note: newNote.trim() || undefined }),
      });
      const json = (await res.json()) as {
        ok?: boolean;
        error?: string;
        recipient?: Recipient;
      };
      if (!res.ok || !json.ok) {
        throw new Error(json.error ?? "Couldn't add.");
      }
      if (json.recipient) {
        setRecipients((rs) => [...rs, json.recipient!]);
      }
      setNewEmail("");
      setNewNote("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't add recipient.");
    } finally {
      setAdding(false);
    }
  };

  const onToggleActive = async (r: Recipient) => {
    setBusyId(r.id);
    setError(null);
    const prev = r.active;
    // Optimistic update
    setRecipients((rs) =>
      rs.map((x) => (x.id === r.id ? { ...x, active: !prev } : x)),
    );
    try {
      const res = await fetch("/api/admin/contact-recipients", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: r.id, active: !prev }),
      });
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !json.ok) throw new Error(json.error ?? "Update failed.");
    } catch (err) {
      // Roll back optimistic update
      setRecipients((rs) =>
        rs.map((x) => (x.id === r.id ? { ...x, active: prev } : x)),
      );
      setError(err instanceof Error ? err.message : "Couldn't update.");
    } finally {
      setBusyId(null);
    }
  };

  const onRemove = async (r: Recipient) => {
    if (
      !window.confirm(
        `Remove ${r.email} from the contact-form recipient list?`,
      )
    )
      return;
    setBusyId(r.id);
    setError(null);
    try {
      const res = await fetch("/api/admin/contact-recipients", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: r.id }),
      });
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !json.ok) throw new Error(json.error ?? "Delete failed.");
      setRecipients((rs) => rs.filter((x) => x.id !== r.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't remove.");
    } finally {
      setBusyId(null);
    }
  };

  const activeCount = recipients.filter((r) => r.active).length;

  return (
    <div className="mx-auto max-w-3xl space-y-6 py-2 md:px-3 md:py-8">
      <header className="space-y-2">
        <p className="font-secondary text-[10px] font-extrabold uppercase tracking-[0.4em] text-rajlo-red md:text-[11px]">
          Admin
        </p>
        <h1 className="text-2xl font-extrabold tracking-tight md:text-3xl">
          Contact-form recipients
        </h1>
        <p className="max-w-2xl text-sm leading-relaxed text-muted">
          Every active address below receives a copy of each submission
          from the public <span className="font-bold">/contact</span> form.
          Deactivating an address suppresses delivery without deleting the
          record — useful when someone is out of office. The list never
          fails closed: if no active recipients exist, submissions fall
          back to the legacy <code className="font-mono">CONTACT_INBOX_EMAIL</code> env var.
        </p>
      </header>

      {error && (
        <div
          role="alert"
          className="rounded-xl border border-rajlo-red/30 bg-primary-soft px-4 py-3 text-sm font-semibold text-rajlo-red"
        >
          {error}
        </div>
      )}

      {/* Add form */}
      <form
        onSubmit={onAdd}
        className="rounded-2xl border border-line bg-surface p-5 md:p-6"
      >
        <p className="text-[10px] font-extrabold uppercase tracking-[0.3em] text-muted">
          Add a recipient
        </p>
        <div className="mt-3 grid gap-3 md:grid-cols-[1.6fr_1fr_auto]">
          <input
            type="email"
            inputMode="email"
            autoComplete="off"
            required
            value={newEmail}
            onChange={(e) => setNewEmail(e.target.value)}
            placeholder="name@rajlo.com"
            className="rounded-xl border border-line bg-background px-4 py-3 text-sm font-semibold text-foreground placeholder:text-muted focus:border-rajlo-red focus:outline-none"
            aria-label="Email address"
          />
          <input
            type="text"
            maxLength={120}
            value={newNote}
            onChange={(e) => setNewNote(e.target.value)}
            placeholder="Note (optional) — e.g. Founder"
            className="rounded-xl border border-line bg-background px-4 py-3 text-sm text-foreground placeholder:text-muted focus:border-rajlo-red focus:outline-none"
            aria-label="Note"
          />
          <button
            type="submit"
            disabled={adding || !newEmail.trim()}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-rajlo-red px-5 py-3 text-sm font-extrabold text-white shadow-sm transition-colors hover:bg-primary-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rajlo-red disabled:opacity-50"
          >
            <Icon name="plus-circle" className="h-4 w-4" />
            {adding ? "Adding…" : "Add"}
          </button>
        </div>
      </form>

      {/* List */}
      <section className="space-y-3">
        <div className="flex items-baseline justify-between">
          <p className="text-[10px] font-extrabold uppercase tracking-[0.3em] text-muted">
            Roster
          </p>
          <p className="text-xs text-muted">
            {loading
              ? "Loading…"
              : `${recipients.length} total · ${activeCount} active`}
          </p>
        </div>
        {loading ? (
          <div className="rounded-2xl border border-line bg-surface p-6 text-sm text-muted">
            Loading recipients…
          </div>
        ) : recipients.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-line bg-surface-soft p-6 text-sm text-muted">
            No recipients yet. Add one above — submissions will fall back
            to the <code className="font-mono">CONTACT_INBOX_EMAIL</code> env var
            until at least one active row exists.
          </div>
        ) : (
          <ul className="space-y-3">
            {recipients.map((r) => (
              <li
                key={r.id}
                className={`flex flex-wrap items-center gap-4 rounded-2xl border bg-surface p-4 md:p-5 ${
                  r.active
                    ? "border-line"
                    : "border-line bg-surface-soft opacity-70"
                }`}
              >
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-rajlo-red/10 text-rajlo-red">
                  <Icon name="mail" className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-extrabold text-foreground">
                    {r.email}
                  </p>
                  <p className="mt-0.5 text-xs text-muted">
                    {r.note ? r.note + " · " : ""}
                    Added {new Date(r.createdAt).toLocaleDateString("en-JM")}
                    {!r.active && " · Inactive"}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <button
                    type="button"
                    onClick={() => onToggleActive(r)}
                    disabled={busyId === r.id}
                    aria-pressed={r.active}
                    className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-[11px] font-extrabold uppercase tracking-wider transition-colors disabled:opacity-50 ${
                      r.active
                        ? "bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                        : "bg-surface-soft text-muted hover:bg-line/50"
                    }`}
                  >
                    {r.active ? "Active" : "Inactive"}
                  </button>
                  <button
                    type="button"
                    onClick={() => onRemove(r)}
                    disabled={busyId === r.id}
                    aria-label={`Remove ${r.email}`}
                    className="grid h-9 w-9 place-items-center rounded-full text-muted transition-colors hover:bg-primary-soft hover:text-rajlo-red disabled:opacity-50"
                  >
                    <Icon name="x" className="h-4 w-4" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
