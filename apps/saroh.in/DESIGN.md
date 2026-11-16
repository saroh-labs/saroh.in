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

- **A screenshot is never behind a click (owner, 16 Nov 2026).** On desk
  and phone, an app screen shows in the page. A phone may crop it
  (CroppedCard, PhoneClip), never fold it whole into a `<details>`; only
  extra words fold.
- **Show what Saroh does, never its internal limits (owner, 16 Nov 2026).**
  A marketing page doesn't draw a locked panel, an upgrade wall, a "questions
  used up" screen or a quota. Those read like telling a visitor our internal
  mechanics. A plan difference is one PlanLine sentence and "Compare plans";
  the details live on /pricing and in Help.
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
| `PageHero`, `markTitle`              | `@saroh/marketing/page-hero`                   | The head of a page without a board of its own (about, help, legal, tools …), both editions: crumbs, the one h1 at `kit-h1` with the Mark under a chosen word or the last one, a lead, the page's actions as children. `markTitle` alone marks an h1 drawn another way.                  |
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
| `MarketingNav`                       | `@saroh/marketing/marketing-nav`               | Solutions · Features · Templates · Pricing · Developers, then Sign in and Start free; each site passes its entries, switches and `cta()` buttons. Sticky; one menu open at a time.                                                                                                      |
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

