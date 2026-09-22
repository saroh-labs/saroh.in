# Billing and classes

> **Read when:** touching invoices, subscriptions or plans, the renewal job,
> courses, class packs, or anything that books into a course session or spends
> a pack. Architecture: ADR-007 / DEC-019. Product rules:
> `saroh-product.md` ("Money a person owes").

## Invoices — **Current**

- **States:** DRAFT → ISSUED → PAID or VOID, and a void one can be reissued.
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
  the soonest to expire is spent. Cancelling a booking returns its class.
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
