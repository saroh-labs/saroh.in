# Design System: Saroh Marketing Site V2 (saroh.in)

The marketing site is built from the Marketing Site V2 designs (Home,
Features, Solutions, Pricing, Waitlist) in Saroh's design project. Pricing
and the plan sections of Home and Solutions are not built yet (Gate W). **The build
matches the design exactly**: type, sizes, spacing, colours, icons, copy and
layout. Where this file and a design disagree, the design wins and this file
is fixed.

## Rules that bite

- **Light only.** No dark theme, no `dark:` classes, no `prefers-color-scheme`
  styles, no theme toggle. `color-scheme: light` is set on `<html>` and in
  `app/site.css`.
- **No prices, limits or plan terms in this repo, and none on a page.** No
  page names a plan's price, limits or contents until Pricing is published;
  the free-plan line under each hero is the fixed, neutral
  `FREE_PLAN_LINE`. Plan names (Free, Grow, Pro) may appear in copy.
- **Every "start" button goes through `cta()` in `lib/links.ts`** (label and
  address together), so the launch switch (`NEXT_PUBLIC_LAUNCH_MODE`) moves
  them all at once. No page hard-codes a CTA.
- **Merchant words:** "location", never "storefront" or "store"; no claim the
  product can't back (`docs/patterns/saroh-product.md`).
- **`cn` from `@/lib/cn`**, not `@saroh/ui/lib/utils`: it knows this app's
  `mk-*` keys. Focus rings are written
  `focus-visible:[outline-style:solid] focus-visible:outline-2 …`, never
  `focus-visible:outline` (tailwind-merge drops the style).

## Colour

The shared ADR-005 tokens carry the brand: Paper (`background`, #F5F2EC),
Ink (`foreground`), Saffron 500/700 (`brand-500`, `brand-700`), Ink 500
(`muted-foreground`) and the two lines (`border`, `border-strong`). What the
designs need beyond them lives in `app/site.css` as `--mk-*` channels and in
Tailwind as `mk-*` colours (`tailwind.config.ts`): running copy, hovers, the
on-Ink band colours, the featured-plan tint and the "Coming soon" pill.

Saffron is for the hero initials, the current-page underline, the button on
dark bands and the featured plan; it is never body text.

## Type

- **Space Grotesk 700** (`font-display`): display, headings, prices.
- **Geist** (`font-sans`): body, labels, nav, eyebrows.
- **JetBrains Mono** (`font-mono`): only the waitlist's opening date.
- **Plus Jakarta Sans 600** (`font-wordmark`): only the phone menu's "Menu".
- **Noto Sans Devanagari 500**: only सारोह in the waitlist footer.

All are self-hosted (`app/layout.tsx`, `app/fonts/`); the build fetches no
font from a network. The scale is the `text-mk-*` keys in
`tailwind.config.ts`, each with the design's tracking and line height.

## Layout

A 1280px page (`max-w-mk-page`) with `clamp(20px, 5vw, 56px)` gutters
(`px-mk-gutter`). Check every page at 1280, 390 and 320 wide; nothing scrolls
sideways.

## Components

V2 components live in `components/v2/`: nav and footer, buttons and CTA links,
cards, pills, the screenshot frame and lightbox, FAQ, CTA band, and the
per-page parts (`home/`, `feature/`, `solution/`, `waitlist/`).
Words live in `content/`, never in a component. Screenshots come from the
manifest in `content/shots.ts`, each with alt text.

Every clickable element has a pointer cursor, hover, focus and pressed states,
and is reachable by keyboard.

## Share cards

Each page's Open Graph and Twitter image is drawn by `lib/og-card.tsx` from
the page's `opengraph-image.tsx`: Paper, the mark, an eyebrow and the
headline. Words only; no price is ever drawn into an image.