| Claim                                                            | Variable                             | Under     |
| ---------------------------------------------------------------- | ------------------------------------ | --------- |
| `social-posting` (Saroh Social posts and schedules for you)      | `NEXT_PUBLIC_CLAIM_SOCIAL_POSTING`   | `social`  |
| `share-every-plan` (Share free on every plan)                    | `NEXT_PUBLIC_CLAIM_SHARE_EVERY_PLAN` | `social`  |
| `ask-ai-stock` (Ask AI reads Stock)                              | `NEXT_PUBLIC_CLAIM_ASK_AI_STOCK`     | `ask-ai`  |
| `ask-ai-website` (Ask AI reads and changes the Website)          | `NEXT_PUBLIC_CLAIM_ASK_AI_WEBSITE`   | `ask-ai`  |
| `ask-ai-social` (Ask AI reads posts)                             | `NEXT_PUBLIC_CLAIM_ASK_AI_SOCIAL`    | `ask-ai`  |
| `ask-ai-languages` (Hinglish or Hindi)                           | `NEXT_PUBLIC_CLAIM_ASK_AI_LANGUAGES` | `ask-ai`  |
| `ask-ai-plans` (a plan named beside Ask AI)                      | `NEXT_PUBLIC_CLAIM_ASK_AI_PLANS`     | `ask-ai`  |
| `ai-apps-plans` (a plan named beside AI apps)                    | `NEXT_PUBLIC_CLAIM_AI_APPS_PLANS`    | `ai-apps` |
| `site-shop` (products and the shop on a merchant's site)         | `NEXT_PUBLIC_CLAIM_SITE_SHOP`        | none      |
| `share-insights` (worth-posting ideas, visits per post)          | `NEXT_PUBLIC_CLAIM_SHARE_INSIGHTS`   | `social`  |
| `card-online` (saroh.tech: card payment online, STRIPE_PAYMENTS) | `NEXT_PUBLIC_CLAIM_CARD_ONLINE`      | none      |

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

- **16 Nov 2026, landing and nav (owner, bugs #1–#4, #6, #9–#17).** Both
  landings: a section's heading starts level with its paragraph (two-column
  heads top-aligned, landing and /features); the door to a day and the
  folded "Everything in Saroh" are gone (the stays-yours line links "All
  features"); the free tools are one shared section (`home/home-tools`);
  the close is the same heading and "See how it works" on both; providers
  are only the site's own (saroh.in Razorpay and Cashfree, saroh.tech
  Stripe); example-site cards share one height. /developers is one shared
  page (`feature-pages/developers-page`), saroh.tech's behind its switch.
  Nav: a menu opens under its button; Website templates (saroh.in) and
  Document templates (saroh.tech); Developers inside Resources. Footers:
  one structure on both sites.

- **16 Nov 2026, one trade look per trade (owner, bugs #8, #19–#22).** Both
  sites draw a business's site in its trade's look from
  `@saroh/marketing/kit/trade-looks` (bakery, salon, gym): Thistlewick is
  drawn in Rye & Co.'s cream and terracotta, never the renderer's grey
  default. saroh.tech's shots are retaken by the same step rules, its demo
  businesses on Grow and Pro locally (paid features show as on their way).

- **16 Nov 2026, feature pages: one step layout and desk shots (owner,
  bugs #26–#30).** Every record feature page (`keep-page.tsx`, both
  editions): the hero's headline and lede both start at the top; each step's
  words start level with its shot, its title is 26px on desk (22px on a
  phone) so it reads as a heading over the 16px body, and the demo line is
  quiet sans, not mono; the shot keeps the wide column on whichever side it
  sits, in one 16:10 frame. Step shots are the desk app at 1280 × 800 with
  its full sidebar (`STEP_VIEW`), never a crop of one panel: a step that is
  about one part scrolls it into view (`focus`); Insights' steps open their
  own tabs. The signed-in name is the business's owner (Asha Rao at Rye &
  Co., Karan Mehta at Pulse), set on the shots database before its shots
  (`SHOTS_DATABASE_URL`), never "Demo Owner".

- **16 Nov 2026, phone polish two (DEC-221, unit/web-polish2).** Phone
  lengths at 390px; desk heights unchanged. Kit: the footer on a phone is
  the wordmark with Saroh's accounts beside it, one line, the groups
  folded two a row and a tighter legal row (816px to 442px; the name's
  meaning stays in the HTML, drawn on desk only). `ClosingCTA` is tighter
  on a phone and carries `data-closing`; `StickyBar` steps aside while it
  is in view, so Start free shows once. `PhoneClip` and `CroppedCard`
  mark their toggle `data-pc="toggle"` (a scene can show more of itself
  while it is open) and `CroppedCard` lifts its cut when opened.
  Duplicated phone copies became one element: a trade-day hour's whole
  lead, line after and note (shown while the hour's toggle is open), the
  How it works chapter leads (first sentence, the rest while Read more is
  open), Share's Your posts list, Ask AI's other screens (a swipe on a
  phone, no second list). Trade pages: three questions then All
  questions; the cut picture's own link opens the whole hour; shorter
  cuts and bands. Reach and Ask: extra words fold (how a change arrives,
  what it can do past the first part, what it can and can't change, the
  second and third private points, what sections read); drawn answers,
  panels and feeds are cut with "See the …", never folded whole; In the
  app's screens stay in sight as a swipe row, its words folded ("Help,
  every point and who uses it"). Share cards drawn small turn words that
  would fall under 12px into bars, and a 64px thumbnail draws none
  (container queries in `tokens.css`, `data-tiny` in `PostCard`). Keep
  pages' phone bands are 48px.

- **17 Nov 2026, phone polish (DEC-221, unit/web-polish).** Phone lengths
  at 390px, desk unchanged. Kit: `kit/phone-fold` (`PhoneFold`: content
  once in the HTML, behind a summary on a phone, shown from 760px;
  `PhoneClip`: a picture cut at a height with a fade, its summary lifting
  the cut); `kit/drawn-photo` (the boards' `.p-rye`/`.p-neel`/`.p-pulse`
  art as `DrawnPhoto`, named per business and item in the world:
  `WorldBusiness.photo`, `WorldItem.photo`; `SiteItem.drawn`); DayScene's
  phone row (sun, hour, mood side by side, 48px bands); SwipeRow counts a
  card only when 60% in view. Solutions: day hours take a two-line
  `phoneLead` with the whole lead, the line after and the note folded
  ("Read the whole hour"); pictures that don't crop themselves are clipped
  by kind; the hour strip, starter list and Also items past three fold;
  chip rows scroll on one line; the AI asks swipe; tile drawings' pills
  and meta are 12px. Landing: drawn bakes, salon and gym photos in the hero
  phone, the site showcase and the Share cards; tighter phone bands.
  /features: each chapter's lead shows its first sentence, the rest folded;
  the money's path is clipped. Orders (`components/feature-pages/orders-moments.tsx`,
  words `content/feature-orders.ts`): where orders come from, the New order
  sheet, ORD-1045 opened and what it moves (bun boxes 38 to 36), all from
  the world; the hero shows Rye & Co.'s own list (`s-orders`) and the first
  step its order (`r-order`) on both editions. Keep pages' steps and Ask
  exchanges swipe on a phone. Reach and Ask: In the app folds on a phone.
- **17 Nov 2026, the Reach and Ask feature pages (DEC-221, unit/web-reach).**
  Website builder (FWDesk/FWPhone2), Share and posts (FSDesk/FSPhone2, with
  `#saroh-social`), Ask AI (FADesk/FAPhone2) and AI apps (FMDesk/FMPhone2),
  each in `components/feature-pages/<slug>.tsx` with its parts in
  `components/feature-pages/<slug>/` and words in `content/reach-*.ts`
  (facts from the world). Shared by the four, in `components/feature-pages/reach/`:
  `PageTop`, `Fold` and `CropToggle` (a phone crop that opens in place, the
  whole screen always in the HTML), `Questions` (three, then "All
  questions"), `Tail`, `AppCard`/`AppRow`, drawn `Photo`s, and `InTheApp`,
  which keeps each old page's captured shots, steps, Help links, every point
  (folded) and Used by. Merchant drawings (`ShopSite`, `PostCard`) wear the
  business's `--site-*` look and its own fonts (`reach/site-fonts.ts`);
  `PostCard` scales by container units. Ask AI's hero wires are measured
  from the laid-out rows and redrawn on resize, from 1080px. New claim
  switches: `site-shop` (stands alone; `CLAIM_PARENT` is partial) and
  `share-insights`.
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
- **17 Nov 2026, "Features", not "How it works" (owner).** The nav entry,
  its menu's see-all ("All features"), the breadcrumbs ("Features / Orders")
  and the phone menu say Features on both sites: it's the word visitors scan
  and search for, and it matches `/features`. The /features page itself still
  opens with "How it works, and why it all stays yours" and keeps its
  chapters; the story ownership (DEC-221) is unchanged.
- Pages move to the kit one by one after this; each adds its line here.
- **17 Nov 2026, the landing (`/`, boards LAHomeDesk + LAHomePhone2).**
  One responsive page: the h1 "Your website and orders, sorted before you
  open." (Mark on "website"); the hero's three phones (`HeroStage`, a
  `SwipeRow` on a phone, the owner's morning first, cropped to 360px) with
  "Show it for a" Bakery · Salon · Gym from `HOME_HERO_SCENES`; the website
  chapter (`#online`, three `SiteDrawing`s from `HOME_SITE_SHOWCASE`); orders
  (`#orders`); the ledger money band (`#money`, the landing's one ledger
  use, as the board draws it); the door (`#day`, picker + link to
  `/for/home-bakers#7am` once that page is live, else the trade's page);
  New in Saroh (`#new`, four cards, each only while its feature is on, its
  unlive claims behind `ask-ai-plans`, `ask-ai-languages`,
  `ask-ai-website`, `share-every-plan`, `social-posting`); the "stays
  yours" line; plan line + questions (`#pricing` only once open, `#faq`, a
  phone shows three then "All questions", CSS only); `ClosingCTA`;
  `StickyBar`. Moved, not cut: the feature grid folds under "Everything in
  Saroh" (`#features`), the Solutions cards under the door (`#solutions`,
  with the "Works for" chips), the plan cards to /pricing, the acronym
  line to the share card, the trust chips into the money band, the old
  sub's "add it once" into the orders chapter. `components/home/fold.tsx` is
  the landing's one `<details>` fold. No captured shot on the landing (the
  hero is drawn); `s-home` stays on Shops.
