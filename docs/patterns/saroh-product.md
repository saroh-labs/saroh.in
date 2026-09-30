# Saroh product context

> **Read when:** designing or changing anything a merchant sees, deciding what
> to build, or writing copy, a claim or a status.
> Sources: `PRODUCT.md` (the short brief), `docs/PRODUCT_STRATEGY.md` (§ numbers
> below), ADR-001 to ADR-006, ADR-010 and DEC-010 to DEC-018, DEC-030, DEC-070. Where
> this file and those disagree, they win — fix this file in the same change.

These are the product facts that change engineering rules. The technical
pattern files refer back here.

## Who uses it

- **Current** (DEC-070) — **Three kinds of people**: **a business** (shop,
  studio, practice), **Just me** (freelancer, consultant, creator) and **a
  site for my work** (portfolio, blog, projects). Setup asks "What are you
  setting up?" first, with nothing chosen, and stores the answer as
  `Organization.kind` (`BUSINESS`, `SOLO`, `WORK`; every business set up
  before it is `BUSINESS`). Whoever holds `org:update` (Owner and Admin)
  changes it at the top of Settings › Business › Identity, with Undo.
- **Current** (DEC-070) — **The kind changes words and defaults, never
  features.** Every module is available to every kind. No guard, module
  gate, entitlement or refusal reads it: the API reads it through
  `organizationKind()` only, and `organization-kind.readers.spec.ts` fails
  a read off its allow-list (onboarding, settings, the summary, the Turn on
  sheet's prefill, a new site's template) or in a guard, `capabilities/module-*`
  or entitlements. So never write "only for businesses" or hide anything by
  kind. The app's words and defaults are one pure file,
  `apps/app.saroh.in/lib/organizations/kind.ts` (`kindWords`,
  `kindDefaults`); an unknown or missing kind reads as `BUSINESS`.

    |                                       | A business                        | Just me                                             | A site for my work                |
    | ------------------------------------- | --------------------------------- | --------------------------------------------------- | --------------------------------- |
    | The owner                             | your business                     | you                                                 | you                               |
    | Their people                          | customers                         | clients                                             | readers                           |
    | Setup's name field                    | What is it called?                | Your name or brand                                  | Your name or brand                |
    | Settings tab                          | Business                          | Your details                                        | Your details                      |
    | Home's first run, in order            | Sell, Bookings, Website, Contacts | Bookings, Invoice a client, Contacts, Website, Sell | Website, Contacts, Bookings, Sell |
    | The module picker suggests            | Sell                              | nothing                                             | Website                           |
    | Setup asks "registered as a company?" | yes                               | yes                                                 | no                                |
    | Bookings' Turn on prefill             | Mon–Sat 10–7, no service          | Mon–Fri 10–6, "Consultation", 60 min                | Mon–Sat 10–7, no service          |

    The words reach the surfaces that name the owner or their people in
    general terms: setup, the module picker, Home's first run and the
    Settings tab and search. Entity names stay: Sell's **Customers** is the
    record of who pays and keeps its name for every kind. Sell is never
    removed for Just me or A site for my work, only moved last. "Invoice a
    client" turns nothing on: it opens a new invoice, for someone with
    `invoice:write`, until the business has one.

- **Current** (DEC-070, K4) — The registered address, business type and
  logo steps appear only once something invoices or takes money: Sell,
  Bookings, Courses, Class packs or Payments on, or an invoice exists
  (`handlesMoney` in `lib/settings/ready.ts`, which never reads the kind).
  They use the kind's words ("Add your address", "Add your details"), and the
  checklist's heading follows its steps ("Get your site live" when only
  publishing is left).
- **Current** (DEC-070, K10–K15) — A new site starts from the kind's
  template: the starter (`starter@2`) for a business, Personal for Just me,
  Portfolio (with the Projects block) for A site for my work. The Turn on
  sheet's Website step says which ("Starts from the Portfolio template"),
  and `/sites/new` starts its picker there; any registered template can be
  chosen instead, Writing among them, and an explicit choice always wins.
  There is no blank site. The kind only picks the default
  (`sites/site-template.ts`, `KIND_TEMPLATE`), never which templates a
  business may use. No template assumes a business, speaks as "we", or
  names an image; every enquiry form a template lays down gets its Form
  when the site is made, so it takes enquiries from the first publish.
  Personal lists the real Services only with Bookings on and a service to
  show; otherwise placeholder offers the owner writes over.
