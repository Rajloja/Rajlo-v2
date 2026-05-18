/**
 * Rajlo email renderer — brand-perfect transactional email layout.
 *
 * Produces a single self-contained HTML string with inline CSS and a
 * table-based skeleton so it renders the same way in Gmail, Apple Mail,
 * Outlook desktop/web, Yahoo, and the rest of the long tail.
 *
 * Visual system (matches Rajlo brand guidelines):
 *   - Red       #f10100   primary CTA + accent
 *   - Black     #111906   title text + dark hero band
 *   - White     #ffffff   card background
 *   - Surface   #f6f6f4   page wash + subtle cards
 *   - Line      #e6e6e2   hairline dividers
 *   - PrimSoft  #fde8e7   highlighted info chips
 *
 * Custom Avenir + Kollektif don't load in email clients, so we fall back
 * to the standard "Helvetica Neue, Helvetica, Arial" stack which gives
 * the closest geometric weight on every platform.
 *
 * The hero band carries the Rajlo wordmark as inline SVG so it scales
 * cleanly on retina without any hosted-image dependency.
 */

const BRAND = {
  red: "#f10100",
  black: "#111906",
  white: "#ffffff",
  surface: "#f6f6f4",
  line: "#e6e6e2",
  primarySoft: "#fde8e7",
  textMuted: "#6b7077",
  textBody: "#3f4640",
  textTitle: "#111906",
  // Brand-red header band — the same colour as the in-app status
  // bar + primary CTA. `headerEnd` is a slightly darker red so the
  // gradient still reads as "header" instead of a flat colour block.
  headerStart: "#f10100",
  headerEnd: "#c00d0c",
  footerBg: "#0d1107",
} as const;

/**
 * Public origin every email link is built off. Required in production —
 * falling back to localhost would silently ship every magic link,
 * password reset, and ride receipt with a `http://localhost:3000`
 * URL that no recipient can reach.
 *
 * Resolution strategy:
 *   - If `NEXT_PUBLIC_APP_URL` is set → use it.
 *   - Else if we're INSIDE `next build` (Next sets
 *     `NEXT_PHASE=phase-production-build`) → fall through to the
 *     localhost placeholder. The build never actually sends email,
 *     so the placeholder is harmless and lets local prod builds
 *     succeed without forcing the developer to set the env var.
 *   - Else if NODE_ENV is production (i.e. real runtime on a
 *     deployment) → throw loudly. This is the case that matters:
 *     a deployed server without the env var would mint broken
 *     emails, so failing fast is the right move.
 *   - Else (dev) → localhost. Standard dev experience.
 */
const BUILD_PHASE = "phase-production-build";

function resolveAppUrl(): string {
  const fromEnv = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (fromEnv) return fromEnv.replace(/\/$/, "");
  if (
    process.env.NODE_ENV === "production" &&
    process.env.NEXT_PHASE !== BUILD_PHASE
  ) {
    throw new Error(
      "NEXT_PUBLIC_APP_URL is required in production. " +
        "Set it on the deployment (Vercel: Project Settings → Environment Variables) " +
        "to the public origin of the app, e.g. https://rajlo.com.",
    );
  }
  return "http://localhost:3000";
}

const APP_URL = resolveAppUrl();

/** Sections you can compose into an email body. Each renders to HTML. */
export type EmailSection =
  | { type: "intro"; text: string }
  | { type: "paragraph"; text: string }
  | { type: "card"; title?: string; rows: CardRow[] }
  | {
      type: "highlight";
      tone?: "positive" | "warning" | "danger" | "neutral";
      eyebrow: string;
      text: string;
    }
  | { type: "divider" }
  | { type: "cta"; href: string; label: string }
  | { type: "linkRow"; href: string; label: string }
  | { type: "code"; value: string; description?: string }
  | { type: "footnote"; text: string };

export type CardRow = {
  label: string;
  value: string;
  /** Render value in a heavier weight. Use for the headline number on a row (fare, ETA). */
  emphasize?: boolean;
};

export type RenderEmailArgs = {
  /** Hidden 1px preview text shown by Gmail/Apple in the inbox list. */
  preheader: string;
  /** Small uppercase tag above the title (e.g. "RIDE REQUESTED"). */
  eyebrow?: string;
  /** Main email title. */
  title: string;
  sections: EmailSection[];
};