- **17 Nov 2026, How it works and the Keep pages (unit/web-features).**
  `/features` is drawn from HWDesk/HWPhone2 and indexed (in the sitemap):
  the h1 "How it works, and why it all stays yours.", the trade switch
  (client toggle over drawings already in the HTML, so the page stays
  static), six ownership chapters grouped Your records / Reaching customers
  / Asking and connecting ("Your posts", not "Your look"), how money moves
  on the ledger band (`components/how-it-works/money-flow.tsx`, the board's
  outline path; the kit `MoneyPath` is for paper), "Everything stays yours"
  and the full feature index. Its drawn crops are `components/how-it-works/
panels.tsx`, fed by the world, no Rye literals; words in
  `content/how-it-works.ts`. Chapters, crops, lines and index rows of a
  switched-off feature or an unlive claim are not drawn. `/features/[slug]`
  dispatches by kind: record features render `KeepPage`
  (`components/feature-pages/keep-page.tsx`, FODesk/FOPhone2: hero with
  mark, scene, cropped captured shot; steps with their shots and Help
  links; points, folded after three on a phone; "What happens around it";
  the Ask band; one MomentCard; PlanLine; Used by chips; questions; close),
  extra words in `content/feature-keep.ts`; Website, Share, Ask AI and AI
  apps render their own components from `components/feature-pages/
registry.ts` (stubs drawing the old page until agent reach lands).
  `vitest.setup.ts` stands in an IntersectionObserver for jsdom.
