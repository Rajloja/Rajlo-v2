"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { LiveIndicator } from "@/components/live-indicator";
import { useLiveQuery } from "@/lib/use-live-query";
import { ArcWatermark } from "@/components/arc-pattern";
import { Icon, type IconName } from "@/components/icons";
import { FadeUp } from "@/components/anim";
import { ActivityFeedSkeleton, Skeleton } from "@/components/skeleton";

/**
 * /admin/messages — admin messaging center.
 *
 * Composer on top, sent-history below. The composer has three pieces:
 *
 *   1. Audience picker — single user (search), all riders, all
 *      drivers (with active/online filter), all admins, everyone, or
 *      a typed-in list of user IDs
 *   2. Channel picker — email / push / inbox (any combination)
 *   3. Subject + body, optional CTA link + label, live preview of
 *      what each channel will look like for the first recipient
 *
 * Send button shows aggregate progress: "73 of 412 emails sent" etc.
 * On success the row appears at the top of the history feed.
 */

type Channel = "email" | "push" | "inbox";

type AudienceKind =
  | "role:rider"
  | "role:driver"
  | "role:admin"
  | "all"
  | "user"
  | "list";

type DriverFilter = "all" | "active" | "online";

type SendResultBucket = { sent: number; failed: number; skipped: number };
type SendResults = {
  email: SendResultBucket;
  push: SendResultBucket;
  inbox: SendResultBucket;
};

type HistoryRow = {
  id: string;
  actor_label: string | null;
  audience_kind: AudienceKind;
  audience_size: number;
  audience_meta: Record<string, unknown> | null;
  channels: Channel[];
  subject: string;
  body: string;
  href: string | null;
  cta: string | null;
  results: SendResults;
  created_at: string;
};

type UserSearchRow = {
  id: string;
  fullName: string;
  email: string | null;
  role: "rider" | "driver" | "admin";
  driverExternalId: string | null;
};

const AUDIENCE_OPTIONS: Array<{
  value: AudienceKind;
  label: string;
  description: string;
  icon: IconName;
}> = [
  {
    value: "role:rider",
    label: "All riders",
    description: "Every account with role 'rider'",
    icon: "users",
  },
  {
    value: "role:driver",
    label: "All drivers",
    description: "Every driver (filterable by active / online)",
    icon: "car",
  },
  {
    value: "role:admin",
    label: "All admins",
    description: "Every account with role 'admin'",
    icon: "shield",
  },
  {
    value: "all",
    label: "Everyone",
    description: "Every account on the platform",
    icon: "activity",
  },
  {
    value: "user",
    label: "Single user",
    description: "Search and pick one rider, driver, or admin",
    icon: "user",
  },
];

const CHANNEL_OPTIONS: Array<{
  value: Channel;
  label: string;
  description: string;
  icon: IconName;
}> = [
  {
    value: "email",
    label: "Email",
    description: "Branded transactional via Resend",
    icon: "mail",
  },
  {
    value: "push",
    label: "Push notification",
    description: "Web push to every registered device",
    icon: "bell",
  },
  {
    value: "inbox",
    label: "In-app inbox",
    description: "Saves to rider/driver notifications feed",
    icon: "inbox",
  },
];

