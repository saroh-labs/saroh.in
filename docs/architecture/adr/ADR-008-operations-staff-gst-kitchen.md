# ADR-008 — An invoice for every order, GST, staff and the kitchen flow

**Status:** Accepted — 2026-09-23 (DEC-023, DEC-024)
**Part of:** [#506](https://github.com/saroh-labs/saroh.in/issues/506) — billing, bookings, orders and customers to the design
**Amends:** [ADR-007](./ADR-007-subscriptions-invoices-classes.md) (store orders are now invoiced; issued invoices are credited, not voided, by a GST-registered business) · DEC-020 (Members move kitchen stages)
**Builds on:** [ADR-001](./ADR-001-organization-tenant-root.md) (Organization is the tenant root) · [ADR-003](./ADR-003-organization-modules.md) (modules) · DEC-010 (merchant payments on the business's own providers)

---

## 1. Context

ADR-007 gave Saroh subscriptions, invoices and classes as working lists and
forms. The finished designs for Invoices, Order Detail, Bookings, Customer
Detail and the public booking page ask for things the product does not model:

- **An invoice for every sale.** A bakery's customer asks for a bill for their
  order, not only for a membership. ADR-007 said store orders keep their own
  receipt.
- **GST.** A registered business must issue tax invoices with GSTIN, HSN/SAC
  and a CGST/SGST or IGST split. ADR-007 left that out on purpose.
- **Staff.** A gym's diary is by person: who takes which service, when they
  work, when they are off. Today availability is weekly per service.
- **A kitchen.** An order is New, then Preparing, then Ready, then Collected.
  Today it has a status and nothing about what the counter is doing.
- **One page per customer**, across orders, bookings, subscriptions and
  invoices, without pretending two records are one person.

Decided with the user on 2026-09-23, in planning
[docs/plans/2026-09-23-003-feat-billing-bookings-orders-screens-plan.md](../../plans/2026-09-23-003-feat-billing-bookings-orders-screens-plan.md).

## 2. Decisions

### An invoice for every order and every paid online booking

**Context.** The design shows an invoice for each order, and the invoice list
as the one place a business finds its paper. ADR-007 kept orders out.

**Decision.**

- Every order makes **one** invoice (`Invoice.orderId`, idempotent per order).
  It is created inside the webhook's payment reconciliation, and by the order
  service for pay-later and hand-recorded payments. Bill-to is copied from the
  order's customer and address.
- **The order is the ledger.** Its invoice has no pay link of its own — paying
  it pays the order. It mirrors the order: paid when the order is paid, and a
  refund reconciliation makes a credit note for the refunded lines.
- A paid online booking is invoiced the same way (`Invoice.bookingId`).
  Subscriptions, courses, packs and hand-written invoices are unchanged.
- **Each rupee is counted once.** Takings and a customer's "spent" sum orders
  plus invoices that are not order invoices. "Owed" sums unpaid invoices,
  leaving order invoices out — an unpaid order is owed on the order.
- **A pay-later order is invoiced when its payment is recorded**, not when it
  is placed (settled in U5): the invoice is written PAID, so its number and
  date are those of the payment, and an order never paid never takes a
  number. An order edited after it was invoiced gets a supplementary invoice
  or a credit note for what changed.

**Consequences.** The invoice list holds every sale. Owed, takings and spent
each need the order-invoice exclusion; a sum that forgets it counts twice.
Existing orders get no invoices retroactively.

**What it is not.** Not a second way to pay an order. Not a second record of
its payments.

### An issued invoice never changes

**Context.** ADR-007 corrected a mistake by voiding and reissuing. For a
GST-registered business a void leaves a hole in the series, and the law's
correction is a credit or debit note against the original.

**Decision.**

- An issued invoice and its lines are never edited or deleted.
- Down is a **credit note**, up is a **supplementary invoice**
  (`Invoice.kind`: invoice, credit note, supplementary), each pointing at the
  original (`relatedInvoiceId`).
- A **GST-registered** business cannot void an issued invoice. A draft is
  discarded; an issued one is credited. Void stays for an unregistered
  business's receipts.
- Overdue stays derived from the due date, never stored.

**Consequences.** Cancelling an issued invoice in the workspace issues a
credit note. Editing an order before preparing charges or refunds the
difference on the order, with a supplementary invoice or credit note — never
an edit to the first one. Refunding a paid order's invoice routes to the
order's refund.

**What it is not.** Not a way to renumber. A number once given out always
means the same paper.

### GST

**Context.** Rye & Co., a bakery in Karnataka, sells nil-rated bread, pastry at
18% and coffee at 5%, and bills a café in Goa. Its paper must follow CGST
Rules, rule 46.

**Decision.**

- **Registration is a business setting.** `BusinessProfile` gains
  `gstRegistered` and `gstState`; the GSTIN is its existing `taxId`. Products
  and services carry a GST rate and an HSN or SAC code.
- **Prices include GST.** Tax is derived per line from the inclusive amount,
  rounded to the paisa per line, and frozen on the line. Totals sum the frozen
  lines.
- An order's **discount is spread across its lines** in proportion, before tax.
  **Delivery is a taxed line** (the business's delivery rate and SAC). The
  invoice total equals the order total.
- **Place of supply:** the bill-to state if set, else the delivery state, else
  the business's state. Same state as the business → CGST + SGST halves;
  another state → IGST.
- A registered business issues a **tax invoice** (with the buyer's GSTIN, state
  and address when the buyer is registered). An unregistered one issues a
  **receipt** with no GST columns.
- **Numbering.** `InvoiceSequence` is keyed by business and series. A
  registered business numbers by prefix and financial year (April–March); an
  unregistered one by a plain prefix (`PF-0001`). Credit notes have their own
  series. The full number stays within 16 characters. Existing invoices keep
  their numbers.
- A registered business's orders **ignore the storefront's old add-on tax**
  setting; GST is already in the price.
- **Settled in U5.** Series: `RC/26-27/0001` registered, `RC-0001` not; credit
  notes `RCCN/26-27/0001` / `RCCN-0001`; no prefix keeps the legacy `INV`
  series. A prefix is one to three characters, so the longest number
  (`ABCCN/26-27/9999`) is 16. The financial year is read in the business's
  timezone (else Asia/Kolkata). An issued invoice credited in full reads
  **CREDITED**. The GST maths is `invoices/gst.ts`; an order's paper is
  written by `invoices/order-invoicing.ts`.

**Consequences.** Tax settings are Owner/Admin only. The tax maths lives in one
pure module, built test-first from worked examples.

**What it is not.** Not GST returns or filing exports, not e-invoicing
(IRN/QR), not TCS.

### Staff and their hours

**Context.** The diary is by person. A trainer at the front desk may take
bookings without ever logging in.

**Decision.**

- A **`StaffMember`** belongs to the organization and optionally to a
  membership (a team member). It records the services the person takes, weekly
  hours, time off and one-off extra hours. **Booking rules** (book ahead,
  latest booking, free cancellation) are per business.
- **One-to-one slots** come from the person's windows intersected with the
  service's own rules. A service with no staff keeps today's weekly rules, so
  existing businesses do not change.
- **Classes** keep their own rules. The instructor is for display and clash
  checks only.
- Each booking records **how it was paid** — membership, pack, paid or desk —
  and, for a membership, which subscription.
- **A late cancel keeps the credit.** Cancelling a class place after the
  free-cancellation window records a late cancel and the pack credit stays
  used; before it, the credit comes back.
- Existing bookings get **no staff backfill**. They show as Unassigned.

**Consequences.** Staff and booking-rule writes need `service:write`. Public
reads show a staff display name and an opaque id, never time off or its reason.

**What it is not.** Not rooms or resources. Not one-to-one services paid with
credits — packs cover classes only.

### The kitchen stage sits under the order status

**Context.** The counter needs New → Preparing → Ready → Collected, or Handed
to courier → Delivered. The order status already drives payments, stock and
reports.

**Decision.**

- **Status values stay** (PENDING, PROCESSING, SHIPPED, DELIVERED, CANCELLED).
  A **stage** field sits under them, and each stage move maps to a status move.
- Every move writes an **`OrderEvent`** — who, when, from, to, note. The
  timeline is these events.
- **The transition table widens once:** PROCESSING → DELIVERED, for a collected
  order. A move backwards happens only as an **Undo of the last step**, by its
  event, within a server-side time limit (ten minutes, settled in U6:
  `UNDO_WINDOW_MS` in `orders/order-stage.ts`); it reverses that step's stock
  rows.
- **Refunds become partial.** A line refund is capped at what is paid and not
  yet refunded on that line, taken under the order's row lock and idempotent,
  so a retry returns the same refund. "Partly refunded" is derived from refund
  sums; the order does not jump to REFUNDED.
- **No message is sent.** Ready does not text anyone; the step is recorded on
  the order, and no copy says otherwise.

**Consequences.** An unpaid order cannot start preparing. Items and address can
be edited only at New. Members move stages (DEC-024); refunds and edits stay
Owner/Admin.

**What it is not.** Not a courier integration — a tracking link is typed.

### One read of a customer, rooted on the contact

**Context.** Every business has contacts; a gym has no store customers. A
store customer and a contact with the same email may still be two people.

**Decision.**

- Customer Detail starts at the **contact**. Orders come from store customers
  joined by a **confirmed identity link** only.
- A store customer with the **exact same email** is offered as "possible match
  — link?". It contributes nothing until linked, and records are never merged.
- Each source is read on its own; a failed one is named, the rest render.
- Notes carry **structured allergens** (ids from the store's allergen list), not
  free text, so Order Detail's allergy banner matches exactly.

**Consequences.** `/commerce/customers/<id>` redirects to its linked contact
where there is one. The page says where each block came from.

**What it is not.** Not customer unification. Saroh does not claim two records
are one person until the merchant links them.

### The public booking page

**Context.** The design lets a customer spend a pack credit or buy a pack
online. Saroh sends no email or SMS, so it cannot check who is asking.

**Decision.**

- **No credits online.** Credits are used at the desk or by the merchant in the
  calendar.
- **Pay now** creates a pending booking that holds its place for 15 minutes and
  an invoice for it (source booking), paid through the existing invoice
  payment path. The price comes from the server. The provider webhook confirms
  the booking; an expired hold releases the place.
- **Pay at the desk** books with nothing charged.

**Consequences.** One booking service serves the page and the one-service
booking block. A client-sent amount is ignored.

**What it is not.** Not customer recognition, not buying packs online, not a
waitlist.

## 3. What this is not

- Not card-on-file, auto-debit or proration on a plan change.
- Not sending email or SMS. Copy never promises a message that is not sent.
- Not retroactive: existing orders get no invoices, existing bookings no staff.

## 4. Build order

The plan above sequences it: these decisions first (U1), then staff (U3), the
kitchen flow (U6), then GST and order invoices (U5), then the screens.
