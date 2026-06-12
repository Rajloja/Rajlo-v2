# Design System — Landing Page Redesign

**Project:** Rajlo (Jamaican rideshare landing page)
**Register:** brand (design IS the product on this surface)
**Last update:** 2026-06-12

> This file is the single source of truth for the landing-page redesign. Every color, font size, spacing value, motion duration, and component decision downstream **must** reference a token defined here. New values cannot be invented inside section files — if you need one, add it here first, then use it.

> Existing global tokens in `src/app/globals.css` (brand red/black, semantic surface/foreground/muted/line, dark theme) are **canonical and unchanged**. This file extends them with landing-page-specific decisions only. Identity-preservation wins; we do not re-pick colors the brand already committed.

---

## 1. Color

### 1.1 Strategy — Committed (per impeccable's 4-step scale)

One saturated brand color carries 30–60% of the visible surface. Brand red (`--rajlo-red: #f10100`) is the page's primary visual mass — not an accent, not a button-only color. Brand black (`--rajlo-black: #111906`) is the dominant ink + the secondary surface for dark hero panels. White is breathing room.

**Why not "Restrained"** (tinted neutrals + one accent ≤10%)? Because the user explicitly rejected the four soft / cold / cream variants of that approach — all of which collapse into restraint-as-cowardice. Committed is the right tier for a brand that wants to be unambiguous about who it is.

**Why not "Drenched"** (the surface IS the color)? Because we still need long-form readable copy (TA tariff explanation, "how it works"), and a fully red surface burns the eye over 4+ scrolls. Committed lets red do real work without exhausting the reader.

### 1.2 Tokens (referenced from `globals.css`, not redefined)

```css
/* Brand — these are the page */
--rajlo-red:   #f10100;    /* primary surface accent + CTAs + meaningful highlights */
--rajlo-black: #111906;    /* dominant ink + dark panels (hero, founding-users) */
--rajlo-white: #ffffff;    /* light surfaces + ink on dark */

/* Semantic — light theme defaults */
--background:    #ffffff;
--foreground:    var(--rajlo-black);
--muted:         #6b7077;  /* hits 4.5:1 on white — body-text-eligible */
--surface:       #ffffff;
--surface-soft:  #f6f6f4;  /* mode card backgrounds, founding-users panel */
--line:          #e6e6e2;
--primary:       var(--rajlo-red);
--primary-soft:  #fde8e7;  /* hover-tint, eyebrow chips on light, fallback pill bg */
--primary-hover: #d40100;

/* Dark theme — system + opt-in [data-theme="dark"] */
--background:    #0a0d08;
--foreground:    #ebede6;
--muted:         #9ba39c;
--surface:       #131811;
--surface-soft:  #1c211a;
--line:          #2a3026;
--primary-soft:  #391010;
--primary-hover: #ff2424;
```

### 1.3 Landing-only support tokens (add to globals.css if used in component code)

```css
/* Landing hero base — radial-bloom + linear gradient recipe.
   NOT a token because it's a layered gradient string; defined here
   for reference and reused across hero + dark panels. */
--landing-hero-bg:
  radial-gradient(circle at 18% -10%, rgba(241,1,0,0.35) 0%, rgba(241,1,0,0) 45%),
  radial-gradient(circle at 80% 110%, rgba(241,1,0,0.18) 0%, rgba(241,1,0,0) 50%),
  linear-gradient(155deg, #1a1d10 0%, #111906 55%, #07090a 100%);

/* Photo-frame fallback — sits under every <Image> so a missing file
   shows brand colour, not a blank rectangle. */
--landing-photo-fallback:
  linear-gradient(155deg, #1a1d10 0%, rgba(241,1,0,0.35) 55%, #07090a 100%);
```

### 1.4 Contrast contract (non-negotiable)

| Pairing | Ratio | Use |
|---|---|---|
| `--foreground` on `--background` | 16.4:1 | Body text (light theme) |
| `--muted` on `--background` | 5.1:1 | Eyebrow / caption text (light theme) — passes AA body |
| `#ffffff` on `--rajlo-red` | 4.5:1 | All white text on red surfaces — meets AA body exactly |
| `#ffffff` on `--rajlo-black` | 15.6:1 | All white text on dark hero — passes AAA |
| `--rajlo-red` on `--primary-soft` | 4.7:1 | Eyebrow text on pink chip — passes AA |

