# Billing and classes

> **Read when:** touching invoices, subscriptions or plans, the renewal job,
> courses, class packs, or anything that books into a course session or spends
> a pack. Architecture: ADR-007 / DEC-019, amended by ADR-008 / DEC-023. Product rules:
> `saroh-product.md` ("Money a person owes").

## Invoices — **Current**

- **States:** DRAFT → ISSUED → PAID or VOID, and a void one can be reissued
  (a GST-registered business credits instead of voiding — below — and an
  issued invoice credited in full reads CREDITED).
  Overdue is derived — `isPastDue` in `modules/invoices/invoice-state.ts` is the
  one rule, used by the invoice's standing, the owed sums and subscriptions.
  Never store it.
- **Numbers** come from `InvoiceSequence` inside the caller's transaction
  (`nextInvoiceNumber`), so a rolled-back caller leaves no gap. Another module
  issues through `InvoicesService.issueInTx(tx, organizationId, input)`, never
  by writing `Invoice` rows itself.
- **Issuing** re-reads the draft under its row lock and refuses a due date that
  has passed; it copies the bill-to name and email, so later edits to the
  contact don't change an issued invoice.
- **Money** is minor units in arithmetic and `Decimal` strings on the wire
  (`backend-data-and-money.md`).
- **Who sees what:** invoice ids and numbers go only to a role with
  `invoice:read`; a subscription or pack view without it still says what is
  owed, not which invoices.

## Invoices for orders, corrections and GST — **Current** (ADR-008, DEC-023)

- **One invoice per order**, and per paid online booking — idempotent on the
  order (or booking) id, created inside the payment reconciliation or by the
  order service for pay-later and hand-recorded payments. **The order is the
  ledger:** its invoice has no pay link and mirrors the order's payment; a
  refund reconciliation makes the credit note.
- **Count each rupee once.** Takings and spent = orders + non-order invoices.
  Owed = unpaid invoices minus order invoices. A new sum that forgets the
  exclusion counts twice.
- **An issued invoice and its lines never change and are never deleted.**
  Down is a credit note, up a supplementary invoice, each with
  `relatedInvoiceId`. A supplementary invoice is ISSUED while its difference
  is unpaid and PAID when it is — or when a later edit supersedes that charge
  and what was paid covers the order again (its units' credit note offsets
  it). A GST-registered business cannot void an issued invoice
  — discard drafts, credit issued ones; void stays for unregistered receipts.
