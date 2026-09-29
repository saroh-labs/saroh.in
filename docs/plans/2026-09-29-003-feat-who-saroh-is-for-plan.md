---
title: "feat: Who Saroh is for — a business, just me, or a site for my work"
type: feat
status: active
date: 2026-09-29
origin: DEC-070
decisions: DEC-070, DEC-068 (M1–M3, built on batch 4), DEC-069, DEC-019, ADR-003, ADR-007, DEC-013, DEC-057
epic: TBD
---

# Who Saroh is for

## Problem frame and scope

Setup says "Name your business", the panel explains that "a business is the
thing customers deal with", and `/onboarding/modules` pre-selects Sell for
everyone (`components/modules/module-goal-picker.tsx`, `RECOMMENDED_KEY`).
Home's first run offers Sell first (`lib/home/first-run.ts`, `JOBS`). The
take-money checklist always asks for the registered address
(`lib/settings/ready.ts`, `address()` has no module condition), and Settings'
nudges always ask for a business type and a logo "for receipts"
(`lib/settings/nudges.ts`). A portfolio with only a website is told to
register a company. Invoices sit behind `@RequireModule("PAYMENTS")`
(`apps/api.saroh.in/src/modules/invoices/invoices.controller.ts:48`), and
Send refuses without a connected provider (`invoice-send.service.ts`,
`sendChannels` → `NO_PAYMENT_PROVIDER`), so a freelancer can't send a bill
without switching on online payments. The one site template (`starter`)
says "We build products and experiences our customers love" and points at
images no app serves (`packages/database/src/seed/data.ts` notes it).

The Organization model is already neutral (ADR-001). DEC-070 adds a
**kind** that changes words and defaults, never features.

**In scope:** `Organization.kind`; the "What are you setting up?" step; a
copy layer that reads the kind on the surfaces listed in K2–K5; first-run
order and picker defaults per kind; checklists that appear only when
something invoices or takes money; changing the kind in Settings; invoices
without Payments (issue, send, record paid); the Turn on sheet's defaults
reading the kind; the starter template's copy; three templates and a Projects
block; the product docs.

**Out of scope:**

- Any feature, gate, entitlement, price or plan that differs by kind. Every
  module stays available to every kind.
- Rewording every screen. The copy layer covers the surfaces that name the
  owner or their people in general terms (listed per unit). Entity names
  stay: Sell's **Customers** is the commerce record and keeps its name.
- Asking existing businesses what they are. They are all `BUSINESS` and can
  change it in Settings.
- Template brands (palette and font pairing). They wait for the Brand track
  (plan 008, H2/H3/H9), like G21. The new templates render on the default
  site theme until then.
- Placeholder marking and "Publish anyway" (G21). Kind in the admin
  console. The templates.saroh.in catalogue listing (run the
  `publish-template` skill once K12–K14 are live).
- Subscriptions, plans, packs and courses without Payments. They keep
  DEC-019's rule: with Payments off, nothing is invoiced automatically.

## Requirements

- R1. Setup starts with "What are you setting up?": **A business** (shop,
  studio, practice), **Just me** (freelancer, consultant, creator), **A site
  for my work** (portfolio, blog, projects). The answer is stored as
  `Organization.kind`. (DEC-070 Decision 1)
- R2. The owner can change the kind later in Settings. (DEC-070 Decision 1)
- R3. The kind changes wording and defaults only. No guard, entitlement,
  module gate or API refusal reads it. (DEC-070 Decision 2; the strategy
  note's "the target audience must not be built into the architecture")
- R4. Words follow the kind: "your business" / "you"; "customers" /
  "clients" / "readers"; the name field says "Your name or brand" for Just me
  and A site for my work. (DEC-070 Decision 2)
- R5. The order of Home's first-run jobs follows the kind. Sell is
  pre-selected in `/onboarding/modules` only for a business. (DEC-070
  Decision 2)
- R6. The registered address, business type and logo nudges appear only
  once something that invoices or takes money is on. (DEC-070 Decision 3)
- R7. Invoices work without the Payments module: create, issue, send, record
  paid, void, credit and download. An online pay link still needs Payments
  and a connected provider. (DEC-070 Decision 5, amending DEC-019)
- R8. The Turn on sheet's defaults (DEC-068) read the kind.
- R9. The starter template's copy stops assuming a business. (DEC-070
  Decision 4)
- R10. Three new templates, Portfolio, Blog/writing and Personal/consultant,
  and a Projects block (image, title, summary, link). The kind picks the
  starter template. (DEC-070 Decision 4)
- R11. `PRODUCT.md` and `docs/patterns/saroh-product.md` widen "who it's
  for". (DEC-070 Consequences)
- R12. Existing businesses behave exactly as today: the column is additive,
  with `BUSINESS` as the default. (DEC-070 Consequences)

**Before launch (DEC-070):** R1–R7 and R11, which is K1–K9. K10 (starter
copy) is recommended before launch too: it is small and stops a portfolio's
first site saying "our customers". **Can follow:** R10, which is K11–K15.

## Key technical decisions

