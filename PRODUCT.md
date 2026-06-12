# Product

## Register

brand

## Users

**Primary — Jamaican commuters.** People who currently flag down route taxis at the curb, hail private taxis through informal networks, or share rides via WhatsApp. Mix of office workers in Kingston / Spanish Town / Mandeville corridors, students on the New Kingston ↔ Papine route, and travellers running to NMIA. Pain points they live with: cash-only is awkward (especially after dark), drivers haggle on price, the rider has no recourse if something goes wrong, and there's no single app that handles BOTH the door-to-door private ride AND the shared route-taxi run they take five days a week.

**Secondary — Jamaican drivers.** TA-licensed PPV drivers (red plate) looking for a platform that pays into a real Jamaican bank account, doesn't run on an inflated take-rate, and works for both kinds of trip they already do — private fares AND corridor route-taxi runs. They are the supply side of a two-sided market but the landing page treats them second; the dedicated `/driver-join` flow does the heavy lifting for that audience.

**Context of use.** A first-time visitor lands here from a Google search, an Instagram link, a WhatsApp forward, or a print/radio campaign. They're on a phone 80%+ of the time, often on flaky data, often glancing at the page in transit. The landing has roughly 10 seconds to make the multi-modal cashless story clear and put a single rider CTA in the thumb's reach.

## Product Purpose

Rajlo is the first dual-engine rideshare platform built specifically for Jamaica:

1. **Private ride (Mode A)** — door-to-door, metered, single rider or carpool.
2. **Route taxi (Mode B)** — TA-regulated corridor service priced exactly against the Transport Authority of Jamaica's published fare schedule.

Both modes run on a single JMD wallet — no cash exchanged between rider and driver, ever. Drivers are TA-licensed PPV operators, ID-verified, document-checked every six months. Payouts go to any Jamaican bank weekly. Fares are formula-anchored to the public TA tariff (currently $122 base + $7.56/km, flipping to $132 + $8.64/km on July 1), so what the rider pays is what the law says.

The landing page exists to make a first-time rider trust the platform enough to install the app + top up the wallet. Success = wallet-funded rider, ready to book.

## Brand Personality

**Direct. Restrained. Committed.**

- **Direct.** Plain English. No "revolutionising mobility." No "the future of how Jamaica moves." Headlines state what the product is in the fewest words that still carry meaning. Body copy reads like a person talking, not a brand committee.
- **Restrained.** Editorial pacing — generous whitespace, big quiet typography, one or two real ideas per scroll. The page doesn't shout. The product carries itself.
- **Committed.** Brand colors do real work: brand-red (`#f10100`) and brand-black (`#111906`) aren't tucked into a logo corner — they're the page. We don't hedge with neutral grays for "safety." The brand is what it is.

**On Jamaican-ness:** the product is Jamaican by default. We do **not** perform it. No patois headlines, no flag colors, no palm-tree silhouettes, no "Yu money, yu trip, yu way." Local context shows up in the actual content (TA tariff schedule, Half-Way Tree, Papine, Spanish Town, NMIA, JN Bank for payouts) — never as a marketing veneer.

**On day-one honesty:** Rajlo is pre-traction. The page does not claim "1M+ rides", "trusted by thousands", or invented testimonials. Where competitors put inflated counters, we put concrete product facts (TA-tariff fares, wallet-only, verified drivers). When real numbers exist, we'll add them. Not before.

## Anti-references

The user explicitly rejected all four of these — they collectively define what this page must NOT feel like:

- **Not Uber/Lyft cold-corporate.** No flat-black hero with a centered white sans-serif and an isometric abstract car. No "trusted by 100M riders" badge strip. No generic-mode-of-transport vibe that could be a delivery app, a scooter rental, or a microbus startup with the logo swapped.
- **Not InDrive loud/scrappy.** No all-caps red headlines, no haggling-as-a-feature pitch, no "we beat the meter" energy. We are not the cheap alternative — we are the regulated one.
- **Not Bolt soft-pastel friendly.** No washed-out pastels, no rounded humanoid illustrations, no "safer alternative" positioning. The brand reads as committed, not soft.
- **Not generic SaaS-cream warm-neutral.** No sand / paper / parchment body backgrounds. No tiny tracked uppercase eyebrow above every section ("ABOUT" "MODES" "PRICING"). No numbered 01 / 02 / 03 scaffolding above sections that aren't actually a sequence. These are the AI-design tells the impeccable skill explicitly warns against in 2026.

Additional structural bans inherited from the impeccable General rules: no gradient text, no glassmorphism as default, no identical card grids, no side-stripe borders on cards, no hero-metric template, no fonts that lack character (no Inter, Roboto, Arial).

## Design Principles

Five strategic principles that resolve trade-offs downstream. Visual decisions live in DESIGN.md; these are the **why**.

1. **Cashless is the spine.** Every section either shows the wallet-only flow as a benefit, builds toward it, or sits out. Don't relegate "no cash" to a sub-bullet; it's the primary differentiator vs. a regular route taxi.

2. **Show the regulation, don't whisper it.** The TA-tariff anchoring + driver verification are the trust story. They live in the hero rhythm, not the footer. The actual TA-published fare formula belongs above the fold somewhere meaningful, not in fine print.

3. **Two modes are equals.** Private ride and route taxi are not a primary mode and a footnote — they're the unique structural story. The page should make the parity legible without falling back into "two identical product cards side-by-side" (banned).

4. **Plain wins.** When deciding between a clever headline and a plain one, ship the plain one. The product is novel enough; the copy doesn't have to be.

5. **Day one is the truth.** No fake metrics, no inflated testimonials, no "Loved by Jamaica" before Jamaica has had a chance to love it. Trust is the only thing we have to trade against established competitors — surrender it once and it doesn't come back.

## Accessibility & Inclusion

- **Target:** WCAG 2.2 AA across the page. Body text ≥ 4.5:1 against its background, large text (≥18px or bold ≥14px) ≥ 3:1, placeholder text held to the same body-text contrast.
- **Reduced motion:** `prefers-reduced-motion: reduce` honored on every animation. Entrance reveals fall back to instant; ambient/loop motion (Ken-Burns, parallax, marquees) disables entirely. The fallback is never "hide the content."
- **Mobile first.** The default test breakpoints are 375 / 768 / 1024 / 1440. The 375 layout is the canonical view — anything that breaks at 375 (overflowing headlines, off-screen CTAs, sub-44px touch targets) is shipped broken.
- **Keyboard.** Every interactive surface is keyboard-reachable with a visible focus ring that survives the brand-red background (light ring on dark bg, dark ring on light bg).
- **Language.** English only at launch. Patois translation is in the i18n layer but is NOT a landing-page surface — leaning on patois here would contradict the "don't perform Jamaican-ness" rule.
- **Image alt text.** Every photographic asset gets descriptive alt text. Decorative photos used for atmosphere are marked `alt=""` so screen readers skip them rather than read meaningless filenames.