- **17 Nov 2026, the pages without a board (unit/web-pages).** About,
  contact, customers, the legal pages, developers, the changelog and its
  entries, Help and its articles, integrations and each provider, pricing's
  head and closing, templates and each template, the QR code maker, the
  link preview checker, the waitlist and welcome are in the kit, words and
  functions unchanged:
    - `PageHero` (`@saroh/marketing/page-hero`, shared with saroh.tech): crumbs, the one h1
      at `kit-h1` with `markTitle` putting the Mark under a chosen word or
      the last one, a lead, the page's actions. A page whose old eyebrow named
      it shows that word as its single crumb ("About Saroh", "Pricing",
      "Contact"); section eyebrows are gone (About's "Where we are").
    - h2 at `kit-h2`, h3 at `kit-h3`; an h2 inside a reading column (legal,
      a Help step, a changelog entry's parts) takes `kit-h3`. Cards 16px,
      crops 12px, buttons `size="kit"`, Ink `TextLink`s with "→" to another
      page. The Ink CtaBand closings became `ClosingCTA`; its body and "No
      card needed" read as the note.
    - Phone: developers and each template get the `StickyBar`; integration
      cards and related templates are a `SwipeRow` from three. Templates'
      filters are the kit's `filter` chips.
    - Pricing still reads the catalogue (`lib/pricing.ts`); its plan cards
      and compare table stay, the one plan strip KIT.md keeps.
    - The GST, guide and download pages, their hubs, the tools hub and every
      tool page are drawn by `@saroh/search-pages`: a `.sp-kit` layer on
      their roots (not /for/) gives them the kit's Saffron, the h1 with the
      mark under its last word (a reading page's h1 at the kit's 42px on
      every screen, so a full search title keeps to a few lines), "/"
      crumbs, the 48px Ink button, the closing as ClosingCTA, plain 13px
      labels for the old small caps, nothing under 12px, and hub cards that
      swipe on a phone. Tool UIs (Operate) keep their controls as they were.
- **17 Nov 2026, Solutions (`/for`, all 34 `/for/<trade>`; unit/web-solutions).**
  Boards SOHubDesk/SOHubPhone2, SOTradeDesk/SOTradePhone2,
  SLFloristDesk/SLFloristPhone2, SLLibrary.
    - **Trade page** (`components/solution/trade-page.tsx`): a sticky trade
      bar ("A day at a"), the page's own MDX h1 and lead, its picture (Home
      on a phone where a day is written, else its MDX sample day), the
      problems (each quote, its area, the hour that answers it, and "How
      Saroh helps" folded), then the day, "What changes" (the MDX tiles,
      with the search pages' own drawings, the quote, Also in Saroh, the AI
      asks), the template and starter list, pricing, every question
      (`FaqItems`), other written days, related trades, `ClosingCTA` and
      the `StickyBar`. Every word of each MDX stays; SEO metadata and
      JSON-LD are byte for byte as before (`live-pages` snapshots).
    - **Written days** (`content/solutions-days.ts`): only where one is
      written, now home bakers (Rye & Co.) and florists (Petal Lane). Each
      hour is a `DayScene` keyed to the world's `day`; the `HourStrip`
      reads the world's lines. On a day page the "What changes" part folds
      into "Everything else Saroh does for …".
    - **Moment library** (`components/solution/moments/`): home, shelf,
      order, site-order, post, payment (`MoneyPath`), bill, ai-app, ask,
      waiting and enquiry, each drawn from data alone (no business's
      name), so saroh.tech or a later day builds from the same pieces. On a
      phone a moment's second picture folds in a closed `<details>`.
      Booking, class/pack and reminder (SLLibrary) wait for the first day
      that uses them.
    - **Claims in words** (`components/solution/words.ts`): a sentence's
      part with a claim is drawn only while it's on (Hinglish at 9 pm,
      "Ask AI on Grow and Pro", "Sharing is free", Saroh Social posting).
    - **Hub** (`components/solution/for-hub.tsx`, `hub-finder.tsx`): "A day
      in your trade." Each trade at one moment of its day
      (`content/solutions-hub.ts`), grouped by what it does, search and
      filters in the address as before; "A whole day, told in full" only on
      trades with a written day; on a phone a swipe row per group, a closed
      A to Z list and a sticky "Find your trade". "Tell us your trade" goes
      to /contact until the hub has its own form.