- **Money in has an invoice, money out a credit note — even money the order
  never asked for.** A payment on a superseded edit charge (#508, U8) stays
  off the order's paid sums and is owed back, but the webhook invoices it
  there and then: a supplementary invoice PAID (`ONLINE`, filed under the
  provider's payment id), the amount spread over the invoiced lines
  (`invoiceSupersededPayment`, under the intent's lock and after the
  `CAPTURED_NEEDS_REFUND` record that makes it once). Its refund's credit
  note goes through `creditNoteForRefund` like any other, spread over that
  invoice's own lines, so the pair mirror each other and takings read the
  money in on one day and out on another.
- **GST:** prices include it; tax is derived per line from the inclusive
  amount, rounded per line and frozen. Spread an order discount across lines
  before tax; delivery is a taxed line. Place of supply: bill-to state, else
  delivery state, else the business's state — same state CGST + SGST, else
  IGST. Registered → tax invoice; unregistered → receipt. A registered
  business's orders ignore the storefront's old add-on tax.
- **Numbering:** `InvoiceSequence` per business **and series**; never renumber
  an existing invoice. The financial year is April–March for everyone (GST
  sets it; not a setting), and a number's financial year and month are dated
  in the business's time zone — India's until one is saved (DEC-033). A business builds its format
  (`BusinessProfile.invoiceNumberFormat`, `NumberFormat` in `numbering.ts`):
  parts in its order (prefix, financial year "26-27", financial year short
  "26" — by the year it starts in, `FY_SHORT` — year, month), "/", "-" or no
  separator (`""`, RC26090001), a 3–6 digit counter last, restarting every financial year, every month
  or — unregistered only — never. Null is the default, today's numbers:
  RC/26-27/0001 registered, RC-0001 not, the legacy INV series with no prefix.
  `numberFormatProblem` is the rule, mirrored in the app's
  `lib/invoices/invoice-number.ts`: the longest number, invoice or credit
  note, with the counter a digit past its own (it grows rather than wrap,
  and a number past 16 cannot be issued — in a webhook, that fails the
  payment), ≤ 16 characters of A–Z 0–9 - /; a yearly restart needs the financial
  year in the number, long or short — not the calendar year alone, which
  January–March share with the next financial year's restart — and a monthly
  one the month and a year of any kind (the database holds each number once).
  The rules are checked on save only, and only when the save changes the
  format, the prefix or the registration (DEC-028): a stored format that
  breaks them (an old year-only yearly format) still reads and numbers, and
  never blocks a GSTIN, country or address save — in the API
  (`business-tax-settings.ts`) or the app (`numberFormatProblemOnSave`). The series key is prefix +
  restart period (`RC/26-27`, `RC/2026-09`, `RC`), not the rest of the format
  (long and short financial year count in the same series), so a mid-year
  change keeps counting; `nextInvoiceNumber` checks the number is free and
  otherwise jumps past the highest issued one with the same stem. Credit notes
  count on their own series (`RCCN/…`) and print "CN" after the prefix, or
  in its place where that would pass 16 (`CN/26-27/09/001`), or first when
  the number has no prefix (with no separator, run together: `RCCN26090001`);
  supplementary invoices share the invoices'.
- **Tax settings are Owner/Admin only.**
- **Where it lives:** the maths is pure — `invoices/gst.ts` (split, spread,
  place of supply), `invoices/gst-states.ts` (state codes, GSTIN checks),
  `invoices/numbering.ts` (`seriesFor`), `invoices/order-invoice.ts` (what an
  order's invoice, a credit note and an edit's correction say). Writes go
  through `invoices/order-invoicing.ts` on the caller's transaction:
  `ensureOrderInvoice` (order row lock, then the partial unique index
  `Invoice_one_per_order`; under that lock it also gives the paying store
  customer a contact, `customer-workspace/ensure-contact.ts`, C2 — no lock
  of its own, and `ON CONFLICT DO NOTHING` so it never fails a payment),
  `creditNoteForRefund` (unique on
  `paymentRefundId`, so the refund path and the refund webhook make one),
  `correctOrderInvoiceForEdit`, `invoiceSupersededPayment`,
  `creditRestOfOrder`. Lock order: order, intent, invoice — the webhook
  (intent, then invoice) never takes them the other way; the full order,
  with stock and refunds, is under "Orders and the shelf" below. Never write
  an order's `Invoice` rows anywhere else.
- **Every owed or spent sum over invoices spreads `OWED_WHERE`**
  (`invoice-state.ts`): no order paper, no credit notes.
- **A registered business's `Order.tax` is informational** — the GST inside
  the total, never added to it (`gstInsideOrder`).

## Orders and the shelf — **Current** (#511, DEC-032)

- **One lock order, every flow:** Order → StockLevel rows (sorted by id,
  `lockStockLevels`) → PaymentRefund → payment intent → Invoice → Booking.
  A status change (cancel, fulfil), the kitchen, an edit, a refund request
  and the refund webhook all take the order's row lock first. The refund
  webhook resolves the order id from the intent **without** a lock, then
  locks the Order and its shelves (`lockOrderShelves`), and only then the
  refund row (`matchRefund`) — so it and a cancel on the same order take
  turns instead of deadlocking. The one flow that starts earlier is a paid
  online order (`reserveOnPayment`): intent → Order → StockLevel, never an
  intent while it holds a row.
- **Every stock move of an order goes through `stock/reserve.ts`** on the
  caller's transaction; `orders/order-inventory.ts` maps a status change
  onto it. A line holds `heldQuantity` on the row it recorded: release(n)
  gives back min(n, held), and fulfilling sells what it still holds, not
  its quantity — so a line refund, a cancel, a kitchen undo and an edit
  combine without releasing twice. Holding is a promise (no log entry);
  selling, a kitchen undo and a return are shelf changes (SOLD, REVERSED,
  RETURNED entries). A line placed while its product counted no stock is
  `NONE` for life.
- **Staff orders hold when made**, under the rows' locks with a conditional
  can-sell update; the refusal is the storefront's words from
  `stock/stock-words.ts` — "Sourdough — Sold out", "… — Only 2 left at Hill
  Road". An online order holds only when paid: `reserveOnPayment` is
  idempotent per intent: a payment that held records a `STOCK_HELD`
  attempt, so its webhook repeating reads HELD even after the order
  closed, while any other payment reaching a closed order is refunded
  (lines held at placement say nothing about it). A payment that lost the
  last unit, or reached a closed order, records one
  refusal (`CAPTURED_NEEDS_REFUND`) and one PENDING refund of the whole
  payment keyed `sold-out:<intent>`, sent from a `payments.send-refund`
  job written on the same transaction (`send-refund.handler.ts`: looks
  before it sends, retried with backoff while the provider's answer is
  unknown) and confirmed by the refund webhook (DEC-026). A refused
  checkout had money reach it, so it is a real order (`realOrderWhere`):
  staff see it and its refund in Orders, and the customer is told the
  money is on its way only once the provider has the refund.
- **A refund moves stock only in the transaction that moves it into
  SUCCEEDED** — the provider's word, never the request — so a redelivered
  webhook changes nothing. By line, each line gives back min(refunded,
  held); a line already fulfilled holds nothing. "Put N back in stock"
  (`PaymentRefundLine.putBackQuantity`, off unless asked, checked when the
  refund is asked for: never more than the line sold less what refunds put
  back) writes a RETURNED entry then; a refund that fails puts nothing back.
  A line-less refund (the provider's dashboard) releases only when it brings
  the order to fully refunded; an edit's difference never does.
- **A kitchen undo of a fulfilment** reverses each line's sale and holds it
  again, refused once a line has a confirmed refund or the order a RETURNED
  entry. An edit refuses a variant the order's storefront doesn't sell and
  writes no entries.
- **Track stock (#515, `stock/tracking.ts`)** — a product counts stock only
  while `Product.stockTracked` and the business's
  `BusinessProfile.stockTracking` (no profile: on) are both on. Turning
  either off takes Product (or the profile) → its StockLevel rows by id, is
  refused while any is promised ("N are promised to open orders — fulfil or
  cancel them first"), and counts each shelf with stock to 0, so the log
  still adds up; turning on writes nothing and every shelf starts at 0.
  Reserve re-reads tracking after its row locks (a line whose product just
  stopped counting is NONE for life); a kitchen undo or a put-back on a
  product that no longer counts moves no stock. Readers spread
  `COUNTING_ROWS`, so an untracked product's rows (kept at 0 for the log)
  read as untracked, never Sold out. The switches need `store:write`,
  never `inventory:write` alone. Each real change writes one audit row on
  the switch's own transaction (`stock/tracking-audit.ts`, Settings →
  Activity): `product.stock-tracking.on` / `.off` (the product's name; off
  adds the units counted to 0 and at how many storefronts; on adds the
  hand-marked Sold outs it cleared — never separate `.clear` rows — and
  `startedWithCount` when a first count turned it on) and
  `business.stock-tracking.on` / `.off` (how many products). No change, no
  row. Pass the context's `roleKey` on the `StockActor` so an operator's
  row is marked `byOperator`.
- **Sold out by hand (#515, `stock/sold-out.ts`)** — an untracked product
  sells unless a storefront marked it sold out (`ProductListing.soldOutAt`,
  `PUT …/products/:id/sold-out`, `inventory:write` or `store:write`; a
  product that counts stock is a 409). `tryHold` refuses a fresh line for
  it at that storefront with the counted Sold out's words, so a staff order
  is refused and a paid checkout is refunded (`reserveOnPayment`); lines
  that held before are never re-judged. It takes the Product lock, writes
  no stock entry, and is recorded as `product.sold-out.mark` / `.clear` in
  the audit stream (Settings → Activity). Turning tracking on — the
  product's switch, or the business's for products whose own switch is
  on — clears it.
- **Subscriptions, plans, bookings and class packs never touch product
  stock.**

## Paying an invoice from a link — **Current**

- **The token is a secret.** 256 random bits, stored only as its SHA-256
  (`Invoice.payTokenHash`, `invoices/pay-token.ts`); the address is shown once,
  a new link replaces the old, and voiding the invoice or deleting its contact
  clears it. Never log `/public/invoices/<token>` — the request log redacts it.
- **The public read is an allow-list** (business name, number, dates, lines,
  tax, total, currency, status, billed-to name) served server-to-server to
  `saroh.app/pay/<token>`; reads and payment starts are rate-limited per link.
- **The amount is the stored invoice's.** A payment request carries only a
  provider and an idempotency key; anything else is ignored.
- **`PaymentIntent` pays an Order or an Invoice** — exactly one (a CHECK in the
  migration). Webhooks find the intent by provider id or by the invoice id
  echoed back as the merchant reference. Success on an ISSUED invoice marks it
  PAID (`ONLINE`) under its row lock; success on one already PAID or VOID is
  `CAPTURED_NEEDS_REFUND`, raised on Home until the provider's refund webhook
  clears it. A refund never changes an invoice's status.

## Paying for a booking online — **Current** (U19, ADR-008)

- **Pay now is a hold, not a booking.** The booking page's pay-now makes a
  PENDING booking with `holdExpiresAt` (15 minutes) and a DRAFT invoice
  (`source` BOOKING) with a pay token; the customer pays it through the
  invoice payment path (`bookings/booking-hold.ts`). The webhook confirms the
  booking (`paidWith` PAID) and numbers the invoice PAID in one transaction; an
  unpaid hold never takes a number.
- **Every capacity count reads `holdsPlace(now)`** — confirmed, or a hold
  inside its time. Never write `status: "CONFIRMED"` for a place count: a
  live hold would be double-booked, and an expired one would never free.
- **An expired hold is free at once**; `booking.release-holds` (every 5 min)
  cancels it and voids its draft, keeping the intent so a late payment is
  still found. A late payment confirms when the place is still free, else it
  is `CAPTURED_NEEDS_REFUND`.
- **A hold is only ever let go through `releaseHoldInTx`** — the sweep, the
  booker, and the team cancelling it (`cancelBooking`) — so its draft is
  always voided and its pay token cleared with it.
- **Lock a booking that may be a hold invoice first, then booking**
  (`lockBookingInTx`), the webhook's order. The other way round, a release
  and a payment arriving together deadlock (#508).
- **Hold drafts are not the business's paper**: `NOT_A_BOOKING_HOLD` keeps
  an unnumbered booking invoice out of the invoice list and customer paper.
- **The price is the service's, on the server.** The book request has no
  amount field (the validation pipe refuses one); pay at the desk books
  CONFIRMED with `paidWith` DESK. A class credit online is below (A10,
  ADR-011).
- **A deposit rides the same hold** (E8, default 39). `pay: "DEPOSIT"` makes
  the hold's draft invoice for `depositCents(price, depositMode)`, worked
  out on the server, and the snapshot records `deposit.cents`; the rest is
  due at the visit (`booking-money.ts`). A service with a deposit is never
  booked to pay at the desk (`payAtBooking`), and a FULL deposit is paying
  now. The public read serves `depositCents`, never the mode.
- **The free-cancel deadline is fixed at booking** (`Booking.freeCancelUntil`,
  DEC-051), written by `reserveInTx` from the rule of that moment. A move
  never changes it; `isLateCancel` reads it, falling back to the start and
  today's rule for bookings made before the column.
- **A cancel in time refunds money paid online for the booking, once**
  (`payments/booking-refund.ts`). Lock order: the booking invoice's intents
  (`lockBookingIntentsInTx`), then `lockBookingInTx`; re-read the booking,
  and only a booking not yet cancelled reserves one PENDING `PaymentRefund`
  keyed `deposit-refund:<bookingId>` in the cancel's transaction. The cancel
  sends it after commit (`sendAutomaticRefund`, DEC-026); the refund webhook
  settles it and makes the credit note on the booking's invoice
  (`creditNoteForRefund`, DEC-023). A late cancel keeps the money; the
  business's `returnCredit` override refunds it only with `payment:manage`.
  A visit of a treatment has no booking invoice, so it never refunds here
  (DEC-050): its money goes back through the order.
- **Cancel and move have one write each, whoever acts** (A6):
  `bookings/booking-cancel.ts` and `booking-move.ts`. The team calls them
  from `BookingsService`, the customer from their account
  (`site-accounts/account-bookings.service.ts`) with no actor, so the
  history reads "by the customer". The customer's own rules sit on top: no
  move inside the free-cancel window ("Call ‹business› to change this"), a
  new time only where the booking page would offer it, and never a refund
  by hand. A visit of a treatment takes its order's lock first.
- **The anonymous `POST public/services/:id/book` answers 410** "Sign in to
  book" and reads no body (A9); bookings from a site go through
  `POST public/site-accounts/bookings`.

## Subscriptions — **Current**

- **Forward only.** A backdated start keeps its renewal day but only the period
  holding today is invoiced; a future start bills nothing until it arrives
  (an empty period ending at the start). Periods are luxon arithmetic in the
  subscription's own snapshotted timezone, anchored and clamped to month end
  (`subscriptions/periods.ts`).
- **One live subscription per person per plan** (partial unique index, 409).
- **Payments off:** subscribing, and resuming past the paid period, are
  refused (`assertPaymentsOn`); renewals wait, but one set to end still ends.
- **Renewal** is the self-rescheduling `subscription.renew` job
  (`backend-jobs.md`); `renewOne` takes the row lock and is idempotent per
  period (partial unique index on live invoices per period).
- **A pause has an end date, or none** (plan 2026-09-26-004, D8;
  `subscriptions/pause-until.ts`). `pausedUntil` is the start of that day in
  the subscription's zone: 2, 4 or 8 weeks, or a day staff name; null is
  "Until I resume", which is staff's only — a customer's own pause (A8)
  takes `weeks`. The renewal job picks it up on that date and resumes it
  through the manual resume's own code (`resumeLocked`), extending the paid
  period by the pause's calendar days or starting a new invoiced period, and
  writes RESUMED as JOB; any resume clears `pausedUntil`. With Payments off,
  a resume that would start a new period is refused: it stays paused, one
  RESUME_REFUSED is written per pause, and Home's
  `PAYMENTS_PAUSES_WAITING` reads the subscriptions themselves until
  Payments is back on.
- **Collections** (plan 2026-09-23-003, U7) are dated from the subscription's
  collection weekday in its own timezone, within each period — a monthly plan
  can collect weekly (`subscriptions/collections.ts`, the one source for any
  read of collections, the month feed included). A skip is one local date in
  `SubscriptionSkip`, future only, with Undo while it is still to come.
- **A skip saves a charge only when it empties the period.** Plans are priced
  per period, never per collection, so skipping one of several collections is
  a pickup skip (no proration). A period whose every collection was skipped
  before it was invoiced advances unbilled (`uncharged`); undoing such a skip
  invoices the period then. A skip after the period's invoice leaves the
  invoice alone.
- **Plan change from the next renewal:** `pendingPlanId`, applied by the
  renewal (or by a resume that starts a new period) at the new plan's price,
  currency and interval — a new interval starts its chain where the old
  period ended. Undo clears it; cancelling now drops it; archived plans are
  refused.
- **A plan's classes reach a member at their next renewal** (round-2
  D10). A subscription takes its plan's `classesPerMonth` into
  `classesPerPeriod`, stamped `classesPerPeriodSetAt`, at subscribe, at
  each renewal and at a resume that starts a new period — a booked plan
  change's classes with it, in the same transaction as the invoice. Read a
  member's allowance only through `subscriptions/classes-allowance.ts`
  (`classesAllowance`, `HAS_ALLOWANCE_WHERE`): booking with the membership
  and Customer Detail's "Classes left" do, and the detail names the next
  period's number when it differs. A null stamp is a row the previous image
  wrote and reads the plan's number (the one-release fallback; follow-up Z1
  removes it once no live row is unset); the backfill is
  `backfill/classes-per-period.cli.ts` (`ROUND_2_PHASE_2_ROLLOUT.md`, D10).
  A seed writing subscriptions sets both columns.
- **Only an ACTIVE plan is on sale** (round-2 D21). A plan's `status` is a
  String, and a DRAFT (D5) isn't published yet. Every path that sells a plan
  — subscribe, a plan change, and a sign-up from the site — calls
  `assertPlanOnSale` (`subscriptions/plan-on-sale.ts`: a DRAFT is a 409
  "This plan isn't published yet", ARCHIVED stays a 400). Every read that
  lists plans for sale — the site's plan lists and blocks — filters by
  `PLANS_ON_SALE`. "Sell again" and Archive refuse a DRAFT; a draft goes on
  sale only by being published.
- **Plan drafts** (round-2 D5). The shared rules are in
  `common/drafts/draft-record.ts`, which class packs reuse in E14. The Plan
  Editor's first save makes a DRAFT (`subscriptions/plan-drafts.ts`); its autosaves
  write the draft's columns and record no event. A live plan's autosaves
  write `pendingChanges` — only the fields that differ from the published
  columns, null when none — and buyers keep reading the published columns
  until Publish. Every editor write takes the plan's row lock (Publish takes
  the name lock first), checks the `revision` it carries against
  `draftRevision`, and bumps it; a stale one is a 409 with details
  `{ yours, current, changedBy, changedAt }` (`changedBy` a display name,
  Saroh support for an operator) and writes nothing. No other refusal
  carries those keys: the editor shell reads them as "Priya changed this
  plan". A name another plan has, or no price, is kept on autosave, listed
  in the read's `problems`, and refused at Publish as a 409 on that field.
  Publishing a draft records PUBLISHED; publishing a live plan's changes
  records the change as the old form did (PRICE_CHANGED, …); Discard
  records DRAFT_DISCARDED. Delete is for a DRAFT nobody is on or switching
  to. The old whole-plan `PATCH :planId` stays until Z6: it refuses a draft,
  and a recorded change or an archive bumps the revision. **The staff list
  hides drafts unless asked** (`include=drafts` or `status=DRAFT`), so an
  app from before the Plan Editor never draws one as a live card.
- **Pack drafts** (round-2 E14) follow the plan's rules on the same shared
  helper, with the same routes under `class-packs` and the same editor
  shape (`class-packs/{pack-drafts,pack-draft-view}.ts`). Only an ACTIVE
  pack is sold: `assertPackOnSale` (`class-packs/pack-on-sale.ts`; a DRAFT
  is a 409 "This pack isn't published yet"), and a list of packs a buyer
  can choose filters by `PACKS_ON_SALE`. A pack's services are a draft
  field too (a sorted id list; `sameValue` compares lists): a draft's are
  written to `ClassPackService` directly, a live pack's wait in the pending
  set, and sales and redemptions keep reading the published ones until
  Publish. There are no pack events yet (E13 adds `PackEvent`), so who
  moved the revision is kept on the pack itself (`revisedAt`,
  `revisedById`; null for an operator, named Saroh support). E13 adds the
  kind and first-pack-only fields to `PACK_DRAFT_FIELDS` and owns the kind
  lock at publish.
- **Every plan change is a plan event** (plan 2026-09-26-004, D2). A plan
  write (`subscriptions/plan-writes.ts`) takes the plan's row lock (FOR NO
  KEY UPDATE, after the name lock), reads what it was, and writes one
  `SubscriptionPlanEvent` in the same transaction, with
  `{ field: [before, after] }` for the fields that changed
  (`plan-events.ts`). A save that
  changes nothing, or is refused, writes none. The log is append-only; an
  operator's change reads as Saroh support (DEC-035). There is no backfill:
  a plan without a CREATED event says "Earlier changes weren't recorded"
  (`earlierUnrecorded`).
- **Everything done to a subscription is a subscription event** (D9).
  Each action writes one `SubscriptionEvent` inside its own transaction,
  after the subscription's row lock, through
  `subscriptions/subscription-events.ts` (`subscriptionEventLog(tx, …)`,
  bound to the actor): TEAM or OPERATOR from the context, JOB for the
  renewal job, CUSTOMER with `customerAccountId` from a customer's own
  session (epic A). A refused action rolls back and writes none; the job
  writes RENEWED once per period, since a redelivered run finds the period
  already moved under the lock. A new action that changes a subscription
  adds a kind to `SUBSCRIPTION_EVENT_KINDS` and records it. Who did it is
  named by `event-actors.ts`, shared with the plan log, so an operator is
  Saroh support in both. The log is append-only, keyed to its subscription
  by `(subscriptionId, organizationId)`, and read newest first by cursor
  (`GET subscriptions/:id/events`); the invoice an event names is left out
  without `invoice:read`. No backfill: without a SUBSCRIBED event the read
  says `earlierUnrecorded`. Home's failed-renewal source reads its
  RENEWAL_FAILED and MANDATE_LIMIT_LOW events (F1, written by D13).
- **A mandate ends with its subscription, a privacy removal or a merge**
  (round-2 D20, DEC-038). A `PaymentMandate` belongs to one subscription.
  Every write that moves a subscription to CANCELLED calls
  `cancelMandatesInTx` (`payments/mandate-cancel-job.ts`) in its own
  transaction, after its event: the live mandates are marked CANCELLED at
  once — never charged again — with a MANDATE_CANCELLED event (actor JOB,
  `data.reason`), and a `mandate.cancel` job asks the provider after
  commit, so a provider timeout never undoes the cancel. A new path to
  CANCELLED must call it too. A merge does the same for the merged-away
  contact's mandates (never moved to the survivor). A privacy removal
  (C11) calls `MandatesService.cancelFor({ organizationId, contactId },
"PRIVACY_REMOVAL")` before its transaction and refuses while
  `unconfirmed` isn't zero. `cancelConfirmedAt` null on a CANCELLED row is
  "being confirmed" (DEC-026); a confirmed row is never asked again.
- **Payment failed** is derived — the latest invoice unpaid past due — never
  stored. "Retry now" mints a new pay link for that invoice, replacing the
  old one; nothing is charged.

## Courses and class packs — **Current**

- **Race safety:** each write that books or spends runs Serializable **and**
  takes a row lock (the course, the pack purchase, the booking) before
  counting. The RLS proxy passes the isolation level through
  (`packages/database/src/rls-proxy.ts`); the locks hold either way. A lost race
  (`isSerializationFailure()`, `P2034` however it arrives) is retried once so
  the answer is true now, then a plain 409.
- **One reservation core:** a course or pack booking goes through
  `BookingsService.reserveInTx(tx, …)` on the caller's transaction, so a
  refusal takes everything back. Course bookings link to their enrolment and
  queue no `booking.notify`.
- **Held seats:** an OPEN course's unsold seats count as taken for everyone
  else on its sessions (`bookings/course-seats.ts`) — in the booking gate,
  rescheduling and the availability listing — but not for the course's own
  enrolees, and not while its business has Courses switched off. A service's
  capacity cannot drop below a course's seats.
- **Packs:** a pack must be unexpired at the session's start; with several,
  the soonest to expire is spent. Cancelling a booking returns its class —
  before the business's free-cancellation window; after it (**Adopted**,
  ADR-008) the cancel is late and the credit stays used.
  Balance is derived (credits − live redemptions).
- **A class credit online** (round-2 A10, ADR-011;
  `bookings/booking-credit.ts`). Only a signed-in customer, on
  `public/site-accounts`. The API decides the offer
  (`GET …/bookings/credit`, `offeredCredit`): a membership's class first —
  ACTIVE, an allowance with one left in the class's month, and only for a
  class (capacity > 1); a membership with no allowance is not a class plan
  and never pays online — then the pack the desk would spend (soonest to
  expire, covers the service, a class left, valid at the start), and no
  pack while Class packs is off. The booking (`pay: "CREDIT"` with
  `packPurchaseId` or `subscriptionId`) spends it on the reservation's
  transaction through the desk's own `redeemPackInTx` / `useMembershipInTx`
  with `actor: "customer"`: the booking is written, then the purchase (or
  subscription) is locked and counted, so a refusal takes the booking back.
  For a customer, someone else's pack or membership is a 404, a named one is
  required (never "whichever"), and every refusal carries
  `details.reason: "credit-gone"` in their words, so the page re-reads its
  offer and keeps the time. A lost serialization race is retried once
  (`reserve`'s `retryOnce`), so two tabs spending the last class get one
  booking and one "no classes left". The booking reads at the desk exactly
  as a desk-made one (`paidWith`, the redemption, the money).
- **Contact deletion** cancels the person's future course and pack-paid
  bookings and deletes their enrolments **before** the contact (a booking
  references both; one cascade trips a foreign key — `DEV_LEARNINGS.md`).

## Modules and routes — **Current**

- Subscriptions and invoices: PAYMENTS, with `@IgnoreModuleReadiness()` so a
  business with no provider still records payments by hand. Courses: its own
  COURSES module (depends on APPOINTMENTS). Class packs: its own CLASS_PACKS
  module (depends on APPOINTMENTS; E12, default 44), reached with
  `pack:read`. Online classes: APPOINTMENTS.
- **Switched off, a module stops new work and keeps its rows** (DEC-016).
  Class packs off refuses a sale from the row itself
  (`class-packs/class-packs-on.ts`, a missing row counts as on), whatever
  `MODULE_ENFORCEMENT` says; packs, purchases and classes spent stay, a
  booking paid with one still says so, and a cancel in time still gives the
  class back. "Also sell" on Bookings › Services and Settings › Modules flip
  the same switch through `ModuleLifecycleService`.
- A Member reads bookings, services and contacts but no billing, course or
  pack screen (DEC-020); every billing read names its own action.
- Workspace routes: `/billing/{subscriptions,plans,invoices}` (the rail's
  Billing section is `/billing`), `/courses`, `/class-packs`. A section's pages
  share its prefix so the rail marks it on every page.
- Demo data: `db:seed:showcase` builds Pulse (subscriptions and invoices),
  Prana (courses, packs, online classes) and CarePoint (a clinic without
  Payments), and checks its own sums in SQL (`docs/architecture/LOCAL_DEV.md`).
