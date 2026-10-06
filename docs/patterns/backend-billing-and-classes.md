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
- **Issued paper never changes** (DEC-082): the seller's name, legal name,
  email, GSTIN, state and address are frozen on the invoice by
  `documentColumns` from `loadTaxProfile`, and a correction copies its
  original's. Anything against an original — a credit note, a supplementary
  invoice, a deposit's balance — is built from the original's row
  (`buildCorrection`, `buildCreditNote`), never `buildManualInvoice` with a
  patched profile: that recomputes the seller, place of supply and tax
  split from today's settings. Anything that draws an issued paper reads the frozen columns
  through `printedSeller`, never today's settings; only a draft prints
  today's. The logo is the one live part. A new frozen column needs its
  writer in `documentColumns`, its select in `serialize.ts` and a backfill.
- **One PDF, never stored** (DEC-083): the merchant's download, the invoice
  email's attachment and the customer's pay-link and receipt downloads all
  draw through `drawPaperPdf` / `IssuedInvoicePdf`
  (`invoices/issued-invoice-pdf.ts`), each behind its own reader's check.
  A new reader asks for `InvoicePdfModule`, not the invoices module.
- **Money** is minor units in arithmetic and `Decimal` strings on the wire
  (`backend-data-and-money.md`).
- **Who sees what:** invoice ids and numbers go only to a role with
  `invoice:read`; a subscription or pack view without it still says what is
  owed, not which invoices.
- **Invoicing needs no module; taking money online needs Payments**
  (DEC-070, amending DEC-019). `InvoicesController` has no class-level
  gate: create, issue, send, remind, void, credit, record paid and the PDF
  ask only for `invoice:*`. The pay-link route alone keeps
  `@RequireModule("PAYMENTS")` + `@IgnoreModuleReadiness()`, and
  `createPayLink` also refuses with Payments off (`assertPaymentsOn`) or no
  provider (`businessPayLinkProvider`). `invoicePayOnline`
  (`invoices/pay-online.ts`) is the one "can this be paid online" rule: it
  is `payOnline` on the send view and on the pay page's read. Send with it
  false mints the same token as a **view link** (`createPayLinkInTx(…, {
requireProvider: false })`), the email says "view it and download a copy",
  and the pay page's payment-intent and autopay answer 409 "This business
  doesn't take payment online." Automatic invoicing (renewals, packs,
  courses, subscribe) still stops with Payments off (`payments-on.ts`).

## Saroh's own invoices — **Current** (pricing catalogue U17)