- **17 Nov 2026, the shared pages (DEC-221, unit/web-techcore).** The
  landing's sections, How it works and the Keep template moved from
  saroh.in's `components/` into `@saroh/marketing`, so saroh.tech draws the
  same pages with its own words and world:
    - `@saroh/marketing/home/*`: `HomeHero`, `HeroStage` (and the
      `HomeHeroScene` type), `SiteChapter` (`SiteShowcase`),
      `OrdersChapter`, `MoneyBand`, `DayDoor`, `NewInSaroh`, `YoursLine`,
      `PlansAndQuestions`, `TourVideo`, `Fold`, `Tag`; words typed by
      `HomeWords` (`home/words`).
    - `@saroh/marketing/how-it-works/*`: the whole page body
      (`HowItWorksPage`), `Chapter`, `GroupHead`, the panels, `HeroVisual`,
      `MoneyFlow`, `ExampleSwitch`, `Rich`; words typed by
      `HowItWorksWords` (`how-it-works/words`, which also holds `Gate`,
      `Chapter`, `IndexItem`).
    - `@saroh/marketing/feature-pages/keep-page`: `KeepPage`, drawn from
      resolved props (`KeepTemplateWords`, shots as `ShotView`s, Help links,
      the Ask band with its claims applied, the plan line). It can say what
      works today in place of the hero note, and mark parts "Not available
      yet".
    - The Reach and Ask pages (`feature-pages/website-page`, `social-page`,
      `ask-ai-page`, `ai-apps-page`, with `reach/*`, `website/*`,
      `social/*`, `ask-ai/*` and their `words` types).
    - What a shared page needs from its site comes in as `PageSite`
      (`feature-pages/site`: start button, claim switches, launch switch,
      shown feature pages, shots); each site has `lib/page-site.tsx`. The
      lead business's day beyond its orders is a `WorldStory`
      (`@saroh/marketing/world`): saroh.in's `RYE_MONDAY`, saroh.tech's
      `THISTLEWICK_TUESDAY`.
    - saroh.in draws byte for byte as before: the landing, /features and
      all twelve feature pages were rendered before and after and diffed.
    - After the phone polish: `OrdersMoments` is
      `@saroh/marketing/feature-pages/orders-moments` (KeepPage's `moments`),
      and saroh.tech's world gives its businesses and items drawn photo
      kinds, so both editions draw the same art.
- **3 Oct 2026.** Marketing Site V2: light only, Space Grotesk and Geist,
  the `--mk-*` layer (earlier history in git).

### Solutions' parts shared with saroh.tech (unit/web-techsol, 17 Nov 2026)

- The /for hub's layout (`SolutionsHub`, `@saroh/marketing/solutions/hub`),
  its search and filters (`@saroh/marketing/solutions/hub-finder`), the
  trade-page layout (`TradePageLayout`, `@saroh/marketing/solutions/trade-page`),
  the moment library (`@saroh/marketing/solutions/moments` and
  `/moment-types`), a written day's shape (`/solutions/day`) and `say`
  (`/solutions/words`) moved into the kit. `fieldClasses` moved with the
  hub's search (`@saroh/marketing/field-classes`; the old path re-exports).
- saroh.in keeps its adapters (`components/solution/for-hub.tsx`,
  `trade-page.tsx`): the search pages' sample day, "What changes" drawings
  and starter list stay here. Every page renders byte for byte as before
  (`live-pages` snapshots unchanged).
