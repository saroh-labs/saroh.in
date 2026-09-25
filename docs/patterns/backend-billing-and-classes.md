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
- **GST:** prices include it; tax is derived per line from the inclusive
  amount, rounded per line and frozen. Spread an order discount across lines
  before tax; delivery is a taxed line. Place of supply: bill-to state, else
  delivery state, else the business's state — same state CGST + SGST, else
  IGST. Registered → tax invoice; unregistered → receipt. A registered
  business's orders ignore the storefront's old add-on tax.
- **Numbering:** `InvoiceSequence` per business **and series**; never renumber
  an existing invoice. The financial year is April–March for everyone (GST
  sets it; not a setting). A business builds its format
  (`BusinessProfile.invoiceNumberFormat`, `NumberFormat` in `numbering.ts`):
  parts in its order (prefix, financial year "26-27", year, month), "/" or
  "-", a 3–6 digit counter last, restarting every financial year, every month
  or — unregistered only — never. Null is the default, today's numbers:
  RC/26-27/0001 registered, RC-0001 not, the legacy INV series with no prefix.
  `numberFormatProblem` is the rule, mirrored in the app's
  `lib/invoices/invoice-number.ts`: the longest number, invoice or credit
  note, with the counter a digit past its own (it grows rather than wrap,
  and a number past 16 cannot be issued — in a webhook, that fails the
  payment), ≤ 16 characters of A–Z 0–9 - /; a yearly restart needs the financial
  year or year in the number, a monthly one the month and one of them (the
  database holds each number once). The series key is prefix + restart period
  (`RC/26-27`, `RC/2026-09`, `RC`), not the rest of the format, so a mid-year
  change keeps counting; `nextInvoiceNumber` checks the number is free and
  otherwise jumps past the highest issued one with the same stem. Credit notes
  count on their own series (`RCCN/…`) and print "CN" after the prefix, or
  in its place where that would pass 16 (`CN/26-27/09/001`), or first when
  the number has no prefix; supplementary invoices share the invoices'.
- **Tax settings are Owner/Admin only.**
- **Where it lives:** the maths is pure — `invoices/gst.ts` (split, spread,
  place of supply), `invoices/gst-states.ts` (state codes, GSTIN checks),
  `invoices/numbering.ts` (`seriesFor`), `invoices/order-invoice.ts` (what an
  order's invoice, a credit note and an edit's correction say). Writes go
  through `invoices/order-invoicing.ts` on the caller's transaction:
  `ensureOrderInvoice` (order row lock, then the partial unique index
  `Invoice_one_per_order`), `creditNoteForRefund` (unique on
  `paymentRefundId`, so the refund path and the refund webhook make one),
  `correctOrderInvoiceForEdit`, `creditRestOfOrder`. Never write an order's
  `Invoice` rows anywhere else.
- **Every owed or spent sum over invoices spreads `OWED_WHERE`**
  (`invoice-state.ts`): no order paper, no credit notes.
- **A registered business's `Order.tax` is informational** — the GST inside
  the total, never added to it (`gstInsideOrder`).

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
  CONFIRMED with `paidWith` DESK. No credits online (ADR-008).

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
- **Payment failed** is derived — the latest invoice unpaid past due — never
  stored. "Retry now" mints a new pay link for that invoice, replacing the
  old one; nothing is charged.

## Courses and class packs — **Current**

- **Race safety:** each write that books or spends runs Serializable **and**
  takes a row lock (the course, the pack purchase, the booking) before
  counting. The RLS proxy passes the isolation level through
  (`packages/database/src/rls-proxy.ts`); the locks hold either way. A lost race
  (`P2034`) is retried once so the answer is true now, then a plain 409.
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
- **Contact deletion** cancels the person's future course and pack-paid
  bookings and deletes their enrolments **before** the contact (a booking
  references both; one cascade trips a foreign key — `DEV_LEARNINGS.md`).

## Modules and routes — **Current**

- Subscriptions and invoices: PAYMENTS, with `@IgnoreModuleReadiness()` so a
  business with no provider still records payments by hand. Courses: its own
  COURSES module (depends on APPOINTMENTS). Packs and online classes:
  APPOINTMENTS.
- A Member reads bookings, services and contacts but no billing, course or
  pack screen (DEC-020); every billing read names its own action.
- Workspace routes: `/billing/{subscriptions,plans,invoices}` (the rail's
  Billing section is `/billing`), `/courses`, `/class-packs`. A section's pages
  share its prefix so the rail marks it on every page.
- Demo data: `db:seed:showcase` builds Pulse (subscriptions and invoices),
  Prana (courses, packs, online classes) and CarePoint (a clinic without
  Payments), and checks its own sums in SQL (`docs/architecture/LOCAL_DEV.md`).
