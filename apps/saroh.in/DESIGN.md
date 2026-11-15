---
name: Saroh marketing site (saroh.in, shared with saroh.tech)
description: One small business's real day, drawn in its own words, so a visitor sees their own shop in Saroh.
colors:
    paper: "#F5F2EC"
    ink: "#1C1C1A"
    ink-700: "#43403A"
    meta: "#6C6659"
    line: "#D9D6CC"
    white: "#FFFFFF"
    saffron: "#D98A15"
    saffron-text: "#91550C"
    ok: "#1F7A4D"
    ok-tint: "#E3F1E8"
    warn: "#C2410C"
    ledger: "#173A2B"
    dawn: "#ECEEE9"
    noon: "#FAF7F0"
    afternoon: "#F2E6D3"
    dusk: "#E9D5BA"
    lamp: "#1E1B17"
    lamp-fg: "#F3EEE4"
    lamp-meta: "#C2B9A9"
typography:
    h1:
        fontFamily: "Space Grotesk, sans-serif"
        fontSize: "clamp(42px, 5vw, 72px)"
        fontWeight: 700
        lineHeight: 1.04
        letterSpacing: "-0.04em"
    h2:
        fontFamily: "Space Grotesk, sans-serif"
        fontSize: "clamp(30px, 3.06vw, 44px)"
        fontWeight: 700
        lineHeight: 1.06
        letterSpacing: "-0.035em"
    h3:
        fontFamily: "Space Grotesk, sans-serif"
        fontSize: "20px"
        fontWeight: 700
        lineHeight: 1.2
        letterSpacing: "-0.02em"
    lead:
        fontFamily: "Geist, sans-serif"
        fontSize: "clamp(17px, 1.4vw, 20px)"
        lineHeight: 1.55
    body:
        fontFamily: "Geist, sans-serif"
        fontSize: "16px"
        lineHeight: 1.6
    time:
        fontFamily: "JetBrains Mono, monospace"
        fontSize: "13px"
rounded:
    chip: "999px"
    button: "10px"
    crop: "12px"
    card: "16px"
spacing:
    gutter: "clamp(20px, 5vw, 56px)"
    section-desk: "120px"
    section-phone: "72px"
components:
    button-primary:
        backgroundColor: "{colors.ink}"
        textColor: "{colors.paper}"
        rounded: "{rounded.button}"
        height: "48px"
    button-secondary:
        backgroundColor: "{colors.white}"
        textColor: "{colors.ink}"
        rounded: "{rounded.button}"
        height: "48px"
    chip-filter-on:
        backgroundColor: "{colors.ink}"
        textColor: "{colors.paper}"
        rounded: "{rounded.chip}"
        height: "36px"
    money-account:
        backgroundColor: "{colors.ledger}"
        textColor: "#EAF2EC"
        rounded: "18px"
---

# Design system: the Saroh marketing sites (2026 redesign)

saroh.in (India) and saroh.tech (Global) share one system: the same kit,
the same layouts, the same kind of screenshot in the same slot. Only the
content differs: the words, the money and the example world. This file is
the system; `apps/saroh.tech/DESIGN.md` lists only what Global does
differently.

The redesign is built from the final boards (scratchpad `web/project/*.dc.html`,
desk and `*Phone2`) and their rule files (KIT.md, WORLD.md, PHONE.md,
FIX.md). **The build matches the boards**: where this file and a board
disagree, the board wins and this file is fixed. The owner's decisions for
it are DEC-221.

## Rules that bite

- **Light only.** No dark theme, no `dark:` classes, no
  `prefers-color-scheme` styles, no toggle. `color-scheme: light` is set in
  `@saroh/marketing/tokens.css`. The night scene's dark band (`lamp`) is a
  colour of the day, not a theme.
- **No prices, limits or plan terms in the repo.** Saroh's prices come from
  the published catalogue through `lib/pricing.ts`; with none, a price is
  the `—` placeholder. Plan names may appear, behind their claim switch
  where the claim isn't backed. Merchant prices in the example world (₹950
  for a black forest cake) are examples, not Saroh's prices.
- **Every start button goes through `cta()`** in `lib/links.ts`
  (`CtaLink`), so the launch switch moves them all. The kit never draws a
  start button of its own: `ClosingCTA`, `StickyBar` and the nav take the
  site's.
- **Words in `content/`, never in a component.** The kit takes words and
  data as props; a page passes them from its content file and its world.
- **A redesign keeps every capability** (00-universal rule 15). Content may
  move or be reworded, never dropped: guides, tools, GST pages, templates,
  help, changelog, downloads and integrations all stay, restyled.