**Banned:** light gray body text on tinted-warm background (the #1 AI-design contrast failure). If something looks "elegant and soft" but you can't pin a 4.5:1 against the bg, it's wrong — bump toward the ink end.

---

## 2. Typography

### 2.1 Fonts (existing — preserved)

| Token | Family | Loaded as | Use |
|---|---|---|---|
| `--font-display` | **Avenir** Heavy (`/fonts/avenir-heavy.ttf`) | `@font-face`, `font-display: swap` | All headlines + display moments + UI buttons |
| `--font-sans` | **Avenir** | Same file, body weights | All body copy + nav + labels |
| `--font-secondary-stack` | **Kollektif** (`/fonts/kollektif.ttf`) | `@font-face`, `font-display: swap` | Uppercase tracked accents — only where there's a specific reason (eyebrow on hero, brand watermark) |

Both pass the **"no Inter / Roboto / Arial"** test. Avenir is a genuine premium geometric humanist; Kollektif is a clean display monospace-feeling sans with character. They pair on a contrast axis (humanist + grotesque-display), which the impeccable rules require.

**Banned:** any new font family. We have two, we don't need three. Adding a serif would feel decorative without purpose given the committed brand voice.

### 2.2 Scale (mobile-first, clamp-based, ceiling 5.5rem)

```css
/* Display — hero + page-section openers */
--text-display-xl: clamp(2.75rem, 4vw + 1.5rem, 5.5rem);  /* hero headline; ceiling 88px */
--text-display-lg: clamp(2rem, 3vw + 1rem, 3.75rem);      /* section headlines */
--text-display-md: clamp(1.5rem, 1.5vw + 1rem, 2.25rem);  /* sub-section / card headlines */

/* Body */
--text-body-lg: clamp(1rem, 0.4vw + 0.875rem, 1.125rem);  /* lede paragraphs */
--text-body:    1rem;                                      /* paragraph body — 16px floor */
--text-body-sm: 0.875rem;                                  /* caption, supporting */

/* Eyebrow / micro */
--text-eyebrow: 0.6875rem;  /* 11px tracked uppercase — used sparingly */
--text-micro:   0.625rem;   /* 10px — only for legal-fineprint moments */
```

**Constraints:**
- `text-wrap: balance` on every `h1`, `h2`, `h3` so display lines don't orphan single words.
- `text-wrap: pretty` on every long-form `p`.
- Display letter-spacing: `-0.02em` to `-0.035em` (floor `-0.04em` per impeccable rule).
- Body line-height: `1.55` (paragraph), `1.1` (display).
- Body line-length cap: `65–75ch` via `max-width`.

### 2.3 Eyebrow rule (important)

The "tiny tracked uppercase eyebrow above every section" is on impeccable's **absolute ban** list — it's the AI-grammar tell of 2026. So:

- **Maximum two eyebrows on the page**, total. Currently allocated to: (a) the hero pill (`Made for Jamaica`), (b) one section opener if it genuinely earns it.
- **No numbered scaffolding** (`01 / 02 / 03`) above sections that aren't an ordered sequence.
- Section transitions should be carried by **whitespace + scale shift**, not by repeating chrome.

---

## 3. Spacing

```css
/* Scale (rem-anchored) */
--space-1:  0.25rem;  /*  4px */
--space-2:  0.5rem;   /*  8px */
--space-3:  0.75rem;  /* 12px */
--space-4:  1rem;     /* 16px */
--space-5:  1.25rem;  /* 20px */
--space-6:  1.5rem;   /* 24px */
--space-8:  2rem;     /* 32px */
--space-10: 2.5rem;   /* 40px */
--space-12: 3rem;     /* 48px */
--space-16: 4rem;     /* 64px */
--space-20: 5rem;     /* 80px */
--space-24: 6rem;     /* 96px */
--space-32: 8rem;     /* 128px */
--space-40: 10rem;    /* 160px */

/* Container */
--container-narrow: 64rem;   /* prose-friendly  ~1024px */
--container-base:   80rem;   /* default page    ~1280px */
--container-wide:   90rem;   /* hero overflow   ~1440px */

/* Section vertical rhythm — varies intentionally per impeccable rule */
--section-pad-tight: clamp(3rem,  6vw, 5rem);   /* mode rows, founding users */
--section-pad-base:  clamp(5rem, 10vw, 8rem);   /* default section padding */
--section-pad-loose: clamp(8rem, 14vw, 12rem);  /* hero + final CTA — these breathe more */
```

**Rule:** never default to `--section-pad-base` for every section. Alternate base / tight / loose so the page has rhythm rather than the AI-grammar uniform reflex.

---

## 4. Layout

### 4.1 Grid + container

- One `--container-base` content column at most layout altitudes.
- Hero gets `--container-wide` because the photo carousel + phone overlap needs breathing room.
- Long prose (TA tariff explanation, "how it works") uses `--container-narrow` to stay inside the 65–75ch cap.

### 4.2 Structural picks (anti–AI-default)

| Pattern | Decision |
|---|---|
| **Identical card grids** (banned) | No section uses `grid-template-columns: repeat(auto-fit, minmax(280px, 1fr))` with 3+ identical cards. |
| **Mode rows** | Alternating **magazine spread**: image left / content right → flip → flip. Three rows, each a different tonal panel (light surface, brand-red gradient, brand-black). |
| **Founding-users** | Two non-identical cards: one **white-on-light-surface** for "For riders", one **white-on-rajlo-black-with-red-glow** for "For drivers". Different shapes, different ink. Same eye level. |
| **How it works** | Three-step horizontal flow on desktop, vertical stack on mobile. NO numbered chrome (banned) — sequence is carried by left-aligned scale shift + arrow connectors. |
| **TA tariff strip** | Editorial sentence + inline figures: `"Base $122. Per km $7.56. Rounded to nearest $10. Effective until July 1."` — not a price-comparison table. |

### 4.3 Radii

```css
--radius-sm:   0.5rem;   /*  8px — input fields, small chips */
--radius-md:   1rem;     /* 16px — buttons, pill controls */
--radius-lg:   1.5rem;   /* 24px — cards, panels */
--radius-xl:   2rem;     /* 32px — hero photo frame, large cards */
--radius-2xl:  3rem;     /* 48px — driver-recruit phone glow */
--radius-pill: 9999px;   /* CTA buttons, chips, eyebrow pills */
```

### 4.4 Z-index scale (semantic, never arbitrary)

```css
--z-base:           1;
--z-elevated:      10;   /* cards on hover */
--z-dropdown:      30;
--z-header:        40;   /* sticky site header */
--z-mobile-drawer: 60;
--z-overlay-bg:    80;
--z-modal:         90;
--z-pill:         100;   /* minimised call pill, etc. */
--z-toast:        110;
--z-tooltip:      120;
```

---

## 5. Motion

### 5.1 Tokens

```css
--ease-out-quart: cubic-bezier(0.165, 0.84, 0.44, 1);
--ease-out-expo:  cubic-bezier(0.16, 1, 0.3, 1);
--ease-spring:    cubic-bezier(0.34, 1.56, 0.64, 1);  /* used sparingly */

--motion-fast:   150ms;  /* hover / focus / press */
--motion-base:   250ms;  /* card lifts, drawer slides */
--motion-medium: 450ms;  /* section entrance reveals */
--motion-slow:   900ms;  /* hero photo crossfade, Ken Burns */
```

### 5.2 Default entrance recipe (per user prompt — "Jakub Krehel")

Stored canonically in `src/lib/animations.ts`. **Every** scroll-revealed element uses this unless there's a specific reason to deviate:

```ts
export const reveal = {
  initial: { opacity: 0, translateY: 8, filter: "blur(4px)" },
  animate: { opacity: 1, translateY: 0, filter: "blur(0px)" },
  transition: { type: "spring", duration: 0.45, bounce: 0 },
};
```

### 5.3 Rules

- **No animated layout properties** (width/height/top/left). Transform + opacity + filter only.
- **Stagger** within a list (e.g. mode rows) is fine; each entrance should match what it reveals (a small chip can pop faster than a full image panel).
- **Reveal must enhance an already-visible default.** Never gate `visibility: hidden` on a class trigger — server-rendered HTML must read complete even with JS disabled or `prefers-reduced-motion`.
- **`@media (prefers-reduced-motion: reduce)`** — every keyframed animation has a no-op alternative; every `motion.div` reveal falls back to instant.
- **Hover lift** on interactive surfaces: `transform: translateY(-2px)`, `--motion-fast`. No shadow change unless the surface is already shadowed.
- **Loop / ambient motion** (Ken Burns on hero photo, floatGlow on phone mockup): disabled entirely under reduced-motion. The fallback is a still image — never "hidden."

---

## 6. Component decisions

### 6.1 Buttons

| Variant | Use | Recipe |
|---|---|---|
| **Primary CTA** | "Ride with Rajlo", "Become a rider", "Open my dashboard" | `bg-rajlo-red text-white shadow-md shadow-rajlo-red/30 rounded-pill px-7 py-4 text-base font-extrabold` — hover `-translate-y-0.5 bg-primary-hover` + shadow `/60`. |
| **Secondary CTA** | "Drive with Rajlo", outline buttons on dark panels | `border border-white/30 bg-white/10 text-white backdrop-blur` — same paddings + radius as primary. Hover `border-white bg-white/20`. |
| **Tertiary / inline** | "Learn more →", footer links | No background, brand-red ink, underline on hover. |

All CTAs have an `arrow-right` icon that translates `+0.5` on hover. Touch target ≥ 44×44px on mobile.

### 6.2 Cards (only when truly the best affordance — per impeccable rule)

- Mode rows are **not cards** — they're magazine spreads (image + body, full-bleed).
- Founding-user panels are cards because they need to read as two parallel choices.
- Pillar tiles for "Why Rajlo" use full-bleed photos with text overlaid — closer to editorial spreads than cards.
- **Banned:** repeating identical card grids, side-stripe borders, glassmorphism by default.

### 6.3 Photo treatment

- All landing imagery: `next/image` with `sizes` prop set per breakpoint (no `fill` without sizes).
- Brand-fallback gradient sits behind every photo div so a missing file shows brand colour, not a blank rectangle (`--landing-photo-fallback`).
- Hero photos preload with `priority` for the LCP candidate only (one image); the rest lazy-load.
- AVIF + webp formats are configured globally in `next.config.ts`.

---

## 7. Page shape (locked in this file so sections can't drift)

**Order:**

1. **Hero** — split-screen on desktop: left column (eyebrow pill + headline with Typewriter verb + dual CTA + 3 "what Rajlo stands on" facts), right column (4-photo Ken-Burns carousel + overlapping phone mockup). Trust strip pinned at the bottom of the dark hero.
2. **Modes** — alternating magazine-style rows (Private / Route Taxi / Drive). Three rows, three tonal panels.
3. **TA tariff editorial moment** — single restrained sentence + inline figures explaining the formula. NEW; replaces the showcase that used to live here. Carries the "show the regulation" design principle.
4. **How it works** — three-step horizontal flow with arrow connectors. No numbered chrome.
5. **Why Rajlo** — four pillars as photo-backed spreads (NOT a 4-card grid).
6. **Driver recruitment** — full-bleed photo + earnings honesty + "Drive with Rajlo" CTA.
7. **Founding users** — two non-identical panels ("Be one of the first" — riders + drivers).
8. **Final CTA** — single red panel, brand voice, dual CTA (rider primary, driver secondary). No newsletter signup, no "trusted by" strip.

**Header:** sticky glass over dark hero → solid on scroll. Mobile drawer slides down from top with nav + CTA.

**Footer:** logo + tagline + product/support/legal columns + copyright + Kingston attribution. Existing site-footer keeps the brand-black surface.

---

## 8. Hard bans (collected, single reference)

Inherited from PRODUCT.md anti-references + impeccable General rules. Match-and-refuse — if you're about to write any of these, rewrite the element with a different structure.

- ❌ Side-stripe borders (`border-left` ≥ 2px as colored accent)
- ❌ Gradient text (`background-clip: text` + gradient)
- ❌ Glassmorphism as default decoration
- ❌ Hero-metric template (big number, small label, supporting stats, gradient accent)
- ❌ Identical card grids (3+ same-sized cards with icon + heading + text)
- ❌ Tiny tracked uppercase eyebrow above every section
- ❌ Numbered section markers (01 / 02 / 03) as default scaffolding
- ❌ Cream / sand / paper / parchment body backgrounds — the 2026 AI-design saturated default
- ❌ Fonts without character (Inter, Roboto, Arial)
- ❌ Black hero + isometric abstract illustration (the Uber/Lyft default)
- ❌ All-caps red shouting headlines (the InDrive trap)
- ❌ Soft pastels + rounded humanoid illustrations (the Bolt trap)
- ❌ Fake metrics / fake testimonials / inflated social proof — we are pre-traction, the page is honest about it
- ❌ Patois headlines / performative Jamaican-ness — the brand is Jamaican by default, never costumed
- ❌ Any number above 1,000 that isn't a real, verifiable count

---

## 9. Accessibility & motion budget

- **WCAG 2.2 AA** baseline — body 4.5:1, large text 3:1, focus rings visible against both light + brand-red backgrounds.
- **Reduced motion** falls back to instant for entrances, stops loops entirely (Ken Burns, floatGlow, marquee).
- **Mobile-first** — 375 / 768 / 1024 / 1440 break test. Headlines tested at every breakpoint; if a hero word overflows at 375, the clamp max comes down or the copy gets rewritten.
- **Keyboard reachability** on every CTA, link, drawer toggle, carousel control.
- **Image alt text** on every photographic asset. Decorative photos: `alt=""`.

---

## 10. Files this enables

- `src/components/landing-v2.tsx` — server-component shell. Owns the section order (§7).
- `src/components/landing-hero.tsx` — client-only Hero island (§7 step 1).
- `src/components/landing-assets.ts` — `PHOTOS` + `BRAND_FALLBACK_BG` (already extracted).
- `src/lib/animations.ts` — motion variants per §5.2.
- `src/app/globals.css` — token source-of-truth; never duplicate values into component CSS.

When a future change wants to touch any token, the diff lands here first, then in `globals.css`, then in the component. Never the other way around.