- **Current** — A business is often a small team of 2–5 people with mixed
  roles, sharing one workspace; someone working for themselves is a team of
  one. Nobody is a full-time software operator (`PRODUCT.md`). Avoid
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
  dashboard of equal tiles. **Needs you** (round 2, F3) draws it flat: one
  row per thing to do, ranked by what has gone wrong — late, then blocked,
  then due, then setting up (`home-needs.ts`) — each with a tag whose words
  say what its tone colours. Suggestions stay off it.
- **Current** — A source that fails to load degrades into a named notice; it
  never becomes a zero or a false "nothing to do"
  (`.agents/skills/saroh-product-states/SKILL.md`).

## Capabilities (modules)

- **Current** — Nine capability modules (ADR-003): Website, CRM,
  Appointments, Courses, Commerce, Payments, Communications, Automations,
  Insights. Courses (ADR-007) depends on Appointments: a course's sessions are
  bookings, but a business that takes bookings need not run courses.
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
- **Current** — **Several storefronts, one website per business.** A business
  may add storefronts up to its plan's `storefronts` entitlement (5 on the free
  floor), under a product ceiling of 25 (ADR-010); the API refuses one more
  (409 at the ceiling, 403 at the plan) and the app reads the allowance from
  `GET …/storefronts/allowance` rather than copying the number. Websites stay
  at one (ADR-006). Design screens so a one-storefront business sees no
  change: a picker or "across N storefronts" only with more than one
  (`lib/stores/pick.ts`), singular copy otherwise. A storefront closes (soft)
  only once no order waits and no stock is on hand or promised there — "Move
  or count out its stock first" — and closing never removes a catalogue
  product.
- **Current** (DEC-069) — **Merchants read "location", never "storefront".**
  A storefront (`Store` in code, `storefronts` in the API — the identifiers
  stay, KTD-1) is a **location**: a place the business sells from in person.
  Sell › Locations lives at `/commerce/locations`; `/commerce/storefronts`
  redirects there. The website is where customers go: **your online shop** is
  the website's `/shop`, and it sells from one location's stock (the site's
  Sells from). Each location says where it sells — "Sells in person only",
  "Sells in person and online · Your online shop", or "Online only" —
  derived from Sells from, never stored. The two kinds read **Customers
  visit** (`SHOP`: an address, hours and collection) and **No counter**
  (`ONLINE`: stock kept for online orders). A location has no public address
  of its own. The four addresses are named apart: _web address_,
  _registered address_, _location address_ and the blog's _posts path_.
  A page's or a post's own part of the link is its _path_ ("Page path",
  "Post path", "Change its path"), never its address; the web address has
  one place, Settings › Business › Identity's Web address card.
- **Current** — **Opening hours are edited once, for every storefront**
  (DEC-034): Business → Hours reads the first storefront's week and Save
  writes it to all of them, saying so first when their weeks differ.
