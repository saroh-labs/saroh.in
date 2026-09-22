# ADR-007 — Subscriptions, invoices, online classes, courses and class packs

**Status:** Proposed — 2026-09-22
**Builds on:** [ADR-001](./ADR-001-organization-tenant-root.md) (Organization is the tenant root) · [ADR-003](./ADR-003-organization-modules.md) (modules) · [ADR-006](./ADR-006-one-storefront-one-website.md) (one storefront, one website) · DEC-010 (merchant payments run on the business's own providers)

---

## 1. Context

Saroh sells products (Sell) and books time (Schedule). The businesses it is
most useful to — gyms, yoga studios, clinics, coaching — also sell things that
are neither:

- **A membership** that renews every month or quarter.
- **A course**: a fixed series of sessions, bought once.
- **A class pack**: ten classes, used on any class, counted down.
- **An online class**: the same booking, with a link instead of an address.
- **An invoice** for each of these — the paper the customer asks for.

None of this exists. A gym can list its classes and take bookings, but cannot
say who is a member, what they owe or when it renews. Today that lives in a
spreadsheet beside Saroh, which is the problem Saroh exists to remove.

Decided with the user on 2026-09-22: renewals are invoiced each period (no
card-on-file), invoices are simple (no GST split yet), and all three class
shapes — online link, courses, class packs — are in.

## 2. Decisions

### Who they belong to

**The Organization owns them, and the person is a Contact.** A gym or a clinic
usually has no storefront, and these are not products in a catalogue: a
membership is a relationship with a person, not a line in a cart. Hanging them
off the store (`Customer`, `Order`) would force every service business to
open a shop to sell a membership. Contact is already the business-wide record
of a person (CRM), and a booking already links to one.

### Names

Saroh's own billing already owns `Plan` and `Subscription` (DEC-014: what a
business pays Saroh). To keep the two apart in code and in conversation:

| Merchant-facing                   | Model                                         | UI word      |
| --------------------------------- | --------------------------------------------- | ------------ |
| What the business sells on repeat | `SubscriptionPlan`                            | Plan         |
| A person on a plan                | `CustomerSubscription`                        | Subscription |
| A bill                            | `Invoice`, `InvoiceLine`                      | Invoice      |
| A fixed series of sessions        | `Course`, `CourseSession`, `CourseEnrollment` | Course       |
| Prepaid classes                   | `ClassPack`, `PackPurchase`, `PackRedemption` | Class pack   |

### Subscriptions — invoiced each period

- A plan has a price, a currency and an interval (week, month, quarter, year).
- A subscription has a start, a current period and a status: `ACTIVE`,
  `PAUSED` or `CANCELLED`. "Overdue" is **derived** — any of its issued
  invoices past its due date — never stored, so it cannot drift from the
  invoices.
- **Billing is forward only.** A member moved over with a start date in the past
  keeps that renewal day, but only the period containing today is invoiced.
  Resuming a pause extends the already-invoiced period by the days paused; a
  new invoice only when the pause outlasted it.
- On each renewal date a background job (`subscription.renew`, backend-jobs
  pattern, idempotent per subscription and period) issues the next period's
  invoice and moves the period on. Cancelling stops the next renewal; the
  current period runs out. Pausing skips renewals until resumed.
- No card-on-file, no auto-debit. Mandates (UPI AutoPay, e-NACH) are a later
  decision with provider approval behind it.
- **With Payments off, subscribing someone is refused** (a 409 that says to
  turn Payments on), and so is resuming a pause past its paid period. A
  subscription is only its invoices, so one without them would be a list that
  says "Active" while nothing is billed. Renewals for that business wait until
  Payments is back on; a subscription set to end still ends. (Decided
  2026-09-22, from the ADR-007 code review.)
- A subscription set to end at its period end ends then even if it was paused
  meanwhile; resuming it after that date does not bill it again.
- A person is on a plan **once at a time**: a second live subscription to the
  same plan is refused (a partial unique index backs it, so two subscribes at
  once cannot both land). Change or resume the one they have instead.
