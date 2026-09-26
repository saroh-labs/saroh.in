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

- `bookings/bookings.service.ts` (1,298) — the merchant's side: service and
  rule CRUD, the calendar read, cancel, outcome, reschedule and booking by
  hand behind one controller. Under 400 means one injectable per feature and
  a controller and DI change, not a move.
- `bookings/public-bookings.service.ts` (477) and `bookings/reservation.ts`
  (418) — one class sharing its rate limiters, and one serializable write
  with its helpers; a little over, and cutting them splits a method.
- `site-blocks/src/booking-flow/booking-flow.tsx` (643) — its state, effects
  and handlers (the hold poll, confirm, letting a hold go) share one
  component's state; the drawing is already in `steps/`. Less means a
  reducer or hook seam, which is new logic.
- Deferred from #508, not yet split: `customer-workspace/customer-detail.service.ts`
  (1,173), `calendar/calendar.service.ts` (1,051),
  `orders/order-kitchen.service.ts` (857), `staff/staff.service.ts` (744).
- `organizations/organization-settings-form.tsx` (1,246) — one form holds
  every Business card (profile, tax and invoices, address, number format)
  and the cross-field rules that re-check them together; the number-format
  editor already went to `invoice-number-fields.tsx`, the time zone picker
  to `time-zone-select.tsx`, and the Hours card, which saves to the
  storefronts, to `business-hours-section.tsx`. Less
  means a card per file sharing one form context.
- `organizations/team-screen.tsx` (1,237) — the Roles and People tabs, the
  member drawer and the invite dialog share the screen's roster and role
  state. Each piece is its own function already; moving them is a file split
  with props threaded through, not yet done.
- `shared/nav-items.tsx` (1,140) — the nav's data (`NAV_GROUPS`,
  `SETTINGS_PAGES`) and every rule that filters it by role, module and
  site; half of it is the table itself. Splitting data from rules is a move,
  not yet made.
- `modules/module-list.tsx` (430) — one list and its row, switch and state
  tag; a little over, and the row carries most of it.

Added or grown past 400 by the Products and Stock release (#510–#531), each
with why it stops there:

- `stock/stock.service.ts` (1,106) — the stock module's one writer: every
  shelf change (count, received, wasted, returned, move, undo, and the
  order flows' sale and return) goes through `recordEntry` or the batched
  count and undo, under one set of lock and below-zero rules. It also finds
  and creates rows under the product's lock. Row resolution, the batch
  writers and the order flows' writers are each a seam. Splitting them
  means exporting the private `Row` and lock helpers across files, and it
  hasn't been done yet.
- `stock/reserve.ts` (901) — every hold, release, sale, kitchen undo and
  refund put-back an order makes, plus `reserveOnPayment`. They share one
  line loader, one lock order and the invariant (promised = sum of held).
  Online payment (`reserveOnPayment`) is the natural cut once the online
  checkout calls it.
- `collections/collections.service.ts` (803) — hand-picked and automatic
  collections, their products and a product's collections, around the one
  category tree. The product page's reads (`forProduct`, `setForProduct`)
  could move to their own service, as the controller's product routes
  already are.
- `stock/levels-read.ts` (442) and `stock/stock-checks.service.ts`
  (430) — the Stock screen's levels, and its four checks. Each is one
  reader, now paged (#527). The levels left `stock-reads.service.ts` (217
  now, the log) when paging grew them; a little over, and cutting one
  splits a query from the words it builds.
- `products/serialize.ts` (596), `products/inventory.service.ts` (545) and
  `products/variants.service.ts` (474) — grew with listings, stock per
  storefront, Track stock and the per-variant switch. `inventory.service`'s
  first switch (`switchStore`) and `serialize`'s stock words are the seams.
  Moving them is a file split with nothing to gain until they change again.
- `products/products.service.ts` (904; 648 before this release) and
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
- `sites/media-picker.tsx` (509) — the media library dialog. Photos and
  videos (#517) added the video rules and the poster frame to its one
  upload state. Less means an upload hook, which is new logic.

Split rather than listed: `providers/provider-list.tsx` (435 before; 120
now) along its rows, which went to `provider-row.tsx` (331); and
`lib/settings/activity.ts` (451 before; 297 now, with the Track stock lines)
along its own seam — what a save recorded, the counts a stock line says and
the words for them went to `activity-changes.ts` (265), leaving the line an
event becomes.

## 7. No `any`, no `@ts-ignore`

**Adopted** — Gap: one `any` (`payments/crypto.ts`); no `@ts-ignore`. Suppress
with `@ts-expect-error <reason>` if you must.

## 8. `cn()` comes from `@saroh/ui/lib/utils`

**Current** — `packages/site-blocks` keeps its own on purpose; its docstring
says why.

## 9. No `alert()` or `confirm()`

**Current** — none in app code (the last three went in #329). For a
destructive confirmation in `app.saroh.in` use
`components/shared/confirm-dialog.tsx`; otherwise `@saroh/ui/alert-dialog` or
`@saroh/ui/dialog`, and `@saroh/ui/toast`.

## 10. Uploads go straight to storage

**Current** — presigned PUTs from `packages/object-storage`; the API never
proxies file bytes.

## 11. Environment through `env.ts`

**Current** — never `process.env` in an app (ESLint `restrictEnvAccess`). See
`devops-environments-and-flags.md`.

## 12. Say what is true

**Adopted** — A comment, a UI string or a doc must match what ships (see
`saroh-product.md`). Gap: the Insights dashboard tells organizations "No views
recorded" when their rollups were never computed. Two booking comments that
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