- **KTD-1. `kind` is a string column with a CHECK, values `BUSINESS`,
  `SOLO`, `WORK`.** The codebase keeps enum-like values as `as const` arrays
  with a derived type (`backend-data-and-money.md`), as `lifecycleStatus`
  and `BusinessProfile.type` already do. The CHECK keeps bad rows out.
  `ORGANIZATION_KINDS` lives in one file,
  `organizations/organization-kind.ts`, and the app mirrors it in
  `lib/organizations/kind.ts`. It sits on `Organization`, not
  `BusinessProfile`, because the profile row is optional (onboarding skips
  it when empty) and "business profile" is the wrong home for "not a
  business".
- **KTD-2. The kind is readable by every member, and writable with
  `org:update`.** It rides on the `org:read` summary
  (`GET /organizations/:id`, `getSummary`) and the organization list, because
  a Member's Home needs the words too. `/settings` (OWNER/ADMIN only) can't
  carry it alone. Writing it goes through the existing
  `PATCH /organizations/:id` with `org:update` (Owner and Admin). DEC-070
  says "the owner"; see open question 1.
- **KTD-3. One reader on the API, enforced by a source scan.** The API reads
  the kind through `organizationKind(db, orgId)` only. A spec
  (`organization-kind.readers.spec.ts`, modelled on
  `capabilities/module-annotations.spec.ts`) fails if that function, or a
  `kind` select on `organization`, appears outside an allow-list:
  onboarding, settings, the context summary, `capabilities/setup` (defaults)
  and `sites/site-create.ts` (template choice). It must never appear in
  `common/guards`, `capabilities/module-*`, entitlements or any `assert*`.
  This makes R3 a test, not a promise.
- **KTD-4. The words are one pure file in the app.**
  `lib/organizations/kind.ts` exports `kindWords(kind)` → `{ owner, Owner,
  people, People, person, nameLabel, settingsTab }`, plus the defaults
  (`firstRunOrder`, `preselect`, `starterTemplate`). An unknown or absent
  kind (an older API) reads as `BUSINESS`, so nothing changes until the API
  sends one. The API's own merchant words (Home's rows) stay kind-neutral
  rather than growing a second words table. See K4.
- **KTD-5. The words table:**

    | | BUSINESS | SOLO (Just me) | WORK (A site for my work) |
    |---|---|---|---|
    | owner | your business | you | you |
    | people | customers | clients | readers |
    | name field | What is it called? | Your name or brand | Your name or brand |
    | Settings tab | Business | Your details | Your details |
    | registered address | registered address | your address | your address |

- **KTD-6. Defaults per kind:**

    | | BUSINESS | SOLO | WORK |
    |---|---|---|---|
    | First-run jobs, in order | Sell, Bookings, Website, Contacts | Bookings, Invoice a client, Contacts, Website, Sell | Website, Contacts ("Hear from readers"), Bookings, Sell |
    | Picker pre-selects | COMMERCE | nothing | WEBSITE |
    | Setup asks "Is it registered as a company?" | yes | yes | no (asked in Settings, and in place before a first invoice, M3) |
    | Bookings turn-on suggestion | Mon–Sat 10–7, blank service | Mon–Fri 10–6, "Consultation", 60 min | Mon–Sat 10–7, blank service |
    | Starter template (K15) | starter | personal | portfolio |

    "Invoice a client" is a first-run job with no module: it links to
    `/billing/invoices/new`, which K7 makes reachable without Payments. Sell
    is never removed for SOLO or WORK. It is last, per R3.
- **KTD-7. "Something invoices or takes money" is a fact, not the kind.**
  The address, business-type and logo steps apply when any of COMMERCE,
  APPOINTMENTS, COURSES, CLASS_PACKS or PAYMENTS is on, **or** the business
  has an invoice (a new `setup.invoices` count on the settings read). A
  freelancer who drafts a first invoice then sees the address step, and
  DEC-068 M3's in-place sheet asks for it at Issue anyway. The kind never
  decides whether a step applies. It only picks the step's words.
- **KTD-8. DEC-068 M3 stays as it is for every kind.** Issue and Send are
  "before money" and refuse with `BUSINESS_DETAILS_MISSING` until the
  address (and a GST-registered GSTIN) is on file
  (`invoices/business-details.ts`). A Just me invoice prints the sender's
  address too. Only the sheet's words change ("Add your details", "your
  address"). Record paid is a merchant action on paper already issued, so
  it stays unchecked, as M3's table says.
- **KTD-9. Invoices leave the Payments gate; pay links don't.**
  `InvoicesController` loses its class-level `@RequireModule("PAYMENTS")`,
  so authorization is `invoice:*` alone, as the service already does. The
  `:invoiceId/pay-link` route keeps a method-level
  `@RequireModule("PAYMENTS")` + `@IgnoreModuleReadiness()`
  (`ModuleEnforcementGuard` uses `getAllAndOverride`, so method metadata
  wins). `paymentsOn` and `PAYMENTS_SWITCHED_OFF`
  (`invoices/payments-on.ts`) keep governing the **automatic** invoices
  (renewals, packs, courses, subscribe). DEC-019's "with Payments off
  nothing new is invoiced" becomes "nothing is invoiced automatically".
- **KTD-10. Send without a provider sends a view link.** Today Send needs
  a provider because the email's link is a pay link. The link stays the same
  token (`mintPayLink` → `mintInvoiceLink`), but minting it without a usable
  provider is allowed for Send. The public page (`saroh.app/pay/[token]`)
  shows the invoice and its PDF, and offers "Pay online" only when
  `payOnline` is true: Payments is on and `businessPayLinkProvider` finds a
  provider that can open the checkout. A new `payOnline` flag on the send
  view and the public view replaces the `NO_PAYMENT_PROVIDER` blocker. The
  button says "Send with pay link" when `payOnline` is true, "Send invoice"
  when it isn't. The alternative, attaching the PDF, needs attachment
  support that communications doesn't have.
