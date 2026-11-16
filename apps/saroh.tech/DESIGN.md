# Design system: saroh.tech (Global)

saroh.tech shares saroh.in's design system: the same kit, tokens, type,
layouts, phone rules, nav and footer, and the same kind of screenshot in the
same slot. **Read `apps/saroh.in/DESIGN.md`**; it is the system. This file
lists only where Global differs (DEC-221).

## Differences

- **The world.** `content/world.ts`, built from the Global demo seed
  (`packages/database/src/seed/global/`), the businesses the Global shots
  are taken on. The lead is Thistlewick Bakery (Madison, WI), a bakery as
  Rye & Co. is in India, so the same slots tell the same kind of story. Its
  day is a Tuesday (17 Nov 2026): the seed closes it on Mondays. The salon
  is Larkspur & Vane (Bristol) and the gym Ironvale Fitness (Denver); there
  is no Global florist, so `?trade=florist` shows the bakery.
- **Money words.** Dollars and pounds as the seed prices them; Stripe in
  `MoneyPath`; "Sales tax" in place of GST. No GST, GSTIN, UPI, Razorpay,
  ₹, +91 or Hinglish anywhere (`lib/world.test.ts`, `lib/content.test.ts`).
- **Plans.** Global launches on Free (DEC-211): a `PlanLine` says "Free
  until paid plans open" with "Tell me when" (`lib/tell-me-when.ts`), never
  Grow or Pro. The `*-plans` claim switches stay off here.
- **Screenshots.** Same keys, crops and frames as India, captured from
  `db:seed:global` (`e2e/marketing-shots/shots.global.ts`), retaken fresh
  for every production release with India's. A key with no Global capture
  yet stays on `PENDING_SHOTS` (`content/shots.ts`) and its slot draws
  India's fallback kind, never another visual.
- **Nav.** Solutions, How it works, Templates (its gallery menu) and
  Pricing; no Developers entry until Global has an API page. Links don't
  prefetch (`prefetch={false}`): the site is static HTML.
- **Footer.** Product (LOCKED order, only the features shown here; no "API
  and webhooks" yet), then the rest of the site's links in groups; the note
  names the company, "Region: Global" and the way to saroh.in.
- **Static export.** No Next server: `?trade=` reads in the browser, and a
  dev-only page is `*.dev.tsx` (`app/dev/ui`).

## Changes

- **17 Nov 2026 (DEC-221).** The shared kit, the Global world, the claim
  switches, the shared nav and footer, page bands edge to edge, and the
  `/features` route shell (noindex until drawn).
- **17 Nov 2026, the pages without a board (unit/web-techpages).** As
  saroh.in's: about, contact, customers, the changelog and its entries,
  guides and help (styling only), integrations, the legal pages, pricing's
  head and closing (the plan cards still read the catalogue, Free with
  "Tell me when"), referral, every templates route, the tools hub and every
  tool page. One h1 with the Mark through the kit's `PageHero` /
  `markTitle` (`@saroh/marketing/page-hero`, shared with saroh.in), the
  kit's heading sizes, 48px buttons (`components/shared/button.tsx`'s
  primary is the kit size), 16px cards, "/" crumbs, plain 13px labels for
  the old small caps, and `Closing` (`components/shared/closing.tsx`, the
  kit's `ClosingCTA`; `CtaBand` now draws it) in place of the Ink band.
  Phone: card groups of help, guides, the tools hub, integrations,
  referral's steps and related pages are `SwipeRow`s; each template page
  gets the `StickyBar`. Tool UIs keep their controls as they were. Words,
  routes, titles and SEO fields are unchanged.
- **17 Nov 2026, Home, How it works and the feature pages (DEC-221,
  unit/web-techcore).** `/`, `/features` and every `/features/<slug>` are
  saroh.in's pages from `@saroh/marketing`, in Global's words
  (`content/home.ts`, `content/how-it-works.ts`, `content/feature-keep.ts`,
  `content/reach-*.ts`) and Thistlewick's Tuesday (`content/world.ts`:
  `THISTLEWICK_TUESDAY`, example orders ORD-041 to ORD-045, the hero's
  three phones, the example sites). Kept from the page before: the free
  tools on Home, every feature page's words (a Limited page says what
  works today; Subscriptions marks each part "Not available yet"). Home's
  money band names no provider (Stripe only on /features, check-claims);
  the plan line is "Everyone is on Free for now" with "Tell me when". There
  is no written Global day yet, so no day button or moment. /features is
  indexed. A pending shot draws saroh.in's neutral frame, never nothing.
- **17 Nov 2026, Solutions (unit/web-techsol).** saroh.in's /for hub and
  trade-page layout, from `@saroh/marketing/solutions/*`, over saroh.tech's
  own trades and words. New hub at `/solutions` (noindex until reviewed):
  the four trades at the hour their demo business opens on the world's
  Tuesday, by group and by how customers come; words in
  `content/solutions-hub.ts`. `/solutions/<trade>` keeps every word of
  `content/solutions.ts`: the headline and sub as h1 and lead, the hero
  shot with its "Shown with…" note, each segment as a problem (pain, area,
  and its title, body, screen and "See <feature>" folded under "How Saroh
  helps"), the change title under the problems' heading, Free's card under
  the trade's pricing title, the questions, the closer and the closing
  band's words. The crumbs now name `/solutions`. No Global trade has a
  written day yet, so no page tells one; a day written for one later drops
  in through `TradePageLayout`'s `day`. Same shot keys as before.
