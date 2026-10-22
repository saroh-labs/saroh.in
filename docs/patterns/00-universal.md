# Universal rules

> **Read when:** before any change, in any app or package.
> Adapted from claude-patterns `00-universal-rules.md`. For product rules, read
> `saroh-product.md`; for how an AI agent should work here, `PRODUCT_STRATEGY.md`
> §33 applies in full.

## 1. Search before creating

**Adopted** — Look for an existing component, hook, helper or service before
writing one; extend or promote it rather than copy it. Five `cn()`
implementations and an orphan `packages/utils` existed until `5ec5560`; no known
duplicate remains, and the rule is what keeps it that way.

## 2. One way to reach the API per app

**Current** — `app.saroh.in` goes through `lib/api/http.ts` (`apiFetch`,
`getJson`, `getList`, `mutate`), server-only, forwarding the session cookie and
the active organization; domain adapters in `lib/<domain>/service.ts` use it.
`admin.saroh.in` uses `lib/control-plane.ts`, the same shape for `/admin/*`.
Client components call a Server Action, never the API. Frontends never import
`@saroh/database` or a package that does (ESLint). `accounts.saroh.in` is the
exception by design: it talks to Better Auth through `authClient`.

## 3. Failures carry their status

**Current** in `app.saroh.in` — `lib/api/errors.ts` `ApiError` keeps the HTTP
status and exposes `isUnauthorized`, `isForbidden`, `isNotFound` and
`isServerError`. Narrow on those, never on a number. A permission denial is
explained, not presented as a breakage (PRODUCT_STRATEGY §30). No other app has
a typed error yet.

## 4. Every user-initiated failure is visible

**Current** — A toast, an inline message or a boundary; the only silent
`catch {}` in the repo is the pre-paint theme script in the accounts layout. See
`frontend-error-feedback.md`.

## 5. Tokens, not colours

**Adopted** — Semantic tokens in product apps, `--site-*` on merchant pages, and
never a hex literal, a raw palette class or an arbitrary value in app code.
Gap: one raw palette class remains in `app.saroh.in`. See
`frontend-design-system.md`.

## 6. Keep files small enough to read

**Adopted** — Past roughly 400 lines, split along seams that already exist; spec
files often show them (`backend-nestjs.md`). Gap: 38 source files were over when
this was written, led by `sites.service.ts`, `site-editor.tsx` and
`bookings.service.ts`. Seed data is exempt.

Still over after #508 split the booking page and the bookings service (U10),
each with why it stops there:

- `bookings/bookings.service.ts` (1,364; 1,712 before A6) — the merchant's
  side: service and rule CRUD, the calendar read, cancel, outcome,
  reschedule and booking by hand behind one controller. A6 moved the cancel
  and move writes, which the customer's account shares, to
  `booking-cancel.ts` and `booking-move.ts`, and B14 the outcome write,
  which Order Detail's "Mark visit N attended" shares, to
  `booking-outcome.ts`; what is left calls them. Under
  400 means one injectable per feature and a controller and DI change, not
  a move.
- `bookings/public-bookings.service.ts` (820 after A10, C12 and E9) and
  `bookings/reservation.ts` (725) — one class sharing its rate limiters, and
  one serializable write with its helpers; cutting them splits a method.
  A10's credit rules went to `bookings/booking-credit.ts` rather than grow
  them further; `bookOnline` is the seam when they are next cut.
