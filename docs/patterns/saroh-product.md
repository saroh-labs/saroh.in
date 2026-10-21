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
  setting up?" as its first step, with "A business" chosen (DEC-130), and stores the answer as
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

    |                            | A business                        | Just me                                             | A site for my work                |
    | -------------------------- | --------------------------------- | --------------------------------------------------- | --------------------------------- |
    | The owner                  | your business                     | you                                                 | you                               |
    | Their people               | customers                         | clients                                             | readers                           |
    | Setup's name step          | Name your business                | Name it                                             | Name your site                    |
    | Setup's name field         | What is it called?                | Your name or brand                                  | Your name or brand                |
    | Setup's last button        | Create the business               | Set it up                                           | Set it up                         |
    | Settings tab               | Business                          | Your details                                        | Your details                      |
    | Home's first run, in order | Sell, Bookings, Website, Contacts | Bookings, Invoice a client, Contacts, Website, Sell | Website, Contacts, Bookings, Sell |
    | The module picker suggests | Sell                              | nothing                                             | Website                           |
    | Bookings' Turn on prefill  | Mon–Sat 10–7, no service          | Mon–Fri 10–6, "Consultation", 60 min                | Mon–Sat 10–7, no service          |

    The words reach the surfaces that name the owner or their people in
    general terms: setup, the module picker, Home's first run and the
    Settings tab and search. Entity names stay: Sell's **Customers** is the
    record of who pays and keeps its name for every kind. Sell is never
    removed for Just me or A site for my work, only moved last. "Invoice a
    client" turns nothing on: it opens a new invoice, for someone with
    `invoice:write`, until the business has one.

- **Current** (DEC-130, amended 11 Oct 2026) — **The first run is four
  short steps, and it ends in the product.** Sign-up takes an email and a
  code (DEC-129). Setup is a stepper
  (`components/organizations/business-setup-form.tsx`), one question to a
  screen with Back and Continue: "What are you setting up?", then the name
  step (your name if the account has none, the name, the web address, the
  country, India chosen), then "What will you do first?". The last step's
  button is the create: it turns that goal on with its defaults, with no
  second sheet (`lib/modules/first-goal.ts`), and lands on the thing
  itself: a new product, a new service, the site with Publish, New contact
  open. Setup never asks whether it is a registered company: the Finish
  setup step "Choose your business type" does. It says "Step 2 of 4",
  never "Last step".