- **No claim the product can't back.** A claim that isn't live in
  production is drawn only behind its claim switch (below). Never a false
  claim; off, it draws nothing or "Not available yet".
- **One h1 per page, the same on desk and phone**, worded to fit three
  lines at 42px, with the Saffron mark under one word.
- **Folded content stays in the HTML** (Google indexes the phone page): a
  closed `<details>`, a swipe row or CSS. Never loaded on tap.
- **Merchant drawings wear the merchant's look**: the `--site-*` layer and
  the merchant's own fonts, never Saroh's brand.
- **A company fact comes from `content/company.ts`**; one that isn't set
  there is not drawn.
- **`cn` from `@saroh/marketing/cn`**, not `@saroh/ui/lib/utils`. Focus
  rings are `ring()`.
- **Search pages** (/for, tools) are read through `searchPages`; never
  import `@saroh/search-pages/embedded` (DEC-193, DEC-201).

## Colour

The shared ADR-005 tokens carry the brand: Paper (`background`), Ink
(`foreground`), Ink 700 (`mk-copy`), meta (`muted-foreground`), line
(`border`), Saffron 500 and 700 (`brand-500`, `brand-700`). The redesign
adds, as `--mk-*` channels and Tailwind `mk-*` colours:

| Token                                                | Use                                                                                     |
| ---------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `mk-ledger` (+ `-fg`, `-muted`)                      | The business's own payment account in `MoneyPath`. The only place ledger green appears. |
| `mk-warn`                                            | "2 left": running low.                                                                  |
| `mk-dawn`, `mk-noon`, `mk-afternoon`, `mk-dusk`      | **Solutions only.** A scene's band, by the light at its hour (`hourTint`).              |
| `mk-lamp` (+ `-2`, `-line`, `-fg`, `-meta`, `-saff`) | The night scene's dark band, its panels, words and moon.                                |

Saffron is the site mark (one h1 word), the current nav entry's rule, the
sun, and a moving payment's dot. It is never body text; `brand-700` is its
text shade (a time stamp on paper).

Contrast is at least 4.5:1 for every text size we draw: copy on Paper,
`lamp-meta` on `lamp`, `ledger-muted` on `ledger`.

## Type