- Deferred from #508, not yet split: `customer-workspace/customer-detail.service.ts`
  (1,289 after C14, whose Spent read — net of refunds, the list's rule — is
  `customer-spent.ts` over `spent.sql.ts`; 1,293 after C7, which moved the
  packs read out to `customer-detail-packs.ts`; 1,351 before). Beside it,
  `customer-workspace/customers-list.service.ts` (565; C14 added only
  "added by hand" on a row, and Add customer is `customer-add.service.ts`)
  and the app's `lib/customer-workspace/view.ts` (799 after C14 took the
  dates to `when.ts` and "added by hand" to `added.ts`; 823 before) — the
  list's read and the detail's words, each a set of small functions whose
  seams are the parts of the page. `calendar/calendar.service.ts` (1,418 after E19, E20, B13 and E27, whose range,
  days-off, payments and working-hours reads already sit in their own files;
  E27 added only the response's `hours` field; split next),
  `orders/order-kitchen.service.ts` (about 1,020 after B6 took the stage writes out; 1,220 after B2b–B15, B9, A14 and B14), `staff/staff.service.ts` (744).
  B9 kept its change of fulfilment and its cancel out of the kitchen
  service (`order-fulfilment-change.service.ts`, 402, one transaction and
  its money; `order-cancel.service.ts`, `order-cancel.ts`,
  `order-change-options.ts`, `order-customer-note.ts`); it added only the
  read's change options and exported `lockOrder`. B14 kept a treatment's
  visits out of it too — the read in `order-visits.ts`, "Mark visit N
  attended" in `order-visit-attend.ts`, the order following its visits in
  `treatment-fulfil.ts`, and the paper's title (D15) in
  `order-invoice-title.ts` — adding only the read's `visits`, the title's
  select and a one-line delegate. The edit is the next cut.
  B13 (walk-ins, New order v2) left it untouched: who the order is for, the
  counter payment and the ways a cart may leave are `orders/new-order.ts`,
  and how a walk-in reads everywhere is `orders/walk-in.ts`.
  B6 (bulk kitchen moves) took the single move, its Undo and `lockOrder`
  out to `orders/order-stage-write.ts`, which every batch line shares;
  the batch itself is `order-stage-batch.service.ts` and its lines'
  helpers `order-stage-batch-lines.ts`.
- `orders/order-read.ts` (696 after B9's `refundsOnTheWay`; 638 before
  B14) — the one read Order Detail renders and its DTOs. B14 added the
  `visits` and `title` fields and put what fills them in their own files;
  the DTO interfaces are the seam.
- `orders/orders.service.ts` (683 after B13) and `orders/dto.ts` (583) —
  the storefront-scoped create, its pricing, discount code and stock
  promise in one serializable write, and the order DTOs. B13 added only the
  calls into `new-order.ts` and the DTO's optional fields, whose classes are
  in `new-order.dto.ts`. The create's pricing is the next seam.
- `payments/payments.service.ts` (2,045 after B8, B9, E8 and B13's null-safe
  customer check) — every money
  path of an order (intents, refunds and their two phases, the pay link's
  intent) shares one private refund core and provider call; B9 added only
  a thin `refundOrderForCancel` onto that core and the cancel's finish in
  `recordRefundTaken`. Refunds as their own service is the seam.
- `app.saroh.in/components/commerce/order-detail/order-detail.tsx` (598
  after B8, B11, B9, B13 and B14) — the page's cards share its one `panel` and hold
  state. Its six side sheets (courier, tracking, edit, refund, fulfilment,
  cancel) are drawn by `order-sheets.tsx` in the frame `order-sheet.tsx`
  (which also holds which is open, `useOrderPanel`); B9's own went to `fulfilment-panel.tsx`,
  `cancel-panel.tsx` and `use-order-changes.ts`, B13's walk-in card to
  `walk-in-card.tsx`; B14's Visits card, its
  stepper and next action to `visits-card.tsx` and `visits-next.tsx`, their
  words to `lib/orders/visits.ts`, and the timeline's lines to
  `lib/orders/timeline-steps.ts`. The header and the money column are the
  next seams.
- `app.saroh.in/components/commerce/orders/order-quick-view.tsx` (421 after
  B5's phone sheet, DEC-067; 401 before B14's "1 of 3 visits" line) — the panel, its read and retry, and
  the body share one open state; the body is the seam.
- The calendar's `lib/calendar/layers.ts` (443) — the layers' order,
  tones, words and day lines. E22 put the named problems and their fixes
  in their own `lib/calendar/problems.ts`, and E23 the money (in, out,
  due, the strip and the day's line) in `lib/calendar/money.ts` and the
  export in `lib/calendar/export.ts`, rather than grow it; the month
  summary and the item lines are its next seams. E24 left it untouched:
  days off are `lib/calendar/days-off.ts`, and the team filter's
  narrowing of the month is `lib/calendar/team.ts`.
  `components/calendar/business-calendar.tsx` (404 after E22) went back
  under when E23 took the switches row to `layer-switches.tsx` and the
  month strip to `month-strip.tsx`; E24 (388) moved the ‹ › month steps
  to `month-step.tsx` to make room for the team filter, whose select is
  `team-filter.tsx`. `calendar/calendar.service.ts` is unchanged by E24,
  which needed nothing new from the API. E25 (the Week's card columns)
  left `layers.ts` and the API untouched too — the week is one E20
  `from`/`to` read — and brought `business-calendar.tsx` down to 304: the
  row under the title (‹ › , Month | Week, the team filter, the switches)
  went to `calendar-toolbar.tsx` and `view-switch.tsx`, the missing-layer
  notice to `calendar-missing.tsx` and the day's sheet to `day-sheet.tsx`,
  which the Week shares. The Week itself is `business-week.tsx`, its
  columns `week-columns.tsx`, and its rules `lib/calendar/week.ts` (dates,
  title, edges, address) and `lib/calendar/week-columns.ts` (what each
  column and card says).
  E27 (the Week's hour grid for a business with a team) left `layers.ts`
  and `business-calendar.tsx` untouched too: the grid is
  `week-hour-grid.tsx`, its days `lib/calendar/week-hours.ts` and its
  geometry `lib/calendar/hour-layout.ts`; `business-week.tsx` (243) only
  chooses between it and the columns. The API's working hours are
  `calendar/working-hours.ts`, read beside the days off.
- `shared/nav-items.tsx` (1,176; Sell › Stock and its Track stock rule, #527) — the nav's data (`NAV_GROUPS`,
  `SETTINGS_PAGES`) and every rule that filters it by role, module and
  site; half of it is the table itself. Splitting data from rules is a move,
  not yet made.
- `modules/module-list.tsx` (430) — one list and its row, switch and state
  tag; a little over, and the row carries most of it.
- `site-accounts/customer-view.ts` (502 after A6) — the account area's one
  allow-list (ADR-011): every answer a signed-in customer gets is built here,
  so a reviewer reads one file to know what can leave. A7's Track words went
  to `account-track.ts`, and A6's bookings to `account-bookings-view.ts`,
  the second allow-list file it re-exports; the order serializers are the
  next seam if A8 and A13 grow it further. DEC-142's reads (invoices to
  pay, a class's line, courses, the email choice, what changed) went to a
  third, `account-details-view.ts`, re-exported the same way, adding only
  Home's new fields here (816 now, with A8, A11 and A13).
- `home/home.service.ts` (778 after F11; 785 after F4; 797 before F2) — `build()` is one parallel
  read of every Home source, each behind its own guard, and the ranking of
  what they return. Round 2 put each source in its own file
  (`home-money-sources.ts`, `home-site-stock-sources.ts`,
  `home-people-sources.ts`, `home-today.ts`, `home-week.ts`, …); F2 also
  moved the CRM reads to `home-crm-sources.ts` rather than grow it, and
  F4's inline actions are `HomeInlineService` in `home-inline.ts`, called
  once. F11's staff landing is `home-staff.ts` (who is narrowed to which
  storefronts and diary, and the where-helpers each source takes), and it
  moved the schedule band to `home-schedule.ts`. B9's failed order refunds
  (DEC-067) are `home-refunds-failed.ts`, called once. The refunds-owed read (to
  `home-money-sources.ts` once D13 has landed there) is the next seam.

- `billing/billing-webhook.service.ts` (about 1,360; 1,034 before 17 Oct)
  — the one transaction each provider event is applied in: a checkout's
  completion, the subscription's own events, and since DEC-164 a payment
  after Saroh let go (`onDroppedCheckout`, `onLeftCheckout`,
  `chargedAfterCancel`). What decides those is already out
  (`paid-after-end.ts`, `double-charge.ts`, `double-charge-refund.job.ts`, `plan-moves.ts`,
  `change-timing.ts`); the three handlers share `completeCheckout`,
  `renewed` and the outcome type, and are the next seam (a class of their
  own handed those two).

Added or grown past 400 by the Products and Stock release (#510–#531), each
with why it stops there:

- `stock/stock.service.ts` (1,147) — the stock module's one writer: every
  shelf change (count, received, wasted, returned, move, undo, and the
  order flows' sale and return) goes through `recordEntry` or the batched
  count and undo, under one set of lock and below-zero rules — and, with
  no entry, `setWarnings` (a warning level alone, #534). It also finds
  and creates rows under the product's lock. Row resolution, the batch
  writers and the order flows' writers are each a seam. Splitting them
  means exporting the private `Row` and lock helpers across files, and it
  hasn't been done yet.
- `stock/reserve.ts` (901) — every hold, release, sale, kitchen undo and
  refund put-back an order makes, plus `reserveOnPayment`. They share one
  line loader, one lock order and the invariant (promised = sum of held).
  Online payment (`reserveOnPayment`) is the natural cut once the online
  checkout calls it.
- `collections/collections.service.ts` (818; the cards' website pages,
  #524) — hand-picked and automatic
  collections, their products and a product's collections, around the one
  category tree. The product page's reads (`forProduct`, `setForProduct`)
  could move to their own service, as the controller's product routes
  already are.
- `stock/levels-read.ts` (458) and `stock/stock-checks.service.ts`
  (515) — the Stock screen's levels, and its four checks. Each is one
  reader, now paged (#527) by a page number or a cursor; which rows a page
  holds is `stock/stock-paging.ts`, shared with the log. The levels left
  `stock-reads.service.ts` (232 now, the log) when paging grew them, and
  how a product's lines and
  cells are drawn and judged went to `stock/product-lines.ts` (#534), which
  the Products list's Needs you shares; a little over, and cutting either
  further splits a query from the words it builds.
- `products/serialize.ts` (596), `products/inventory.service.ts` (545) and
  `products/variants.service.ts` (474) — grew with listings, stock per
  storefront, Track stock and the per-variant switch. `inventory.service`'s
  first switch (`switchStore`) and `serialize`'s stock words are the seams.
  Moving them is a file split with nothing to gain until they change again.
- `products/products.service.ts` (927; 648 before this release) and
  `stores/stores.service.ts` (411) — the catalogue's reads and section
  saves, now business-wide with listings and the delete guard; and a
  storefront's create with its caps and, now, the business's currency. The
  catalogue list read and the storefront caps are the seams; a little over
  for the second, and not yet cut for the first.
- `backfill/catalogue-settings.ts` (624), `backfill/merge-same-products.ts`
  (493), `backfill/merge-same-products.move.ts` (523),
  `backfill/listings-stock-levels.ts` (491) and `backfill/held-stock.ts`
  (481) — one-off backfills, each one exported unit that the integration
  suite runs twice. The merge is already split, into deciding and moving.
- `stores/catalogue-screen.tsx` (425; 401 before the Collections chip,
  #524) — the Products list's rows, paging, bulk bar, quick look and
  delete confirm share its list state. The Collections chip's cards and
  sheet went to their own `commerce/collections/collections-panel.tsx`,
  passed in as a slot; the list's reload and paging are the next seam.
- `commerce/collections/collection-sheet.tsx` (401; #524) — New and Edit
  collection: reading the one to edit, its draft and field errors, the
  save, the delete confirm and the leave-unsaved confirm share its state.
  The fields and the products picker already went to
  `collection-fields.tsx`, `kind-choice.tsx` and `products-picker.tsx`;
  the load-save-delete flow, as a hook, is the next seam. One line over,
  and not yet cut.
- `sites/media-picker.tsx` (509) — the media library dialog. Photos and
  videos (#517) added the video rules and the poster frame to its one
  upload state. Less means an upload hook, which is new logic.
- `lib/products/editor-sections.ts` (762) — every editor section's schema,
  how it reads a saved product and the patch it sends, plus the media rules
  and the shell's hint and saved message. Each part is small and the
  sections share its limits and helpers; the Editor and the product page's
  sheets import it from one place. The media rules and the shell's part are
  the seams. The Editor's newer words and rules (#525) went to their own
  files instead: `editor-labels.ts`, `editor-stock.ts`, `variant-rows.ts`,
  `listing-changes.ts`.
- `product-editor-v2/photos-section.tsx` (458) and `editor-shell.tsx`
  (416) — the media set's staged list with its upload, drop and address
  paths; and the header, jumps, create flow and two columns. The library
  panel went to `photo-library-panel.tsx`, and the status pill, read-only
  note and next steps to `editor-parts.tsx` (leaving asks through the one
  guard, `components/shared/use-leave-guard.tsx`). A little over;
  what is left shares one component's state.
- `sites/custom-domain.tsx` (417 after DEC-140's bare domains) — the
  domains' read, add, check and remove share its list and busy state. The
  bare domain's step, standing and words went to `bare-domain-step.tsx`
  and `lib/domains/bare-view.ts`, leaving only the call and "Add ‹domain›"
  from a row. A domain's card is the next seam.

Added or grown past 400 by the Bookings rebuild (#1016, #1035, #1038),
each with why it stops there:

- `app.saroh.in/components/bookings/calendar/calendar-screen.tsx` (474;
  908 before the review fixes) — the screen's own state (the peek, the
  cancelled switch, Add someone) and the layout switch. Its held actions
  went to `use-calendar-actions.ts`, its free and closed time to
  `use-gap-targets.ts`, and what each day and week draws, with Header C's
  facts, to `use-calendar-days.ts`. The three layouts' JSX (day, week,
  list) is the next seam.
- `app.saroh.in/components/bookings/new-booking/new-booking-flow.tsx`
  (690) — the five steps share one draft (who, service, with, when, pay)
  and `book()`, whose refusals send the flow back to the step they name.
  The steps' drawing is already `steps.tsx`, `check-step.tsx` and
  `done-step.tsx`, the reads `use-flow-reads.ts` and the rules
  `lib/services/new-booking.ts`. `book()` and its refusals, as a hook,
  are the next cut.
- `app.saroh.in/components/bookings/sheets/customer-step.tsx` (587) —
  `useCustomerFinder` (search, the new customer's card, the duplicate
  check) and the step that draws it, which New booking and the free-time
  sheet share. The hook is the seam: its own file.
- `app.saroh.in/components/bookings/sheets/time-picker.tsx` (505) — one
  picker for New booking, Move and Book their next visit: the read and
  its retry, the day strip with Pick a date, and the times by part of the
  day share its day and window. The day strip is the next seam.
- API, not cut in this batch: `notifications/team-alert.handler.ts` (756;
  689 before) — every alert's wording (`wordOrder`, `wordFailed`,
  `wordJoined`, `wordBooking`, `wordSite`) and who it is emailed to,
  beside the handler; the rule-request 'ask' branch grew it, and the
  wording functions, one file per kind as `team-alerts.ts` started, are
  the seam. `staff/staff-rules.service.ts` (560) — read, apply, ask,
  approve, turn down, withdraw and dismiss share one row lock and one
  view; the request transitions (`move`, `askInTx`, `answerInTx`) are the
  next cut. `admin/admin-own-rate.service.ts` (465) — read, preview, set
  and end a business's own rate around one window rule; the
  module-level helpers (`windowInTx`, `viewsOf`, `summaryOf`) can move
  to their own file.

Split rather than listed: `organizations/team/team-screen.tsx` (1,486
before; 334 now, 22 Oct, DEC-183): the screen only composes its tabs; the
roster is `people-tab.tsx` with `pending-invites.tsx`, the drawer
`member-drawer.tsx` (extras still in `member-extras.tsx`), the removal
`remove-member.tsx`, the invite `invite-sheet.tsx`, and one answer to every
role question `role-book.ts` over `roles/role-words.ts`. Its Roles tab,
`organizations/roles/roles-tab.tsx` (836 before; 181 now), splits the same
way: `role-list`, `role-detail`, `permissions`, `role-sheet`,
`new-role-sheet`, and the viewer's reach in `role-reach.ts`. And
`organizations/business-settings/organization-settings-form.tsx`
(1,321 before; 219 now) when Settings › Business became rows with a sheet
each (10 Oct): the page only composes. Its schema, draft and the patch a
save sends are `business-form.ts`; the rows `business-details/business-detail-rows.tsx` and
`tax/business-tax-rows.tsx`; the sheet `business-field-sheet.tsx`, with its
fields in `business-sheet-fields.tsx` and `tax/business-tax-fields.tsx`; and
which sheet is open `use-business-sheets.ts` over
`lib/organizations/business-rows.ts`. And `sites/site-editor.tsx` (2,160 before; under 300 since
round-2 G1, #260) along its hooks and panels into `sites/editor/`. Of what it
became, `editor/use-editor-draft.ts` (409) is a little over: the sections,
what the server last accepted, the save and its autosave share one set of
state, and the form-id stamping already went to `stamp-form-ids.ts`. And
`providers/provider-list.tsx` (435 before; 120
now) along its rows, which went to `provider-row.tsx` (331); and
`lib/settings/activity.ts` (451 before; 297 now, with the Track stock lines)
along its own seam — what a save recorded, the counts a stock line says and
the words for them went to `activity-changes.ts` (265), leaving the line an
event becomes. The Editor's `variants-section.tsx` (822 before; 390 now, #525)
went along its row, its add row and its save — `variant-row.tsx`,
`variant-add-row.tsx`, `variant-save.ts`, with the row rules in
`lib/products/variant-rows.ts`; and `stock-section.tsx` (491 before; 332
now) along its two ways of counting, to `stock-fields.tsx` and
`lib/products/editor-stock.ts`. Customer Detail's
`customers/detail/detail-screen.tsx` (489 before; 359 after C14) went along
its header's actions: Edit details, ⋯ More actions and every sheet and
dialog they open are `useMoreActions` in `more-actions.tsx`.

## 7. No `any`, no `@ts-ignore`

**Adopted** — Gap: one `any` (`payments/crypto.ts`); no `@ts-ignore`. Suppress
with `@ts-expect-error <reason>` if you must.

## 8. `cn()` comes from `@saroh/ui/lib/utils`

**Current** — `packages/site-blocks` keeps its own on purpose; its docstring
says why.

## 9. No `alert()` or `confirm()`

**Current** — none in app code (the last three went in #329). For a
confirmation in `app.saroh.in` use `components/shared/confirm-dialog.tsx`,
and only for what cannot be undone (`frontend-forms.md`: one sheet, one
dialog, one confirm); elsewhere `@saroh/ui/alert-dialog` or
`@saroh/ui/dialog`, and `@saroh/ui/toast`.

## 10. Uploads go straight to storage

**Current** — presigned PUTs from `packages/object-storage`; the API never
proxies file bytes.

## 11. Environment through `env.ts`

**Current** — never `process.env` in an app (ESLint `restrictEnvAccess`). See
`devops-environments-and-flags.md`.

## 12. Say what is true

**Adopted** — A comment, a UI string or a doc must match what ships (see
`saroh-product.md`). Insights' website figures were the last known gap: the
renderer sends a view beacon since UX-032. Two booking comments that
claimed delivery were corrected in `fb778b9`.

## 13. Leave a trail

**Current** — `docs/architecture/DEV_LEARNINGS.md` for anything non-obvious you
fixed; the pattern file and its AGENTS.md trigger for any convention you change;
a row in AGENTS.md → Triggers for a new skill or pattern file. A product or
architecture decision — made with the user in a conversation, not only in an
issue — is written down in the repo the same day: an ADR in
`docs/architecture/adr/` for anything with context and trade-offs, a `DEC-`
entry in `DECISIONS.md` pointing at it, and a line in the pattern file whose
readers must obey it. An agent's private memory is not a trail; nobody else can
read it.

## 14. Git

**Current** — don't commit or push unless asked. Never `--no-verify`: the
pre-commit hook runs lint-staged, so fix what it reports.

## 15. A redesign keeps every capability

**Current** — Matching a Claude Design file is a change of look, not of what the
screen can do. List every control and state readout the screen has before you
start, and give each one a place in the new layout; anything the design leaves
out is kept — behind a toggle or a secondary control, never a hover-only tooltip
— not cut. A deliberate change in behaviour is named to the user before it
ships. The site editor redesign (#334) dropped Tablet and zoom, the whole-site
review panel, status details, block previews and settled notes, and #347 had to
put every one back.

## Before calling anything done

Run the commands in AGENTS.md → Before you finish.
