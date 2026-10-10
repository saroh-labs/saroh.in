# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Saroh is for three kinds of people (DEC-070). Setup asks "What are you
setting up?" first, and the answer is stored as the Organization's _kind_:

| Kind                   | Who                                           | What they start with           |
| ---------------------- | --------------------------------------------- | ------------------------------ |
| **A business**         | A shop, studio or practice                    | Selling, bookings, a website   |
| **Just me**            | A freelancer, consultant or creator           | Clients, bookings and invoices |
| **A site for my work** | Someone showing a portfolio, blog or projects | A website first                |

**The kind changes words and defaults, never features.** Every module is
there for every kind; the kind picks the words ("your business" or "you";
customers, clients or readers), the order of the first things to do, and
what the module picker suggests. It can be changed later in Settings.

**A business is often a small team with mixed roles, 2–5 people**, sharing
one workspace. Someone is on orders, someone is on bookings, an owner
oversees. Someone working for themselves is a team of one. Nobody is a
full-time software operator; the tool is a means to the work.

They are the same people across four genuinely different scenes, all confirmed:

| Scene                                        | What it demands                                                            |
| -------------------------------------------- | -------------------------------------------------------------------------- |
| Desk, long sessions                          | Density and scanning; hover is available but must never be load-bearing    |
| Phone, short bursts, one-handed              | Large targets, no hover, thumb-reachable primary actions                   |
| Shop floor / warehouse, bright ambient light | Contrast well above the WCAG floor; glanceable, not readable-if-you-squint |
| Evenings at home, low light                  | Dark is a first-class surface, not an inverted afterthought                |

A design that serves only the desk scene fails three of the four.

Secondary: Saroh platform staff in `admin.saroh.in` (separate surface, separate
authorization model).

## Product Purpose

Saroh is one workspace where a small business, someone working for
themselves, or someone showing their work runs what they need of selling,
bookings, invoices, the people they deal with, messaging and a public
website, switching on only the capabilities they use.

Success is the merchant opening the workspace and knowing what needs attention
without hunting — then doing that thing.

## Positioning

**Commerce leads for a business, and nothing is commerce-only** (product
decision 2026-08-02, widened by DEC-070 on 2026-09-29). For a business,
Sell comes first and is suggested at setup. Just me starts with bookings
and invoicing a client, and A site for my work starts with the website;
Sell is still there for both, last rather than gone. Invoicing needs no
module: only taking money online needs Payments. Capability
modules with a typed registry, real dependencies and derived
readiness states; a merchant enables what they need and the interface changes
shape accordingly.

The differentiating claim — one customer record behind an order _and_ a booking
— is **not yet true**. `Customer` is store-scoped and reconciliation to a
`Contact` is manual. It was deliberately removed from the marketing site rather
than left standing (commit `38b8b87`). Future work must not reintroduce it until
auto-linking ships.

## Operating Context

- `app.saroh.in` — the merchant workspace (this surface, **Operate** mode)
- `accounts.saroh.in` — the single identity provider
- `admin.saroh.in` — internal staff control plane
- `saroh.app` — renders **merchants' own** public sites (`*.saroh.app`)
- `saroh.in` — marketing (Persuade mode)

Navigation is capability-gated: a merchant with Commerce off never sees Sell.
Home is a ranked action list — ATTENTION, then OVERDUE, then SETUP, then
SUGGESTION — so the first thing on screen is the most consequential.

## Capabilities and Constraints

- pnpm workspaces + Turborepo; Next.js 16 App Router, React 19, Tailwind 3.4
- `api.saroh.in` (NestJS) is the **only** database-facing service; frontends
  never reach Postgres directly
- Shared design tokens live in `packages/ui/src/globals.css` and
  `tooling/tailwind-config`; four apps consume them
- `--accent` is a shadcn neutral (32 component usages), **not** a brand accent —
  renaming it breaks components
- Turning a capability off never deletes merchant data
- Sign-up is closed until early access opens, and opening it is the owner's
  call on judgement, not a checklist. Two switches hold it shut, and flipping
  both is the whole of opening: production `accounts.saroh.in` admits only a
  browser holding the prelaunch key while `PRELAUNCH_GATE` is `on` in
  `apps/accounts.saroh.in/wrangler.jsonc` (anyone else lands on
  www.saroh.in; `off` and the next deploy takes the key away), and
  `saroh.in` sends every start button to `/waitlist` and shows no Sign in or
  Pricing until `NEXT_PUBLIC_LAUNCH_MODE` is `open` (`apps/saroh.in/lib/links.ts`).
  Until then people join the waitlist (`WaitlistSignup`), and staff invite
  from it in `admin.saroh.in` (`waitlist:invite`); the invitation's sign-up
  link works once accounts is open

## Brand Commitments

The name **Saroh** and its wordmark stay. Everything else — palette,
typography, shape, density, motion — is explicitly open (confirmed 2026-08-04).

**Merchant sites must stay neutral.** `saroh.app` renders merchants'
sites and must never inherit Saroh's brand. The `--site-*` token layer is
separate by design and stays that way.

## Vocabulary

The words a merchant reads (DEC-069). Code identifiers keep their older names.

| Say                    | Means                                                                     | Never say                         |
| ---------------------- | ------------------------------------------------------------------------- | --------------------------------- |
| **Location**           | A place the business sells from in person (`Store`, "storefront" in code) | storefront, store                 |
| **Your online shop**   | The website's `/shop`, selling from one location's stock                  | online store, storefront          |
| **Customers visit**    | A location with an address, hours and collection (`SHOP` kind)            | shop (as a kind)                  |
| **No counter**         | A location holding stock for online orders only (`ONLINE` kind)           | online store (as a kind)          |
| **Web address**        | The business's website address, `<address>.saroh.app` or its domain       | address, subdomain, Saroh address |
| **Registered address** | The business's legal address, on invoices                                 | address                           |
| **Location address**   | Where a location is, on its receipts                                      | address                           |
| **Posts path**         | Where the blog's posts live on the site                                   | writing address                   |

## Evidence on Hand

- `docs/product-transformation/` — six audit and strategy documents
- Seeded demo organization "Northwind Supply": 24 contacts, 16 leads, 3
  services, 10 bookings, 12 products, 10 orders (`pnpm --filter @saroh/database
db:seed`; sign in `demo@saroh.dev` / `demo-password-123`)
- The merchant activation path is instrumented (#176): typed, organization-scoped
  events cover onboarding completion and time-to-first-useful-action. There is
  still **no** usage history to cite — the events exist, the data does not yet —
  and there is no A/B history. Nothing tracks a merchant's own customers, and
  nothing should.
- No customers, testimonials, or case studies. Do not fabricate them.

## Product Principles

1. **Outcome vocabulary, not module names.** The merchant answers "what does
   your business need to do?" in outcomes; the interface keeps those words.
2. **Say what is true.** Claims in UI and marketing match what ships; a capability
   that is configured-but-broken says so rather than reporting healthy.
3. **Reversible by default.** Choices can be undone; turning something off never
   destroys what it held.
4. **The most consequential thing is first.** Ranked attention, not a dashboard
   of equal tiles.
5. **Four scenes, one interface.** Desk, phone, shop floor and evening are all
   primary; none is a degraded mode of another.

## Accessibility & Inclusion

Bright-ambient use makes contrast a functional requirement, not a compliance
one: body text targets materially above 4.5:1 rather than at it. No affordance
may depend on hover, since phone and shop-floor use have no hover at all. Touch
targets sized for hurried, possibly gloved, one-handed use.