- **Current** (round 2, C2–C4) — **Customers is one list for the business,
  keyed on the `Contact`.** Sell → Customers reads `GET
organizations/:org/customers`: everyone who has paid (an order through a
  linked store customer, a paid invoice, a subscription or a pack) or signs
  in on the business's site. A store `Customer` is still kept per storefront;
  a paying one gets a contact made and linked by the backfill and at their
  next payment (link reason `BACKFILL` or `PAYMENT`) — **unless a contact
  already holds their email**. Then nothing is linked on its own (#120): the
  list names them ("12 paying customers aren't linked to a contact yet ·
  Review") and a person links them from the review sheet. **A storefront may
  choose otherwise** (DEC-055, C15, Sell → Storefronts → Customers, off by
  default): a customer of it who pays with an email held by a contact that
  was itself made from a store customer is linked to that contact, through
  `resolveContact` — never to a contact staff entered, a lead or a removed
  one, never when the contact signs in without a verified email (DEC-049),
  and never for a store customer made before the setting was turned on. So say "one list of
  customers", never that every order and booking is already one record:
  someone who ordered and hasn't paid, or a lead, is in Contacts or on their
  storefront record, not in this list, and the list says so (§14,
  `PRODUCT.md`).
- **Current** (round 2, C14, DEC-056) — **Add customer makes a contact only**,
  for the whole business, never a storefront's customer, so it asks no
  storefront. The contact carries `source = "customers:added"`, and the list
  shows them from the start: "Added by hand" in Last order, and "Added by hand
  today · no orders yet" on Customer Detail. A contact made anywhere else
  (Contacts, a lead, an enquiry) joins the list only when they pay or sign in.
  An email a contact already holds is refused with who holds it. Import still
  brings a spreadsheet in at one storefront.
- **Current** (round 2, C14, default 20) — **Spent is what they paid and kept
  paid**: paid orders (delivery included) less every refund that has not
  failed, and paid invoices that aren't an order's own less their issued
  credit notes; an edit's money back is not taken off twice, since the
  order's total already fell. The list and Customer Detail read one rule
  (`customer-workspace/spent.sql.ts`).
- **Adopted** — Never silently merge uncertain identities: normalise email and
  phone, and keep links reversible and auditable (§14).
- **Adopted** (2026-09-26, DEC-041, DEC-042) — **Customers is everyone who
  pays or signs in on the business's site**, and the list is keyed on the
  Contact. Leads, Pipeline and Contacts (the CRM) stay as they are. A merchant
  may **merge** two customers; Saroh suggests merges and never makes one. A
  person's details can be **removed for privacy**; their orders and issued
  invoices stay, with what was printed on them.
- **Adopted** (2026-09-26, DEC-040) — **Needs attention is one list per
  customer** (Allergy, Medical, Access, Other). A sensitive entry reaches only
  a role with the sensitive permission, and the API leaves it out for everyone
  else.
- **Adopted** (2026-09-26, ADR-011, DEC-037) — **A business's customers sign
  in on its own site** with a one-time code, with one account per business,
  never a Saroh-wide identity.
- **Current** — Merchant payments run on the Organization's own providers —
  Razorpay and Cashfree first — kept apart from Saroh's billing (DEC-010).
- **Current** — **Deleting a contact, a lead or a customer is permanent, so it
  asks first** and says what goes and what stays (#384). A contact takes their
  leads and consent records; bookings, form entries and messages keep their
  own record and lose only the link. **A customer who has ordered cannot be
  deleted** — an order keeps who bought it; the menu shows why, it does not
  hide the option.

## Bookings

- **Current** — Availability is pure, timezone-aware geometry
  (`apps/api.saroh.in/src/modules/bookings/availability.ts`): rules in the
  Service's IANA timezone, correct across DST, buffers spacing slots, capacity
  counting overlaps. Booking and rescheduling re-check capacity inside a
  serializable transaction; public booking is idempotent and rate-limited.
- **Adopted** — The booker and the merchant hear about a new or moved booking.
  Not true yet: `booking.notify` has no handler (`backend-jobs.md`, known gaps).
  Don't write copy that promises a confirmation message.
- **Current** — The booking page asks Where only for a service offered
  either way, and records the answer on the booking (`Booking.locationType`);
  the meeting link shows only on an online booking. "Anything we should
  know?" is kept on the booking as a sensitive note (E7, default 110): only
  someone who may see sensitive Needs attention reads it, one booking at a
  time — never in a list, the snapshot, a job or a log.
- **Current** — A booking made by hand follows the booking page's rules: a
  real open slot, the same serializable capacity check, and its history names
  who on the team made it (#384).

## Money a person owes, and classes sold ahead (ADR-007)

- **Current** — Subscriptions and plans live under **Payments** in the rail
  (addresses `/billing/…`); courses under **Courses** (its own module);
  class packs beside the schedule, under Appointments.
- **Current** (DEC-070, amending DEC-019) — **Invoicing needs no module.**
  Creating, issuing, sending, voiding, crediting, downloading and recording
  an invoice paid need only `invoice:*`. While Payments is on, Invoices sits
  under Payments in the rail; while it's off, Invoices is a row of its own
  at the same address, and `/billing` lands there. **Taking money online
  needs Payments** and a connected provider that can open the checkout:
  the API says which as `payOnline`, and the workspace never guesses. With
  it, Send reads "Send with pay link" and the link can be copied; without
  it, Send reads "Send invoice", there is no pay link to copy, the email
  says "view it and download a copy", and the customer's page shows the
  invoice with no Pay button, "Pay ‹business› the way they've asked you
  to", and "Print or save as PDF". Home's overdue invoices row needs
  `invoice:read`, not Payments. Issue and Send still need the registered
  address first for every kind (DEC-068 M3, in place in the business
  details sheet); recording a payment doesn't.
- **Current** — Saroh records and invoices; it does not charge a card on file
  and does not send the invoice. Copy says so: "Nothing is charged and nobody is
  contacted", "Saroh doesn't send this. Print it and hand it over."
  **Adopted** (2026-09-26, DEC-038): autopay will run on the business's own
  provider's mandates, with a pay link as the fallback. The copy above stays
  true for every subscription without a mandate.
  **Current** (round-2 D17): an invoice is sent only when someone presses
  "Send with pay link" (or "Send invoice", above) or "Send reminder", and
  only where the API's `send` flag names a channel (the business's own
  email provider; the account thread once A13 and A14 are live). Where it
  names none, the old copy stays: "Saroh doesn't send it", with "Copy pay
  link" only when `payOnline` is true.
- **Current** — **Promise an automatic invoice only when Payments is on.**
  Invoicing by hand works either way (above), but with Payments off nothing
  is invoiced automatically: subscribing is refused, renewals wait, and a
  pack or course is recorded with the price paid and no invoice — so no copy
  may promise one. The API says which (`invoicesOnEnrol`); the workspace
  never guesses.
- **Current** — Overdue, seats left, classes left and "next renewal" are
  derived and said in words, never stored and never shown as colour alone.
- **Current** — A dialog says what an action books and charges before it
  happens ("Books the 6 sessions left of 8 · invoice ₹4,800.00"). Full is a
  constraint, not a warning: the button is off and says what would free a seat.
- **Current** — Cancelling keeps money decisions separate: ending a
  subscription or an enrolment leaves its invoice, with an unticked "Void it
  too" when one is open.

## Websites

- **Current** — `draft → publish → immutable snapshot` (ADR-002). Drafts are
  private; the public renderer reads only `Publication` snapshots; rollback
  repoints `Site.currentPublicationId`. Rich fields are sanitised at publish, so
  the renderer only ever reads safe content. Publish, restore and a test
  release's Go live all repoint through `putLive` (`sites/live-pointer.ts`,
  DEC-071), which records the review route and any bypass; nothing else in
  `modules/sites` writes the pointer (`live-pointer.source.spec.ts`).
- **Current** — Approval is advisory (DEC-047) unless the site turns on
  **"Publishing needs approval"** (DEC-071, off by default). While it is on,
  Publish and restore answer 409 `APPROVAL_REQUIRED`, and Go live works only
  for a test release someone other than the person going live approved, with
  no newer change request or review request on it. An owner can still go
  live without approval (`override: true`); that is recorded as the route
  OVERRIDDEN, an OVERRIDDEN approval row and a
  `site.publish_approval.override` audit event. Only an owner turns the
  setting on or off (an audit event each way) or overrides. The rule is
  enforced in `putLive`, with the words and the owner check in
  `sites/publish-approval.ts`, so every way of going live obeys it, a
  scheduled go-live included.
- **Current** — Section content validates against the versioned contract in
  `packages/block-contract/src/section-contract.ts`. A breaking change ships as a
  new version beside the old one, never an in-place edit, so existing
  publications keep validating.
- **Current** — A merchant's site never wears Saroh's brand (`--site-*`, gates
  G2 and G6). A Site owns its Posts (ADR-004).
- **Current** — A form entry is the record of what someone typed; it
  outlives the contact and lead it created. Reading entries is `form:read`
  (owner/admin), not the site's permission, because they are people's details
  (#385).

## Communications

- **Current** — Real messages go through the Organization's own connected
  provider (DEC-011). Saroh-owned email is only for identity and security mail,
  and for a template test sent to the signed-in user's own verified address.
  Consent gates every send.
- **Adopted** — A simple WhatsApp deep link with a prefilled message is
  acceptable before any provider integration (§16). None exists yet.
- **Adopted** (2026-09-26, ADR-011) — A message about a customer's own order,
  booking or invoice always goes into their account on the business's site.
  It goes out by email, SMS or WhatsApp only through the business's connected
  provider. Saroh's own email sends a site's sign-in codes and nothing else.
  Until those messages ship, the honest copy ("Saroh doesn't send this") stays.
  Invoices went first (D17): see Money above.
- **Current** (round-2 A14) — A booking confirmed, moved or cancelled, and
  an order's Ready and handover, are told to the customer: in their account
  thread while it is live (`SITE_ACCOUNT_AREA` and the `ACCOUNT_THREAD`
  flag), and by email to a verified site account through the business's
  own provider. Nothing by SMS or WhatsApp. **Copy names what is sent, from
  the API's reach** (`EMAIL_AND_ACCOUNT` | `EMAIL` | `ACCOUNT` |
  `ON_SIGN_IN` | `NONE`, `lib/messages/notice-reach.ts`): "Saroh doesn't
  message ‹First›" only for `NONE`, and a read that failed claims nothing
  either way. The account's "‹Business› has been told" / "The team has been
  told" shows only when the API says it (`told`): the customer's own move or
  cancel reaches the team's inbox.

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