- The subscriptions list points each row at the **oldest unpaid invoice while
  any is overdue** — the one to chase first — and at the latest otherwise.
  (Decided 2026-09-22.)
- Deleting a contact takes their subscriptions and packs with it, and cancels
  their future bookings paid with those packs, in one transaction; the
  workspace says what went. Invoices stay under their bill-to snapshot.

### Invoices — simple

- Numbered per business, `INV-0001` upward, from a counter row incremented in
  the same transaction as the invoice, so two invoices never share a number.
- Lines (description, quantity, unit price), subtotal, one tax line (an
  amount, not a GST split), total. `Decimal(12,2)` money, computed by the API in
  integer minor units, never by the client (backend-data-and-money).
- Status `DRAFT` → `ISSUED` → `PAID`, or `VOID`. An issued invoice's lines never
  change; a mistake is voided and reissued, so a number once given out always
  means the same thing.
- Paid by hand first (cash, UPI, bank transfer, card at the counter —
  recorded, nothing charged). Paying through the business's own provider (a pay
  link) extends `PaymentIntent`, which today requires an order, to take an
  invoice instead — a payments change reviewed on its own, as a later step.
- Printable. No PDF service; the browser prints it.
- What it is for: a subscription period, a course enrollment, a class pack
  purchase, or entered by hand. Store orders keep their own receipt and are
  not invoiced in this ADR.

### Online classes

`Service` gets `locationType` (`IN_PERSON` | `ONLINE`) and an optional
`meetingUrl`. An online service shows its link on the booking, to the
business and to the person who booked (the confirmation screen; there is no
booking email yet — `booking.notify` has no handler, and nothing here claims
one).

The link is a **shared credential**: public bookings take no payment, so anyone
who books a slot gets the service's standing link. The service form says so and
suggests a passcode, a waiting room or per-session links for paid classes.

### Courses

A course is a named series of dated sessions on one service, with a seat
count and a price. Enrolling a person takes a seat, books every session for
them (one `Booking` per session, so the schedule, capacity and attendance work
as they do for any booking), and issues an invoice. A course's sessions are
the business's own dates, so they are not checked against the service's weekly
hours — but they do count against its capacity.

### Class packs

A pack is N credits for a price, valid for D days, usable on the services it
names. Buying one records a purchase and, when Payments is on, issues an
invoice; with Payments off a pack or a course enrolment is recorded with the
price paid and no invoice. Booking with a
pack records a redemption against it; cancelling that booking returns the
credit. The balance is **derived** from purchases minus live redemptions.

### Where they live in the workspace

- **Schedule** gains Courses and Class packs, and Services gains the online
  fields — they are all about booked time, so they sit under the Appointments
  module.
- **Subscriptions** and **Invoices** are money a business is owed, under the
  Payments module, in the rail's **Billing** section. Its pages live under
  `/billing` — `/billing/subscriptions`, `/billing/plans`, `/billing/invoices`
  — as Sell's live under `/commerce`, so the rail marks Billing on every one.
  The first paths (`/subscriptions`, `/invoices`) redirect. (2026-09-22.)
- A person's contact page shows their subscriptions, packs, courses and
  invoices together — the one place a merchant looks when that person calls.

## 3. What this is not

- Not GST tax invoices (no GSTIN, HSN/SAC or CGST/SGST/IGST split). Revisit
  when a business needs to file with them.
- Not automatic charging.
- Not a replacement for store orders and receipts.
- Not hotel stays: bookings stay timed slots within a day.

## 4. Build order

The implementation plan sequences the work, one PR per unit against
`development`:
[docs/plans/2026-09-22-001-feat-subscriptions-invoices-classes-plan.md](../../plans/2026-09-22-001-feat-subscriptions-invoices-classes-plan.md).
In short: the data model and permissions first, then invoices and
subscriptions (API and screens), then online classes, class packs and courses,
then the contact page and navigation, then the invoice pay link, and last the
showcase seed.