Saroh billing a business for its plan is not the business's paper: it is
`SarohInvoice` (Saroh's series, Saroh as seller from env), never an
`Invoice` row, and never numbered from a business's `InvoiceSequence`. It
reuses the pure GST helpers (`invoices/gst.ts`, `gst-states.ts`,
`numbering.ts`'s financial year) and the D16 PDF renderer through its own
paper view. Written by the billing webhook with the charge, once per
charge; rules in `docs/architecture/PRICING_ROLLOUT.md` › "Saroh's own
invoices (U17)".

Trials, coupons and add-ons (U16) ride the same path: a coupon is
redeemed and its discount invoiced with the charge it comes off, never at
checkout, and an add-on is a line on the charge after the period it covers
(`SubscriptionAddonCharge`). The amount the provider charges and the
invoice's lines are worked out by one rule each, so they agree. Rules in
`PRICING_ROLLOUT.md` › "Trials, yearly, coupons and add-ons (U16)".

## Business details before money — **Current** (DEC-068, M3)

Every invoice prints the business's registered address, and a
GST-registered business's GSTIN. **Refuse before money; record and flag
after it.**

- **The rule is one file**, `invoices/business-details.ts`: missing is the
  address (first line, city, PIN, and an Indian address's state,
  `gstState`) and, when `gstRegistered`, the GSTIN (`taxId`). No profile is
  a missing address.
- **Before money, a merchant's action is refused** with
  `assertBusinessDetails`: a 409 `{ reason: "BUSINESS_DETAILS_MISSING",
missing: ["address", "gstin"] }` in merchant words, before anything is
  written or numbered. The app reads `missing` off the failure (`toFailure`,
  `mutate`) and asks for the details in place (`useBusinessDetailsStep`),
  then runs the action again.
- **After money, nothing is refused.** Paper written because money moved is
  written without the details, and Home's Needs you says so
  (`PAYMENTS_BUSINESS_DETAILS`, `home/home-business-details.ts`: missing
  details and any numbered paper, to whoever holds `org:update`).
- **Every path that writes an invoice, and which side it is on:**

    | Path                                                                 | Money                              | Behaviour                            |
    | -------------------------------------------------------------------- | ---------------------------------- | ------------------------------------ |
    | Issue a draft (`InvoicesService.issue`)                              | before                             | refused                              |
    | Send / Remind (`InvoiceSendService`)                                 | before                             | refused                              |
    | An invoice's pay link, and Retry by pay link (`payLink`)             | before                             | refused                              |
    | A member's own "Pay now" (`payLinkForCustomer`)                      | before                             | allowed: the customer can't add them |
    | An order's pay link; New order with a pay link                       | before                             | refused                              |
    | A booking's pay link (`BookingsService.payLink`)                     | before                             | refused                              |
    | Subscribe (`SubscriptionsService.subscribe`)                         | before                             | refused                              |
    | Restart past the paid period by hand (`resume`)                      | before                             | refused                              |
    | A pack sold at the desk still to be paid (`paidBy` none or NONE)     | before                             | refused                              |
    | A course enrolment with Payments on                                  | before                             | refused                              |
    | Connect a payment provider (`connectProvider`)                       | before                             | refused: online money starts here    |
    | An order paid online (webhook → `ensureOrderInvoice`)                | after                              | recorded, flagged                    |
    | A payment on a superseded charge (`invoiceSupersededPayment`)        | after                              | recorded, flagged                    |
    | Renewal, early renewal, a pause ending (the job)                     | after                              | recorded, flagged                    |
    | A member's own resume; Undo of a skip that invoices the period       | no new sale: the period was agreed | recorded, flagged                    |
    | Retry by charging the mandate                                        | the invoice is already out         | not checked                          |
    | A pack paid at the desk (CASH, UPI, CARD, BANK, ONLINE)              | after                              | recorded, flagged                    |
    | Money taken at the desk for a booking (`booking-desk-pay.ts`)        | after                              | recorded, flagged                    |
    | New order paid at the counter; an order marked paid by hand          | after                              | recorded, flagged                    |
    | Booking hold, pack or plan bought online (numbered on the webhook)   | after                              | recorded, flagged                    |
    | Credit notes and an edit's correction (`correctOrderInvoiceForEdit`) | corrections of paper already out   | never checked                        |

- **A new path that writes an invoice or opens a way to be paid picks a
  side.** Merchant-initiated and before money: call `assertBusinessDetails`
  before the transaction (or first in it). Anything a payment, a job or a
  customer triggers: never call it. The site's checkout and booking page
  are not re-gated: a business connected before DEC-068 keeps taking
  online payments, and Home asks for the details.
- **Tests:** an integration spec's business needs an address before it
  connects a provider or issues anything: `giveBusinessDetails` in
  `test/business-details.ts`. The seed gives every business one.

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
- **GST shows only when it applies (DEC-072)** — presentation, on the
  paper, the PDF, the pay page and anything else a customer reads:
    - An unregistered business charges no GST, so its paper shows none: no
      rate, no HSN/SAC column, no tax columns, no "Nil-rated".
    - A registered business's line whose `gstRate` is null is "not set"
      (D15): no rate, no "0%", no "Nil-rated". It is taxed at nothing and is
      not a 0% supply, so it never makes a paper a bill of supply.
    - Only a rate recorded as exactly 0 is labelled "Nil-rated".
    - One rule, twice: `lineGstNote` in `invoices/invoice-paper-view.ts` (the
      PDF) and in the app's `lib/invoices/paper-title.ts` (Invoice Detail's
      paper). Change both together. Stored rates are never rewritten to
      match.
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
  Road". **A site order paid at the handover holds when made too**
  (2026-10-06, `Order.payOnHandover`): "Pay when you collect" / "Pay on
  delivery" at the site's checkout makes the order unpaid and real at once
  — it holds as a staff pay-later order does (`createCheckoutOrder`), is
  never replaced or closed as an abandoned checkout (`holdsOnPayment` is
  false for it, so `closeCheckoutInTx`, the webhook's online-order path and
  `realOrderWhere` all treat it as a staff order), counts on
  `ordersPerMonth` from the start (soft at the site), tells the team at
  once, and is invoiced when staff mark it paid (DEC-023). Its kitchen runs
  before the money; only the handover (collected, delivered) waits for it
  (`moveAwaitsPayment`). Nothing releases it on a timer: staff cancel it,
  as a pay-later order. Three days on, still unpaid and not handed over,
  Home shows it under Attention and the team is told once (R34,
  `orders/uncollected.ts`; `backend-jobs.md` → Team alerts). Offered always on a plan without online payments,
  beside online where the storefront turns it on
  (`StoreSettings.offerPayOnHandover`, `checkoutReadiness`); never for a
  shipment. An online order holds only when paid: `reserveOnPayment` is
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
- **Cancel is a refund in full (round-2 B9, `orders/order-cancel.ts`).**
  An order paid online is cancelled through the one refund path
  (`PaymentsService.refundOrderForCancel`, everything left by line); its
  refund rows carry the key `order-cancel:<order>:<request>`, and the order
  is marked CANCELLED only once nothing taken online is left and the
  provider has answered for every refund (`finishCancelInTx`). Every path
  that learns of a refund calls it under the order's lock — the cancel
  itself (`recordRefundTaken`), try-again, the `payments.send-refund` job
  the cancel writes for an unanswered part, and the refund webhook — so a
  lost answer keeps the order open with the money held, and whichever
  hears last finishes it once. Its stock comes back as each refund is
  confirmed (above), never on the cancel. Unpaid or paid by hand, it is
  cancelled at once and its stock released there. A treatment's visits
  still to come are cancelled with it (`bookings/treatment-cancel.ts`).
  Refused from the handover on, and once a visit was attended.
- **Changing how an order is fulfilled (B9)** re-prices only its delivery
  charge, typed by staff, under the order's lock. On an order paid online
  more is a supplementary invoice and the difference is owed — the order's
  pay link takes it (`payLinkStanding` reads a paid order that owes more as
  DUE, except a site checkout's, whose first payment held its stock) — and
  less is a refund of the difference (`forEdit`) with a credit note, as an
  edit's. The invoice correction is a line with no product, at the
  business's delivery rate and SAC.
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
  tax, total, currency, status, billed-to name, `payOnline`, and on an owed
  view-only invoice `payInstructions`, R32) served
  server-to-server to `saroh.app/pay/<token>`; reads and payment starts are
  rate-limited per link. With `payOnline` false (DEC-070) the page shows the
  invoice with no Pay button, only "Print or save as PDF", and starting a payment or autopay
  is a 409 (`assertPaysOnline`). An older API without the field means "as
  before": show Pay.
- **The amount is the stored invoice's.** A payment request carries only a
  provider and an idempotency key; anything else is ignored.
- **`PaymentIntent` pays an Order or an Invoice** — exactly one (a CHECK in the
  migration). Webhooks find the intent by provider id or by the invoice id
  echoed back as the merchant reference. Success on an ISSUED invoice marks it
  PAID (`ONLINE`) under its row lock; success on one already PAID or VOID is
  `CAPTURED_NEEDS_REFUND`, raised on Home until the provider's refund webhook
  clears it. A refund never changes an invoice's status.

## How to pay us: offline payment details — **Current** (R32)

- **Every business, every plan,** can tell customers how to pay it offline:
  a UPI ID, bank details (name on the account, number, IFSC, bank) and a
  short note. Six nullable columns on `BusinessProfile` (`payUpiId`,
  `payBank*`, `payNote`), read and written with the rest of the business's
  settings (`org:settings:read` / `org:update`, Owner and Admin) as
  `payInstructions` on the settings PATCH. Rules, normalising and the reads
  are `organizations/business-pay-instructions.ts`: a UPI ID is
  `name@handle` (lower-cased), an IFSC `^[A-Z]{4}0[A-Z0-9]{6}$`, an account
  number 9–18 digits (CHECKs in the migration), and bank details are taken
  whole or not at all. Never logged; the audit stream names the change, never
  the value (`NAME_ONLY_FIELDS`).
- **Shown only on a customer's own record.** The public sees them only
  inside: the invoice pay link's read (owed, and `payOnline` false), the
  order pay link's read (while DUE), and a signed-in desk booking's answer
  (`account-bookings.controller.ts`). Never a standalone endpoint that hands
  a business's bank details to anyone with its slug.
  `businessPayInstructionsOf` is the one read, and re-checks every value on
  the way out.
- **The invoice email names the ways** ("see how to pay ‹business› by UPI or
  bank transfer here") on a view link, never the details: a stored message
  body never carries an account number. The invoice PDF has no payment
  section and carries none.
- **Drawn by one block:** `PayInstructionsCard` in `packages/site-blocks`
  (QR from `uqr`, the UPI deep link `upi://pay?pa=…&pn=…&am=…&cu=INR&tn=…`,
  copy buttons), used by the invoice and order pay pages, the booking
  confirmation, and the Settings › Business › How to pay us preview.

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
  an unnumbered booking invoice — and an unnumbered online pack draft
  (A11, below) — out of the invoice list and customer paper.
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
- **The business decides how a booking is paid** (DEC-088, #821, #822):
  `BookingRules.bookingPayment` is ONLINE, DESK or BOTH (default, as
  before). The page's `payOnline` is the rule allowing it AND a provider
  that can take it (`onlinePaymentBlocker`, `bookings/booking-payment.ts`);
  `bookOnline` refuses a way the rule doesn't allow before anything is
  held (`refuseDisallowedPay`; a credit and a service with no price are
  never refused). A priced service nothing allowed can pay for (a deposit,
  or online only, with nothing online) can't be booked on the page, which
  says to get in touch and draws no payment line (`unpayableText`). The
  merchant's screens read `GET booking-rules/payment` and say why
  (`lib/services/online-booking.ts`). Packs and plans ignore the rule: it
  is about bookings.
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
- **Money taken at the desk is the booking's paper, paid by hand** (round-2
  P2, DEC-023): `POST services/bookings/:id/desk-payment` (`booking:write`
  and `invoice:write`, the pay link's pair) takes cash, UPI or card. With
  no invoice it issues the booking's own (source BOOKING) and writes it
  PAID with the method; a pay link already out is that ISSUED invoice paid
  instead, its token cleared; after a deposit only the rest is taken, on a
  SUPPLEMENTARY invoice against the deposit's (source BOOKING, `bookingId`
  set). Nothing is charged, so nothing is refundable online: the booking's
  `paidAtDeskCents` and `deskMethod` read PAID booking paper whose method
  is one of `PAYMENT_METHODS` — so "Mark it paid" on the invoice counts
  too — and `dueCents` subtracts it. What "Take ₹X" may take, and why not
  (cancelled, a hold, a treatment's visit, a course's session, a pack or
  membership, a payment PROCESSING, a voided invoice, no price, paid), is
  one pure rule, `bookings/desk-take.ts`, shared by the booking read, the
  diary and the write. The write takes the cancel's lock order, refuses an
  `amountCents` that differs from what it works out, and answers a repeat
  of the last take (same method and amount, within ten minutes) as it did.
  A `PAID_AT_DESK` BookingEvent names who took it. No Undo: the invoice
  is issued paper.
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
  period's number when it differs. Since Z1 a set stamp is the only
  designed state: the subscription's own value, null included, is
  authoritative. A null stamp can only come from an API below D10 (a
  rollback with no backfill after it); it is logged at ERROR as
  `subscription_allowance_unset` and served the plan's number, never
  unlimited, and the fix is the backfill
  `backfill/classes-per-period.cli.ts` (`ROUND_2_PHASE_2_ROLLOUT.md`, D10
  and Z1). A seed writing subscriptions sets both columns.
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
  Publish. Who moved the revision is kept on the pack itself (`revisedAt`,
  `revisedById`; null for an operator, named Saroh support). Draft
  autosaves record no event.
- **A pack's kind, first pack only, paid by, extensions and history**
  (round-2 E13, defaults 45 and 46; `class-packs/pack-kind.ts`).
  `ClassPack.kind` is CLASSES (pays for classes, `capacity > 1`) or
  ONE_TO_ONE (`capacity` 1). Every read that offers or spends a pack for a
  booking — `redeemPackInTx`, New booking's `purchases?serviceId=`, and the
  customer's credit online (`booking-credit.ts`) — filters with
  `purchasesPayingFor(service)`, so what is offered is what is spent. The
  kind is locked once sold: the old `PATCH` is a 409 on `kind`; an autosave
  keeps a pending kind change and lists it in `problems`, and Publish
  refuses it. Validity is at least 7 days. A `firstPackOnly` pack is sold
  only to someone with no earlier purchase of a pack of its kind
  (`first-pack.ts`: an advisory lock per person on the sale's transaction,
  after `resolveContact`; A11's online sale calls it too). The sale holds
  the pack FOR SHARE, so a publish or kind change waits for it.
  `PackPurchase.paidBy` records how the desk was paid (CASH, UPI, CARD,
  BANK, ONLINE, NONE; null before E13) and never restricts how anyone pays
  (DEC-059). An extension adds 1–30 days to `expiresAt` under the
  purchase's FOR UPDATE lock (the redeem lock), with a reason, as a
  `PackExtension` row; a pack with nothing left can't be extended, and an
  expired one can if the new date is still to come. Every create, publish,
  change, sale, extension, archive and restore writes one `PackEvent` in
  its own transaction (`pack-events.ts`, actors as `event-actors.ts`);
  without a CREATED event the read says `earlierUnrecorded`. Pack Detail's
  reads (`GET class-packs/:id` with `overview`, `…/holders`, `…/used`,
  `…/sales`, `…/events`) need only `pack:read`, money included (DEC-039);
  only an invoice id needs `invoice:read`.
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
- **Payment failed** is derived — the latest invoice unpaid and past due,
  or whose autopay charge failed since it was issued (RENEWAL_FAILED,
  MANDATE_LIMIT_LOW) — never stored. Retry (`subscriptions.service.ts`
  `retryPayment`) asks the provider about an open charge first (a capture
  it finds pays the invoice; one still in flight is a 409), then either
  charges the mandate again under a new key (`via: MANDATE`) or mints a new
  pay link, replacing the old one (`PAY_LINK`, the default). The read's
  `retryVia` says which is on offer.
- **Renewals charge the mandate** (round-2 D13). `renewOne` issues the
  period's invoice, then `MandateChargesService.queueInTx` on the same
  transaction: with an ACTIVE mandate whose provider's charging is on
  (`payments/mandate-charge-gate.ts`, the rollout flag) and the invoice
  within `maxAmountCents`, it writes a CREATED intent under
  `inv_<invoiceId>_<attempt>` and the `subscription.charge` job; above the
  limit it writes MANDATE_LIMIT_LOW and charges nothing; otherwise
  nothing. The job (`subscription-charge.handler.ts`, steps in
  `charge-job.ts`) prepares (order + pre-debit notice), debits at
  `debitAfter` once the notice is DELIVERED or NOT_NEEDED, and looks the
  debit up if its webhook is late. Each step re-checks the subscription
  isn't CANCELLED and the mandate is still chargeable, or lets the charge
  go (CANCELLED). Outcomes are written by `payments/mandate-charge-outcome.ts`
  (CHARGED; RENEWAL_FAILED with `data.reason`; the team's "Payment failed"
  alert on a decline). When the debit happens is the merchant's choice
  (next point).
- **The merchant chooses when autopay debits** (round-2 D13B, DEC-065;
  `subscriptions/autopay-timing.ts`). `BusinessProfile.autopayChargeTiming`,
  overridden by `SubscriptionPlan.autopayChargeTiming` when set (the booked
  plan's for a renewal that switches plan): `DAY_AFTER_RENEWAL` (default,
  D13 as it shipped: invoice on the renewal date, debit 26 hours later, at
  once for a card or eMandate), `ON_RENEWAL_DATE` (the invoice and notice
  `AUTOPAY_LEAD_DAYS` = 2 days early, the debit on the renewal date; every
  method gets the early invoice) or `ON_DUE_DATE` (the debit at the start
  of the due date, the notice 2 days before; no room for a Retry). Rules
  every reader must keep:
    - The planned debit is written on the charge's CREATED intent
      (`debitAfter`) by `queueInTx`'s `schedule`, PREPARE is enqueued for 2
      days before it, and `prepareCharge`'s `notBefore` keeps a no-notice
      method from being debited sooner. **A setting changed later never moves
      a queued charge.** DAY_AFTER_RENEWAL and Retry plan nothing (null).
    - The early invoice comes from the renewal job's second pass
      (`SubscriptionRenewHandler.renewEarly` → `renewEarlyOne`): ACTIVE, not
      set to end, Payments on, a chargeable mandate, and **no invoice at all
      yet for the next period**. On the renewal date `renewOne` finds it live
      and advances without another.
    - **Anything that stops the next period being billed as invoiced drops
      the early invoice** (`subscriptions/early-renewal.ts`,
      `dropEarlyRenewalInTx`): cancel (now or at period end), pause, and a
      plan change booked or undone call it under the row lock; the charge
      job's `stillCharging` calls it too before any step. It cancels the open
      charge (never one PROCESSING), voids the invoice — or credits it in full
      for a GST-registered business (DEC-023) — and writes
      EARLY_INVOICE_CANCELLED. A new write that ends, pauses or re-terms a
      subscription must call it.
    - A VOID or CREDITED invoice is not a period's live invoice (`renewOne`,
      and the `Invoice_one_live_per_period` index), so a subscription kept
      after its early invoice was dropped is invoiced on the renewal date.
    - The customer's "Next autopay charge" (`subscriptions/next-autopay-charge.ts`)
      is a queued charge's planned debit, else the next renewal's projected
      from the renewal date, the timing and the mandate's method.
- **One charge at a time per invoice** (D13). While a mandate charge is
  under way (`payments/charge-under-way.ts`: open and either PROCESSING or
  on an ACTIVE mandate; sales only, never D12B's ₹1 check), a pay link,
  its checkout, Send and Send reminder, the account's "Pay now" and Retry
  are refused with 409 "Autopay charge in progress", and the reads say
  "Autopay charge in progress · ‹date›" (`autopayCharge`,
  `online.autopayCharge`, `autopayCharging`).
- **And the other way round: autopay stands aside for an open pay-link
  checkout** (`openCheckoutWhere`, `checkoutOpenOn`). A pay-link intent
  counts as open for `CHECKOUT_LIFE_MS` (3 days) after its last activity —
  made, or its newest PaymentAttempt — and a FAILED one only for
  `FAILED_CHECKOUT_MS` (an hour) after it failed: Razorpay's retry is in the
  same session. Pass the caller's `now`. While one is open, nothing queues,
  prepares or debits a charge and Retry offers the pay link; a charge that
  stands aside writes RENEWAL_FAILED (CHECKOUT_OPEN: Home's tag is
  "Autopay didn't charge — paying by link", never "Payment failed") and a
  resume step for
  the moment the checkout closes (`checkoutOpenUntil`), so autopay comes back without the merchant.

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
- **A pack bought online** (round-2 A11, ADR-011;
  `class-packs/{pack-checkout,public-pack-purchase.service}.ts`). Only a
  signed-in customer, at `public/site-accounts/me/packs`, only an ACTIVE
  pack (a draft or archived one is a 404), and only while Class packs is
  rolled out and on (`packs-offered.ts`, DEC-057). Starting makes a DRAFT
  invoice (source PACK, no number) priced from the pack on the server, with
  its terms snapshotted in `Invoice.packTerms`, and an intent through the
  invoice payment path on a provider whose window can open. The webhook
  (`applyInvoiceSuccess` → `completePackDraftInTx`, under the intent's and
  the invoice's locks) makes the `PackPurchase` from the snapshot — expiry
  counted from the payment — and numbers the invoice PAID (`ONLINE`), so a
  pack changed or archived meanwhile still sells on the terms shown; a
  second payment on it, or one on a discarded draft, is
  `CAPTURED_NEEDS_REFUND`. The same pack on the same terms reuses its
  draft; changed terms void the old one; at most three packs wait at once.
  The hold sweep voids drafts unpaid after 24 hours
  (`discardStalePackDrafts`), so no abandoned attempt ever takes a number.
- **Contact deletion** cancels the person's future course and pack-paid
  bookings and deletes their enrolments **before** the contact (a booking
  references both; one cascade trips a foreign key — `DEV_LEARNINGS.md`).

## Modules and routes — **Current**

- Subscriptions: PAYMENTS, with `@IgnoreModuleReadiness()` so a business
  with no provider still records payments by hand. Invoices: no module
  (DEC-070), `invoice:*` alone; only `POST :invoiceId/pay-link` keeps a
  method-level `@RequireModule("PAYMENTS")` + `@IgnoreModuleReadiness()`,
  pinned in `capabilities/module-annotations.spec.ts`. The rail shows
  Invoices under Payments while it's on, and as its own row while it's off
  (`nav-items.tsx`, `unlessModule`). Courses: its own
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