- **Current** (DEC-130, 11 Oct 2026) — **How the stepper is built.** Change
  a step in `lib/organizations/setup-steps.ts`, nowhere else.
    - **One list.** The plan's names are `SETUP_PLAN` in
      `@saroh/ui/lib/setup-plan`, which the sign-up panel on
      accounts.saroh.in draws too. `setup-steps.ts` builds setup's steps
      from it (each with the fields its gate checks), and the form, the
      panel beside it, the count above the heading and the progress bar
      all read that. A test in each app pins the same four strings.
    - **One step only some are asked** (DEC-167, R7): "Who does Saroh
      bill for this business?", between the name and what to do first,
      for an owner who has a billing profile already (the page reads
      `GET /billing-profiles`). Their profiles (legal name, GSTIN or "No
      GSTIN", address, billing email), then "New billing profile" with
      its fields inline; none is chosen for them, and Continue asks until
      one is. Someone with none isn't asked: their first profile is made
      from the business. Every step function takes `billing`; the plan's
      own three steps and their strings are unchanged. Its answers stay
      out of the tab's draft.
    - **One form.** Every step's answers live in one react-hook-form, and
      only the step on show is drawn. Back and Continue lose nothing, and
      Back never asks.
    - **Continue is the step's gate.** It checks its own fields
      (`form.trigger`), says each problem under its field, puts the
      keyboard on the first, and on the name step waits for the web
      address's answer, so a taken address is never passed on. The step's
      button is the form's one submit, so Enter in a field presses it.
    - **The step is in the address** (`?step=name`, `?step=first`, the
      first step bare) and in the browser's history
      (`setup-step-context.tsx`), so the browser's Back is the step before.
      A step asked for before the ones ahead of it are answered opens the
      first that is not (`openStep`).
    - **What was typed is kept for the tab** (`sessionStorage`, answers
      only, read and written inside try/catch), so a reload stays on the
      step. It is cleared when the business is made and on signing out.
    - **Each step is the same frame:** the count, a large heading (which
      takes the keyboard when the step changes), one sentence, that step's
      fields, then at the foot a thin `ProgressBar`, a quiet Back on the
      left and the step's button on the right, stacked on a phone with the
      button on top. "Signed in as … · Sign out" is under it on every
      step.
- **Current** (DEC-130) — **One list of goals, in one set of words**:
  `lib/modules/goals.ts` ("Sell things", "Take bookings", "Put up a
  website", "Keep track of people", and a kind's own for the last). Setup,
  Home's first run and the module picker read it, and `goalHref` is each
  goal's one destination. Never word the choice again on a new screen.
- **Current** (DEC-130) — **The web address is asked once**, at setup. The
  Turn on sheet says it as a line when Website is turned on later, and
  turns it back into a field only when the API refuses it.
- **Current** (DEC-130) — **A new business gets one email from Saroh**:
  "{Business} is set up on Saroh", the next step for the goal chosen, and
  "Open {Business}" (`apps/api.saroh.in/src/common/email-welcome.ts`).
  Onboarding sends it, once, to the person who set the business up. Never
  to someone invited: they are told where they are on arrival instead
  ("You've joined {Business} as {Role}. …", `lib/organizations/joined.ts`),
  and every accepted invitation, a location's too, comes through the
  workspace's door (`/open/:id`), which opens the business they joined.
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
  or offers the few suggested for the business with it picked; and
  `/sites/new` starts its picker there (industry templates U12: cards
  suggested from the kind and the modules that are on, "All" a click away,
  `?template=` to start on one, and the chosen template's colourway sent as
  `styleId`). Any registered template can be chosen instead, and an
  explicit choice always wins. A card whose sections need a module that is
  off says so ("Its products show once Sell is on") and is never refused
  (`lib/sites/template-picker.ts`).
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

## Moments

- **Current** (10 Oct 2026) — **A moment is one calm line where the product
  marks that something good happened for the business**, in the right place,
  once, with the real fact in it and at most one thing worth doing next. The
  shared piece is `Moment` (`apps/app.saroh.in/components/shared/moment.tsx`):
  a `Notice` in the success tone with a title, one fact line, one optional
  action and Dismiss, announced politely (`role="status"`), entering on the
  motion tokens and still under reduced motion.

    | Moment                   | Where                                   | Says                                                       |
    | ------------------------ | --------------------------------------- | ---------------------------------------------------------- |
    | First order              | Orders, and Home in its first 24 hours  | "Your first order" · who, how much · Open order            |
    | 10th and 100th order     | Orders (Home when its figures allow)    | "Your 10th order" · who, how much · Open order             |
    | First booking            | All bookings, and Home in its first day | "Your first booking" · who, what, when · Open booking      |
    | The site's first publish | The publish check's finished state      | "‹Site› is live." · the address as a link · Share, QR code |
    | Setup finished           | `SetupChecklist`'s own done title       | Its own words; not a `Moment`                              |

- **Current** — **A moment is derived, never stored.** It is the first order
  because the business has exactly one (`lib/moments/derive.ts`, from the
  reads the screen already makes), only within a week of it, and only for
  someone who can open the thing (`order:read`, `booking:read`). What is
  stored is that the business has seen it: `Organization.momentsSeen`, a
  fixed list of keys (`organizations/moments.ts` in the API,
  `lib/moments/keys.ts` in the app; `GET` and `POST …/moments/:key/seen`,
  `org:read`). Dismissing it or following its action marks it seen for the
  whole business, on every device. If the seen list can't be read, nothing
  is shown. Home reads a list for a moment only when its own figures make a
  first possible (`homeMayHaveFirstOrder`), so a shop past its first day
  pays nothing. A new moment is a key in both lists, a rule in `derive.ts`
  with its test, and a row here.
- **Current** — **What a moment must never be:** an exclamation mark, an
  emoji, confetti, "Congratulations", a streak, a badge, a count of days in
  a row, a modal, anything that blocks the work or asks to be looked at
  twice. Never a number that was not read, never a claim that Saroh holds
  money, and never a second message for something already said (setup's
  welcome email and the checklist's done title are those moments).
- **Not built** — a first online payment (no read counts a business's
  online payments), a first online order as its own moment and a first
  returning customer (the Orders list row says neither), and a day-close
  summary (there is no day close).

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
  failed, and what came in on invoices that aren't an order's own (their
  ledger, by the money-in rule, DEC-173: part of a bill counts, a bounced
  cheque doesn't) less their issued credit notes; an edit's money back is
  not taken off twice, since the order's total already fell. The list,
  Customer Detail and Insights' best customers read one rule
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

## Closing a business

- **Current** (DEC-120, owner 9 Oct) — **A business scheduled for deletion
  winds down.** Until its date nothing new starts, and what is already made
  can be finished, cancelled and refunded; the banner on every page says so
  and, to an owner, offers **Download your data** (Settings › Your data, the
  owner's alone, open at any time): one zip of spreadsheets and uploaded
  files, emailed as a link and kept 7 days. Copy never promises a refund can
  be sent online once the payment provider is disconnected: it says to
  refund in the provider's dashboard and record it.
- **Current** (DEC-120) — **Customers are never told a business is closing,
  suspended or deleted.** Its site says "This business isn't taking orders
  right now." / "…isn't taking bookings online right now." (the paused
  words, #800), and a refusal names no state.

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

- **Current** (DEC-108) — **A site's verification codes and the merchant's own
  trackers are read live, beside the snapshot**, never inside it
  (`GET /public/sites/:siteId/head`): saving one is never an unpublished change
  and never enters `SITE_CHANGE_KINDS`. Only public ids from a fixed list of
  tools are stored (`@saroh/block-contract` `site-tracking.ts`); Saroh writes
  every loader on fixed hosts, and nothing a merchant enters can run code: no
  code box, no Google Tag Manager, PostHog's site apps, web experiments and
  surveys forced off. The tracker read fails closed on the plan. Trackers never
  load on private paths (`apps/saroh.app/lib/private-paths.ts`, shared with
  `robots.txt`), only after consent unless cookieless, and customer-data forms
  carry `NO_CAPTURE_ATTRS`/`NO_CAPTURE_CLASS` (`site-blocks/consent-events.ts`).
  A new form that takes a customer's details carries them too.
- **Current** (DEC-128) — **How to reach the business is read live, and is
  the business's, not the site's.** The footer's phone, contact email,
  address and social links come from `GET /public/sites/:siteId/contact`
  (`organizations/business-contact.ts`, an allow-list), so a save shows with
  no publish and none of them is a "Next publish" row. Anything new that
  says how to reach the business reads that one read. A social link is only
  ever a fixed network's own address (`@saroh/block-contract`
  `social-links.ts`): never add a free link field beside it. The address
  shown is where customers come (locations that say customers visit); the
  registered address only by the owner's choice, and a location with no
  counter never. Google Maps is not a social link: it is an address's own
  optional map link (`StoreSettings.mapUrl`, the registered address's
  `registeredAddressMapUrl`), which "Get directions" opens, else a search
  for the address. The icons are drawn in the page's own text colour
  (`SocialLinkRow`), with nothing fetched from a network.
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
- **Current** (DEC-071, T12) — Reviewers review a test release on its own
  page (`/sites/:siteId/releases/:releaseId`), drawn from its frozen
  snapshot with the session and `site:read`, no link token. A verdict, a
  request or a note there carries `testReleaseId` and never touches the
  draft's review; a note pins a section by its position on the frozen page.
  Every review panel says what it reviews: "Draft" or "Test release N ·
  name". Version history says which release a go-live came from, badges
  Approved, Bypassed and "Overridden by ‹owner›", and lists scheduled
  go-lives.
- **Current** (UX-068, UX-043) — **A review closes.** Withdrawing the
  request (`WITHDRAWN`) or putting the draft live past it (`BYPASSED`,
  `OVERRIDDEN`) closes every request and change request before it
  (`CLOSING_OUTCOMES` in `sites/review-route.ts`); closing never counts as
  an approval. The person who asked isn't offered Approve or Ask for
  changes on their own request (`askedByYou`). Ask for changes needs a
  short reason, kept on the row and shown wherever the verdict is. Share in
  the editor names its two choices: ask a teammate to review, or make a
  preview link anyone can open.
- **Current** — Section content validates against the versioned contract in
  `packages/block-contract/src/section-contract.ts`. A breaking change ships as a
  new version beside the old one, never an in-place edit, so existing
  publications keep validating.
- **Current** (DEC-121, amended 10 Oct) — **A site says who the customer
  is buying from, in the business's own details, never in Saroh's words.**
  The footer's "Sold by ‹legal name›" (the site's name when none is set;
  "Run by" where the shop doesn't serve), its registered address and its
  contact, each only if set, on every plan; the order and booking
  confirmations carry the one line. Never the GSTIN. "Report", to
  `saroh.in/customers`, sits beside "Made with Saroh" on Free only: a paid
  site carries no Saroh link. Settings › Business asks for the details
  while a business with a published website lacks them (`lib/settings/nudges.ts`).
- **Current** — A merchant's site never wears Saroh's brand (`--site-*`, gates
  G2 and G6). A Site owns its Posts (ADR-004).
- **Current** — A form entry is the record of what someone typed; it
  outlives the contact and lead it created. Reading entries is `form:read`
  (owner/admin), not the site's permission, because they are people's details
  (#385).

## Communications

- **Current** — Real messages go through the Organization's own connected
  provider (DEC-011, reaffirmed 2026-10-07), review invitations included.
  Saroh sends none of a business's messages to its customers: DEC-086
  (Saroh sending booking notices) is reversed and its code stays off. With
  no connected email provider, nothing is emailed, and the customer sees the
  update in their account. Connecting its own email provider comes with Grow
  and Pro, not Free (DEC-091), so a Free business's customers get no emails,
  by design; Settings offers "Connect your email" only where the plan has
  room for one, and "See plans" otherwise — never a connect the API would
  refuse. Saroh's own email is for Saroh speaking to its own users (DEC-011,
  amended 2026-10-07): sign-in and account mail, team invitations, Saroh's
  billing, the waitlist, alerts to a business's own team (enquiries, and
  the team alerts — new order, booking, failed payment, someone joining, a
  go-live, a custom domain that stopped working (#917) — for every business, provider or not, in fixed words with the
  business's names cleaned; built, #849), a site's customer sign-in codes, the email-changed notice
  and the "Ask to remove my data" acknowledgement and its done or closed email
  with Saroh's built-in customer accounts (ADR-011; DEC-172, #1106), all under one footer that names
  them (`siteAccountEmailFooter`, #1156), and a template test
  sent to the signed-in user's own verified address. A business that brings
  its own login system sends its own codes (not built). With no email
  provider, owners and admins who can act are asked to connect one — "Your
  customers get no emails from you", and what they miss — on Home's Needs
  you and Settings › Providers, with Connect (`comms:manage`), or on a plan
  that can't connect one, "comes with a paid plan" and See plans
  (`billing:read`); it goes once one is connected, and the same note says
  why an invoice or a review invitation can't be emailed (built, #850). Consent gates every send.
- **Adopted** — A simple WhatsApp deep link with a prefilled message is
  acceptable before any provider integration (§16). None exists yet.
- **Adopted** (2026-09-26, ADR-011; amended 12 Oct 2026) — A message about a
  customer's own order, booking or invoice goes into their account on the
  business's site, unless the business has turned those updates off (below).
  It goes out by email, SMS or WhatsApp only through the business's connected
  provider. Saroh's own email sends a site's sign-in codes and notices about
  the customer's own account there (a changed email, a request to remove
  their data), and nothing else.
  Until those messages ship, the honest copy ("Saroh doesn't send this") stays.
  Invoices went first (D17): see Money above.
- **Current** (round-2 A14) — A booking confirmed, moved or cancelled, and
  an order's Ready and handover, are told to the customer: in their account
  thread while it is live (`SITE_ACCOUNT_AREA`, the `ACCOUNT_THREAD`
  flag, and the business's own choice, below), and by email to the
  contact's email through the business's own provider (DEC-174 D1: a desk,
  phone or guest customer too; a site account's verified address wins
  when it differs, A2). The peek names it: "emailed to ‹email›". Nothing by SMS or
  WhatsApp. **Copy names what is sent, from
  the API's reach** (`EMAIL_AND_ACCOUNT` | `EMAIL` | `ACCOUNT` |
  `ON_SIGN_IN` | `NONE`, `lib/messages/notice-reach.ts`): "Saroh doesn't
  message ‹First›" only for `NONE`, and a read that failed claims nothing
  either way. The account's "‹Business› has been told" / "The team has been
  told" shows only when the API says it (`told`): the customer's own move or
  cancel reaches the team's inbox.
- **Current** (owner, 12 Oct 2026) — **Updates in Messages are on for every
  business, and each can turn them off for itself.** Saroh posts an order's
  steps, a booking confirmed, moved or cancelled, an invoice sent or
  reminded about and autopay turned off into the customer's Messages only
  when three things hold: the account area is on for the instance
  (`SITE_ACCOUNT_AREA`), the `ACCOUNT_THREAD` rollout flag is on for the
  business, and the business has not turned its updates off
  (`BusinessProfile.accountUpdates`, on by default). The rule is one
  function, `accountThreadOn` in `communications/account-thread.ts`, which
  the notice reach and the invoice send both ask: never ask a gate of your
  own. Off, each caller does what it did before the thread was live: email
  through the business's own provider where there is one, else nothing, and
  the reach says `EMAIL` or `NONE`. Off stops only Saroh's own posts. A
  customer still writes to the business in Messages, the team's Reply still
  reaches them, and so does the note someone chooses to send when they
  change or cancel an order ("Tell the customer"). The business chooses on
  Settings › Providers ("Updates in Messages", `comms:manage`): a read row
  with Edit, a sheet with the two choices and Undo. The row is drawn only
  while the first two hold (`offered`), so nobody is offered a switch that
  does nothing, and it says what a business with no email provider is left
  with: no other way to tell a customer their order is ready.
- **Current** (DEC-174, U1 #1132) — **Every automatic customer notice
  added by DEC-174 has a switch the business can turn off.** The kinds,
  their defaults, the module each belongs to and their words are one pure
  module, `communications/notice-settings.ts`: renewal invoices, failed
  autopay charges, membership emails, refunds, team replies, enquiry
  replies, delivery updates, course emails, pack credits and back in stock
  start on; overdue reminders start off (D3 is opt-in). A business's choice
  is a `CustomerNoticeSetting` row only while it differs from the default,
  as `NotificationPreference` is; a write equal to the default deletes it.
  **Every sender asks `noticeOn(tx, organizationId, kind)` inside its own
  transaction, and only that**: never a gate of its own. `noticeOn` says
  only whether the business sends the kind; the provider, consent and the
  account thread stay the send path's. `GET` and
  `PATCH …/customer-notices/settings`: anyone in the business reads them
  (`canChange` says whether they may change them), a change needs
  `comms:manage` and writes `customer-notices.setting` to the audit stream.
  A kind whose module is off is not listed (DEC-057); the enquiry reply is
  listed but not offered without a connected email provider ("Connect your
  email first"), and a change to a kind not offered is refused (409).
  Booking and order notices, and the fixes, have no switch here.
  **A kind is not listed until Saroh sends it** (`NOTICE_SENDS`, U4
  #1135): every kind starts false, and the unit that ships a kind's sender
  flips its own line in the same commit, so no switch ever does nothing.
- **Current** (DEC-174, U4 #1135) — **Settings › Providers' "Emails to
  your customers"**, under "Updates in Messages"
  (`components/providers/customer-emails-row.tsx`, words in
  `lib/communications/customer-emails.ts`): a read row ("9 on, 1 off",
  "Not sent: Overdue reminders.") and at most one quiet line under it (no
  email provider: "None of these go out until your email is connected";
  else, for someone without `comms:manage`, why they can only read them).
  The page's own email prompt carries Connect, so the row never repeats
  it. Edit (View, read-only) opens a side sheet of switches, one per kind
  offered with what the customer gets; each saves as it is flipped, with
  Undo (`useSettingsUndo`), and Done closes it. The sheet holds one note at
  most. No row at all while the business is offered none. A change is told
  in Settings › Activity ("turned Membership emails off for customers").

- **Current** (DEC-174, U14 #1145) — **A team reply in a customer's
  Messages is emailed to them** through the business's own email, a minute
  after it is sent; replies inside that minute go as one email, quoting
  each. The line under the reply box (and Home's Reply) names the address
  ("Emailed to ‹email› a minute after you send"), and says "Nothing is
  emailed or texted" only when nothing is: no email connected, "Your
  replies in Messages" turned off, no address, or email turned off by the
  customer.

## Analytics

- **Current** — Saroh owns a versioned, append-only event model (DEC-012).
  Organization analytics is separate from Saroh's own product analytics, and
  payloads carry no secrets and minimise visitor PII. Activation events
  (`onboarding.completed`, `first.*.created`) are instrumented, but there is no
  usage history to cite yet. Nothing tracks a merchant's own customers, and
  nothing should.
- **Current** (DEC-075, DEC-171) — **Insights answers questions about the
  money first**: on the Money tab (#1093), money actually taken for the
  page's period against the same length before, written as sentences
  (`lib/insights/money-words.ts`) from the same figures the bars draw. The
  weekly bars are **rolling weeks ending today** (`moneyBuckets`,
  `modules/analytics/period.ts`), so a period's bars hold exactly its days
  and add up to its money in; never a calendar week straddling the period's
  first day. **Takings** are paid orders (net of refunds that have
  not failed, an edit's money back not taken twice, a REFUNDED order not at
  all) plus paid invoices that are not an order's own (net of their credit
  notes) — ADR-008's each-rupee-once and Customers' Spent rule
  (`analytics/takings.ts`, `takings.sql.ts` reuses `spent.sql.ts`). A sale
  falls on the day it was paid, and a refund lowers that day. Where it was
  sold is the Orders list's notion: `placedOnline` is online, otherwise the
  order's location; other invoices are "by invoice". Every figure states its
  window; a change needs the period before to be on record with three
  payments, else it says why; a change of 2% or less is "about the same"
  (Comparisons, below). The read (`GET analytics/money`; the old
  `analytics/takings` is retired) needs
  `analytics:read` and `payment:read`, and answers before Insights' setup
  is done (`@IgnoreModuleReadiness`).
- **Current** — Insights' website figures reflect real events. The hourly
  `analytics.rollup` (DEC-075) builds the rollups (the page says "Updated
  every hour"); a live site sends one cookieless `site.view` per page
  (`apps/saroh.app/lib/site-view.ts`: path only, the referrer's origin only,
  nothing when the browser sends Do Not Track or Global Privacy Control,
  nothing from a private page — the account area, a checkout, a pay link, an
  order's page, a waitlist claim (`lib/private-paths.ts`, U15) — never on a
  test release or preview), and an
  enquiry writes `enquiry.submitted` in its own transaction (UX-032). Its
  Orders tile (#919) counts `order.paid` less `order.refunded` (#867) over the
  range's days; nothing before #867 is back-filled (DEC-012), so a line under
  the tiles says so while the range reaches back before
  `ORDERS_RECORDED_FROM` (`lib/analytics/website-words.ts`).
- **Current** — where a site visit came from (U15, #1099, A13), first party,
  for "Where customers come from". The visit lives in the visitor's tab
  memory only (`@saroh/site-blocks/visit-source`: no cookie, no storage, no
  id; it ends on a reload, a closed tab or 30 minutes without a page). Its
  source is one of five groups (`instagram`, `google`, `whatsapp`, `direct`
  = "Typed your address", `other`) from the referrer's host and an allowed
  `ref` / `utm_source` value, plus at most one merchant link label of the
  allowed shape (`analytics/visit-source.ts`: lower-case letters, digits,
  hyphens, 32 at most, no run of six digits, no more than six digits in all,
  never an id's shape `c` + 24); nothing else in the address is read, and
  `ref` is never read on `/book` (or under it) or beside the booking flow's
  `step=`, where it is a booking's id. Each step is sent once a visit, with
  the source only and no visitor hash: `site.visit`, `site.looked` (a
  product or the booking page), `site.started` (a checkout: `/checkout`
  sends no page view, being private, but does send this step, with its
  group and label only). The checkout copies the source onto the order
  (`Order.visitSource`, `visitRef`) and `order.paid` / `order.refunded`
  carry it; `analytics.retention` clears it off orders past 400 days. The
  rollup adds `source` and `ref` dimensions; `analytics/visit-sources.ts`
  is the read (counted from the first day a source was recorded; paid is
  the business's, not a site's; labels with fewer than 3 visits in the range
  fold into one `OTHER_LINKS_REF` row, "Other links"). A paid order with no
  source was taken another way, before tracking began, or from a visit that
  sent nothing.
- **Current** — **what visit tracking collects, where, for how long and who
  sees it** (U15 privacy review, 21 Oct). The browser's word is never
  trusted: each promise below is kept by the API too.

    | What                                                                                                                                        | Where it is kept                                                                                                                                                                                       | For how long                                                                                                    | Who sees it                                                                                   |
    | ------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
    | A page view: its path (cut at `?` and `#`), the referrer's origin, no title                                                                 | `AnalyticsEvent` `site.view`                                                                                                                                                                           | 400 days, then the retention sweep deletes it                                                                   | Nobody row by row; counted into Insights for `analytics:read`                                 |
    | A visitor hash on a page view: `sha256(daily salt : site : address)`, the salt an HMAC of `ANALYTICS_IP_SALT` and the UTC day, never stored | `AnalyticsEvent.visitorHash`                                                                                                                                                                           | With the view (400 days); a new hash every day and on every site                                                | Nobody; only "unique visitors a day"                                                          |
    | A visit's steps (`site.visit`, `site.looked`, `site.started`): a group and a label, no visitor, time to the hour, random id                 | `AnalyticsEvent`                                                                                                                                                                                       | 400 days                                                                                                        | Counted into Insights for `analytics:read`                                                    |
    | Daily counts by path, source and label                                                                                                      | `AnalyticsDailyAggregate`                                                                                                                                                                              | Kept (they name no one)                                                                                         | `analytics:read`; labels under 3 visits only as "Other links"                                 |
    | Where an order's visit came from (group, label)                                                                                             | `Order.visitSource`, `visitRef`, and its `order.paid` / `order.refunded` event                                                                                                                         | Cleared at 400 days (not while the business is on legal hold) and by the customer's removal (`PERSONAL_FIELDS`) | `cameFrom` on the order only with `analytics:read`; in the owner's data export (`orders.csv`) |
    | Nothing at all                                                                                                                              | Private pages (`PRIVATE_PATH_PREFIXES` in `@saroh/block-contract`, one list for the site and the API, which refuses a view of one), Do Not Track or Global Privacy Control, previews and test releases |                                                                                                                 |                                                                                               |

    Never kept: the address, a cookie or browser storage, the query string
    beyond one allowed label, the referrer's path, a page title, a consent
    value, a time or a dedupe key the browser sent (a public event is stored
    `anonymous`, at the server's time). Views stored before the review under
    a private path are removed by the one-off
    `packages/database/src/backfill/private-path-views.cli.ts` (dry run
    first).

- **Current** — "From visit to paid" and "Where do visitors come from?"
  (U16, #1101) on Where customers come from, between the figures and the
  visits each day, and the Overview's third answer, read from
  `GET analytics/sources?period=&siteId=` (`analytics/sources.ts`,
  `analytics:read`, counts only). The path's four steps (visited, looked,
  started, paid) are each held to at most the one before, so it never goes
  up. A share is said as a count reads ("1 in 7", "3 in 4", "about half",
  `lib/insights/sources-words.ts` `oneIn`), never a percentage, and what
  is counted is called visits, never people (no visitor is kept). A source
  with fewer than 5 visits is counted in Other sites and the line under the
  table names it; the merchant's own `?ref=` links are listed under the
  table when any were visited. Counting that began inside the period says
  from when; before anything is counted one message says it starts with
  the next visit. With a website chosen, paid stays the business's and the
  table says so. Where customers come from is no longer marked Next.

## One word each

**Current** (UX-078, owner 9 Oct) — one word for one thing, in the workspace,
on merchant sites, in emails and in Help. Code identifiers, routes, enum
values and module keys keep their names (`APPOINTMENTS`, `/appointments`,
`RESCHEDULED`, `BANK` and `BANK_TRANSFER`); only the words shown change.
`pnpm check:words` fails on the three that crept back most, and on
Bookings' retired words below.

- **Booking**, never "appointment" or "reservation". The `APPOINTMENTS`
  module is **Bookings**; its name lives in `lib/modules/names.ts` (and the
  API registry's `label`, which its refusals quote).
- **Move** a booking, never "Reschedule".
- **Booked** for a confirmed booking still to come, never "Confirmed" — the
  pill and the confirmation email ("You're booked with …"). A `PENDING`
  booking, held while the customer pays, reads **Awaiting payment**
  everywhere: pill, filter, diary, month calendar, quick look (DEC-170
  replaced DEC-113's "To confirm"; `bookingStatus` in `lib/format/status.ts`).
- **Bookings' words** (DEC-170, bookings plan U18, #1034). Each lives once
  in `apps/app.saroh.in/lib/services/booking-words.ts` (`BOOKING_WORDS`,
  `outcomeWord`), and `pnpm check:words` fails on the retired one in the
  workspace:

    | Say                                   | Not                                                                |
    | ------------------------------------- | ------------------------------------------------------------------ |
    | Awaiting payment                      | To confirm, Waiting for payment, unpaid                            |
    | Mark arrived (button), Came (status)  | Check in, They came, Attended, Checked in                          |
    | Didn't come                           | No-show, They didn't                                               |
    | Not marked yet                        | Not said yet, Nobody has said how this went                        |
    | Pays at the visit                     | Pays at the session                                                |
    | Payment link, Send a payment link     | Pay link, Send a pay link (invoices, orders and subscriptions too) |
    | Book                                  | Create booking                                                     |
    | Day · Week · List                     | Day by person, Agenda                                              |
    | Hours and time off                    | Availability                                                       |
    | Extra opening hours                   | One-off extra hours                                                |
    | Break after, Break before             | Gap after, Buffer before                                           |
    | Who comes: One person · A group class | Kind: One-to-one · Class                                           |
    | Who does it                           | Who takes it                                                       |
    | Calendar (Home's month of everything) | Overview                                                           |

    "Booking rules" stays. Code identifiers, routes (`/bookings/availability`,
    `/calendar`) and stored values (`NO_SHOW`, `ATTENDED`) keep their names.

- **Cash, UPI, Card, Bank transfer, Other** — every payment picker and
  label, from `lib/payments/method-words.ts`. Where it is taken ("at the
  counter", "the card machine") is a hint under the choice, never the label.
- **Closed**, never "Shut", for business hours.
- **Location / Locations** follows the count — the rail, the page title and
  every breadcrumb (`locationsWord` in `lib/stores/pick.ts`).
- Classes vs credits: **not decided** — leave both as they are.

**Current** (10 Oct 2026) — **what a merchant reads in the workspace**
(`apps/app.saroh.in`: JSX text, labels, placeholders, aria-labels, toasts,
empty states, and every sentence a `lib/` function returns):

- **No em dash and no semicolon in a sentence.** Two sentences, a comma, a colon or
  "and", whichever reads naturally ("Voided. Nothing is owed.", "A place
  you sell from: a shop counter, a studio, a market stall."). A name and
  its note are joined by a colon or " · ", never a dash.
- **A range says "to"**: "31 Aug to 27 Sep", "14 to 20 Sep 2026", "₹499 to
  ₹899", "Showing 1 to 50 of 120", "Mon to Sat". The one exception is the
  typed format of a day's hours, "07:00–19:00", which the field reads back.
- **An absent value in a cell is a dash, drawn by the one shared piece**
  (owner, 11 Oct 2026; the words of 10 Oct read heavier, most of all in a
  big stat tile and a mono SKU cell). A table cell, a stat tile, a row's
  meta line, a code cell, a quick look and a summary draw
  `<AbsentValue says="…" />` (`@saroh/ui/absent-value`): a muted "—" the
  eye sees, hidden from a screen reader, and the word it hears instead.
  The word is still chosen with care: "Not set" (nobody has filled it in),
  "None" (there are none), "Not known" (it couldn't be read or worked
  out), "Not yet" (a month still to come), "Not recorded", "None sold".
  `<AbsentOr says="…">{text}</AbsentOr>` draws a `lib/` function's words,
  or the dash when they are nothing. A place that can only hold a plain
  string (a `title`, a joined meta line, a sort value) takes
  `absentText()` from `@saroh/ui/lib/absent`, the only file the dash is
  written in. `CountBadge` draws the same mark for a count that couldn't
  be read.
    - **A Settings read row keeps its words.** Label on the left, value
      on the right, the row's Edit button beside it: "Not set" there is the
      invitation to set it (`Absent` in `components/sites/settings-rows.tsx`,
      `empty` on a Business row, Your profile, the pay-instructions and
      verification rows, an Activity change).
    - **A sentence is not a cell.** A line that reads as words keeps them
      ("GSTIN not set" on the print preview, "use within no limit → 30
      days" in a pack's changes, "changed billing from every unknown
      period").
- **business**, never organization or workspace; **location**, never store
  or storefront; **module**, never capability; **Stock**, never inventory;
  **Sign in** and the noun **sign-in**, never log in or login; a **time**,
  never a slot; **Try again**, never Retry; **Save**, never "Save changes".
- No exclamation mark, "successfully", "please", "simply", "easy", "oops"
  or "invalid": an error says what happened and what to do next ("Add a
  name.", "That didn't go through. Try again.").
- `pnpm check:copy` (`scripts/check-app-copy.mjs`, in `pnpm prepush` and
  CI) reads the app with TypeScript's parser and fails each of these. Its
  allow-list takes a file, a rule and a reason. The absent mark is its one
  dash: it reads `packages/ui/src/lib/absent.ts` too, which is on the
  allow-list, so a "—" (or `&mdash;`, or `\u2014`) typed anywhere else in
  the app still fails.
- **Current** (owner, 11 Oct 2026): the menu's last group, which holds
  Settings (and, in the phone's More sheet, the rows with no seat on the
  bar), is headed **Manage** everywhere it is drawn or spoken. The rail
  itself is the landmark "Main menu". Nothing a person reads says
  "Workspace"; Settings search still finds the web address by it, a
  synonym that is matched and never shown (the check's one "workspace"
  entry). The docs still call the app itself "the workspace".

## Comparisons

**Current** (DEC-171, Home and Insights plan U4, #1081) — how Home and
Insights say one figure against another. Every comparison sentence comes
from `apps/app.saroh.in/lib/insights/compare-words.ts`; Insights' Money
answers (`lib/insights/money-words.ts`, `overview-words.ts`) follow the same
rules.

- **The last 7 days against the 7 days before**, never a week that just
  started against a whole one. Insights' longer periods say theirs: "the
  4 weeks before", "the 3 months before".
- **A period is named with its days**: "13 to 19 Oct", "28 Sep to 4 Oct",
  and with years only when it crosses one.
- **Money says a percent, counts say the difference**: "Up 12% on the 7
  days before", "4 more than the 7 days before", "3 fewer than the 7 days
  before". A change of 2% or less is "About the same as the 7 days before".
- **Zero is said in words.** "Nothing came in", "No bookings", "None in the
  7 days before". A drop to nothing is "Down from ₹4,000 in the 7 days
  before", never "down 100%" or "about 100% below". While anything came in,
  down stops at 99%.
- **No change without something to compare with.** Nothing before: "Nothing
  came in the 7 days before". Too little before: "Too little came in the 7
  days before to compare". Never 0% or N/A as a sentence.
- **No percent bigger than is useful**: three times as much is "About 3
  times the 7 days before", not "Up 200%".
- **No 0% places**: a place whose share rounds under 1% isn't named.
- **One thing, many things**: "1 booking", "22 bookings", through `count()`.
- **Money only for those who may read it** (DEC-098). The phone's one
  sentence says money with `payment:read` ("Last 7 days: ₹48,250, up 12% on
  the 7 days before.") and counts without it ("Last 7 days: 22 bookings and
  41 orders, both up on the 7 days before."). Several currencies are each
  said once, with no change, since they can't be added.
- **A week marked high or low** says it once: "₹1,090 last week, your lowest
  in 12 weeks", only with at least two weeks to set it against.

## Saying what is true

- **Current** — UI, marketing, docs and comments match what ships, and a
  configured-but-broken capability says so (`PRODUCT.md`, principle 2).
  Every claim on saroh.in has a row in `docs/architecture/MARKETING_CLAIMS.md`
  (claim, what backs it, status); a new claim gets its row first.
- **Current** — There are no customers, testimonials or case studies. Never
  fabricate them.
- **Current** — Signup is waitlist-only. Open sign-up is built behind the one
  launch switch, `NEXT_PUBLIC_LAUNCH_MODE=open` on saroh.in (plan U27): every
  start button then goes to accounts `/signup?plan=&cycle=`, the plan rides
  through verification to onboarding, is checked there against the live
  catalogue, and a paid one goes on to its checkout once the business exists
  (Free otherwise, and an unknown plan says so). The second switch is
  production accounts' prelaunch key gate (`PRELAUNCH_GATE` in
  `apps/accounts.saroh.in/wrangler.jsonc`), which keeps sign-in and
  sign-up to key holders and sends everyone else to the waitlist page on
  www.saroh.in (`DEV_REDIRECT_PATH`). Flipping
  both is launch, on the owner's judgement (`PRODUCT.md`); until then no CTA
  points at sign-up or Sign in. Social publishing is not a
  current priority and must not be exposed as production-ready (§22). AI
  features are deferred (DEC-015).
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