export default function AdminMessagesPage() {
  /* ─────────── Composer state ─────────── */
  const [audience, setAudience] = useState<AudienceKind>("role:rider");
  const [driverFilter, setDriverFilter] = useState<DriverFilter>("active");
  const [pickedUser, setPickedUser] = useState<UserSearchRow | null>(null);
  const [channels, setChannels] = useState<Channel[]>(["push", "inbox"]);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [href, setHref] = useState("");
  const [cta, setCta] = useState("");

  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [sendResult, setSendResult] = useState<{
    recipients: number;
    results: SendResults;
  } | null>(null);

  /* ─────────── History (live-polled) ─────────── */
  // 30s cadence — admins won't be sending dozens of broadcasts per
  // minute, so this keeps the feed current without busywork.
  const HISTORY_PAGE_SIZE = 20;
  const historyUrl = `/api/admin/messages?limit=${HISTORY_PAGE_SIZE}&offset=0`;
  const historyQuery = useLiveQuery<{
    messages: HistoryRow[];
    pagination?: { hasMore: boolean };
  }>(historyUrl, { interval: 30_000 });
  const historyFirstPage = historyQuery.data?.messages ?? [];
  const [historyExtra, setHistoryExtra] = useState<HistoryRow[]>([]);
  const [hasMoreOlderHistory, setHasMoreOlderHistory] = useState(true);
  const [loadingMoreHistory, setLoadingMoreHistory] = useState(false);
  useEffect(() => {
    setHistoryExtra([]);
    setHasMoreOlderHistory(true);
  }, [historyUrl]);
  const historyFirstIds = new Set(historyFirstPage.map((h) => h.id));
  const history: HistoryRow[] = [
    ...historyFirstPage,
    ...historyExtra.filter((h) => !historyFirstIds.has(h.id)),
  ];
  const canLoadMoreHistory =
    historyExtra.length === 0
      ? (historyQuery.data?.pagination?.hasMore ?? false)
      : hasMoreOlderHistory;
  const historyLoading = historyQuery.loading;
  const reloadHistory = historyQuery.refresh;

  const loadMoreHistory = async () => {
    setLoadingMoreHistory(true);
    try {
      const next = new URL(historyUrl, window.location.origin);
      next.searchParams.set("offset", String(history.length));
      const res = await fetch(next.toString());
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as {
        messages: HistoryRow[];
        pagination?: { hasMore: boolean };
      };
      setHistoryExtra((prev) => {
        const seen = new Set([
          ...historyFirstPage.map((h) => h.id),
          ...prev.map((h) => h.id),
        ]);
        return [...prev, ...json.messages.filter((h) => !seen.has(h.id))];
      });
      setHasMoreOlderHistory(json.pagination?.hasMore ?? false);
    } catch {
      // Silent failure for history — admin can retry.
    } finally {
      setLoadingMoreHistory(false);
    }
  };

  const submit = async () => {
    setSending(true);
    setSendError(null);
    setSendResult(null);
    try {
      const audienceBody: Record<string, unknown> = { kind: audience };
      if (audience === "role:driver") audienceBody.filter = driverFilter;
      if (audience === "user") {
        if (!pickedUser) throw new Error("Pick a user first");
        audienceBody.userId = pickedUser.id;
      }

      const res = await fetch("/api/admin/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          audience: audienceBody,
          channels,
          subject,
          body,
          href: href || undefined,
          cta: cta || undefined,
        }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        error?: string;
        recipients?: number;
        results?: SendResults;
      };
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      setSendResult({
        recipients: json.recipients ?? 0,
        results: json.results ?? {
          email: { sent: 0, failed: 0, skipped: 0 },
          push: { sent: 0, failed: 0, skipped: 0 },
          inbox: { sent: 0, failed: 0, skipped: 0 },
        },
      });
      // Clear composer for the next send.
      setSubject("");
      setBody("");
      setHref("");
      setCta("");
      reloadHistory();
    } catch (e) {
      setSendError(e instanceof Error ? e.message : "Send failed");
    } finally {
      setSending(false);
    }
  };

  const canSend =
    !sending &&
    subject.trim().length > 0 &&
    body.trim().length > 0 &&
    channels.length > 0 &&
    (audience !== "user" || pickedUser !== null);

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
              <p className="font-secondary text-xs font-bold uppercase tracking-wider text-rajlo-red">
                Messaging center
              </p>
              <h1 className="mt-2 text-3xl font-extrabold leading-tight tracking-tight md:text-4xl">
                Reach riders and drivers
              </h1>
              <p className="mt-1 text-sm text-white/70 md:text-base">
                Send a one-off email, push, or in-app message — to a single
                user, a role, or everyone on the platform.
              </p>
            </div>
            <Link
              href="/admin/audit-logs?source=admin"
              className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-4 py-2 text-xs font-bold text-white backdrop-blur transition-all hover:bg-white/20"
            >
              <Icon name="history" className="h-3.5 w-3.5" />
              Audit log
            </Link>
          </div>
        </div>
      </FadeUp>

      <div className="grid gap-5 lg:grid-cols-3">
        {/* Composer */}
        <div className="space-y-5 lg:col-span-2">
          {/* Audience */}
          <FadeUp delay={0.04}>
            <Section eyebrow="Audience" title="Who's getting this?">
              <div className="grid gap-2 md:grid-cols-2">
                {AUDIENCE_OPTIONS.map((o) => (
                  <button
                    key={o.value}
                    type="button"
                    onClick={() => setAudience(o.value)}
                    className={`flex items-start gap-3 rounded-2xl border p-3 text-left transition-all ${
                      audience === o.value
                        ? "border-rajlo-red bg-primary-soft"
                        : "border-line bg-surface-soft hover:border-rajlo-red/40"
                    }`}
                  >
                    <span
                      className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${
                        audience === o.value
                          ? "bg-rajlo-red text-white"
                          : "bg-white text-rajlo-red"
                      }`}
                    >
                      <Icon name={o.icon} className="h-4 w-4" />
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-extrabold">{o.label}</p>
                      <p className="mt-0.5 text-xs text-muted">{o.description}</p>
                    </div>
                  </button>
                ))}
              </div>

              {/* Driver filter */}
              {audience === "role:driver" && (
                <div className="mt-4 rounded-xl border border-line bg-surface-soft p-3">
                  <p className="font-secondary text-[10px] font-bold uppercase tracking-wider text-muted">
                    Driver filter
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {(
                      [
                        { v: "all", l: "All drivers" },
                        { v: "active", l: "Activated only" },
                        { v: "online", l: "Currently online" },
                      ] as const
                    ).map((o) => (
                      <button
                        key={o.v}
                        type="button"
                        onClick={() => setDriverFilter(o.v)}
                        className={`rounded-full px-3 py-1.5 text-[11px] font-bold transition-all ${
                          driverFilter === o.v
                            ? "bg-rajlo-red text-white"
                            : "bg-white text-muted hover:text-foreground"
                        }`}
                      >
                        {o.l}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Single user picker */}
              {audience === "user" && (
                <div className="mt-4">
                  <UserPicker
                    selected={pickedUser}
                    onSelect={setPickedUser}
                  />
                </div>
              )}
            </Section>
          </FadeUp>

          {/* Channels */}
          <FadeUp delay={0.06}>
            <Section eyebrow="Channels" title="How should it reach them?">
              <div className="grid gap-2 md:grid-cols-3">
                {CHANNEL_OPTIONS.map((c) => {
                  const on = channels.includes(c.value);
                  return (
                    <button
                      key={c.value}
                      type="button"
                      onClick={() =>
                        setChannels((prev) =>
                          on
                            ? prev.filter((x) => x !== c.value)
                            : [...prev, c.value],
                        )
                      }
                      className={`flex items-start gap-3 rounded-2xl border p-3 text-left transition-all ${
                        on
                          ? "border-rajlo-red bg-primary-soft"
                          : "border-line bg-surface-soft hover:border-rajlo-red/40"
                      }`}
                    >
                      <span
                        className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${
                          on ? "bg-rajlo-red text-white" : "bg-white text-rajlo-red"
                        }`}
                      >
                        <Icon name={c.icon} className="h-4 w-4" />
                      </span>
                      <div className="min-w-0">
                        <p className="text-sm font-extrabold">{c.label}</p>
                        <p className="mt-0.5 text-xs text-muted">
                          {c.description}
                        </p>
                      </div>
                      <span
                        className={`grid h-5 w-5 shrink-0 place-items-center rounded-md border ${
                          on
                            ? "border-rajlo-red bg-rajlo-red text-white"
                            : "border-line bg-white text-transparent"
                        }`}
                      >
                        <Icon name="check-circle" className="h-3 w-3" />
                      </span>
                    </button>
                  );
                })}
              </div>
            </Section>
          </FadeUp>

          {/* Composer fields */}
          <FadeUp delay={0.08}>
            <Section eyebrow="Message" title="What are you sending?">
              <div className="space-y-4">
                <Field
                  label="Subject"
                  hint="Used as the email subject AND the push notification title"
                >
                  <input
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    maxLength={200}
                    placeholder="e.g. Service update — Kingston rides"
                    className="w-full rounded-xl border border-line bg-surface-soft px-3 py-2.5 text-sm font-semibold focus:border-rajlo-red focus:outline-none"
                  />
                  <p className="mt-1 text-right text-[10px] text-muted">
                    {subject.length} / 200
                  </p>
                </Field>
                <Field
                  label="Body"
                  hint="Plain text. Blank lines become paragraphs in the email."
                >
                  <textarea
                    value={body}
                    onChange={(e) => setBody(e.target.value)}
                    maxLength={5000}
                    rows={8}
                    placeholder="Write the message here…"
                    className="w-full rounded-xl border border-line bg-surface-soft px-3 py-2.5 text-sm leading-relaxed focus:border-rajlo-red focus:outline-none"
                  />
                  <p className="mt-1 text-right text-[10px] text-muted">
                    {body.length} / 5000
                  </p>
                </Field>
                <div className="grid gap-3 md:grid-cols-2">
                  <Field
                    label="CTA link (optional)"
                    hint="Where the push / email button opens"
                  >
                    <input
                      value={href}
                      onChange={(e) => setHref(e.target.value)}
                      placeholder="https://rajlo.com/promo"
                      className="w-full rounded-xl border border-line bg-surface-soft px-3 py-2.5 text-sm font-semibold focus:border-rajlo-red focus:outline-none"
                    />
                  </Field>
                  <Field
                    label="CTA label (optional)"
                    hint="Button text in the email + inbox row"
                  >
                    <input
                      value={cta}
                      onChange={(e) => setCta(e.target.value)}
                      maxLength={40}
                      placeholder="See details"
                      className="w-full rounded-xl border border-line bg-surface-soft px-3 py-2.5 text-sm font-semibold focus:border-rajlo-red focus:outline-none"
                    />
                  </Field>
                </div>
              </div>
            </Section>
          </FadeUp>

          {/* Submit */}
          <FadeUp delay={0.1}>
            <div className="rounded-2xl border border-line bg-surface p-5">
              {sendError && (
                <div className="mb-3 rounded-xl border border-rajlo-red/20 bg-primary-soft px-3 py-2 text-sm font-semibold text-rajlo-red">
                  {sendError}
                </div>
              )}
              {sendResult && (
                <div className="mb-3 rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm">
                  <p className="font-extrabold text-emerald-800">
                    Sent to {sendResult.recipients} recipient
                    {sendResult.recipients === 1 ? "" : "s"}
                  </p>
                  <ul className="mt-2 space-y-0.5 text-xs text-emerald-900/80">
                    {channels.map((ch) => (
                      <li key={ch}>
                        <span className="font-bold capitalize">{ch}</span>:{" "}
                        {sendResult.results[ch].sent} sent ·{" "}
                        {sendResult.results[ch].skipped} skipped ·{" "}
                        {sendResult.results[ch].failed} failed
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-xs text-muted">
                  {audience === "user"
                    ? pickedUser
                      ? `1 recipient · ${pickedUser.fullName}`
                      : "Pick a user above"
                    : audience === "role:driver"
                      ? `All ${driverFilter === "all" ? "drivers" : driverFilter === "online" ? "online drivers" : "active drivers"} via ${channels.join(" + ") || "no channel"}`
                      : `${describeAudience(audience)} via ${channels.join(" + ") || "no channel"}`}
                </p>
                <button
                  type="button"
                  onClick={submit}
                  disabled={!canSend}
                  className="inline-flex items-center gap-2 rounded-full bg-rajlo-red px-6 py-2.5 text-sm font-extrabold text-white shadow-lg shadow-rajlo-red/30 transition-all hover:-translate-y-0.5 hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none disabled:hover:-translate-y-0"
                >
                  {sending ? "Sending…" : "Send message"}
                  {!sending && <Icon name="arrow-right" className="h-4 w-4" />}
                </button>
              </div>
            </div>
          </FadeUp>
        </div>

        {/* Live preview + history */}
        <div className="space-y-5">
          <FadeUp delay={0.06}>
            <Section eyebrow="Preview" title="What recipients see">
              {channels.length === 0 ? (
                <p className="py-10 text-center text-xs text-muted">
                  Pick a channel above to see a preview.
                </p>
              ) : (
                <div className="space-y-3">
                  {channels.includes("push") && (
                    <PushPreview
                      title={subject || "Subject preview"}
                      body={body || "Body preview"}
                    />
                  )}
                  {channels.includes("email") && (
                    <EmailPreview
                      subject={subject || "Subject preview"}
                      body={body || "Body preview"}
                      cta={cta}
                      href={href}
                    />
                  )}
                  {channels.includes("inbox") && (
                    <InboxPreview
                      title={subject || "Subject preview"}
                      body={body || "Body preview"}
                      cta={cta}
                    />
                  )}
                </div>
              )}
            </Section>
          </FadeUp>

          <FadeUp delay={0.1}>
            <Section
              eyebrow="History"
              title="Past sends"
              rightSlot={
                <LiveIndicator
                  lastUpdated={historyQuery.lastUpdated}
                  refreshing={historyQuery.refreshing}
                  onRefresh={reloadHistory}
                />
              }
            >
              {historyLoading ? (
                <ActivityFeedSkeleton rows={4} />
              ) : history.length === 0 ? (
                <p className="py-10 text-center text-xs text-muted">
                  No messages have been sent yet.
                </p>
              ) : (
                <ul className="space-y-2">
                  {history.map((h) => (
                    <HistoryRowItem key={h.id} row={h} />
                  ))}
                  {canLoadMoreHistory && (
                    <li className="pt-1 text-center">
                      <button
                        type="button"
                        onClick={loadMoreHistory}
                        disabled={loadingMoreHistory}
                        className="inline-flex items-center gap-2 rounded-full border border-line bg-surface px-4 py-1.5 text-xs font-bold text-foreground transition-colors hover:bg-surface-soft disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {loadingMoreHistory ? (
                          <span className="h-3 w-3 animate-spin rounded-full border-2 border-rajlo-red border-t-transparent" />
                        ) : null}
                        {loadingMoreHistory ? "Loading…" : "Load more"}
                      </button>
                    </li>
                  )}
                </ul>
              )}
            </Section>
          </FadeUp>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────── pieces ─────────────────────────── */

function Section({
  eyebrow,
  title,
  children,
  rightSlot,
}: {
  eyebrow: string;
  title: string;
  children: React.ReactNode;
  rightSlot?: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-line bg-surface p-5">
      <div className="flex flex-wrap items-center gap-2">
        <p className="font-secondary text-[10px] font-bold uppercase tracking-wider text-rajlo-red">
          {eyebrow}
        </p>
        {rightSlot}
      </div>
      <p className="mt-1 mb-4 text-sm font-bold">{title}</p>
      {children}
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <p className="text-xs font-bold">{label}</p>
      {hint && <p className="mt-0.5 mb-1.5 text-[11px] text-muted">{hint}</p>}
      {children}
    </label>
  );
}

function describeAudience(kind: AudienceKind): string {
  switch (kind) {
    case "role:rider":
      return "All riders";
    case "role:admin":
      return "All admins";
    case "all":
      return "Everyone";
    case "list":
      return "Specific list";
    default:
      return kind;
  }
}

function PushPreview({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-2xl border border-line bg-surface-soft p-3">
      <p className="font-secondary text-[10px] font-bold uppercase tracking-wider text-muted">
        Push notification
      </p>
      <div className="mt-2 flex items-start gap-3 rounded-xl bg-white p-3 shadow-sm">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-rajlo-red text-white">
          <Icon name="bell" className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-extrabold">{title}</p>
          <p className="mt-0.5 line-clamp-3 text-xs text-muted">{body}</p>
          <p className="mt-1 text-[10px] font-semibold uppercase tracking-wider text-muted">
            Rajlo · now
          </p>
        </div>
      </div>
    </div>
  );
}

function EmailPreview({
  subject,
  body,
  cta,
  href,
}: {
  subject: string;
  body: string;
  cta: string;
  href: string;
}) {
  const firstParagraph = body.split(/\n\s*\n/)[0]?.slice(0, 220) ?? "";
  return (
    <div className="rounded-2xl border border-line bg-surface-soft p-3">
      <p className="font-secondary text-[10px] font-bold uppercase tracking-wider text-muted">
        Email
      </p>
      <div className="mt-2 overflow-hidden rounded-xl border border-line bg-white">
        <div className="bg-rajlo-black px-4 py-3 text-white">
          <p className="text-[10px] font-extrabold uppercase tracking-wider text-rajlo-red">
            Rajlo update
          </p>
          <p className="mt-1 text-sm font-extrabold">{subject}</p>
        </div>
        <div className="space-y-2 p-4 text-xs leading-relaxed text-foreground">
          <p>{firstParagraph || "Body preview"}</p>
          {cta && href && (
            <p>
              <span className="inline-block rounded-full bg-rajlo-red px-3 py-1.5 text-[11px] font-extrabold text-white">
                {cta} →
              </span>
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function InboxPreview({
  title,
  body,
  cta,
}: {
  title: string;
  body: string;
  cta: string;
}) {
  return (
    <div className="rounded-2xl border border-line bg-surface-soft p-3">
      <p className="font-secondary text-[10px] font-bold uppercase tracking-wider text-muted">
        In-app inbox
      </p>
      <div className="mt-2 flex items-start gap-3 rounded-xl bg-white p-3 shadow-sm">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-primary-soft text-rajlo-red">
          <Icon name="inbox" className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-extrabold">{title}</p>
          <p className="mt-0.5 line-clamp-3 text-xs text-muted">{body}</p>
          {cta && (
            <p className="mt-1 inline-block rounded-full bg-primary-soft px-2.5 py-0.5 text-[10px] font-extrabold text-rajlo-red">
              {cta}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function HistoryRowItem({ row }: { row: HistoryRow }) {
  const totals = (["email", "push", "inbox"] as const).reduce(
    (acc, c) => {
      const r = row.results?.[c];
      if (!r) return acc;
      acc.sent += r.sent;
      acc.failed += r.failed;
      return acc;
    },
    { sent: 0, failed: 0 },
  );
  return (
    <li className="rounded-xl border border-line bg-surface-soft p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-extrabold">{row.subject}</p>
          <p className="mt-0.5 truncate text-[11px] text-muted">
            {audienceLabel(row)} · {row.audience_size} recipient
            {row.audience_size === 1 ? "" : "s"}
          </p>
        </div>
        <div className="flex shrink-0 gap-1">
          {row.channels.map((c) => (
            <span
              key={c}
              className="rounded-full bg-rajlo-black px-2 py-0.5 text-[9px] font-extrabold uppercase tracking-wider text-white"
            >
              {c}
            </span>
          ))}
        </div>
      </div>
      <p className="mt-2 line-clamp-2 text-[11px] text-muted">{row.body}</p>
      <div className="mt-2 flex items-center justify-between text-[10px]">
        <span className="font-bold text-emerald-700">
          {totals.sent} delivered
        </span>
        {totals.failed > 0 && (
          <span className="font-bold text-rajlo-red">
            {totals.failed} failed
          </span>
        )}
        <span className="text-muted">
          {row.actor_label ?? "Admin"} · {ago(row.created_at)}
        </span>
      </div>
    </li>
  );
}

function audienceLabel(row: HistoryRow): string {
  switch (row.audience_kind) {
    case "role:rider":
      return "All riders";
    case "role:driver": {
      const filter = (row.audience_meta?.filter as string | undefined) ?? "all";
      return filter === "online"
        ? "Online drivers"
        : filter === "active"
          ? "Active drivers"
          : "All drivers";
    }
    case "role:admin":
      return "All admins";
    case "all":
      return "Everyone";
    case "user": {
      const label = row.audience_meta?.label as string | undefined;
      return label ?? "Single user";
    }
    case "list":
      return "Specific list";
    default:
      return row.audience_kind;
  }
}

/* ─────────── User picker ─────────── */

function UserPicker({
  selected,
  onSelect,
}: {
  selected: UserSearchRow | null;
  onSelect: (u: UserSearchRow | null) => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<UserSearchRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      return;
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(
          `/api/admin/users?q=${encodeURIComponent(query.trim())}&limit=20`,
        );
        if (!res.ok) throw new Error();
        const json = (await res.json()) as { users: UserSearchRow[] };
        setResults(json.users ?? []);
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 250);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]);

  if (selected) {
    return (
      <div className="flex items-center gap-3 rounded-xl border border-rajlo-red/30 bg-primary-soft px-3 py-2.5">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-rajlo-red text-white">
          <Icon name="user" className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-extrabold">{selected.fullName}</p>
          <p className="truncate text-xs text-muted">
            {selected.email ?? "no email"} · {selected.role}
            {selected.driverExternalId && ` · ${selected.driverExternalId}`}
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            onSelect(null);
            setQuery("");
          }}
          className="grid h-7 w-7 place-items-center rounded-lg text-muted hover:bg-white hover:text-rajlo-red"
        >
          <Icon name="x" className="h-3.5 w-3.5" />
        </button>
      </div>
    );
  }

  return (
    <div className="relative">
      <label className="block">
        <p className="font-secondary text-[10px] font-bold uppercase tracking-wider text-muted">
          Search a user
        </p>
        <div className="relative mt-1">
          <Icon
            name="search"
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted"
          />
          <input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            placeholder="Name, email, plate, or driver ID"
            className="w-full rounded-xl border border-line bg-surface-soft py-2.5 pl-9 pr-4 text-sm font-semibold focus:border-rajlo-red focus:outline-none"
          />
        </div>
      </label>
      {open && query.trim() && (
        <div className="absolute left-0 right-0 top-full z-20 mt-1 max-h-72 overflow-auto rounded-xl border border-line bg-surface shadow-lg">
          {loading ? (
            <div className="space-y-1 p-2">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-12 w-full" rounded="lg" />
              ))}
            </div>
          ) : results.length === 0 ? (
            <p className="p-4 text-center text-xs text-muted">No matches</p>
          ) : (
            <ul className="divide-y divide-line">
              {results.map((u) => (
                <li key={u.id}>
                  <button
                    type="button"
                    onClick={() => {
                      onSelect(u);
                      setOpen(false);
                    }}
                    className="flex w-full items-center gap-3 px-3 py-2 text-left transition-colors hover:bg-surface-soft"
                  >
                    <span
                      className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg text-[10px] font-extrabold uppercase text-white ${
                        u.role === "driver"
                          ? "bg-rajlo-red"
                          : u.role === "admin"
                            ? "bg-rajlo-black"
                            : "bg-emerald-600"
                      }`}
                    >
                      {u.role[0]}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-bold">{u.fullName}</p>
                      <p className="truncate text-[11px] text-muted">
                        {u.email ?? "no email"}
                        {u.driverExternalId && ` · ${u.driverExternalId}`}
                      </p>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
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
