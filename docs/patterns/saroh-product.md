# Saroh product context

> **Read when:** designing or changing anything a merchant sees, deciding what
> to build, or writing copy, a claim or a status.
> Sources: `PRODUCT.md` (the short brief), `docs/PRODUCT_STRATEGY.md` (§ numbers
> below), ADR-001 to ADR-004 and DEC-010 to DEC-016. Where this file and those
> disagree, they win — fix this file in the same change.

These are the product facts that change engineering rules. The technical
pattern files refer back here.

## Who uses it

- **Current** — A small team of 2–5 people with mixed roles, sharing one
  workspace; nobody is a full-time software operator (`PRODUCT.md`). Avoid
  complexity designed for large specialised teams (§3). Saroh staff use
  `admin.saroh.in`, a separate surface with its own authorization.
- **Current** — Four primary scenes: desk, phone one-handed, bright shop floor,
  evening in the dark. None is a degraded mode of another (§18). See
  `frontend-design-system.md`, `frontend-verification.md` and
  `.agents/skills/saroh-four-scenes/SKILL.md`.

## What it must answer

- **Current** — "What should I do next?" (§4). Home is a ranked action list —
  ATTENTION, then OVERDUE, then SETUP, then SUGGESTION — computed in
  `apps/api.saroh.in/src/modules/home` and rendered through
  `lib/home/service.ts`. The most consequential thing goes first; not a
  dashboard of equal tiles.
- **Current** — A source that fails to load degrades into a named notice; it
  never becomes a zero or a false "nothing to do"
  (`.agents/skills/saroh-product-states/SKILL.md`).

## Capabilities (modules)

- **Current** — Eight capability modules (ADR-003): Website, CRM,
  Appointments, Commerce, Payments, Communications, Automations, Insights.
  `apps/api.saroh.in/src/modules/capabilities/module-registry.ts` is the source
  of truth; never hard-code a module key.
- **Current** — A module is available only when four gates hold: its rollout
  flag, selection by the Organization (or Project), its dependencies, and the
  actor's permission. Readiness (`ACTIVE`, `SETUP_REQUIRED`,
  `ATTENTION_REQUIRED`, `DISABLED`) is derived, never stored. Gate read-only
  bands on availability and actions on `ACTIVE`.
- **Current** — Turning a module off never deletes merchant data, and the copy
  says so every time (§21, §25).
- **Current** — Gating in the UI (`ModuleGate` at section layouts, `moduleKey`
  on nav groups) is an aid and fails open when availability is unknown. The API
  enforces it: `ModuleEnforcementGuard` on 19 controllers across all eight
  modules.
- **Current** — Outcome vocabulary, not module names: "Manage customers and
  enquiries", not "Enable CRM" (§6). Onboarding asks what the business needs to
  do, never how big it is.
- **Current** — Navigation shows workflows the merchant can use, never
  "a backend module exists" (§20).

## Selling, customers and identity

- **Current** — Commerce-led, not commerce-only (decided 2026-08-02). A `Store`
  is a commerce channel beneath an Organization (ADR-001), not the tenant.
- **Current** — **One customer record behind an order and a booking is not true
  yet.** `Customer` is store-scoped (its `organizationId` is still nullable), and
  linking it to a `Contact` is manual
  (`components/customers/identity-link-dialog.tsx`). Do not claim unification in
  UI, marketing or docs until auto-linking ships (§14, `PRODUCT.md`).
- **Adopted** — Never silently merge uncertain identities: normalise email and
  phone, and keep links reversible and auditable (§14).
- **Current** — Merchant payments run on the Organization's own providers —
  Razorpay and Cashfree first — kept apart from Saroh's billing (DEC-010).

## Bookings

- **Current** — Availability is pure, timezone-aware geometry
  (`apps/api.saroh.in/src/modules/bookings/availability.ts`): rules in the
  Service's IANA timezone, correct across DST, buffers spacing slots, capacity
  counting overlaps. Booking and rescheduling re-check capacity inside a
  serializable transaction; public booking is idempotent and rate-limited.
- **Adopted** — The booker and the merchant hear about a new or moved booking.
  Not true yet: `booking.notify` has no handler (`backend-jobs.md`, known gaps).
  Don't write copy that promises a confirmation message.

## Websites

- **Current** — `draft → publish → immutable snapshot` (ADR-002). Drafts are
  private; the public renderer reads only `Publication` snapshots; rollback
  repoints `Site.currentPublicationId`. Rich fields are sanitised at publish, so
  the renderer only ever reads safe content.
- **Current** — Section content validates against the versioned contract in
  `packages/block-contract/src/section-contract.ts`. A breaking change ships as a
  new version beside the old one, never an in-place edit, so existing
  publications keep validating.
- **Current** — A merchant's site never wears Saroh's brand (`--site-*`, gates
  G2 and G6). A Site owns its Posts (ADR-004).

## Communications

- **Current** — Real messages go through the Organization's own connected
  provider (DEC-011). Saroh-owned email is only for identity and security mail,
  and for a template test sent to the signed-in user's own verified address.
  Consent gates every send.
- **Adopted** — A simple WhatsApp deep link with a prefilled message is
  acceptable before any provider integration (§16). None exists yet.

## Analytics

- **Current** — Saroh owns a versioned, append-only event model (DEC-012).
  Organization analytics is separate from Saroh's own product analytics, and
  payloads carry no secrets and minimise visitor PII. Activation events
  (`onboarding.completed`, `first.*.created`) are instrumented, but there is no
  usage history to cite yet. Nothing tracks a merchant's own customers, and
  nothing should.
- **Adopted** — Insights reflects real events. Not true yet: nothing schedules
  `analytics.aggregate` (`backend-jobs.md`).

## Saying what is true

- **Current** — UI, marketing, docs and comments match what ships, and a
  configured-but-broken capability says so (`PRODUCT.md`, principle 2).
- **Current** — There are no customers, testimonials or case studies. Never
  fabricate them.
- **Current** — Signup is waitlist-only. Social publishing is not a current
  priority and must not be exposed as production-ready (§22). AI features are
  deferred (DEC-015).
- **Current** — The name Saroh and its wordmark are fixed; palette, type, shape,
  density and motion are open (confirmed 2026-08-04).

## How to decide

- Improve a core workflow before adding a capability; prefer a strong default
  with progressive customisation; keep the architecture correct and the
  merchant experience simple (§24, §36).
- No broad rewrite without a named defect, the customers affected, the benefit,
  the migration cost, the data risk, the compatibility impact and a test
  strategy (§26).
- A major proposal states the problem, user impact, UX, technical approach,
  dependencies, risks, validation, acceptance criteria and priority (§34).
- Before implementing an issue, confirm it still describes reality (§32). When
  documents contradict each other or the code, say so and fix one — never
  silently pick (§31, §33).