export function renderEmail({
  preheader,
  eyebrow,
  title,
  sections,
}: RenderEmailArgs): string {
  const body = sections.map(renderSection).join("\n");
  const year = new Date().getFullYear();

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="x-apple-disable-message-reformatting" />
  <meta http-equiv="X-UA-Compatible" content="IE=edge" />
  <title>${esc(title)}</title>
  <style>
    /* Mobile + dark-mode overrides (clients that support <style>). */
    @media only screen and (max-width: 620px) {
      /* Title block stays tight to the body so the gap between
         the headline and the lede paragraph doesn't blow out on
         narrow screens. Body block keeps comfortable bottom
         padding before the footer. */
      .rj-card-title { padding: 26px 22px 4px 22px !important; }
      .rj-card-body  { padding: 6px 22px 22px 22px !important; }
      /* Legacy class kept so any caller still using rj-card
         doesn't lose its mobile overrides. */
      .rj-card { padding: 22px 22px !important; }
      .rj-hero { padding: 28px 22px !important; }
      .rj-foot { padding: 22px !important; }
      .rj-title { font-size: 26px !important; line-height: 1.18 !important; }
      .rj-cta { display: block !important; width: 100% !important; box-sizing: border-box !important; text-align: center !important; }
    }
    @media (prefers-color-scheme: dark) {
      /* Most clients (Gmail, Outlook web) ignore this; Apple Mail honours it.
         We keep our own colours regardless so the brand hero stays consistent —
         only soften the page wash slightly. */
      .rj-page { background: #0a0c08 !important; }
    }
  </style>
</head>
<body style="margin:0;padding:0;background:${BRAND.surface};">
  <span style="display:none!important;visibility:hidden;opacity:0;color:transparent;height:0;width:0;font-size:1px;line-height:1px;mso-hide:all;">${esc(preheader)}</span>
  <table class="rj-page" role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${BRAND.surface};margin:0;padding:0;">
    <tr>
      <td align="center" style="padding:32px 16px;">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;background:${BRAND.white};border-radius:24px;overflow:hidden;border:1px solid ${BRAND.line};font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">

          <!-- Hero / brand header -->
          <tr>
            <td class="rj-hero" align="left" style="background:linear-gradient(135deg,${BRAND.headerStart} 0%,${BRAND.headerEnd} 100%);background-color:${BRAND.headerStart};padding:32px 32px 28px 32px;color:${BRAND.white};">
              ${renderHeaderMark()}
            </td>
          </tr>

          <!-- Eyebrow + Title block -->
          <tr>
            <td class="rj-card-title" style="padding:32px 32px 4px 32px;">
              ${
                eyebrow
                  ? `<div style="font-size:11px;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;color:${BRAND.red};margin:0 0 12px 0;">${esc(eyebrow)}</div>`
                  : ""
              }
              <h1 class="rj-title" style="margin:0;font-size:30px;line-height:1.18;letter-spacing:-0.02em;font-weight:800;color:${BRAND.textTitle};font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">${esc(title)}</h1>
            </td>
          </tr>

          <!-- Body sections -->
          <tr>
            <td class="rj-card-body" style="padding:8px 32px 28px 32px;">
              ${body}
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td class="rj-foot" style="background:${BRAND.footerBg};padding:26px 32px;color:#cbd5d0;font-size:12px;line-height:1.7;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td>
                    <div style="font-weight:800;font-size:15px;color:${BRAND.white};letter-spacing:-0.01em;">Rajlo</div>
                    <div style="color:#9ba49d;margin-top:2px;font-size:12px;">Jamaica's red-plate rideshare network. Let's go!</div>
                  </td>
                </tr>
                <tr>
                  <td style="padding-top:14px;">
                    <a href="${APP_URL}/rider/help" style="color:#cbd5d0;text-decoration:none;font-weight:600;">Help</a>
                    <span style="color:#3a3f37;margin:0 8px;">·</span>
                    <a href="${APP_URL}/rider/settings" style="color:#cbd5d0;text-decoration:none;font-weight:600;">Settings</a>
                    <span style="color:#3a3f37;margin:0 8px;">·</span>
                    <a href="${APP_URL}/legal/privacy-policy" style="color:#cbd5d0;text-decoration:none;font-weight:600;">Privacy</a>
                    <span style="color:#3a3f37;margin:0 8px;">·</span>
                    <a href="${APP_URL}/legal/terms-of-service" style="color:#cbd5d0;text-decoration:none;font-weight:600;">Terms</a>
                  </td>
                </tr>
                <tr>
                  <td style="padding-top:18px;color:#6c736a;font-size:11px;">
                    © ${year} Rajlo Limited · Kingston, Jamaica · You're receiving this because you have a Rajlo account.
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
        <div style="max-width:600px;width:100%;color:${BRAND.textMuted};font-size:11px;line-height:1.6;padding:14px 8px 0 8px;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
          Trouble seeing this email? Open it in your browser, or reply and our support team will follow up.
        </div>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

/* ──────────────────────────────────────────────────────────────────────
   Section renderers
   ────────────────────────────────────────────────────────────────────── */

function renderSection(s: EmailSection): string {
  switch (s.type) {
    case "intro":
      return `<p style="margin:0 0 16px 0;font-size:16px;line-height:1.6;color:${BRAND.textBody};">${linkify(s.text)}</p>`;

    case "paragraph":
      return `<p style="margin:0 0 14px 0;font-size:15px;line-height:1.65;color:${BRAND.textBody};">${linkify(s.text)}</p>`;

    case "card":
      return renderCard(s.rows, s.title);

    case "highlight":
      return renderHighlight(s);

    case "divider":
      return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:18px 0;"><tr><td style="border-top:1px solid ${BRAND.line};font-size:0;line-height:0;height:1px;">&nbsp;</td></tr></table>`;

    case "cta":
      return renderCta(s.href, s.label);

    case "linkRow":
      return `<p style="margin:8px 0 14px 0;font-size:14px;line-height:1.5;color:${BRAND.textBody};">If the button doesn't work, open this link: <a href="${attr(s.href)}" style="color:${BRAND.red};font-weight:600;text-decoration:none;word-break:break-all;">${esc(s.label)}</a></p>`;

    case "code":
      return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 16px 0;">
        <tr>
          <td align="center" style="background:${BRAND.surface};border:1px solid ${BRAND.line};border-radius:14px;padding:22px 16px;">
            <div style="font-family:'SFMono-Regular',Menlo,Consolas,monospace;font-size:30px;letter-spacing:0.32em;font-weight:700;color:${BRAND.textTitle};">${esc(s.value)}</div>
            ${s.description ? `<div style="margin-top:8px;font-size:12px;color:${BRAND.textMuted};line-height:1.5;">${esc(s.description)}</div>` : ""}
          </td>
        </tr>
      </table>`;

    case "footnote":
      return `<p style="margin:18px 0 0 0;font-size:12px;line-height:1.6;color:${BRAND.textMuted};">${linkify(s.text)}</p>`;
  }
}

function renderCard(rows: CardRow[], title?: string): string {
  const head = title
    ? `<tr><td style="padding:0 0 12px 0;font-size:11px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:${BRAND.textMuted};">${esc(title)}</td></tr>`
    : "";

  const body = rows
    .map(
      (r, i) => `
        <tr>
          <td style="padding:${i === 0 ? "0" : "10px 0 0 0"};">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td style="font-size:12px;font-weight:600;color:${BRAND.textMuted};text-transform:uppercase;letter-spacing:0.08em;width:38%;vertical-align:top;padding-right:12px;">${esc(r.label)}</td>
                <td style="font-size:${r.emphasize ? "18px" : "15px"};font-weight:${r.emphasize ? "800" : "600"};color:${BRAND.textTitle};line-height:1.45;text-align:right;">${esc(r.value)}</td>
              </tr>
            </table>
          </td>
        </tr>`,
    )
    .join("");

  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${BRAND.surface};border:1px solid ${BRAND.line};border-radius:18px;margin:6px 0 16px 0;">
    <tr>
      <td style="padding:20px 22px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
          ${head}
          ${body}
        </table>
      </td>
    </tr>
  </table>`;
}

function renderHighlight(s: {
  tone?: "positive" | "warning" | "danger" | "neutral";
  eyebrow: string;
  text: string;
}): string {
  const tone = s.tone ?? "neutral";
  const palette = {
    positive: { bg: "#ecfdf5", border: "#a7f3d0", eyebrow: "#047857", text: "#064e3b" },
    warning: { bg: "#fef7ed", border: "#fed7aa", eyebrow: "#9a3412", text: "#7c2d12" },
    danger: { bg: BRAND.primarySoft, border: BRAND.red, eyebrow: BRAND.red, text: BRAND.textTitle },
    neutral: { bg: BRAND.surface, border: BRAND.line, eyebrow: BRAND.textMuted, text: BRAND.textTitle },
  }[tone];

  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${palette.bg};border:1px solid ${palette.border};border-radius:14px;margin:6px 0 16px 0;">
    <tr>
      <td style="padding:14px 18px;">
        <div style="font-size:11px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:${palette.eyebrow};margin:0 0 6px 0;">${esc(s.eyebrow)}</div>
        <div style="font-size:14px;line-height:1.55;color:${palette.text};">${linkify(s.text)}</div>
      </td>
    </tr>
  </table>`;
}

function renderCta(href: string, label: string): string {
  // VML rectangle gives Outlook desktop a real button shape. Other clients
  // ignore the comment and render the styled <a> below.
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:20px 0 6px 0;">
    <tr>
      <td>
        <!--[if mso]>
        <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word"
          href="${attr(href)}" arcsize="50%" stroke="f" fillcolor="${BRAND.red}" style="height:52px;v-text-anchor:middle;width:280px;">
          <w:anchorlock/>
          <center style="color:#ffffff;font-family:Helvetica,Arial,sans-serif;font-size:15px;font-weight:700;">${esc(label)}</center>
        </v:roundrect>
        <![endif]-->
        <!--[if !mso]><!-- -->
        <a class="rj-cta" href="${attr(href)}" style="display:inline-block;background:${BRAND.red};color:${BRAND.white};text-decoration:none;font-weight:700;font-size:15px;letter-spacing:0.01em;padding:16px 30px;border-radius:999px;mso-padding-alt:0;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">${esc(label)} &nbsp;→</a>
        <!--<![endif]-->
      </td>
    </tr>
  </table>`;
}

/* ──────────────────────────────────────────────────────────────────────
   Brand mark — hosted PNG icon + styled text wordmark
   ──────────────────────────────────────────────────────────────────────

   Why not inline SVG: Gmail's HTML sanitizer strips <svg> tags entirely
   for security — the only thing that survived was the tagline text.
   Apple Mail renders inline SVG fine, but the email has to look right
   in Gmail too (it's the dominant inbox).

   Why this works in every client:
     - The brand square mark is a hosted PNG (`/icon.png`, served by
       Next.js from `app/icon.png`) — every email client renders <img>.
     - The "Rajlo" wordmark is plain styled text in spans, which is
       universal HTML so it works even when images are blocked.
     - Result: even with images-off, the recipient still sees a
       branded "Rajlo · Let's go!" header in the right colours.
   ────────────────────────────────────────────────────────────────────── */

// White wordmark served from our own /public folder. Generated from
// `Rajlo white.svg` via sharp at 600×303 with a transparent background
// (tightly cropped so it scales cleanly to email-header sizes).
// Swap the file in `public/` (or change the path here) to update
// every transactional email in one shot.
const EMAIL_LOGO_URL = `${APP_URL}/email-logo-white.png`;

function renderHeaderMark(): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0">
    <tr>
      <td style="vertical-align:middle;">
        <img
          src="${EMAIL_LOGO_URL}"
          height="52"
          alt="Rajlo · Let's go!"
          style="display:block;border:0;outline:none;text-decoration:none;-ms-interpolation-mode:bicubic;height:52px;width:auto;max-width:220px;"
        />
      </td>
    </tr>
  </table>`;
}

/* ──────────────────────────────────────────────────────────────────────
   Helpers
   ────────────────────────────────────────────────────────────────────── */

export function esc(s: string): string {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function attr(s: string): string {
  return esc(s);
}

/** Convert plain-text URLs to brand-coloured anchors. Used inside body copy. */
function linkify(text: string): string {
  // Escape everything first, THEN re-allow the one bit of inline
  // markup the templates use — <strong> for bold. It carries no
  // attributes (no injection surface) and this text is always
  // template-defined, never raw user input. Without this the literal
  // "<strong>" tags show as text in the email.
  const safe = esc(text)
    .replace(/&lt;strong&gt;/g, "<strong>")
    .replace(/&lt;\/strong&gt;/g, "</strong>");
  return safe.replace(/https?:\/\/[^\s<>"]+/g, (url) => {
    return `<a href="${url}" style="color:${BRAND.red};font-weight:600;text-decoration:none;">${url}</a>`;
  });
}

/** Build a plaintext fallback from a list of text snippets. Resend
 *  auto-degrades gracefully to text-only clients when this is provided. */
export function plaintext(parts: string[]): string {
  return parts
    .map((p) => p.trim())
    .filter(Boolean)
    .join("\n\n");
}

/** Public app URL — shared with templates so links route correctly across envs. */
export { APP_URL };
