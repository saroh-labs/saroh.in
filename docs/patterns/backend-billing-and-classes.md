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
  ISSUED and PAID are worked out from the invoice's payment ledger (below),
  never set by hand: a removed payment or a bounced cheque takes a PAID
  invoice back to ISSUED. "Partly paid" is derived like Overdue (ISSUED
  with `paidCents > 0`, `isPartlyPaid`), never a status.
- **Cancel or correct** (DEC-173, U13 #1125): one sheet in the app
  (`components/invoices/cancel-or-correct-sheet.tsx`) for every way an
  unpaid issued invoice is taken back. A registered business credits all
  of it (`POST :id/credit`) or credits it and writes a correct one
  (`POST :id/credit-and-rewrite`: the credit note and a draft with the same
  lines in **one transaction**, so a failure leaves neither; a PAID invoice
  is refused, it is refunded instead). One not registered voids it, or
  voids and writes again (`reissue`). The credit note is previewed before
  it is made (`GET :id/credit-preview`, `peekInvoiceNumber`: the number it
  would most likely take, nothing taken), refused as the credit itself
  would be. A void invoice nobody wrote again gets **Write again**
  (`POST :id/write-again`): the same draft, once, under the row lock, and
  never beside a live invoice for the same subscription period. Every
  draft made this way points back with `reissuedFromId`. A partly paid
  invoice is refused everywhere until its payments are removed; Refund…
  on a paid one is unchanged (`RefundInvoiceDialog`).
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

## Payments on an invoice are a ledger — **Current** (DEC-173, #1113, #1114, #1115)

- **One row per payment** (`InvoicePayment`, integer paise): cash, UPI, a
  bank transfer, a card, other, a cheque, or ONLINE (the webhook's alone).
  An order's invoice has none: the order is its ledger (ADR-008).
- **One write path:** `modules/invoices/invoice-ledger.ts`. Lock the
  invoice with `lockInvoiceForLedger` (FOR NO KEY UPDATE: no key column
  changes), then write with `recordLedgerPaymentInTx`, or change a row and
  call `settleFromLedger`. Settling, in the same transaction, sets
  `paidCents` to the live sum (not removed, not bounced; a waiting cheque
  counts), the status to PAID when it reaches the total and ISSUED
  otherwise, and the legacy `paidAt` / `paymentMethod` /
  `paymentReference` / `paymentNote` from the last live payment while
  PAID (null while owed, so their readers keep meaning "paid, and how").
  Nothing else writes `paidCents` or sets a non-order invoice PAID.
- **Refused by the ledger, whoever calls it:** an order's invoice or a
  credit note (409), an invoice not ISSUED (409; PAID takes nothing more),
  an amount of 0 (400), more than is left (422 with `details.leftToPay`;
  no advances yet), one payment over the `Int` range (400).
- **The hand routes** (`InvoicePaymentsService`, `invoice:write` on each,
  DEC-098): `POST :invoiceId/payments` (`amount` defaults to what is left;
  answers `recorded.paymentId` for Undo), `DELETE
:invoiceId/payments/:paymentId` (soft: `removedAt`, who, a reason,
  "Recorded by mistake" by default; an ONLINE payment is refunded, never
  removed), `POST …/cleared` (a WAITING cheque) and `POST …/bounced` (a
  WAITING cheque, or one already CLEARED: banks return cheques days later,
  and it keeps its `clearedAt` so the history and the pay page say it was
  returned after it was banked; a bounce reopens what it paid, with no
  charge). Neither moves money on a CREDITED or VOID invoice. **Retries are
  keyed, never matched on fields** (review #6, 20 Oct): Record payment
  sends an `idempotencyKey`, one per opening of the sheet, stored on the
  row under a unique `(invoiceId, idempotencyKey)`; a retry with it answers
  with the first payment (`recorded.replayed`), and the app says "Already
  recorded" with no Undo. Two real payments of the same amount carry two
  keys and both count; a record with no key is always a payment of its
  own. Record payment is refused while an autopay charge is under way on
  the invoice (`chargeUnderWayOn`, 409 "Autopay charge in progress"), as
  Pay, Remind and the desk are. A bounced cheque is never removable
  (`canRemove` false); it already doesn't count.
- **A receipt is never for a cheque not in the bank** (review #9): Email
  receipt and the WhatsApp RECEIPT text thank the last live payment that
  isn't a WAITING cheque, and answer 409 "This cheque isn't in the bank
  yet." when that is all there is. The `invoice.receipt` handler also
  sends nothing for a waiting cheque or on an invoice no longer ISSUED or
  PAID. "Cheques not in the bank" (`WAITING_CHEQUE_WHERE`) leaves out a
  credited or void invoice's cheque.
- **Every write is an event** on the invoice's history: an audit row in
  the same transaction (`invoice.payment.recorded`, `.removed`,
  `.cheque_cleared`, `.cheque_bounced`; `invoice-payment-events.ts`),
  ids, amounts and the method only. The automatic receipt (owner, 20 Oct)
  hangs from `paymentRecordedInTx` (below, U5 #1117).
- **Every other path that pays an invoice writes the ledger** (U3, #1115),
  in its own transaction: the webhook, a mandate charge found by a look-up
  (`settleCapturedChargeInTx`) and a pay-now hold, a pack or a plan bought
  online (numbered, issued, then `payIssuedDraftOnlineInTx`) all go through
  `recordOnlinePaymentInTx`; the desk (`booking-desk-pay.ts`) issues its
  paper and records its one payment with `recordLedgerPaymentInTx`. An
  order's paper is stamped paid by `stampOrderPaperPaidInTx` or
  `order-invoicing.ts`, with no row. `invoice-ledger.guard.spec.ts` reads the
  sources and fails a write anywhere else that sets an invoice PAID or
  writes `paidCents`.
- **Owed is what is left to pay** everywhere money is owed:
  `leftToPayCents` (`invoice-state.ts`) is the one place it is worked out,
  and every owed figure folds its bills through it (Home's week and how
  late, the overdue and failed-renewal rows, awaiting payment, a customer's
  Owed, `GET /owed`, a subscription's unpaid total, the calendar's due
  amounts, the reminder email and thread message). Takings and spent are
  unchanged: they count paid invoices.
- **A partly paid invoice isn't voided or credited** until its payments
  are removed (409); the void is fenced on `paidCents = 0` and the credit
  checks again under the ledger lock. **A credit checks what the merchant
  saw** (review #2): Cancel and Refund send `expectStatus` and
  `expectPaidSoFar` from the screen (the API's own read before stands in
  when they don't), and `creditInTx` compares them with the invoice under
  `lockInvoiceForLedger`: paid meanwhile is 409 "This invoice was just
  paid. Reload it.", any other payment change 409 "A payment on this
  invoice just changed. Reload it." Nothing is credited and no draft is
  written. **Nor while a cheque waits** (review #5): 409 "Wait for the
  cheque to clear or bounce.", from the preview too.
- **The read** serves `paidSoFar`, `leftToPay`, `partlyPaid` and
  `chequeWaiting` on every invoice, and `payments[]` (each with
  `bankStatus`, `removed` and `canRemove`) on the detail. A PAID invoice
  reads its total as paid, so an order's invoice reads right with no rows.
- **Tests:** `invoice-ledger.spec.ts` (the settle rules) and
  `invoice-payments.db.spec.ts` (every refusal, repeats, two payments
  racing on the row lock, one business never reaching another's), plain
  and under `TEST_RLS=on`. The whole journey (written on the paper in
  Band, issued and shared on WhatsApp, ₹1,000 in cash taking ₹1,000 off
  Owed, the rest by cheque, the cheques line, in the bank, the receipt
  shared) is one browser spec on Northwind's own data,
  `e2e/tests/invoices-journey.spec.ts`, `@serial` because the strip and
  the cheques line are business-wide (U17 #1129).
- **Demo data shows every state** (U17 #1129). The showcase plans what
  happened to an invoice after it went out in
  `packages/database/src/seed/showcase/invoice-states.ts`: its ledger
  rows, its share log and its `INVOICE_SENT` / `INVOICE_REMINDER` emails,
  and the look it went out in. The invoice's status and paid columns are
  worked out from the planned rows by `settleLedger`, the API's `settle`
  rules, never typed by hand, and an overpayment stops the seed. Rye &
  Co. (`bakery.ts`, GST) has a part payment, two cheques waiting (₹8,400
  and ₹5,600), one in the bank, one bounced and owed again, overdue a
  week, a month and longer, WhatsApp shares, reminders both ways, a
  credit note with the invoice written again, and Classic, Band and
  Compact paper with Band in its colour as the default. Pulse (`pulse.ts`,
  not registered) has part payments on two renewals, a void invoice
  written again, and Compact in its colour. A paid invoice planned without
  rows gets its one payment from the ledger backfill, as a live database
  did. The seed's own check (`check.ts`) fails on: `paidCents` not its
  live sum, a PAID invoice with no payment, a status that doesn't follow
  the payments, a paid date that isn't the last payment's, cheque fields
  that don't fit the method and bank status, a payment on paper that
  doesn't take one or out of time, a share or email before issue, a
  rewrite from an invoice that wasn't cancelled, and a style or colour the
  API wouldn't store; `checkRye` and `checkPulse` fail when a state is
  missing. The emails are `Message` rows, which an invoice's delete leaves
  (`SetNull`): a seed clears them on its own seeded ids.
- **The list's search, views and money strip** (U4, #1116). `GET /`
  takes `q` (trimmed, at most 80 characters): a name (bill-to, or the
  contact's first and last name, so a draft is found too), part of a
  number, or an amount (`money-query.ts`: "₹8,400", "8400", "8,400.00";
  "8,40" is not one) matching the total or what is left to pay. What is
  left is found by folding the partly paid invoices through
  `leftToPayCents`, never worked out again in SQL. Searched on the server,
  so the 500 cap never hides an older invoice. New views: `owed`
  (`OWED_VIEW_WHERE`: issued, overdue included, not an order's paper or a
  credit note) and `cheques` (`WAITING_CHEQUE_WHERE`); `paidFrom`
  (`YYYY-MM-DD` in the business's zone) and Home's `paidSince` (an
  instant) are the invoices money came in on since then, by the one
  money-in rule (`invoices/money-in.ts` `moneyInSinceWhere`; below). New
  parts are ANDed on, so no part's `OR` overwrites another's.
- **Money in is one rule** (DEC-173, `invoices/money-in.ts`). The Invoices
  strip's Paid this month, Home's Money in today, This week, How it's
  going and the last 24 hours, and Insights' takings (money in, the bars,
  today, this week so far, where it came from, the first sale) all read
  it, and nothing else works out when money came in:
    - paper that isn't an order's counts its **ledger**: each payment that
      counts (`LIVE_PAYMENT_WHERE`: not removed, not a bounced cheque; a
      waiting cheque counts) on its `receivedAt`, never the invoice's
      total on its `paidAt`. A part payment counts the day it came in; a
      bounced or removed one stops counting where it fell; a back-dated
      one counts on the day it was received;
    - an order's paper counts its total on its `paidAt` (the order is its
      ledger, ADR-008); Insights reads the order itself, as Spent does;
    - never a credit note, nor a hold's, an online pack's or a plan's
      unnumbered draft (`NOT_A_BOOKING_HOLD`);
    - Prisma reads `readMoneyIn` (`moneyInPaymentWhere`,
      `orderPaperPaidWhere`); SQL reads `moneyInPaymentSql()`;
    - money handed back stays each surface's own: the strip is money
      received; Home takes a refund's credit note off on the day it was
      issued; Insights takes an invoice's credit notes off its latest
      payments first, so a payment never reads below zero;
    - `money-in.db.spec.ts` pins the strip, Home and Insights to one
      figure for a part-paid invoice, a bounced cheque on a paid invoice
      and a back-dated payment. A new surface that says how much came in
      reads `money-in.ts` and joins that spec. A spec that writes a PAID
      invoice straight to the database gives it its ledger row
      (`test/ledger-paid.ts` `onTheLedger`), as the app and the backfill
      always do;
    - a customer's **Spent** (the Customers list, Customer Detail, and
      Insights' best customers and "came back") is the same rule per
      contact: `spent.sql.ts` `spentLedgerRowsSql` reads
      `moneyInPaymentSql()`, net of credit notes latest payment first, as
      takings does; an order counts its total net of refunds. Who counts as
      a customer is "has a payment that counts", never `status = 'PAID'`.
      `customer-spent.money-in.db.spec.ts` pins the list, Detail and
      Insights to `readMoneyIn`.
- **"So far" compares with the same time of day** (DEC-171). Money in
  today, How it's going's sales and orders, and Insights' money in, this
  week so far and today all end the earlier window at the same moment
  as now on the day it stands for (`lastSoFar`, `goingWindows`
  `beforeSoFar`, `periodWindows` `beforeSoFar`; Insights swaps that day's
  rows for its so-far read with `withDaySoFar`), never part of today
  against a whole day. Bookings, counted by when they start, and the
  bars, a picture of whole days, stay whole.
- **One zone reader.** A business's zone is `businessTimezone`
  (`bookings/staff-availability.ts`: its setting, else its first active
  service's, else `FALLBACK_TIMEZONE`) on every money surface: the strip,
  the list's `paidFrom`, Home and Insights. No other reader or fallback
  constant is written.
- **`GET invoices/summary`** (`InvoiceSummaryService`, `invoice:read`):
  Owed and Overdue (left to pay, `isPastDue`), Paid this month (money in
  from the 1st in the business's zone, by the one rule above), Drafts, and
  `chequesWaiting` (null while none waits). Each figure is `{ count, totals?, filter }`,
  totals per currency in minor units (`amountMinor`, as Home's), and
  `filter` is the list query it stands for. Without `payment:read` there
  are no `totals` (DEC-098). Home's `week.chequesWaiting`
  (`home/home-cheques.ts`, `{ count, totals, href }`, href
  `/billing/invoices?view=cheques`) reads the same `readChequesWaiting`,
  and is null without `payment:read` and `invoice:read` (the line opens the
  invoices) or while none waits. `HomeService` reads it in a guarded read
  of its own beside the week, never inside `readWeek`: a failure is named
  "Cheques" in `unavailable` (the phone says "Couldn't check cheques just
  now") and the week's other figures still come (Home U18, invoices U8
  #1120).
- **Overdue bills have one definition** (`invoices/overdue-bills.ts`,
  `overdueBillsWhere`): issued, past due, not an order's or a credit note,
  not a live subscription's latest period invoice, not a cancelled
  booking's paid link. Home's bills group (`home-money-sources.ts`) and
  Remind all both read it, so "10 overdue" and the people Remind all
  lists never disagree. Never write a second where for "overdue bills".
- **Remind all** (DEC-171, Home plan U8 #1085) is Remind many with
  `quietDays: 3`, never a route of its own. Home's bills group carries
  `remind: { invoiceIds, quietDays }` (the 100 oldest overdue,
  `overdueBillIds`) only for `invoice:write`; the sheet posts them to
  `POST invoices/reminders/preview` and, after the ten-second hold with
  Undo on Home's one hold (`useInlineActions().remindAll`), the EMAIL ones
  to `POST invoices/reminders` with the same `quietDays`, which reads every
  bill again. "Heard from" is `lastHeardFrom`: an email that went, an
  account-thread post or a WhatsApp NEW or REMINDER share, the three
  things one reminder a day counts. On a phone it is the bills sheet's
  foot, beside See bills, with the hold's Undo in the sheet.
- **Search speed:** a business's invoices are filtered after the
  `organizationId` index; 5,000 invoices (among 55,000) search in about
  4 ms, so there is no trigram index. `list-filter.db.spec.ts` times 1,500.

## Sharing an invoice, reminding many, and the receipt — **Current** (DEC-173, U5 #1117)

- **WhatsApp is a link, never a sender.** `POST :invoiceId/share`
  (`InvoiceShareService`, `invoice:write`) with `channel` WHATSAPP, LINK,
  PDF or PRINT and an optional `kind` (NEW, REMINDER, RECEIPT; by default
  a receipt once paid, a reminder once overdue, else new). WHATSAPP and
  LINK mint a fresh link as a send does (a pay link while the invoice is
  owed and payable online, else a view link; the old link stops, DEC-110)
  and answer `{ url, text, phone, whatsappUrl }`; PDF and PRINT mint
  nothing. The words are `invoice-share-words.ts`, in the business's voice,
  asking for what is left on a partly paid invoice. The app opens
  `whatsappChatLink(phone, text)` (`@saroh/block-contract`); the API
  answers the same link so the bulk flow needs no second rule. Saroh can't
  know a WhatsApp message went: words say "shared on WhatsApp".
- **The share sheet** (U11 #1123, `components/invoices/share-sheet.tsx`,
  rules in `lib/invoices/share.ts`) is the one place an invoice is shared
  by hand: the details open it through `useShareFlow`, and Record
  payment's "Share receipt on WhatsApp" opens it on the receipt. Tabs
  WhatsApp, Email, Link, PDF. The preview is drawn from the invoice before
  anything is minted (`previewMessage`, the API's words with the link as
  a chip); the API's text replaces it once shared. A link minted in the
  sheet is reused by every tab while it is open (Copy message then Open
  WhatsApp is one share, one link). The number comes from `send.phone`
  (the contact's, on the detail read); with none, it is typed and used for
  that message only. Each refusal mirrors the API's, said before the
  press; a 429's `retryAt` reaches the screen as `ApiFailure.retryAt`.
  A WhatsApp tab is opened inside the press (`about:blank`) and pointed at
  `wa.me` once the share answers, so no popup blocker stops it. PDF and
  print are logged quietly where a share could be, never for a reader.
- **The share log** is `InvoiceShare` (channel, kind, who, when; its own
  RLS policy and CHECKs), served as `shared[]` on the invoice read. Emails
  aren't in it: their `Message` rows are the record.
- **One reminder a day, whichever way:** `nextReminderAt`
  (`invoice-send.service.ts`) reads email Messages, account-thread posts
  and WhatsApp NEW or REMINDER shares together, so a WhatsApp reminder
  after an email one (or the other way) is a 429 with `retryAt`. Link, PDF
  and print don't count.
- **Remind many:** `POST invoices/reminders/preview` and `POST
invoices/reminders` (`InvoiceRemindersService`, `invoice:write`, at most
  100 ids, duplicates once). Each invoice is EMAIL when an email can go
  (`channelsFor`: provider connected, an address, email not turned off),
  else WHATSAPP with a phone, else NONE with why (`UNREACHABLE` with
  `emailBlocked`; `DRAFT`, `PAID`, `ORDER`, `NOT_OWED`, `AUTOPAY_PENDING`,
  `NOT_FOUND` for an id that isn't the business's); one reminded today is
  WAIT with `retryAt`; with `quietDays` (1 to 14) one sent or reminded
  inside them is WAIT `REMINDED_RECENTLY` with `lastAt`, `lastWords`
  ("Reminded 2 days ago") and `retryAt`, read again at Send. Each row has
  `dueAt` and `lateDays`; `leftToPay` only with `payment:read`. The
  preview's `message` is the first EMAIL row's reminder email as words
  (`invoice-reminder-sample.ts`), null without `payment:read`. Send emails the EMAIL ones, each through `remind`
  (its own transaction and checks), and sends nothing else: the business
  opens each WhatsApp one through the share route. Never a failure for
  the lot.
- **Remind many's three steps** (U12 #1124, INVBulkSend;
  `components/invoices/bulk-remind-sheet.tsx`, its steps in
  `bulk-remind-steps.tsx`, the words in `lib/invoices/remind-many.ts`):
  "Remind all N" on the Overdue view, or the rows ticked at a desk (the
  ink bar, `remind-bar.tsx`), opens one `FormSheet`: Pick who (all
  ticked), How each one goes (the preview grouped Email / WhatsApp /
  Can't reach now, headed by INVShareB's one look, the button saying
  "Send 3 emails, then WhatsApp 2"), Send. The emails go through
  `useHold().send` (ten seconds; the sheet draws its own Undo, since the
  toast is behind a modal); Undo before any WhatsApp opened comes back to
  step 2, after one it stands. WhatsApp is walked one at a time with Open
  (`openWhatsAppShare`, the share route, so it is logged and counts as the
  day's reminder) or Skip. More than 100 picked go in calls of at most 100
  (`chunks`), for the preview and the send. A row reminded here shows
  "Reminded today · by email / on WhatsApp" until the list is read again.
  On Overdue each row also has its own Remind: the share sheet on the
  reminder, through `useRowShare` (details read, then `useShareFlow`).
  Only `invoice:write` sees any of it.
- **The receipt is automatic** (owner, 20 Oct). `paymentRecordedInTx`
  queues `invoice.receipt` (`invoice-receipt.ts`) at
  `now + RECEIPT_HOLD_MS`, for every payment the ledger records, by hand,
  online, by autopay or at the desk; a cheque's goes when it is marked in
  the bank. It is queued only when it can go (`receiptCanGo`: the
  business's email provider connected, an address, email not turned off),
  so with no provider nothing is queued or sent; Saroh's address never
  carries it. Removing a payment (Undo) deletes its waiting job. The
  handler (`invoice-receipt.handler.ts`) locks the payment row, sends
  nothing for one removed, bounced or already receipted, and records the
  Message on `InvoicePayment.receiptMessageId` in the same transaction, so
  a retry never emails twice. The email (`INVOICE_PAYMENT_RECEIVED`) says
  the payment, paid so far and left to pay, with the PDF attached and no
  link. `share` with `channel: EMAIL` (receipts only) sends it now, and a
  409 with no provider.
- **Tests:** `invoice-share-words.spec.ts`, `invoice-share.db.spec.ts`,
  `invoice-reminders.db.spec.ts`, `invoice-receipt.db.spec.ts` and
  `rls/invoice-shares-rls.db.spec.ts`, plain and under `TEST_RLS=on`.

## An invoice's history: who did what — **Current** (automatic notices U9 #1140, DEC-174)

- **`InvoiceEvent`** (`invoices/invoice-events.ts`, migration
  `20261223140000_invoice_events`): `kind` ISSUED, SENT, REMINDED,
  AUTO_SENT, AUTO_REMINDED, SEND_FAILED, VOIDED, CREDITED, REISSUED,
  PAY_ATTEMPT_FAILED, LINK_MADE; `actorKind` USER (with `actorUserId`),
  JOB (Saroh, on the business's behalf) or CUSTOMER; `channel` EMAIL or
  THREAD; `messageId`; small `data` (address, reason, credit note, draft;
  never a token). Its own RLS policy and CHECKs, including "USER exactly
  when there is a person". `AuditEvent` can't hold it: its actor is
  required and an automatic send has none.
- **Written with `recordInvoiceEvent(tx, …)` in the change's own
  transaction**: `issue` and `issueInTx` (a person, else JOB), `voidInTx`,
  `creditInTx`, `draftFromInTx` (reissue, credit and rewrite, Write again
  are REISSUED with the draft), a link made by hand (`createPayLink` /
  `createViewLink`, now on a transaction; a member's own new link is
  CUSTOMER), `send` / `remind` (one event per send, with the Message id
  and SUPPRESSED when the customer turned email off), the webhook's
  `applyInvoiceFailure` (CUSTOMER, or JOB for autopay). A link a send or a
  share mints is told by that send or share, not as LINK_MADE.
- **Automatic sends** pass `{ automatic: true }` to `send` / `remind`
  (renewals U10, overdue reminders U20): AUTO_SENT / AUTO_REMINDED, actor
  JOB. Every rule of a send still applies.
- **A failed send is told once**: the `message.send` handler calls
  `recordInvoiceSendFailed` only on the last attempt (or a failure it
  won't retry), for an invoice's own emails; a partial unique index on
  `(messageId, kind)` keeps a re-run to one line.
- **Reads.** The detail read carries `events[]` (newest 50, with the
  person's name now) and `shared[].byName`; the app's `historyLines` draws
  them (`lib/invoices/event-words.ts`), dates a credit note from its
  CREDITED event, and skips a `sent[]` email its event already tells.
  `GET :invoiceId/history` (`invoice:read`) merges events, shares, the
  ledger's payment audit rows (amounts only with `payment:read`), emails
  from before events, and the invoice's own dates for what no row
  records. No backfill (A16): older invoices read their dates without
  names. In the data export as `invoice-history.csv`.
- **Tests:** `invoice-events.db.spec.ts`,
  `rls/invoice-events-rls.db.spec.ts`, plain and under `TEST_RLS=on`;
  `lib/invoices/details-view.test.ts`; `e2e/tests/invoices-history.spec.ts`.

## Invoice styles: Classic, Band, Compact, frozen at issue — **Current** (DEC-173, U6 #1118)

- **Three styles in the business's colour.** `PAPER_STYLES` (CLASSIC, BAND,
  COMPACT), the colour rule and `RULE_46_FIELDS` live in
  `@saroh/block-contract` (`invoice-paper.ts`) so the app's paper and the
  API's PDF draw from one rule; `invoices/paper-styles.ts` is the API's
  side (what a write may store, which look a paper is drawn in). Null style
  is Classic and null colour is ink: every invoice issued before styles
  reads as it did, with no backfill.
- **The business's default** is `BusinessProfile.invoiceStyle` and
  `invoiceColour`, set through the settings PATCH as `invoicePaper: {
style, colour }` (Owner or Admin, `org:update`) and read back as
  `invoicePaper` on the settings read. It is its own field, not part of
  `tax`, so a style save never re-runs the GSTIN and address checks.
- **A draft may choose its own** (`paperStyle`, `paperColour` on the draft
  DTO); null follows the default, read when the draft is (`paper` on the
  read is what it will go out in, `paperChoice` what it chose itself).
  Style and colour fall back on their own. `""` or null clears one.
- **Issuing freezes the look** (DEC-082): `issue` writes the draft's own
  choice, else the default as it is then, never null, so a later change of
  default never redraws issued paper. Every other path that issues
  (orders, bookings, plans, packs) freezes the default through
  `loadTaxProfile` → `documentColumns`. A credit note takes its original's
  look (`sellerOf`, `asOriginal`); a reissued draft carries it too. The
  logo stays live.
- **Validation:** a colour is `#RRGGBB` (stored in capitals), a style one
  of the three; anything else is a 400 on its field (`paperWrite`, after
  the DTO's own check). A colour is never refused for being pale or dark.
- **Readable by rule, never typed:** the colour as text and heavy rules is
  the business's when it reads at 4.5:1 on white, else moved toward ink
  (`paperColours`, the safe-colour rule the site looks use). Band's text is
  ink or white, whichever reads on the fill (`bandTextTone`); a mid grey
  neither reads on is moved, not refused.
- **The PDF** (`invoice-pdf.ts`): Classic is today's paper with the colour
  on the title, the labels and the heavy rules; Band fills the top of the
  first page edge to edge, measured first, with the seller and the number
  on it; Compact has smaller rows and the seller, the buyer and the place
  of supply side by side, still A4. Every style draws every Rule 46
  particular; an unregistered business's paper draws no GST in any.
  Saroh's own invoices to businesses carry no look: Classic in ink.
- **Chosen in the app** (U15 #1127): a draft's own look is picked on the
  paper's style rail (`paper-editor/style-panel.tsx`) and saved with the
  draft as `paperStyle`/`paperColour` through its autosave ("" follows the
  default; "Use my default" sends both ""). "Make this my default" and
  Settings › Business › Tax and invoices › Invoice style
  (`invoice-paper-sheet.tsx`) send `invoicePaper`, Owner and Admin only
  (`org:update`; `mayUpdateBusiness` reads the resolved actions, never a
  role name). The app's details paper (`invoice-paper.tsx`) draws the
  invoice's `paper` in the same three styles from `paperColours`, so the
  sheet, the PDF and the paper agree; its spec checks each style against
  the Rule 46 particulars.
- **Not here:** terms and a business's own signature are #1060.
- **Tests:** `paper-styles.spec.ts`, `invoice-pdf.styles.spec.ts` (each
  style against `RULE_46_FIELDS`, no GST unregistered, a long name, pale
  and dark colours read from the uncompressed drawing, with and without a
  logo), `invoice-paper-styles.db.spec.ts` (the default's permissions and
  refusals, the freeze, credit notes and reissues), plain and under
  `TEST_RLS=on`; `@saroh/block-contract` `invoice-paper.test.ts`.

## Saroh's own invoices — **Current** (pricing catalogue U17)

Saroh billing a business for its plan is not the business's paper: it is
`SarohInvoice` (Saroh's series, Saroh as seller from env), never an
`Invoice` row, and never numbered from a business's `InvoiceSequence`. It
reuses the pure GST helpers (`invoices/gst.ts`, `gst-states.ts`,
`numbering.ts`'s financial year) and the D16 PDF renderer through its own
paper view. Written by the billing webhook with the charge, once per
charge; rules in `docs/architecture/PRICING_ROLLOUT.md` › "Saroh's own
invoices (U17)".

**Who Saroh bills: the billing profile (DEC-167, owner, 18 Oct 2026).**
A business is billed to one `BillingProfile` (owned by a user, possibly
billing several businesses); Saroh's invoice takes its bill-to — legal
name, GSTIN, address, state, billing email and phone — from the profile at
issue, with the profile's id (`SarohInvoice.billingProfileId`, also on
`BillingCheckout`), and its email goes to the profile's billing email as
well as the people who manage the business's billing. Earlier invoices
keep what they were issued with. Settings › Business (`BusinessProfile`)
stays the business's own seller identity, for the business's own
invoices; it is not Saroh's bill-to. A profile's details are its owner's
(R2), also on the reads Plan & billing makes with `billing:read`: the
checkout handoff (the provider window's prefill and notes) is built only
for `billing:manage`, and with another owner's profile (a co-owner paying)
carries no email or phone and notes naming only the profile and the
business; a quote's `billingDetails.profile` is null without
`billing:manage` (`checkout.service.ts`, `checkout-privacy.db.spec.ts`).

**Switching a paid business's profile waits for the renewal (R13, U6).**
Choosing another profile applies at once only while nothing more is
charged at the provider (Free, a plan ending, a year paid once), or while
the business has no profile (nothing to move from; a business the data
move left without one can then upgrade at once). While a coupon still
comes off charges to come, a switch is refused (409 `discount-running`,
naming the date the discount ends): the switch's new subscription is made
at full price, so it waits until the discount is used. A
business whose subscription renews gets a SCHEDULED checkout for the same
plan and cycle on the new profile's customer, starting at the period's end
(`billing/profile-switch.ts` decides, `CheckoutService.startProfileSwitch`
makes it); authorised, the webhook tells the old autopay to end with its
period (a same-plan checkout on another profile is never a "renewal"), and
`applyDueMoveInTx` repoints `Organization.billingProfileId` as it adopts
the checkout, with an audit row — unless the checkout's profile has been
deleted since (its owner deleted their account; `BillingCheckout` has no
foreign key to it): then the checkout is still adopted, the business keeps
its pointer, and `billing_profile_gone` is raised in Admin › Billing ›
Needs action. Deleting an account raises `billing_profile_owner_left` for
each business billed to, or with an OPEN or SCHEDULED checkout on, one of
its profiles (`noticeProfilesOfDeletedOwnerInTx`, through `@saroh/auth`'s
`onUserDeleting`), and never refuses the deletion. Unauthorised, it lapses like any checkout
and nothing changes. A plan change and a switch before one renewal are one
checkout: a switch after an authorised plan change is made for that plan
and supersedes it once authorised; a change starting at the renewal while
a switch is in play is made on the profile it moves to. Choosing the
profile it keeps gives up a switch still waiting; once authorised (the old
autopay told to end) staying is a switch back, authorised again. A payment
for a plan waiting is a 409 `checkout-waiting`.

**What Saroh needs before it charges (owner, 17 Oct 2026; the profile's
since 18 Oct).** Every checkout that charges or sets up autopay — all but
a move to Free; a first month, an upgrade, a renewal, a scheduled change, a
year paid once — is refused before anything is made at the provider until
the business has a billing profile with a billing name (its legal name,
else the business's name), a billing email, a whole address (first line,
city, six-digit PIN) and a state. `billing/billing-details.ts` is the one
rule: a 400 with `details.field` (`billing-profile` when there is none,
`billingName`, `billingEmail`, `addressLine1`, `city`, `postalCode`,
`billingState`, `phone`) and `details.missing`; the quote's
`billingDetails: { missing, phone }` tells the change-plan dialog what to
ask, in place. A GSTIN stays optional, a phone "if available". What was
missing and given is saved on the profile (never on `BusinessProfile`,
and never over what the profile has; a GSTIN given replaces the
profile's, with its state). The invoice prints the billing email and the
phone under the address. The profile's Razorpay customer is brought up to
date by the `billing.profile.sync` job the save queues
(`backend-integrations.md`).

**Cancelling a plan (owner, 17 Oct 2026).** "Cancel plan" under Your plan
(`components/settings/plan-billing/cancel-plan.tsx`, owner only, offered
by `cancelOffer` in `lib/saroh-billing/plan-view.ts`) is the same move to
Free as the plan picker's: `GET` then `POST /billing/change-plan` with
Free, so the date it says is the quote's `effectiveAt`. Words per payment
kind are `cancelWords` (`quote-words.ts`). There is no undo: the plan it
is on quotes `NONE` until it ends, and taking a pending Free back would
need a new autopay at the provider, since the old one was told to end.
Not offered under a plan given for a while, on a plan already ending, or
while a year paid once is scheduled to start, whatever the cycle now. The
API refuses that move too (`toFree`: 409 `paid-year-scheduled`): a
SCHEDULED one-time checkout is paid at authorisation, and dropping it
would keep a year's money for a year never given. It can be cancelled
once it has started, or refunded by hand.

**How a plan is paid (DEC-093, DEC-161, #803).** Monthly is autopay; one
approval covers the catalogue's `autopay.charges` monthly charges (12
today, 2 to 1,200, edited in Admin › Plans › Offers). It is read from the
version of the plan being bought (`quoteChange`'s `autopayCharges`, sent as
the provider's `totalCount`) and later from the version of the checkout's
plan (`termCheckoutOf`), so an autopay keeps the count it was made with;
never a constant, never a column. Yearly is one payment for the year (a
provider order, never autopay, never a trial). The catalogue's trial may
carry a nominal first month (`trial.firstPaise`), taken as the mandate is
authorised and invoiced on its own (`first-month:<checkout>`). Where the
autopay runs out is `billing-term.ts` (the code says "term"; a business
never reads it, and it is no price promise): in its last 30 days the same
plan quotes as `RENEW` (a SCHEDULED checkout from that day that cancels
nothing), and one nobody approves runs to the end of what was paid and
then moves to Free (`term-end.ts`: a monthly subscription's `completed`,
which also replaces a "move them" still waiting for approval; the hourly
sweep for a year paid once). The business is asked to approve the next
autopay, never renewed by itself (DEC-100): the hourly sweep sends the
request 30, 7 and 1 days before the end, in the inbox and by email, once
per stage (`term-ending.ts`, `term-ending-notice.ts`), and says nothing
once a renewal or another plan is authorised.

**No price lock (DEC-161).** A version published with "move them" that
changes what a business pays moves it at its first billing date at least
30 days after go-live (`PRICE_NOTICE_DAYS`, `moveNoticeDays`; 7 for any
other move) and tells it 30 days ahead, by email (`PRICE_CHANGE`) and in
the inbox (`move-notice.handler.ts`, `price-change.ts`), and on the plan
screen from the publish. The provider never changes an autopay's amount:
the business approves the new one (the SCHEDULED checkout). Until it does
the move waits (`moveReadiness` → `needs-authorisation`) and it keeps
paying the price it has on the autopay it has — nothing moves it to Free
or stops a charge. Words a business reads never say "term", "your price
doesn't change" or "pay for the next term". Rules in `PRICING_ROLLOUT.md`
› "Price changes (DEC-161)". A business whose owner chose Free or cancelled for the
period's end (`Subscription.freeChosenAt`, set by Plan and billing's move
to Free and by cancel, cleared wherever `cancelAtPeriodEnd` is) is told
its plan moves to Free then, as it chose, and never asked to pay; the
term run out (`term-end.ts`) sets `cancelAtPeriodEnd` without it.
Between, each autopay charge is announced 3 days ahead by email (#804,
the Terms' "We email you 3 days before"; `renewal-reminder.ts`): the
amount as its invoice will add it up (`renewalTotalPaise`) and the date in
the business's zone, once per period end, and only when the charge will
happen as named (`renewalDecision` lists the silent cases). Rules in `PRICING_ROLLOUT.md` › "Checkout and term
(DEC-093)".

**First month, not trial (DEC-093).** A TRIAL checkout that took a charge
is the nominal first month, and its email says "first month" and autopay
(`firstMonthEndingEmail`); only a trial that cost nothing keeps the trial
words (`paidFirstMonth` in `offers.ts`). The waitlist's months of a plan
are a `plan` override with an end date (#805), told as a plan that ends.

**When a plan change takes effect (DEC-159).** One rule,
`billing/change-timing.ts`, read by the quote (`checkout-quote.ts`), the
change (`CheckoutService`) and the provider's events
(`BillingWebhookService`), so the quote says exactly what will happen.
Saroh refunds nothing, so nothing paid for is cut short:

- A dearer plan starts today. In a paid period it pays the difference for
  what is left (`UPGRADE`). In the first month (`TRIALING`) the month ends
  there: the plan's full first charge now, its term from now, no offer of
  its own (`NEW`).
- Anything else waits for the end of what is paid, a period or a first
  month: a plan that costs the same or less, the other cycle, or Free. Ask
  `paidUntil` for the date; never compare `currentPeriodEnd` yourself, and
  never special-case `TRIALING` to move at once.
- The first-month offer belongs to the plan it is set on and is used once
  per business (`hadTrial`). No path may quote a `TRIAL` while one runs.
- Ending the provider subscription a business is leaving goes through
  `leavesWithCycle`: with the cycle in a paid period, at once in a first
  month (it has no cycle, and left alone would take the full charge).
  Its `cancelled` event must not move the plan early (`runsToMoveDate`).

Rules and edge cases in `PRICING_ROLLOUT.md` › "During the first month".

**Never Free while the provider charges, never a plan nobody pays for
(owner, 17 Oct 2026; DEC-164).**

- `leavesWithCycle(sub, chargesStartAt, now)` is false whenever the
  provider subscription hasn't started charging — a first month, or an
  upgrade's or a checkout's whose `startAt` is still ahead
  (`charges-start.ts`). Pass both.
- A payment after Saroh let go of what it was for is settled by
  `paid-after-end.ts`: honoured (plan and invoice) when nothing conflicts;
  otherwise the autopay is stopped, no invoice written, and the double
  charge refunded in full automatically through Razorpay
  (`double-charge.ts` claims it once per payment,
  `double-charge-refund.job.ts` refunds, emails and notes it; DEC-164,
  latest). A refused refund is never retried: the owner refunds it by hand
  from the admin note. A double charge is the only refund Saroh sends: a
  cancel mid-period is never refunded, and any other refund is the
  owner's, in Razorpay. CANCELLED goes back to ACTIVE only there
  (a charge the provider took).
- **What an operator must do is a row, and every refund is on record
  (DEC-166).** A billing problem Saroh can't solve itself is a
  `BillingAction` (`billing-actions.ts`), written by every ops notice and
  listed in Admin › Billing › Needs action. A refund or dispute on a
  payment Saroh took is a `BillingRefund` (`billing-refunds.ts`): the
  double-charge job's (AUTO), a hand refund the owner made in Razorpay and
  an operator recorded on the invoice (MANUAL), Razorpay's `refund.*` and
  `payment.dispute.*` webhooks (PROVIDER), one row per provider id, its
  status moved on and never back. **Saroh issues no credit note for a
  refund on its own invoice**: each raises "a credit note may be needed:
  ask the CA" in Needs action, and the GST export still lists invoices
  only. What the provider took is kept on the invoice
  (`providerAmountPaise`, `invoice-amount.ts`); a total that differs is
  raised. Operators act with `saroh-billing:act` (end autopay the
  business's own way, re-check a refund, re-sync the customer, record a
  refund, mark resolved), never by editing an invoice.
- A refused provider cancel is never taken as settled
  (`provider-cancel.job.ts`).
- A checkout lapses at its start date (`checkoutExpiresAt`) and tells the
  provider (`expireBy`); one approved after its start is stale.
- A renewal (RENEW) or a move that ends the plan, ended at the provider
  before it starts, leaves the move to Free on the same date, never a
  cleared one.
- A scheduled change's first charge failing (`pending`) applies the move,
  then PAST_DUE and the payment-failed email, whichever ran first.
- A `plan` override never takes away a dearer plan the business pays for:
  the plan read is the dearer of the two (`effectivePlanId` with
  `planPriceOf`), and an override that dearer plan shadows is not reported.
- A renewal's invoice is billed to the business's billing profile as it is
  now (its GSTIN and state, DEC-167); the checkout's are for its own first
  charge.
- A suspended business, still billed, may always pay less: change-plan and
  add-ons are `@LifecycleWrite("lower-charges")` and ask `new` themselves
  for anything that charges more.
- `POST …/billing/subscribe` and `…/billing/cancel` are retired (410); every
  change goes through `change-plan`.

Trials, coupons and add-ons (U16) ride the same path: a coupon is
redeemed and its discount invoiced with the charge it comes off, never at
checkout, and an add-on is a line on the charge after the period it covers
(`SubscriptionAddonCharge`). The amount the provider charges and the
invoice's lines are worked out by one rule each, so they agree. Rules in
`PRICING_ROLLOUT.md` › "Trials, yearly, coupons and add-ons (U16)".

## Commission on Saroh's payments — **Current** (DEC-169, admin console U21)

What an account manager earns on the payments of the businesses they look
after: `modules/commission/`. **No rate is ever in code, tests, seeds,
fixtures or docs**: a rate is a `CommissionRate` row for a link kind
(`BROUGHT_IN`, `ASSIGNED`), set in the console by `commission:rates`, from
now or a later day, never backdated; specs draw theirs at random per run.

- **Payments stay correct.** Nothing commission does is inside a payment's
  transaction. `BillingWebhookService` calls `CommissionQueue` only after
  its transaction has committed (`afterCommit`), wrapped so a failure is
  logged (`commission_enqueue_failed`) and the webhook still answers. The
  queue writes a `commission.line` job for each invoice the event wrote
  whose business had a manager then, and a `commission.refund` job for a
  refunded or disputed payment whose invoice has lines. No `*InTx` billing
  function, `saroh-invoices.service.ts` or `billing-refunds.ts` knows
  commission exists; `commission.db.spec.ts` proves a payment records the
  same with the job failing every try, the enqueue failing, and the
  tables gone.
- **A line** (`CommissionLine`, relation-free like `BillingAction`, one per
  invoice and installment) is for the manager whose link was open when the
  invoice was issued, at the rate in force then for the link's kind, on
  the invoice's `taxablePaise` (before GST, after its discount), rounded
  half up once (`commissionPaise`). The rate and its id are copied onto the
  line: a later rate never moves it. No link, a manager not
  `onCommission`, or nothing before GST: no line. A paid first month and
  an upgrade's difference are invoices like any other, so they earn; a
  trial with no charge, Free and a failed payment have no invoice. A year
  paid at once is twelve lines, one twelfth each (`splitEvenly`, adding up
  exactly), the k-th payable at the end of the k-th month (owner, 19 Oct).
- **When it is paid** (`settleInvoiceInTx`, `nextStatus`): PENDING until
  its `periodEnd` passes with no refund or dispute open, then PAYABLE in
  `statementMonth`, the month the period ended in India (`monthOf`), or
  the next month not yet marked paid for that manager. HELD while the
  invoice's `providerAmountPaise` differs from its total and the
  `amount-mismatch:<invoice>` Needs-action row is unresolved. NO_RATE
  while no rate exists for the kind (worked out with the first set after
  the payment, at once when a rate is set and by the sweep). A refund
  PROCESSED or a dispute LOST cancels it, whether written before or after
  the line (matched by invoice or payment id); PENDING refunds and open
  disputes hold it; FAILED, WON and CLOSED change nothing. Once PAID a
  line never changes: a refund then raises
  `commission_refund_after_payout` once, and nothing is deducted.
- **Mark paid** (`team:pay`, never one's own) turns the month's PAYABLE
  lines PAID with a `CommissionPayout` (a reference, a reason), and that
  month is locked for them. Both run under `commission-payout:<id>`.
- **The jobs** retry; the line job's last try raises
  `commission_line_failed` once per invoice. `commission.sweep`
  (hourly) writes lines a lost job missed (60 days back), moves lines
  whose period ended or that are HELD, NO_RATE or PAYABLE, and re-checks
  invoices whose refund changed in the last 3 days (hand refunds
  included).

## Moving to a lower plan — **Current** (#800, #801, #802; the Terms' "Moving to a lower plan")

What is over the plan's limits becomes read-only; nothing is deleted, and
moving back up restores everything at once.

- **Derived, never stored** (`billing/over-limit.ts`, pure;
  `over-limit.service.ts`, the reads). What is paused is worked out on every
  ask from the plan the business reads (`CatalogueAccessService.resolve`)
  and a fixed order. Nothing marks a row paused, so a move back up un-pauses
  everything the moment the plan reads higher, with no job. Behind
  `PLAN_ENFORCEMENT` and the catalogue path, as metering is (off: nothing
  pauses); fails open (`over_limit_unresolved`).
- **The order** (the owner can't pick): team — the owner always, then team
  members and diary people with no login by when they joined
  (`Membership.createdAt`), then open invitations, against `members`.
  Everyone counts, a Reviewer like anyone else, and a limit of one keeps the
  owner alone (DEC-155, DEC-111). Products and
  blog posts — the newest by `createdAt` stay (a `Cut`: the oldest kept,
  spread as `keptByCut` into a read). Locations (`SHOP` only, DEC-109) and
  websites (DEC-094) — the first made stay.
- **The one stored thing is the clock.** Nothing pauses until 7 days after
  the business was told what would pause: the grace claim, a
  `CustomerNotice` of kind `MOVE_DOWN` keyed by the limits it was told
  about (`moveDownClaimKey`). Whichever notice first lists the pauses writes
  it. A claim the business left behind (moved up, back under) is cleared by
  the sweep (`claimStands`), so the next move down is told and waited for
  again.
- **Every way down is told** (`move-down-notice.ts`, the hourly sweep's
  last step): a plan override's end and a term's end through their own
  30/7/1-day notices, which now list the pauses; a move chosen for the
  period's end or its first month's (Free, a cheaper plan, a cancel;
  DEC-159) 30/7/1 days ahead; and a move that happened at once (a payment
  that failed for good, a cancel now, a limit or add-on taken away) within
  the hour, pausing 7 days on. The plan itself moves on its date as before; only the pause
  waits.
- **Where it is enforced** — ask `pausedNow(org)` (cached 30 s): a paused
  product's or post's writes refuse with `pausedByPlan` (409
  `PAUSED_BY_PLAN`; archive, delete and unpublish stay open); the public
  catalogue and blog hide them; a paused location or website refuses
  checkout and booking with `notTakingOrders` (409 `NOT_TAKING_ORDERS`,
  customer words, no plan named) and the site says it isn't taking orders —
  class packs and plans bought online too (`siteTakingOrders`, and the
  packs and plans reads carry `notTakingOrders` via `withPause`, so the
  blocks show no Buy, Join or "Ask about"); a diary person with no login
  past the team limit takes no new bookings (`bookings/diary-paused.ts`:
  `loadStaffing` splits them out, so the slot engine, the booking page,
  "with whom" and booking by hand never offer them; the team hears who and
  why, a customer only that they aren't taking bookings; their bookings
  already made are kept); a paused team member can't open the business
  (403 `MEMBER_PAUSED`, `organizations/member-paused.ts`) — asked at the
  organization context, by the storefront authorizer (`StoresService
.orgAllows`, before the legacy fallback) and passed through by the
  module gate's store-scoped context, so no route answers them with a
  generic denial — and a paused invitation can't be accepted;
  `GET …/billing/paused` feeds the workspace's marks and banner (products
  list, product page and quick look, posts, locations, websites, Team and
  its diary people, the calendar). **Never touched:** invoices, orders,
  customers, payment records — no pause reads them.
- **Notice words:** a move still ahead says "the new plan's limits"; a move
  already made (`now`) says "your plan's limits" (`pausesParagraphs`).
- **The admin limit override** says what then happens
  (`admin/limit-override-warning.ts`, #802).
- **The business's own domain** pauses the same way, on its own rule
  (DEC-139; `billing/domain-plan.ts`, `domain-plan.service.ts`,
  `domain-plan-notice.ts`): derived from `customDomain` and a 3-day clock
  (`CustomerNotice` `DOMAIN_PLAN_ENDED`), never a mark on the `Domain` row,
  which is not written at all. Anything that picks a site's address asks
  `domainPlan.paused(org)` (cached 30 s): the host lookup, `primaryHostOf`,
  `siteOriginOf`, `siteMovedTo`, the test-release lookup and Web address.
  A new place that prefers the verified domain must ask it too.
  `PRICING_ROLLOUT.md` → A business's own domain.

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
- **GST:** a line's amount is what is paid for it, GST and all; tax is
  derived per line from that amount, rounded per line and frozen. Whether
  the typed price already is that amount, or GST is added to it first, is
  the business's choice (next rule). Spread an order discount across lines
  before tax; delivery is a taxed line. Place of supply: bill-to state, else
  delivery state, else the business's state — same state CGST + SGST, else
  IGST. Registered → tax invoice; unregistered → receipt. A registered
  business's orders ignore the storefront's old add-on tax.
- **How a price carries GST is the business's choice** (12 Oct 2026,
  amending ADR-008). A GST-registered business says "My prices include GST"
  (`INCLUDED`, the default and what every price meant before) or "GST is
  added to my prices" (`ADDED`): `BusinessProfile.gstPriceMode`, with a
  nullable `gstPriceMode` on `Service`, `Product`, `SubscriptionPlan`,
  `ClassPack` and `Course` for one priced the other way (null: same as the
  business). A business that is not registered is never asked, and the tax
  settings refuse the field for it.
    - **One sum, one file:** `invoices/gst-price.ts`. One unit's amount to
      pay is the typed price, or under `ADDED` the typed price plus its GST
      rounded to the paisa, half up (₹1,000 at 18% is ₹1,180). A line is
      the quantity times that. The tax inside is then derived from the
      amount as every paper derives it (`splitInclusive`). `priceCharge` is
      the whole answer; `sellUnit` (a product), `serviceCharge`
      (`bookings/service-price.ts`), `saleCharge` (a plan, a class pack, a
      course: `invoices/sale-price.ts`) and `loadPriceTerms`
      (`invoices/price-terms.ts`, the same "registered" test as
      `loadTaxProfile`) are how callers reach it. Never add GST to a price
      anywhere else.
    - **The amount to pay is fixed when something is sold, and nothing
      after it asks for the mode again.** An order line's `price` and a
      booking's `snapshot.service.priceCents` ARE the amount to pay; the
      line keeps what was typed and the mode beside it
      (`OrderItem.listPrice`, `gstPriceMode`; the snapshot's
      `listPriceCents`, `gstPriceMode`), and an invoice line freezes the
      mode with its rate (`InvoiceLine.gstPriceMode`; a correction copies
      its original's). So totals, deposits, what is due, desk payments, pay
      links, edits, refunds and credit notes work unchanged from that
      amount, a later change of the business's choice never rewrites a
      placed order, a made booking or issued paper, and a credit note
      reverses exactly what was charged. A deposit is a share of the amount
      to pay (25% of ₹1,000 + 18% is ₹295), with `depositCents`' own
      rounding.
    - **Where a typed price becomes an amount to pay** (add a new one
      here): `priceOrderLines` (a staff order, lines added by an edit),
      `quoteLines` (the site's bag and checkout), `startTreatmentInTx`
      (a treatment's order), `buildSnapshot` in `reserveInTx` (every
      booking), `onlinePrice` (a hold), and for plans, packs and courses
      the paths in the table under "Plans, class packs and courses carry
      GST" below.
    - **Not covered, and charged as typed with GST inside:** a delivery
      charge and a line typed on a hand-written invoice. The settings sheet
      says so.
    - **The customer is told before paying, in one form of words.** Public
      reads serve `GstOnPrice` (`{ mode, rate, listCents, gstCents,
payCents }`, or null when nothing is said: not registered, no rate, or
      exempt): the product and its options, each bag line and the GST
      inside the quote's total, the booking page's services (`payCents`,
      `gst`), the pay pages' and the confirmation's lines
      (`invoices/line-gst-words.ts`, from frozen sums). The site only
      formats them (`gstPriceWords` and friends,
      `packages/site-blocks/src/lib/gst-price.ts`): "₹1,000, includes
      ₹152.54 GST (18%)" or "₹1,000 + ₹180 GST (18%)". A browsed price (a
      card, a services list) shows the typed price and "+ GST" when it is
      added (`gstAdded`). The merchant's counter previews its totals with
      the same rule and takes the API's order as the truth. The search
      engines' structured data (`product-json-ld.ts`, `service-json-ld.ts`)
      publishes the amount to pay.
    - **A paper prints the typed price as the rate of a line GST was added
      to** (12 Oct 2026, the owner's rule: "If the business says prices
      include GST, ₹1,000 will be the full amount. If they say exclude,
      then ₹1,000 + GST"). The stored `unitPrice` and `amount` stay the
      amount to pay, on every line; only the reading changes, and it is one
      file, `invoices/added-line.ts`:
        - **Rate:** the price typed, before GST, read back from the frozen
          unit amount and rate (the taxable value of one unit's amount is
          the typed price to the paisa, for every price and rate above 0;
          `added-line.spec.ts` checks each rate). An order's line prints
          its own record of it, `OrderItem.listPrice`.
        - **Amount:** the line's frozen taxable value, never quantity ×
          rate. So the lines add up to the taxable value, and the taxable
          value and the GST to the total.
        - **Where the units do not multiply out, the paper says both.** GST
          is rounded on one unit and the line's tax is derived from the
          whole line, so 7 × ₹99.99 at 18% is ₹699.93 while the line's
          taxable value is ₹699.94 (7 × ₹117.99 = ₹825.93, less ₹125.99).
          The gap is under half a paisa a unit (100 × ₹99.99 is 15 paise
          short of ₹9,999.15). The line then also says what one comes to
          with GST, which does multiply out: "₹99.99 each, ₹117.99 with
          GST".
        - **A discount is printed before GST** (what stands between
          quantity × rate and the amount), so the line still reads across:
          ₹1,000 less ₹100 is ₹900, + ₹162.
        - **The sentence under the total** is "Prices include GST." when no
          line had GST added, "GST is added to these prices." when every
          line that carries GST had, and none on a paper with both, where
          each line says its own: "GST 18% added, ₹180" and "GST 18%
          included · taxable ₹50.85" (a delivery charge beside an added
          item is the usual one). A nil-rated line and one with no rate
          have no say.
        - **A line recorded as "includes", or with no mode (everything
          sold before the choice), prints exactly as it always has.** A
          credit note and a supplementary invoice copy their original's
          mode and unit amount, so they print the rate it printed.
        - **Where it is drawn** (change them together): the PDF
          (`paperView`, `lineGstNote`, `lineEachNote` in
          `invoices/invoice-paper-view.ts`), Invoice Detail's paper and
          the quick look in the app (`addedGst` on each line of
          `GET /invoices/:id`; `lib/invoices/paper-title.ts`), the
          customer's pay page and receipt (`invoicePaper` serves the rate,
          the amount and `unitPay` already read that way) and the order's
          pay page (`orderLineOnPaper`). The site formats and never works
          one out. The order confirmation and the bag print no rate and
          keep the amount to pay with the words under it.
    - **A change to the choice, the registration, the GSTIN or the state
      revalidates the business's published pages** (`prices`,
      `backend-jobs.md` → Site page cache).
    - **GST is part of MRP** (the owner, 12 Oct 2026). An MRP includes all
      taxes, so a product's or an option's MRP is compared with the amount
      to pay for one, GST and all, never with the typed price before GST.
      Under `INCLUDED`, and for a business that is not registered, that
      amount is the typed price and the comparison is the one it always
      was. Equal is allowed. Services, plans, packs and courses have no
      MRP.
        - **One rule, one file:** `products/product-rules.ts`, on
          `sellUnit`. `overMrp` is the comparison, `assertMrpAtOrAbovePrice`
          (one price) and `assertProductWithinMrp` (a product and its
          options) the refusals: `{ message, field }`, with the sums where
          GST is what takes it over ("With 18% GST added this is ₹1,180 to
          pay, more than its MRP of ₹1,100. Lower the price, raise the MRP,
          or set this product's price to include GST."), and the old words
          where the typed price is itself above the MRP. Never compare a
          price with an MRP anywhere else.
        - **Every write that can change the sum asks it** (add a new one
          here): a product's create, whole save and section save
          (`ProductsService`: the price, the MRP, the rate, "GST on this
          price", or a status that puts it back on sale), a variant's create
          and save (`VariantsService.assertCoherent`), the copy
          (`duplicateProduct`), an import row (`imports/product-mrp.ts`: an
          error in the preview, never written) and a rate chosen from the
          missing-rates sheet (`gst-rates.service.ts`). A save that changes
          none of those is not judged, so a product already over its MRP
          can still have its name or photos saved. A product's own write is
          refused for its own price, or for an option GST takes over its
          MRP, which it names.
        - **The business's switch is counted first.** A tax save that adds
          GST to prices (`priceTermsChange`: to `ADDED`, or becoming
          registered) is refused while any product not archived would go
          over its MRP: `details: { field, reason: "OVER_MRP", products,
options, items, more }` and a sentence with the count, the first
          names and the way out (`products/over-mrp.ts`). The sheet reads
          the same list before Save (`GET …/gst-rates/over-mrp?mode=ADDED`).
          Going back to `INCLUDED` never asks. Without `mode` the read lists
          what is over as the business stands, for one that switched before
          the rule existed: such a product keeps selling at its amount to
          pay and shows no saving until it is put right. There is no data
          migration.
        - **The saving is the API's.** The public catalogue serves `saving`
          (`{ mrp, percent }` or null) on a product, each option and each
          card: the MRP against the amount to pay, whole percent rounded
          down, null when that amount is the MRP or more (`mrpSaving`). The
          site strikes through and says "% off" only from it
          (`packages/site-blocks/src/lib/mrp-saving.ts`), and the structured
          data's list price is the MRP only then.
- **Plans, class packs and courses carry GST** (12 Oct 2026, the owner's
  decision: "charging from the new invoices; already added ones won't be
  edited"). Each has a `gstRate`, a `sacCode` and its own `gstPriceMode`,
  by the same rules as a service. A plan's and a pack's are draft fields,
  published with the price; a course's are saved with it.
    - **One helper:** `invoices/sale-price.ts`. `saleCharge` is the amount
      to pay, the customer's `GstOnPrice` and the invoice line (unit price,
      rate, SAC, mode); `saleChargeInTx` reads the business's terms only
      when the item has a rate. **No rate, no change:** a plan, pack or
      course with no rate, and anything of a business that is not
      registered, is charged its typed price and written with the line it
      always had.
    - **A stored price says which it is.** `CustomerSubscription.price` is
      the typed price the member joined at, and stays so: each period's
      amount is worked out again from it. `PackPurchase.price` and
      `CourseEnrollment.price` are the amount paid, GST and all (a course's
      "price for them" override is a typed price too: GST is added to it
      where the business adds GST).
    - **Every invoice from the day a rate is set carries it, renewals of
      members who joined before it included.** A period's invoice reads
      the plan's GST as it stands when it is written (`invoicePeriod` in
      `subscriptions.service.ts`, the one place: the desk's subscribe, a
      restart after a pause, an undone skip, the renewal job and its early
      pass). Under "includes" the member pays the same and the paper shows
      the split; under "added" they pay more (₹2,000 at 18% renews at
      ₹2,360). An invoice already issued is never changed.
    - **A renewal is never refused or stopped for a rate.** With none it
      is written exactly as before, and the plan is in the missing-rates
      read, listed while it is on sale or archived with anyone still on it.
    - **Autopay never takes more than the mandate allows.** The renewal's
      invoice is the amount to pay, and `MandateChargesService` asks the
      limit three times (`queueInTx`, `prepareCharge`, `charge`): above it
      nothing is queued or debited, MANDATE_LIMIT_LOW is written and the
      invoice goes out with its pay link, as before D13
      (`mandate-charges.limit.spec.ts`). A new mandate's limit is taken
      from the renewal's amount to pay (`autopay.service.ts`,
      `subscription-autopay.service.ts`), not the typed price.
    - **The business is told before it publishes.** The Plan Editor's read
      carries `renewalChange` (`plan-draft-view.ts`): how many members are
      on the plan, what each price group's next renewal is now and would
      be, how many change, and how many of those have an autopay limit
      below the new amount. Null when nobody is on it or the GST is as
      published.
    - **The member is not told by a notice of their own yet.** No customer
      notice kind covers a plan (`notify-templates.ts` has bookings, orders
      and the waitlist). The renewal's invoice, its pay page, the account's
      Plan tab and "To pay" say the GST; a "your renewal amount changes"
      notice is a follow-up.
    - **Every path, and what it does:**

        | Path                                                       | Started by | No rate chosen       | Amount                                          |
        | ---------------------------------------------------------- | ---------- | -------------------- | ----------------------------------------------- |
        | Subscribe at the desk (`subscribe`)                        | team       | refused, asked       | `saleCharge`, from the plan                     |
        | Book a plan change (`changePlan`)                          | team       | refused, asked       | none now; the renewal bills the new plan        |
        | Renewal, early renewal (`renewOne`, `renewEarlyOne`)       | job        | never refused        | `saleCharge`, the plan's GST that day           |
        | A pause ending; a resume by hand or by the member          | job, team  | never refused        | as a renewal                                    |
        | An undone skip that invoices the period                    | team       | never refused        | as a renewal                                    |
        | Autopay charge and Retry (`queueInTx`)                     | job, team  | not asked            | the invoice's total, never above the limit      |
        | Join a plan on the site (`public-plan-join.service.ts`)    | customer   | never refused        | `saleCharge`, frozen in `planTerms.pay`         |
        | Sell a pack at the desk (`ClassPacksService.sell`)         | team       | refused, asked       | `saleCharge`; the purchase keeps the amount     |
        | Buy a pack on the site (`public-pack-purchase.service.ts`) | customer   | never refused        | `saleCharge`, frozen in `packTerms.pay`         |
        | Enrol on a course (`CoursesService.enrol`)                 | team       | refused, asked       | `saleCharge`; the enrolment keeps the amount    |
        | A credit note, a refund, a dropped early invoice           | either     | mirrors its original | the original's frozen lines (`buildCreditNote`) |

        There is no proration, no instalment and no deposit on a plan, a pack
        or a course, and no course enrolment on the site.

    - **The site says it before the money moves:** the plans and packs
      reads, the join and pack checkout answers, the account's plan and
      "To pay" rows serve `GstOnPrice` (`gst`), and a join's or a pack's
      draft freezes the amount shown, so a rate set while someone is paying
      starts the draft again (`samePlanTerms`, `sameTerms`).
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
      match. The same pair holds how a line GST was added to reads
      (`lineEachNote`, `paperPrices`, `pricesSentence`; above, "A paper
      prints the typed price").
- **A tax invoice someone at the business starts never goes out with a rate
  nobody chose** (12 Oct 2026). Null is "not set" and 0 is a rate ("Exempt
  or nil-rated"), so only null is asked about, and only of a registered
  business.
    - **The rule is one file**, `invoices/gst-rate-required.ts`:
      `assertRatesSet(registered, lines)` throws a 409 `{ reason:
"GST_RATE_MISSING", items: [{ kind, id, name }] }` before anything is
      numbered or written. `kind` is `SERVICE`, `PRODUCT`, `PLAN`, `PACK`
      or `COURSE` (the rate is saved on the item) or `LINE` (a line typed on
      an invoice, named by its place). `assertSaleRated` is the same
      refusal for one plan, pack or course sold at the desk; something free
      is never asked.
    - **The app asks in place and carries on.** `toFailure` and `mutate`
      read `rates` off the failure; `useGstRateStep` opens a sheet with one
      row per item, saves each rate (`PUT …/gst-rates`, or the draft's lines)
      and runs the same action again. Nobody is sent to another page.
    - **Refused:** issuing a draft; a booking's desk payment and its pay
      link; a new order paid at the counter; an order recorded as paid; a
      treatment's balance recorded by the team; units added to an order whose
      invoice is out (`correctOrderInvoiceForEdit`); subscribing someone or
      booking a plan change at the desk; selling a pack and enrolling on a
      course while Payments is on (with it off no invoice is written, so
      nothing is asked).
    - **Never refused:** anything a customer's payment or a job writes (the
      webhook's `ensureOrderInvoice`, a booking's hold, a pack or plan
      bought online, a renewal, a resume). Nobody is there to choose, and a
      payment is never failed for it; stopping a renewal for a rate would
      stop the business's income. `ensureOrderInvoice` asks only when its
      caller passes `refuseUnsetRate`, and a test pins who may call
      `assertSaleRated` (`gst-rate-required.spec.ts`).
    - **Paper already out is left alone:** a pay link already issued is
      marked paid as it is, and a credit note mirrors what it credits.
    - **Finding them first:** `GET …/gst-rates/missing` lists the priced
      things on sale with no rate (`gst-rates.service.ts`): services,
      products, plans (also an archived one with anyone still on it, with
      who is on it by price), class packs and open courses, each read with
      its own permission. It is drawn as one notice with a count on
      Services, Invoices, Plans, Class packs and Courses, and the editors
      ask for the rate beside the price (a plan's and a pack's Publish is
      refused without one for a registered business). `PUT …/gst-rates`
      saves a rate on any of them: the item's editor may, so may whoever
      issues invoices, and for a pack whoever sells packs; those others
      only fill in a rate nobody chose. A plan's and a pack's is written to
      the published columns under the row lock, with its history event and
      the editor's revision moved.
    - **A new path that writes a tax invoice picks a side**, as for the
      business's details above: started by the team, call `assertRatesSet`;
      started by a payment, a job or a customer, never.
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
  the total, never added to it (`gstInsideOrder`). Under "GST is added" it
  is still inside: the lines it is summed from are already the amount to
  pay.

## Orders and the shelf — **Current** (#511, DEC-032)

- **An order that becomes paid is counted for Insights in the same
  transaction** (#867, DEC-012): every place `Order.paymentStatus` moves to
  PAID calls `recordOrderPaidInTx` (`analytics/order-events.ts`), and every
  place it moves to REFUNDED calls `recordOrderRefundedInTx`. Today they are
  `moveOrderPayment` in the webhook service (checkout, pay link, webhook and
  lookup), `updateStatus` (Record as paid, refunded by hand),
  `takeCounterPaymentInTx`, `confirmHoldInTx` (a treatment paid in full at
  booking) and the cancel of an order paid by hand. A new way to pay or
  refund an order calls them too. Both are keyed on the order and skip a
  duplicate, so calling them on a replay is safe. A part refunded by hand
  leaves the order PAID and writes no `order.refunded` (below).
- **A refund recorded by hand is any amount up to what is left** (#865,
  DEC-116, `orders/hand-refund.ts`). "Record as refunded" sends
  `paymentStatus: REFUNDED` and, for another amount, `refundAmount`
  ("49.50"). Under the order's lock the API reads what is left
  (`leftToRefundCents`: paid by hand and online, less every non-failed
  refund and `Order.refundedByHand`) and refuses nothing or more than that
  in the online "another amount"'s words. All of what is left is the full
  path: REFUNDED, `creditRestOfOrder`, `recordOrderRefundedInTx`. Less
  keeps the order PAID and writes `creditPartOfOrder`: a credit note for
  the amount spread over the invoiced lines by their amounts, GST worked
  out of each share at the line's rate, split as the original was. Both
  add the amount to `Order.refundedByHand` and a REFUND step with it and
  how it went back. `refundedByHand` counts in the order read's `refunded`
  and `leftToRefund`, the list's PARTLY_REFUNDED, and `orderRefundedSql`
  (Spent and takings); Home's "taken" reads the credit note. An online
  refund (by line, everything left, or another amount) is capped by it
  too: after its per-payment split, the refund core calls
  `assertWithinOrderLeftInTx` under the same order lock and transaction
  that create the refund rows, and refuses more than the order has left
  ("At most ₹X can be refunded."). An edit's difference (`forEdit`) is
  not checked: it is the order costing less. A cancel works out that
  amount itself rather than refusing it (#918, below).
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
- **Cancel refunds what is left (round-2 B9, #918, `orders/order-cancel.ts`).**
  An order paid online is cancelled through the one refund path
  (`PaymentsService.refundOrderForCancel`, everything left by line); its
  refund rows carry the key `order-cancel:<order>:<request>`, and the order
  is marked CANCELLED only once nothing is left for it to send back and the
  provider has answered for every refund (`finishCancelInTx`). What it
  sends back is `onlineRefundableInTx`'s `leftCents`: what the online
  payments still hold, but never more than `leftToRefundCents` leaves on
  the order (DEC-116) — after part was refunded by hand, a cancel sends
  only the rest, as one amount split across the payments newest first
  (`allocateAcrossPayments`, as another amount is). The lines still ride on
  it, so stock comes back on confirmation; its credit note, whose lines no
  longer add up to the money, is spread over the invoice for that amount
  (`issueCreditNote`), so each refund is credited once. With nothing left
  it sends nothing and cancels at once. Paid by hand, the counter gives
  back what is left (`CancelOutcome.byHand`, null when nothing is) and
  `creditRestOfOrder` credits only what earlier credit notes left. The
  refund webhook's `fullyRefunded` counts `refundedByHand` too: by hand
  and the rest online, the order reads REFUNDED once nothing is left. Every path
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
  tax, total, `paidSoFar` and `leftToPay` (DEC-173), `payments` (U16),
  currency, status,
  billed-to name, `payOnline`, and on an owed
  view-only invoice `payInstructions`, R32) served
  server-to-server to `saroh.app/pay/<token>`; reads and payment starts are
  rate-limited per link. With `payOnline` false (DEC-070) the page shows the
  invoice with no Pay button, only "Print or save as PDF", and starting a payment or autopay
  is a 409 (`assertPaysOnline`). An older API without the field means "as
  before": show Pay.
- **The amount is what is left to pay** (DEC-173, #1115): the stored total
  less the ledger's `paidCents`, worked out by the API
  (`createIntentForInvoicePublic`), so a partly paid invoice is charged its
  balance and still has a working link. A payment request carries only a
  provider and an idempotency key; anything else is ignored. An autopay
  charge and autopay's first payment charge what is left too.
- **`PaymentIntent` pays an Order or an Invoice** — exactly one (a CHECK in the
  migration). Webhooks find the intent by provider id or by the invoice id
  echoed back as the merchant reference. Success on an ISSUED invoice writes
  one `ONLINE` payment on its ledger for the intent's amount
  (`recordOnlinePaymentInTx`, linked by `paymentIntentId`, unique, so a
  replay never doubles it): PAID when that settles it, partly paid when not.
  Success on one already PAID or VOID, or for more than is left (part was
  paid by hand while the checkout was open: `MORE_THAN_LEFT`), is
  `CAPTURED_NEEDS_REFUND`, raised on Home until the provider's refund webhook
  clears it. A refund never changes an invoice's status.
- **The page says what was paid, and only that** (DEC-173, U16 #1128). The
  pay read's `payments` (`payments/pay-link-payments.ts`, the newest 20,
  oldest first) is its own allow-list: amount, method, `receivedAt`, and a
  cheque's number, bank and bank status. Never a reference, note, reason,
  who recorded it or an id; a removed payment is left out; a bounced cheque
  stays so the page can say why the amount is due again. The renderer
  (`saroh.app` `lib/invoice-paid-shape.ts`, `components/invoice-paid-so-far.tsx`)
  draws the newest payment as a receipt ("₹4,000.00 received · Cash · 19
  October 2026"), Paid so far and Left to pay under the total, and Pay for
  what is left. A cheque not in the bank yet has its own words ("This invoice
  is settled once the cheque clears…"), is badged "Cheque received", never
  "Paid", and offers no Pay when it covers what was left. Every owed figure on
  the page (Pay, autopay's "just pay", How to pay us' amount and QR) reads
  `leftToPay`. An older API without these fields reads as before.

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
- **A hold whose time ran out is a lapse, not a cancel** (#1137, DEC-174).
  `releaseHoldInTx`'s `why` says which: `let-go` (the booker or the team:
  CANCELLED, with the team member as actor), `lapsed` (the sweep: a
  `LAPSED` BookingEvent with no actor, and one `booking.notify` with reason
  `lapsed` when there is a contact and it is not a course's session — the
  booker hears "Your hold on ‹service›, ‹time› has lapsed because it wasn't
  paid", `BOOKING_LAPSED`, with "Book again:" and `/book?service=…`), or
  `paid-late` (money came after the place was taken: `LAPSED`, owed back,
  no notice). Nothing that reads "cancelled by the customer" (a null actor
  on CANCELLED) counts a lapse: the team gets no bell for it.
- **A hold that moves is not told "has moved"** (#1137): the move's
  `booking.notify` carries `held: true` while the booking is PENDING, and
  the handler sends no BOOKING_MOVED for it (the team still hears a move
  the customer made). The payment's confirmation reads the booking's time
  then, so it gives the new one.
- **Lock a booking that may be a hold invoice first, then booking**
  (`lockBookingInTx`), the webhook's order. The other way round, a release
  and a payment arriving together deadlock (#508).
- **Hold drafts are not the business's paper**: `NOT_A_BOOKING_HOLD` keeps
  an unnumbered booking invoice — and an unnumbered online pack draft
  (A11, below) — out of the invoice list and customer paper.
- **The price is the service's, on the server.** It is the amount to pay
  as the business charges it (`service-price.ts`: the typed price, or with
  GST added), frozen in the booking's snapshot. The book request has no
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
  **The refund is in the booking's history** (#1137): once sent, a
  `REFUNDED` BookingEvent ("Refunded ₹500 to how they paid"), or
  `REFUND_FAILED` ("Refund failed") when the provider refused it, with
  `data: { amountCents, currency, refundId, outcome }`
  (`recordBookingRefundInTx`). The refund row's status decides which, under
  its lock, and a line already the newest for that refund is not written
  again; the refund webhook's settle and fail (and a refund made in the
  provider's dashboard) call the same helper, so a refund that fails later
  appends "Refund failed". Only a booking's own invoice (no order).
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
  too — for the words only. **What was paid is the paper's ledger**
  (DEC-173, `paidOnPaperCents`: each invoice's paid so far,
  `paidSoFarCents`, however the money came in: online, at the desk, or
  recorded by hand on Invoices, in one payment or several), never the
  last payment's method or the intents: `dueCents` and the take are the
  price less it, a pay link out takes `leftToPayCents` of its invoice, and
  paid in full is refused as paid. What "Take ₹X" may take, and why not
  (cancelled, a hold, a treatment's visit, a course's session, a pack or
  membership, a payment PROCESSING, a voided invoice, no price, paid), is
  one pure rule, `bookings/desk-take.ts`, shared by the booking read, the
  diary, the calendar's Due and the write. The write takes the cancel's
  lock order, refuses an `amountCents` that differs from what it works out, and answers a repeat
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
  Rye & Co. and Pulse carry every state the rebuilt invoice screens draw
  ("Payments on an invoice are a ledger" → Demo data, #1129).