- **KTD-11. With Payments off, Invoices has its own rail row.** In
  `nav-items.tsx`, while Payments is on, Invoices stays under Payments as
  today. While it's off, a top-level **Invoices** row appears
  (`/billing/invoices`, `invoice:read`, no `moduleKey`). `/billing` redirects
  to Invoices when Subscriptions can't be shown. The route keeps its
  address, so no links break.
- **KTD-12. The starter changes by a new version, not in place.** The
  registry keys templates by `id@version`, and sites built from v1 keep
  resolving it. `starter@2` has neutral copy and no image paths that don't
  resolve. Its hero has no image, and the gallery gives way to a text-and-CTA
  section, because `gallery` needs at least one image.
- **KTD-13. The Projects block is a static block (`projects@1`), not a
  bound one.** A project is the merchant's own words and photo. There is no
  Project model to read, and `Organization.projects` is ADR-001's internal
  grouping, not portfolio work, so the block must not bind to it. Its shape:
  `{ variant, padding, title?, items: [{ image?, title, summary?, link? }]
  (1–24) }`. `image` is `imageSchema` and `link` is `linkHref`. Variants
  are `cards` and `list` (`LIST_LAYOUTS`). It follows the Visit us recipe
  (commit `c13a36fc`): contract, rendered, fixtures, renderer, preview, and
  editor fields. `check:blocks` G2/G6/G7 apply: `--site-*` only, and
  `font-site-*` only.
- **KTD-14. No feature flag.** The default kind reproduces today's flows
  exactly, and a flag around wording would only add a second path to test
  (DEC-013 is for staged capability). Invoices without Payments are safe to
  ship on: with `MODULE_ENFORCEMENT` off the gate is already a no-op, and
  with it on, the change only widens access for `invoice:*` holders.

## Implementation units

### K1. `Organization.kind` in the API

**Goal:** Store, accept and serve the kind. Only allowed readers read it.

**Requirements:** R1, R2, R3, R12 · **Dependencies:** none · **Launch:** before

**Files:**
- Modify: `packages/database/prisma/schema.prisma` (`Organization.kind
  String @default("BUSINESS")`)
- Create: `packages/database/prisma/migrations/20261020120000_organization_kind/migration.sql`
- Create: `apps/api.saroh.in/src/modules/organizations/organization-kind.ts`
  (`ORGANIZATION_KINDS`, `OrganizationKind`, `organizationKind(db, id)`)
- Create: `apps/api.saroh.in/src/modules/organizations/organization-kind.readers.spec.ts`
- Modify: `apps/api.saroh.in/src/modules/organizations/dto.ts` (`kind?` on
  `OnboardOrganizationDto` and `UpdateOrganizationDto`, `@IsIn`)
- Modify: `organization-onboarding.service.ts` (write `kind`; audit metadata
  `{ slug, kind }`), `organization-settings.service.ts` (`update` writes and
  audits it; `read` returns it), `organization-context.service.ts`
  (`getSummary` and the list return it), `settings-audit.ts` (label)
- Test: `organization-onboarding.service.spec.ts`,
  `organization-settings.service.spec.ts`, a new
  `organization-kind.db.spec.ts`

**Approach:**
- Migration: `ALTER TABLE "Organization" ADD COLUMN "kind" TEXT NOT NULL
  DEFAULT 'BUSINESS'`, plus `CHECK ("kind" IN ('BUSINESS','SOLO','WORK'))`.
  A constant default needs no table rewrite on PostgreSQL 11+. No backfill.
- Onboarding without `kind` (an older app) stores `BUSINESS`.
- A change of kind is an audited settings change (`changed: ["kind"]`), with
  before and after.
- The readers spec follows KTD-3.

**Test scenarios:**
- Happy: onboard with `SOLO` → the summary, the list and settings all say
  `SOLO`.
- Edge: onboard with no kind → `BUSINESS`. PATCH with no kind leaves it
  unchanged.
- Error: `kind: "SHOP"` → 400 naming `kind`. A Member's PATCH → 403
  (`org:update`).
- DB: the CHECK refuses a raw insert of `"X"`. A migration replay matches
  the schema (`db:verify:replay`).
- Source scan: a stray `organizationKind(` in `common/guards` fails the
  spec.

**Verification:** `pnpm --filter @saroh/api test:unit`, then `test:int` for
the db spec. `db:verify:replay` is green.

---

### K2. "What are you setting up?" and the words

**Goal:** Setup asks the kind first, and the setup screen speaks in its
words.

**Requirements:** R1, R4 · **Dependencies:** K1 · **Launch:** before

**Files:**
- Create: `apps/app.saroh.in/lib/organizations/kind.ts` (+ `kind.test.ts`):
  the kinds, `kindOf(raw)` (unknown → `BUSINESS`), `kindWords`, and the
  KTD-6 defaults
- Create: `apps/app.saroh.in/components/organizations/setup-kind-choice.tsx`
- Modify: `apps/app.saroh.in/app/onboarding/page.tsx` (title, panel copy per
  kind), `components/organizations/business-setup-form.tsx`,
  `lib/organizations/actions.ts` (`createOrganization` sends `kind`),
  `lib/organizations/service.ts` (`Organization.kind`),
  `lib/organizations/settings-service.ts` (`OrganizationSettings.kind`)