- **Space Grotesk 700** (`font-display`): the three heading sizes and big
  figures (a scene's hour, a money figure).
- **Geist** (`font-sans`): body, labels, nav, chips.
- **JetBrains Mono** (`font-mono`): times ("9:14 am"), order and invoice
  numbers, amounts in a ledger, addresses in a frame. Data, never costume.
- **Plus Jakarta Sans 600**: only the phone menu's "Menu".
- **Noto Sans Devanagari**: only सारोह, subset per page.

Three heading sizes and no more on a page: **h1** 72px desk / 42px phone
(`text-mk-kit-h1`), **h2** 44 / 30 (`text-mk-kit-h2`), **h3** 20
(`text-mk-kit-h3`). Lead 20 / 17 (`text-mk-kit-lead`), body 16, meta 13,
never under 12px. Tracking stops at -0.04em. Headings wrap balanced.

All fonts are self-hosted (`app/layout.tsx`, `app/fonts/`); the build
fetches none. A page that draws a merchant site also loads that site's
fonts from `packages/site-blocks/fonts/` and sets `--font-site-serif` /
`--font-site-sans` (the kit sheet shows how).

## Layout

- The page is as wide as the window; bands (`Section tone`) run edge to
  edge, and each section's column is the 1280px `Container` with
  `clamp(20px, 5vw, 56px)` gutters.
- Section space: 120px above and below on desk, 72px on a phone
  (`Section space="kit"`). More space above a heading than below it.
- The breakpoint is **760px**: below it the phone layout. The **nav** switches
  at **1240px**: its seven entries (Solutions · How it works · Templates ·
  Pricing · Developers · Resources · Tools) need the room (1,200px with Pricing and Sign in), so tablets and small laptops get the
  phone menu.
- Check every page at **1440, 390 and 320**: nothing scrolls sideways, no
  text under 12px. Rows that scroll (SwipeRow, HourStrip, TradeSwitcher)
  scroll inside themselves, never the page.

## Components

The kit lives in `packages/marketing/src` and is imported one piece at a
time (no barrel). Every component takes words and data as props and holds
none; the world file supplies names, numbers and times. The kit sheet,
`/dev/kit` (under `next dev` only), draws each one on the India world.

| Component                            | Import                                         | Purpose and rules                                                                                                                                                                                                                                                                       |
| ------------------------------------ | ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Section`, `SectionHeading`          | `@saroh/marketing/section`, `/section-heading` | A section and its heading. `size="kit-h1"` with `as="h1"` is the page title; `size="kit-h2"` a section heading; `tone` gives it an edge-to-edge band (`paper`, `white`, hour tints, `lamp`); `space="kit"` the 120/72 spacing; `align="center"`. No eyebrows in the redesign.           |
| `Mark`                               | `@saroh/marketing/mark`                        | The Saffron underline under **one** word of the h1, once per page.                                                                                                                                                                                                                      |
| `Button` / `ButtonLink` `size="kit"` | `@saroh/marketing/button`                      | 48px, 10px corners. Primary Ink, secondary a 1px Ink outline on white. Sentence case. Start buttons are `CtaLink size="kit"`.                                                                                                                                                           |
| `TextLink` `tone="ink"` / `"on-ink"` | `@saroh/marketing/text-link`                   | 1px underline 3px below, 44px tall. `arrow` (→) only when it goes to another page; none when it opens something here; never ↗.                                                                                                                                                          |
| `Chip`, `SourceChips`                | `@saroh/marketing/kit/chip`                    | 36px pills (44px to tap). `filter` (outline, Ink when on, mono count), `chapter` (jump links, Ink when current), `source` (paper fill, coloured dot), `plan` (plain meta text: plan pills read as buttons). `SourceChips` is the one "Read from" row wherever Ask AI shows its sources. |
| `TimeStamp`                          | `@saroh/marketing/kit/time-stamp`              | "9:14 am", "9 am" in mono, from "HH:MM". `clockLabel`, `hourLabel`, `hourAnchor`, `hourTint` in `/kit/time`. Never 24-hour, never "PM".                                                                                                                                                 |
| `CroppedCard`                        | `@saroh/marketing/kit/cropped-card`            | A screen cropped to the rows that matter, cut with a 48px fade, then "See the whole …" (no arrow) opening the rest from a closed `<details>` right after it.                                                                                                                            |
| `SwipeRow`                           | `@saroh/marketing/kit/swipe-row`               | Three or more of a kind on a phone: one card in full, the next peeking 24px, "1 of N" under it; columns from 760px. Every card is in the HTML.                                                                                                                                          |
| `MomentCard`                         | `@saroh/marketing/kit/moment-card`             | "Seen in a day", feature pages only: ONE moment, never a strip. Time, one line, a link to that hour on the trade page (`dayLink`).                                                                                                                                                      |
| `PlanLine`                           | `@saroh/marketing/kit/plan-line`               | Plans in one sentence plus "Compare plans →". Replaces every plan strip but /pricing. A plan name in it sits behind its claim switch.                                                                                                                                                   |
| `StickyBar`                          | `@saroh/marketing/kit/sticky-bar`              | The phone's one sticky action: a 64px white bar that slides up once the hero's own CTA (`watch`, its id) has scrolled away. While it shows, the header's start button hides (`STICKY_HIDES`).                                                                                           |
| `ClosingCTA`                         | `@saroh/marketing/kit/closing-cta`             | A page's last word: one h2, primary Start free, secondary by page type (a feature page its trade-day moment, a trade page its template).                                                                                                                                                |
| `Breadcrumbs`                        | `@saroh/marketing/breadcrumbs`                 | "How it works / Orders", "Solutions / Home bakers". "/" between; no Keep or Reach level.                                                                                                                                                                                                |
| `TradeSwitcher`                      | `@saroh/marketing/kit/trade-switcher`          | The segmented trade picker ("A day at a", "Show it for a"). Links with `?trade=` (no script needed) or toggles with `onSelect`.                                                                                                                                                         |
| `SunArc`                             | `@saroh/marketing/kit/sun-arc`                 | The sun's place at an hour; at night a dashed arc and the moon.                                                                                                                                                                                                                         |
| `HourStrip`                          | `@saroh/marketing/kit/hour-strip`              | A day's index under a trade hero: the light of the day as a bar in the hour tints, a dot per hour, its line linked to the scene and its feature. `current` is a stop's `href`.                                                                                                          |
| `DayScene`                           | `@saroh/marketing/kit/day-scene`               | One hour of a trade's day, Solutions only: a band in that hour's light, sun arc, the hour large, mood, then h2, lead, picture and "how it works" chips. Its id is the hour's anchor (`9am`).                                                                                            |
| `MoneyPath`                          | `@saroh/marketing/kit/money-path`              | How money moves: customer → the business's own provider account (ledger) → its bank, and Saroh on a dashed line, seeing but never holding it. Its home is /features and the 4 pm scene.                                                                                                 |
| `PhoneFrame`, `BrowserFrame`         | `@saroh/marketing/kit/frames`                  | Frames for drawn screens. `BrowserFrame look="app"` (app.saroh.in) or `look="site"` (a merchant address, in the site's colours).                                                                                                                                                        |
| `SiteDrawing`                        | `@saroh/marketing/kit/site-drawing`            | A merchant's site drawn from its `SiteLook` (`--site-*` HSL channels and its own fonts); `phone` for the single column.                                                                                                                                                                 |
| `Claim`                              | `@saroh/marketing/kit/claim`                   | A claim behind its claim switch: drawn while on, else nothing or "Not available yet".                                                                                                                                                                                                   |
| `MarketingNav`                       | `@saroh/marketing/marketing-nav`               | Solutions · How it works · Templates · Pricing · Developers, then Sign in and Start free; each site passes its entries, switches and `cta()` buttons. Sticky; one menu open at a time.                                                                                                  |
| `MarketingFooter`                    | `@saroh/marketing/marketing-footer`            | Wordmark, one line, then groups: **Product first in the LOCKED order** (Website builder, Orders, Bookings, Billing, Share and posts, Saroh Social, Ask AI, AI apps, API and webhooks), every other link folded into the groups after it. On a phone each group is a closed `<details>`. |

Every clickable element has hover, focus (`ring()`), pressed and keyboard
states. Screenshots come from the manifest in `content/shots.ts`, each with
alt text.

### Pieces kept from Marketing Site V2

`ScreenshotFrame`, `ShotImage`, `Faq`, `Pill`, `ChoiceChip`, the pricing
tables, the help and tool panels, `CtaBand` and the rest stay as they
were, for the pages the redesign hasn't reached. A redesigned page uses the
kit above instead.

## Phone rules

PHONE.md, as built:

1. **One idea per scene**: one h2, at most two lines of body, one visual,
   at most one link. The other points go behind "See how …".
2. **Crop, don't shrink**: `CroppedCard`, 14 to 16px rows at full size.
3. **Three or more become a `SwipeRow`.**
4. **Short endings**: three FAQ questions then "All questions", the
   `PlanLine`, related links as one chip row, the folded footer.
5. **One sticky CTA** (`StickyBar`); repeated in-page start buttons go;
   the closing section keeps one.
6. **Chapter chips** on long pages (`Chip variant="chapter"`); on trade
   pages the trade switcher plays this part.
7. **Hero within one screen**: h1 at most three lines, one line of lede,
   the visual starting above the fold.
8. Body 16px, meta 13px, never under 12px; targets at least 44px; 20px
   side margin.

**The indexing rule (owner, 17 Nov 2026): Google indexes the phone
version.** Everything moved behind a tap stays in the page's HTML (closed
`<details>`, a swipe row, CSS); a "See the whole …" sheet shows content
already on the page; every FAQ question and answer is in the markup; desk
and phone share one h1.

## Screenshots: one type, both editions

- Where a section shows a real app screen, it is a **captured shot**
  through `@saroh/marketing/shot-image` and `content/shots.ts`, from the
  `e2e/marketing-shots` pipeline (`shots.config.ts` for India,
  `shots.global.ts` for Global).
- **The same slot uses the same shot key and the same crop and frame** in
  both editions. Global gets its own capture of that key from
  `db:seed:global`; until it has one, the key is on saroh.tech's
  `PENDING_SHOTS` and the slot draws the same fallback as India, never a
  different kind of visual.
- **Shots are retaken fresh for every production release, both editions,
  same keys** (owner, 17 Nov 2026; `docs/patterns/devops-tooling-and-deploy.md`
  → "Marketing screenshots are taken fresh for every production release").
- **Drawn moments** (crops, chips, cards, phone heroes, site drawings) are
  kit components fed by the edition's world. They reflect real screens:
  the app's own words and fields, no invented UI.

## Example worlds

Every name, number, time and address a drawing shows comes from the
edition's world file, typed by `@saroh/marketing/world`:

- **India**: `apps/saroh.in/content/world.ts`, exactly WORLD.md's LOCKED
  (round 5) table. Rye & Co. (Asha, Hill Road, Bengaluru, on Grow), its
  Monday 16 Nov 2026, orders ORD-1041 to ORD-1049, its day's anchors
  (`#7am` … `#9pm`, `#tue7am`) and Studio Neel, Pulse Fitness and Petal
  Lane. `RYE_MONDAY` holds stock, the class, the week and the 6:12 pm and
  9 pm stories.
- **Global**: `apps/saroh.tech/content/world.ts`, from the Global demo seed,
  so drawings agree with the Global shots.
- `exampleFor(world, trade)` picks the example for `?trade=` (bakery,
  salon, gym, florist), falling back to the lead; `tradeParam` reads the
  parameter; `dayLink` builds `/for/home-bakers#9am`.
- The day is told in full only on its trade page (`/for/home-bakers`,
  `/for/florists`); every other page shows one moment and links to it.

## Claim switches

`CLAIM_SWITCHES` in `@saroh/marketing/feature-switches` (DEC-221), read by
`claimsOff()` / `claimOn()` (`lib/feature-switches.ts`), by DEC-135's
rule: on only when it says `on`, unset is on only under `next dev`, and a
claim is off whenever its feature's release switch is off.

| Claim                                                       | Variable                             | Under     |
| ----------------------------------------------------------- | ------------------------------------ | --------- |
| `social-posting` (Saroh Social posts and schedules for you) | `NEXT_PUBLIC_CLAIM_SOCIAL_POSTING`   | `social`  |
| `share-every-plan` (Share free on every plan)               | `NEXT_PUBLIC_CLAIM_SHARE_EVERY_PLAN` | `social`  |
| `ask-ai-stock` (Ask AI reads Stock)                         | `NEXT_PUBLIC_CLAIM_ASK_AI_STOCK`     | `ask-ai`  |
| `ask-ai-website` (Ask AI reads and changes the Website)     | `NEXT_PUBLIC_CLAIM_ASK_AI_WEBSITE`   | `ask-ai`  |
| `ask-ai-social` (Ask AI reads posts)                        | `NEXT_PUBLIC_CLAIM_ASK_AI_SOCIAL`    | `ask-ai`  |
| `ask-ai-languages` (Hinglish or Hindi)                      | `NEXT_PUBLIC_CLAIM_ASK_AI_LANGUAGES` | `ask-ai`  |
| `ask-ai-plans` (a plan named beside Ask AI)                 | `NEXT_PUBLIC_CLAIM_ASK_AI_PLANS`     | `ask-ai`  |
| `ai-apps-plans` (a plan named beside AI apps)               | `NEXT_PUBLIC_CLAIM_AI_APPS_PLANS`    | `ai-apps` |

Wrap the claim in `<Claim on={claimOn("…")}>`. A new unlive claim gets a
switch here first, with its test.

## The link preview tool

`/tools/link-preview` draws each app's card with `ShareCard` from
`@saroh/ui/share-card`, in each app's own colours. Its verdict and error
colours are `mk-good`, `mk-bad` (and their `-bg`), the placeholder
`mk-hint`, the code block's text `mk-code`.

## Share cards

Each page's Open Graph image is drawn by `lib/og-card.tsx` from the page's
`opengraph-image.tsx`: Paper, the mark and the headline. Words only; no
price is ever drawn into an image.

## Changes

- **17 Nov 2026, the redesign's foundation (DEC-221, batch-2026-11-15-4).**
  The kit (tokens: ledger, warn, hour tints; the three heading sizes; Mark;
  the 48px button; the Ink TextLink; Chip, SourceChips, TimeStamp,
  CroppedCard, SwipeRow, MomentCard, PlanLine, StickyBar, ClosingCTA,
  TradeSwitcher, SunArc, HourStrip, DayScene, MoneyPath, PhoneFrame,
  BrowserFrame, SiteDrawing, Claim); the example worlds; the claim switches;
  the shared nav (Solutions · How it works · Templates · Pricing ·
  Developers; the Resources and Tools menus folded into How it works' strip
  and kept as phone-sheet levels) and footer (Product first, LOCKED order;
  groups fold on a phone); page bands edge to edge; the `/features` route
  shell (noindex until drawn); the kit sheet at `/dev/kit`.
- **17 Nov 2026, Resources and Tools stay menus (owner).** The guides and the
  free tools are how people find Saroh, so Resources and Tools are their own
  desk menus again after Developers (saroh.tech: after Pricing), not folded
  into How it works. The desk nav starts at 1240px.
- Pages move to the kit one by one after this; each adds its line here.
- **3 Oct 2026.** Marketing Site V2: light only, Space Grotesk and Geist,
  the `--mk-*` layer (earlier history in git).
