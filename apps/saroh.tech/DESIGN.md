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