- Modify: `packages/database/src/seed/data.ts` (a `founder@saroh.dev` person who
  owns nothing), `e2e/fixtures/sessions.ts` and `e2e/tests/auth.setup.ts`
  (their session)
- Test: `business-setup-form.test.tsx`, `e2e/tests/setup-kind.spec.ts`

**Approach:**
- The question is the form's first field: three large radio cards with the
  DEC-070 examples, and nothing pre-chosen. The rest of the form shows once a
  card is picked, on the same screen, so there is still one step. The page
  `<title>` becomes "Set up Saroh".
- The name label comes from `kindWords(kind).nameLabel`, and the
  placeholder follows the kind ("Rye & Co. Bakery" / "Asha Rao" / "Asha Rao
  Studio"). "Customers see this on receipts" becomes "People see this on
  your site and invoices".
- WORK hides "Is it registered as a company?" (KTD-6). The country stays for
  every kind, because time zone and currency read it.
- The panel copy stops defining a business: "Name it and Saroh opens. You
  decide what it does from inside."
- The switcher's "New business" says "Set up another" for the same flow.
- Keep the address field's words unchanged: DEC-069's plan owns "web
  address" (see Risks).

**Test scenarios:**
- Vitest: `kindWords` for each kind. An unknown kind → the BUSINESS words.
- Vitest: the form refuses submit with no kind ("Choose what you're setting
  up"). WORK sends no `type`.
- e2e (`@covers app:/onboarding api:organizations`), as `founder`: pick Just
  me, and the label reads "Your name or brand". Create a stamped business,
  and its summary kind is `SOLO`. Repeat for A site for my work at phone
  width.

**Verification:** Setup at desk and phone widths, in light and dark. Axe is
clean on the radio cards.

---

### K3. First run and the module picker follow the kind

**Goal:** Home's first-run jobs and `/onboarding/modules` order and
pre-select by kind.

**Requirements:** R4, R5 · **Dependencies:** K2, K7 ("Invoice a client"
needs Invoices without Payments) · **Launch:** before

**Files:**
- Modify: `apps/app.saroh.in/lib/home/first-run.ts` (+ test):
  `firstRunJobs(modules, kind)` orders by `firstRunOrder(kind)`, and a
  module-less `INVOICE` job for SOLO carries `href` instead of `key`
- Modify: `components/home/first-run-jobs.tsx` (an href job is a link;
  words: "Keep track of clients" / "Hear from readers"),
  `components/home/home-dashboard.tsx` (passes the kind),
  `app/(shell)/page.tsx` (reads the kind from the active organization)
- Modify: `components/modules/module-goal-picker.tsx` (`preselect(kind)`
  replaces `RECOMMENDED_KEY`; goal titles use `people`),
  `app/onboarding/modules/page.tsx` ("What do you need to do?")
- Test: `first-run.test.ts`, `module-goal-picker.test.tsx`,
  `e2e/tests/first-run-kind.spec.ts`

**Approach:**
- The order is data from `kind.ts`, so K3 only reads it.
- The "Invoice a client" job is offered only to holders of `invoice:write`,
  by the same "no dead card" rule as `firstRunJobs`. It vanishes once the
  business has an invoice.
- The picker's comment about the 2026-08-02 commerce-led decision is
  updated: commerce leads for a business.

**Test scenarios:**
- Vitest: BUSINESS → Sell first and COMMERCE pre-selected (today's
  behaviour). SOLO → Bookings first and nothing pre-selected. WORK → Website
  first and WEBSITE pre-selected. A job whose module is dark (DEC-057) is
  still left out.
- Vitest: a SOLO Member without `invoice:write` sees no Invoice job.
- e2e (`@covers app:/ app:/onboarding/modules`), as `founder` on a
  business of its own: WORK's first card is "Put up a website", and opening
  it opens the Turn on sheet for Website.

**Verification:** Home first run at desk and phone widths for each kind.

---

### K4. Checklists only when something invoices or takes money

**Goal:** The address, business-type and logo steps apply only when money
or an invoice is involved, in the kind's words.

**Requirements:** R4, R6 · **Dependencies:** K1, K2 · **Launch:** before

**Files:**
- Modify: `apps/api.saroh.in/src/modules/organizations/organization-settings.service.ts`
  (`setupFacts` gains `invoices`: a count of non-void invoices), and its spec
- Modify: `apps/api.saroh.in/src/modules/home/home-business-details.ts`
  (neutral words: "the address your invoices print")
- Modify: `apps/app.saroh.in/lib/settings/ready.ts` (a `handlesMoney(modules,
  facts)` test gates `address()`; labels from `kindWords`),
  `lib/settings/nudges.ts` (`businessType` and `logo` gated the same way),
  `lib/settings/ready-service.ts` (passes the kind),
  `lib/organizations/settings-service.ts` (`SetupFacts.invoices`)
- Modify: `components/home/take-money-checklist.tsx` (heading when no money
  step applies: "Get your site live"),
  `components/settings/ready-checklist.tsx` (heading),
  `components/organizations/business-details-sheet.tsx` and
  `use-business-details-step.tsx` (the sheet's words)
- Test: `ready.test.ts`, `nudges.test.ts`,
  `use-business-details-step.test.tsx`

**Approach:**
- `handlesMoney` follows KTD-7. An older API with no `setup.invoices` falls
  back to modules alone.
- Payments' own step already returns `null` when nothing sells, so it
  doesn't change.
- If no step applies, the card isn't shown. `takeMoneyPlace` already
  returns `null` for `total === 0`.
- The heading follows the steps, not the kind: "Get ready to take money"
  when a money step is in the list, else "Get your site live".

**Test scenarios:**
- Vitest: only Website on and no invoices → steps = [site]; no address, no
  type, no logo.
- Vitest: the same, with one draft invoice → address, type and logo are
  back.
- Vitest: Bookings on → the address applies (today's behaviour).
- Vitest: SOLO → "Add your address", and the sheet's title is "Add your
  details". BUSINESS → unchanged strings.
- DB (API): `setup.invoices` counts drafts and issued invoices, not void
  ones, for this business only.

**Verification:** Northwind's Home is unchanged. A fresh WORK business with
Website on shows one step.

---

### K5. Change the kind in Settings

**Goal:** Settings › Business (the "Your details" tab for SOLO and WORK)
lets whoever holds `org:update` change the kind.

**Requirements:** R2, R4 · **Dependencies:** K1, K2 · **Launch:** before

**Files:**
- Modify: `apps/app.saroh.in/components/organizations/organization-settings-form.tsx`
  (a "What is this?" radio group at the top of Identity),
  `lib/organizations/settings-actions.ts`,
  `app/(shell)/settings/(sections)/organization/page.tsx` (tab and heading
  words), `lib/settings/search.ts` ("What you're setting up")
- Test: `organization-settings-form.test.tsx`,
  `e2e/tests/business-settings.spec.ts` (extended)

**Approach:**
- Saves on its own like the other Identity fields, with the settings Undo
  toast (`settings-undo.ts`).
- The note under it says what is true: "Changes the words Saroh uses and
  what it suggests first. Nothing is turned on or off."
- Hidden from anyone without `org:update`, as the rest of the form is.

**Test scenarios:**
- Vitest: switching to Just me saves `kind: "SOLO"` and offers Undo.
- e2e `@serial` on Northwind (`@covers app:/settings/organization
  api:organizations api:audit`): change to Just me, check that the tab reads
  "Your details" and the activity log records it, then put it back to A
  business.

**Verification:** Desk and phone. The Undo puts back the words.

---

### K6. Invoices without Payments (API)

**Goal:** Invoicing needs only `invoice:*`. Send works without a provider.
Pay links still need Payments and a provider.

**Requirements:** R7 · **Dependencies:** none · **Launch:** before

**Files:**
- Modify: `apps/api.saroh.in/src/modules/invoices/invoices.controller.ts`
  (KTD-9)
- Modify: `invoices/invoices.service.ts` (`mintInvoiceLink(db, org, id, {
  requireProvider })`; `payLink` requires it, Send doesn't),
  `invoices/invoice-send.service.ts` (`sendChannels` drops
  `NO_PAYMENT_PROVIDER`; the view gains `payOnline`; the template var tells
  the email "Pay online" or "View your invoice"),
  `invoices/send-view.ts`, `invoices/payments-on.ts` (the comment:
  automatic invoicing only)
- Modify: `communications/transactional.ts` and the invoice email templates
  (words for `payOnline: false`)
- Modify: `payments/public-invoices.service.ts` (`read` returns `payOnline`;
  `payment-intent` and `autopay` refuse with 409 "This business doesn't take
  payment online" when it is false)
- Modify: `home/home.service.ts` (the "Overdue invoices" and "Business
  details" slots are gated on `invoice:read` / `org:update`, not on
  `available.has("PAYMENTS")`)
- Modify: `capabilities/module-annotations.spec.ts` (invoices move from
  `CLASS_LEVEL`; a method-level pin keeps the pay-link route under Payments)
- Test: `invoice-send.service.spec.ts`, `invoice-send.db.spec.ts`,
  `invoices.db.spec.ts`, `public-invoices.service.spec.ts`,
  `home.sources.spec.ts`, and a new `invoices-without-payments.db.spec.ts`

**Approach:**
- M3's `assertBusinessDetails` stays on Issue, Send and the pay link
  (KTD-8).
- `payOnline = paymentsOn(db, org) && provider usable` (the
  `businessPayLinkProvider` rule, without throwing).
- An already-sent pay link on a business that later turns Payments off
  opens as a view link. It never errors.

**Test scenarios:**
- DB: Payments row DISABLED and no provider → create, issue, send (email
  queued with a view link), record a cash payment → PAID. Make pay link →
  403/409 (module).
- DB: Payments on with a connected provider → Send's email carries the pay
  link, and `payOnline` is true (today's behaviour).
- DB: with Payments off, `payment-intent` on the token → 409. The public
  read still returns the invoice.
- Unit: Home lists an overdue invoice for a business with Payments off.
- Integration: with RLS on, business A's token never reads B's invoice
  (existing spec, re-run).
- Renewals still wait with Payments off (the `subscription-renew` spec
  still passes).

**Verification:** `test:unit` and `test:int` are green. The annotation spec
pins the new split.

---

### K7. Invoices without Payments (workspace and pay page)

**Goal:** A business without Payments finds Invoices, sends one and records
it paid. The customer's page shows the invoice without a Pay button.

**Requirements:** R7 · **Dependencies:** K6 (the API ships first) ·
**Launch:** before

**Files:**
- Modify: `apps/app.saroh.in/components/shared/nav-items.tsx` (KTD-11),
  `components/shared/command-menu.tsx` ("New invoice" drops `moduleKey`),
  `lib/contacts/panels.ts` (the invoices panel drops `moduleKey`),
  `app/(shell)/billing/invoices/layout.tsx` (a permission gate, not
  `ModuleGate`), `app/(shell)/billing/page.tsx` (the redirect)
- Modify: `components/invoices/send-dialog.tsx`, `invoice-actions.tsx`,
  `invoice-detail.tsx`, `lib/invoices/…` (the send view type:
  `payOnline`; "Send invoice" vs "Send with pay link"; with no provider,
  "Copy pay link" is offered only when `payOnline`)
- Modify: `apps/saroh.app/components/invoice-pay.tsx`,
  `apps/saroh.app/lib/invoice-pay.ts` (with no `payOnline`: the invoice,
  "Download PDF", and "Pay <business> the way they've asked you to")
- Test: `nav-items.test.ts`, `send-dialog.test.tsx`, `invoice-pay.test.tsx`,
  `e2e/tests/invoices-without-payments.spec.ts`

**Approach:**
- Nothing in the workspace decides `payOnline`. It comes from the API
  (`saroh-product.md`: the workspace never guesses).
- The copy "Saroh doesn't send this" stays where no channel exists
  (`sendChannels` still names none without email).

**Test scenarios:**
- Vitest: the rail with Payments off shows a top-level Invoices row, and
  with Payments on, Invoices sits under Payments.
- Vitest: `payOnline: false` → the button reads "Send invoice", with no
  "Copy pay link".
- e2e (`@covers app:/billing/invoices api:invoices site:/pay`), as
  `founder` on a business of its own with only Contacts on: create a
  contact, draft, issue (the M3 sheet asks for the address in place), record
  a cash payment, and check the status is Paid. Open the link from Send's
  view: no Pay button.
- e2e phone width: the Invoices row is reachable from the tab bar's More.

**Verification:** Desk, phone and dark. Northwind (Payments on) is
unchanged.

---

### K8. The Turn on sheet reads the kind

**Goal:** DEC-068's defaults follow KTD-6.

**Requirements:** R8 · **Dependencies:** K1 · **Launch:** before (small)

**Files:**
- Modify: `apps/api.saroh.in/src/modules/capabilities/setup/module-setup.service.ts`
  (`defaults` reads `organizationKind`: APPOINTMENTS hours and the service
  suggestion per kind)
- Test: `module-setup.db.spec.ts`

**Approach:** Only the prefill changes. The payload, validation and
transaction are untouched. K15 adds the Website template default later.

**Test scenarios:**
- DB: SOLO → Mon–Fri 10:00–18:00 and "Consultation", 60 min.
  BUSINESS → the current defaults.
- An edited suggestion is saved as sent, not as the default.

**Verification:** `test:int`. Northwind's sheet is unchanged.

---

### K9. Product docs widen who it's for

**Goal:** The docs say what DEC-070 made true.

**Requirements:** R3, R7, R11 · **Dependencies:** K6 (to describe the
invoice rule as built) · **Launch:** before

**Files:**
- Modify: `PRODUCT.md` (Users: businesses, people working for themselves,
  people showing their work; Product Purpose; Positioning: commerce leads for
  a business)
- Modify: `docs/patterns/saroh-product.md` ("Who uses it": the three kinds
  and the words-only rule; "Money a person owes": invoices without Payments,
  pay links with it, and "Mention an invoice only when Payments is on"
  narrowed to automatic invoices)
- Modify: `docs/patterns/backend-billing-and-classes.md` (the gate split,
  and `payOnline`), `docs/architecture/DECISIONS.md` (an "Amended by
  DEC-070" line under DEC-019), `docs/patterns/README.md` if a row is needed

**Test scenarios:** none (docs). Check each statement against the code
(00-universal §12).

**Verification:** A reviewer can find the kind rule from `AGENTS.md`'s
Triggers row for merchant-facing copy.

---

### K10. The starter's copy stops assuming a business

**Goal:** `starter@2`: neutral words, and no broken images.

**Requirements:** R9 · **Dependencies:** none · **Launch:** before
(recommended)

**Files:**
- Modify: `packages/templates/src/templates/starter.ts` (export
  `starterTemplateV1` unchanged and `starterTemplate` = v2),
  `packages/templates/src/registry.ts` (register both),
  `packages/templates/src/instantiate.test.ts`
- Modify: `packages/database/src/seed/data.ts` (the comment about missing
  images)

**Approach:**
- The copy: "Welcome — here's what {name} does." "Get in touch" stays. The
  About page reads "About {name}", with a story placeholder that fits a
  person or a firm.
- No images: the hero has none, and the gallery becomes a `richText` +
  `cta`. The Publication stamp (`sites.service.ts:1788`) takes the new
  version.

**Test scenarios:**
- Vitest: v2 instantiates, and every section passes the contract. No
  section references `/templates/starter/`. v1 still resolves by
  `getTemplate("starter", 1)`.
- Vitest: v2 copy never contains "customers", "we build" or "our story".

**Verification:** Turn on Website for a fresh business, and the draft shows
no broken image.

---

### K11. The Projects block

**Goal:** `projects@1` (KTD-13), rendered on sites and edited in the
editor.

**Requirements:** R10 · **Dependencies:** none · **Launch:** follows

**Files:**
- Modify: `packages/block-contract/src/section-contract.ts` (schema,
  `SECTION_TYPES`, registry), `rendered.ts`, `to-rendered.ts`,
  `fixtures.ts`, `variants.ts`, `examples.test.ts`,
  `section-contract.test.ts`, `variants.test.ts`
- Create: `packages/site-blocks/src/blocks/projects.tsx` (+ test)
- Modify: `packages/site-blocks/src/section-renderer.tsx`, `index.ts`,
  `block-fixture-preview.tsx`, `blocks.test.tsx` (+ snapshot)
- Create: `apps/app.saroh.in/components/sites/section-fields/projects.tsx`
- Modify: `apps/app.saroh.in/components/sites/section-fields/index.tsx`,
  `block-kinds.ts` (+ test), `block-icons.ts`, `editor-constants.ts`,
  `empty-section.ts`
- Modify: `apps/api.saroh.in/src/modules/sites/site-flags.ts` (a project
  image with no alt text is flagged before publish, as G7's photo is)

**Approach:**
- Cards: image on top, title, summary, and "View project" when there is a
  link. List: a row per project. An external link opens in the same tab
  with `rel="noopener"` per `linkHref`.
- The editor adds, reorders and removes items, with the media picker for
  the image.
- Items with no image render without a gap.

**Test scenarios:**
- Contract: a valid fixture passes. 0 items or 25 items → refused. A
  `javascript:` link → refused.
- Render: a snapshot for cards and list. Axe: images have their alt, and
  links have names.
- `pnpm run check:blocks` is green (G2, G6, G7).
- Vitest: the editor's add/reorder/remove round-trips through the draft.

**Verification:** The ui.saroh.in catalogue and a draft site at desk and
phone widths.

---

### K12. Portfolio template

**Goal:** `portfolio@1`: Home (hero, projects, enquiry), Work (projects),
About (richText + contact).

**Requirements:** R10 · **Dependencies:** K11 · **Launch:** follows

**Files:**
- Create: `packages/templates/src/templates/portfolio.ts` (+
  `portfolio.test.ts`)
- Modify: `packages/templates/src/index.ts` (export only; K15 registers it)

**Approach:** Content builders from `TemplateContext`, as the starter does.
Three sample projects have placeholder text and no image paths.

**Test scenarios:** It instantiates and every section validates. The copy
is kind-neutral. No asset path is used that doesn't exist.

**Verification:** `pnpm --filter @saroh/templates test`.

---

### K13. Blog/writing template

**Goal:** `writing@1`: Home (hero, journal), About (richText), Contact
(enquiry).

**Requirements:** R10 · **Dependencies:** none (journal exists, G10) ·
**Launch:** follows

**Files:** Create `packages/templates/src/templates/writing.ts` (+ test).
Modify `packages/templates/src/index.ts`.

**Approach:** The journal block reads the site's posts live. An empty
journal already says so, so the template adds no sample posts.

**Test scenarios:** It instantiates and validates. It renders with zero
posts without a false claim.

**Verification:** Package tests.

---

### K14. Personal/consultant template

**Goal:** `personal@1`: Home (hero, features, servicesList, cta), About,
Contact (enquiry).

**Requirements:** R10 · **Dependencies:** none · **Launch:** follows

**Files:** Create `packages/templates/src/templates/personal.ts` (+ test).
Modify `packages/templates/src/index.ts`.

**Approach:** `servicesList` is bound. It is included only when the
template context says Appointments is on, and it is otherwise replaced by
`features`. That needs `TemplateContext.modules?: string[]`, filled in
`site-create.ts` `buildTemplateContext`. Because K15 owns `site-create.ts`,
the template reads the field defensively here.

**Test scenarios:** With and without Appointments, it instantiates and
validates.

**Verification:** Package tests.

---

### K15. Register the templates, and the kind picks one

**Goal:** The three templates are listed, and a new site starts from the
kind's template.

**Requirements:** R8, R10 · **Dependencies:** K8, K10, K12, K13, K14 ·
**Launch:** follows

**Files:**
- Modify: `packages/templates/src/registry.ts`, `manifest.ts`
  (`TemplateContext.modules`)
- Modify: `apps/api.saroh.in/src/modules/sites/site-create.ts`
  (`buildTemplateContext` fills `modules`; with no `templateId`, the default
  is the kind's), `capabilities/setup/module-setup.service.ts` (Website's
  defaults name the template)
- Modify: `apps/app.saroh.in/lib/organizations/kind.ts`
  (`starterTemplate`), `components/sites/create-site-form.tsx` (pre-selects
  it), `components/modules/turn-on/setup-fields.tsx` (one line: "Starts
  from Portfolio")
- Test: `site-create` db spec, `module-setup.db.spec.ts`,
  `create-site-form.test.tsx`, and e2e `site-templates.spec.ts` (as
  `founder`)

**Approach:** `GET …/templates` already lists the registry. The explicit
choice in `/sites/new` still wins over the default.

**Test scenarios:**
- DB: WORK and Turn on Website → the draft pages are the portfolio's.
  BUSINESS → `starter@2`. An explicit `templateId` wins.
- e2e: a WORK business's new site shows the Projects block in the editor.

**Verification:** A new site for each kind at desk and phone widths. Then
run `publish-template` for the catalogue.

## Rollout

- **Expand only.** K1's migration
  `20261020120000_organization_kind` adds a defaulted column. The previous
  API ignores it, and the previous app never sends `kind`, which the new API
  defaults. **The API ships before the app** for K1→K2/K5 and K6→K7. The
  `saroh.app` pay page deploys after K6's API (it reads `payOnline`, and an
  older API without it means "as today": show Pay).
- **No backfill.** Every existing Organization is `BUSINESS` by the column
  default (R12).
- **No flags** (KTD-14). The enforcement flag `MODULE_ENFORCEMENT` keeps
  governing gates as before.
- **Contract steps for later:** none are required. Optional follow-up:
  delete `components/invoices/payments-denied.tsx` once no route uses it.
- **Seed:** K2 adds the `founder` person. K10 changes no seeded site, which
  is written from explicit sections.
- **Migration timestamp:** `20261020120000`. The DEC-069 and DEC-071 plans
  add migrations in the same window, so re-check the order before merge.
  Each is additive and independent.

## Waves

| Wave | Units (parallel) | Why together |
|---|---|---|
| 1 | K1, K6, K10 | Disjoint areas: organizations and schema; invoices, public invoices and home; templates |
| 2 | K2, K7, K8 | K2 and K8 need K1, and K7 needs K6. K2 owns `lib/organizations/*`, K7 owns nav, billing and the pay page, and K8 owns `capabilities/setup` |
| 3 | K3, K4, K5 | All need K2 (K3 also needs K7). Files: K3 has Home first run and the picker; K4 has `lib/settings/ready*`, the checklists and the M3 sheet; K5 has the settings form and page |
| 4 | K9 | Docs, once K6 is merged |
| — | **Launch line** | K1–K10 |
| 5 | K11, K13, K14 | New files. K11 edits block-contract and site-blocks; K13 and K14 edit only their own template files (the `index.ts` export lines are a trivial merge) |
| 6 | K12 | Needs K11 |
| 7 | K15 | Needs K8, K10 and K12–K14. It alone edits `registry.ts` and `site-create.ts` |

## Risks and open questions

1. **Who may change the kind?** DEC-070 says "the owner", but
   `PATCH /organizations/:id` is `org:update` (Owner and Admin).
   **Recommended:** `org:update`. The kind changes only words, and an Admin
   already edits the name. If the user wants Owner-only, K1 adds an Owner
   check on the `kind` field alone.
2. **What does "Just me" pre-select in `/onboarding/modules`?** DEC-070
   says only that Sell is pre-selected for a business. **Recommended:**
   nothing for Just me, whose first job is often an invoice and needs no
   module, and Website for A site for my work ("website first").
3. **How is an invoice sent without a provider?** **Recommended:** a view
   link to the same page, with no Pay button (KTD-10). Attaching the PDF
   would need attachment support in communications. That is a later
   upgrade, not needed for launch.
4. **Does Just me need an address before a first invoice?** M3 refuses
   Issue and Send without one. **Recommended:** keep it (KTD-8). The
   in-place sheet makes it one step, and an invoice without a sender address
   is poor paper. Only the words change.
5. **Should existing businesses be asked their kind once?**
   **Recommended:** no. Settings is enough, and the default is today's
   behaviour.
6. **Conflict with the DEC-069 plan.** Both edit
   `business-setup-form.tsx` (DEC-069 renames the address field to "web
   address"). K2 leaves the address field alone. Whichever lands second
   rebases, and the edits don't overlap in lines.
7. **Conflict with DEC-068's M-units still open on batch 4.** K3 and K8
   edit `module-goal-picker.tsx`, `first-run-jobs.tsx` and
   `module-setup.service.ts`, which M1/M2 just changed. Start K3 and K8 from
   a base that has M1–M3 merged (batch 4 already does).
8. **Templates render without a brand until the Brand track lands.** They
   use the default site theme. When H3's catalogues ship, each gains a
   pairing, as G21 planned. Accepted.

## Issue list

- K1 — `organizations(K1): Organization.kind, stored, served and read only for words`
- K2 — `onboarding(K2): "What are you setting up?" and the words it sets`
- K3 — `home(K3): First run and the module picker follow the kind`
- K4 — `settings(K4): Address, business type and logo only when something invoices or takes money`
- K5 — `settings(K5): Change what you're setting up`
- K6 — `invoices(K6): Invoice, send and record paid without Payments (API)`
- K7 — `invoices(K7): Invoices without Payments in the workspace and on the pay page`
- K8 — `modules(K8): The Turn on sheet's defaults follow the kind`
- K9 — `docs(K9): Saroh is for businesses, people working for themselves, and people showing their work`
- K10 — `sites(K10): The starter template stops assuming a business`
- K11 — `sites(K11): Projects block`
- K12 — `sites(K12): Portfolio template`
- K13 — `sites(K13): Blog and writing template`
- K14 — `sites(K14): Personal and consultant template`
- K15 — `sites(K15): A new site starts from the kind's template`

## Resolved open questions (user, 2026-09-29)

The user accepted every recommendation in "Risks and open questions" above as written ("all as recommended"). Treat each recommendation as the decision.
