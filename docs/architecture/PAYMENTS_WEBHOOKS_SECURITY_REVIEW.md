# Payments and webhooks security review (#106)

A focused review, on 2026-09-26, of the merchant webhook inbox
(`modules/webhooks`), the Saroh billing webhook (`modules/billing`), the public
checkout and invoice pay-link endpoints, credential encryption
(`modules/payments`), and what the RLS cutover changes for them. Paths are
relative to `apps/api.saroh.in/src/` unless they start with `packages/`.

**The foundations hold up.** Signatures are checked over the raw body with a
constant-time compare, using the right secret for each organization, before
anything is parsed or written. Amounts always come from the stored order or
invoice, never the client. Webhook lookups are scoped to the organization.
Credentials are sealed with AES-256-GCM.

The defects found were about **state**. Two reconciliation paths trusted a
status read before a lock. A public path let an order that was already paid be
paid again. And billing event ids weren't unique per delivery. All four were
fixed in this change, with tests. The rest are risks, listed for a decision.

## Summary

| ID     | Severity | Verdict | Finding                                                                                          | Status                  |
| ------ | -------- | ------- | ------------------------------------------------------------------------------------------------ | ----------------------- |
| PAY-01 | Medium   | Bug     | Pay-link success trusted an intent status read before the lock → a good payment "needs a refund" | **Fixed** (#106)        |
| PAY-02 | Medium   | Bug     | A failure event overwrote SUPERSEDED intents, and in a race SUCCEEDED ones                       | **Fixed** (#106)        |
| PAY-03 | Medium   | Bug     | Public checkout opened intents on orders already PAID, REFUNDED or cancelled                     | **Fixed** (#106)        |
| PAY-04 | Medium   | Bug     | Billing event ids were `type:subscriptionId`, so a repeat of the same event type was dropped     | **Fixed** (#106)        |
| PAY-05 | Medium   | Risk    | Webhook inbox is unique on `(provider, providerEventId)` across all orgs                         | **Fixed** (1a78e763f)   |
| PAY-06 | Low      | Risk    | Captured amount and currency are never compared with the intent                                  | **Fixed** (1a78e763f)   |
| PAY-07 | Low      | Risk    | Billing reconcile reads status outside a transaction; out-of-order events can move state back    | Open                    |
| PAY-08 | Low      | Risk    | `/public/orders/*` had no rate limit                                                             | **Fixed** (#106)        |
| PAY-09 | Low      | Risk    | No timestamp tolerance on Cashfree; Razorpay's event-id header is not signed                     | Open                    |
| PAY-10 | Low      | OK      | Credential encryption sound; hardening possible (tag length, AAD, key version)                   | Open (hardening)        |
| PAY-11 | Info     | OK      | Signature verification and raw-body handling                                                     | —                       |
| PAY-12 | Info     | OK      | Org scoping on webhook and public paths                                                          | —                       |
| PAY-13 | Info     | OK      | RLS cutover: no webhook or public payment path changes behaviour                                 | —                       |
| PAY-14 | Info     | OK      | Idempotency of intent creation and refunds                                                       | —                       |
| PAY-15 | Medium   | Risk    | The pay link's per-caller limits see saroh.app's server, not the buyer                           | Open — needs a decision |

---

## PAY-01: pay-link success used a stale intent status — Fixed

`applyInvoiceSuccess` (`modules/webhooks/webhooks.service.ts`) checked
`intent.status === "SUCCEEDED"` on the row `findIntent` read with no lock, then
locked the Invoice. Razorpay sends `payment.captured` and `order.paid` for one
payment, under different event ids, often together. If the first committed the
invoice as PAID while the second waited on the lock, the second then saw PAID
with the stale unpaid status. It recorded the same money as
`CAPTURED_NEEDS_REFUND`, and the merchant was prompted to refund a correct
payment.

**Fix.** Lock and re-read the intent first (`lockIntent`), before the Invoice.
That's the documented lock order: intent, then Invoice. Test:
`webhooks.invoice.spec.ts`, "reads the intent under its lock".

## PAY-02: a failure event overwrote settled intents — Fixed

`applyIntentFailure` updated to FAILED whenever the unlocked status wasn't
SUCCEEDED or FAILED. So a SUPERSEDED intent (an edit's replaced difference
charge) became FAILED, and a later success on it counted as the order's money
rather than money owed back. In a race, a SUCCEEDED intent was overwritten
too, hiding the only paid intent from refund planning.

**Fix.** The condition moved into SQL. The update is now
`updateMany({ where: { id, status: { in: OPEN_INTENT_STATUSES } } })`, and it
counts as applied only if a row changed. Tests: `webhooks.invoice.spec.ts`,
"never overrides an intent that succeeded / was superseded".

## PAY-03: public checkout accepted payment on paid or refunded orders — Fixed

`requirePayableOrder` checked only that the order had an organization and its
storefront wasn't paused. A second tab or a revisited checkout mints a new
idempotency key and opened a fresh intent for the full total. On a PAID order,
the capture was absorbed unflagged. On a REFUNDED order, the transition threw
and the event was marked FAILED, with the money taken.

**Fix.** `payments.service.ts` refuses (409) unless `paymentStatus` is UNPAID or
FAILED and the order isn't CANCELLED. A difference after an edit is charged
from the business's side (`createDifferenceIntent`), which this doesn't touch.
Tests: `public-payments.service.spec.ts`, "refuses an order that is already
paid / refunded / cancelled".

**Still recommended:** in `applySuccess`, a capture on an order that's already
paid through a non-difference intent should record `CAPTURED_NEEDS_REFUND`, as
the invoice path does. That covers two intents opened before either is paid.

## PAY-04: billing event ids collided across deliveries — Fixed

Both billing adapters built `providerEventId` from the event type and
subscription id only, and the inbox is unique on `(provider, providerEventId)`.
So month 2's `subscription.charged` was dropped as a duplicate of month 1's,
and a subscription that recovered from PAST_DUE stayed PAST_DUE for good.

**Fix.** `parseWebhook(payload, headers)` now takes headers. Razorpay uses its
`x-razorpay-event-id`, falling back to `type:subscription:created_at`. Cashfree
uses `type:subscription:event_time:status`. A redelivery of the same event is
still a duplicate. Tests are in `billing/providers/billing-provider.spec.ts`.

Old inbox rows keep their old ids, which can't collide with the new format.

## PAY-05: inbox uniqueness is global, not per org — Fixed

`WebhookEvent` is `@@unique([provider, providerEventId])`, with no
organization in the key. Merchants set their own webhook secret, so merchant B
can sign any body sent to their own endpoint. If B could guess the ids org A's
future deliveries will use (Cashfree ids derive from `cf_payment_id`), A's real
payment would be answered "duplicate" and never reconciled. That guessability is
not verified. **Fix:** a migration changing the unique to
`(organizationId, provider, providerEventId)`, plus a test with the same id
under two orgs.

**Fixed** in 1a78e763f. Migration `20261104100000_webhook_inbox_unique_per_org`
makes the unique `(organizationId, provider, providerEventId)`. It first
checks that no rows would collide under the new key (none can: it widens the
old one) and stops rather than drop a row, builds the new index, then drops
the old one, so duplicates are refused throughout. `organizationId` stays
nullable; the inbox always writes it, and NULLs never collide. Saroh's own
billing inbox (`BillingWebhookEvent`) has no business in its URL and keeps
its key. Tests: `webhooks/webhooks.inbox.db.spec.ts` (the same id under two
businesses is two deliveries, a repeat in one is a duplicate); the migration
replays from empty, and was applied to a database holding rows.

## PAY-06: captured amount never compared — Fixed

Neither the normalized event nor the adapters carry the payment amount. The
amount is fixed server-side on the provider order and enforced by the provider,
so this is defence in depth. **Fix:** parse amount and currency, and on a
mismatch record `CAPTURED_NEEDS_REFUND` without marking the order or invoice
paid.

**Fixed** in 1a78e763f. Adapters normalise what was captured in paise
(`capturedAmountCents`: Razorpay's `payment.entity.amount` as is, Cashfree's
rupee `payment_amount` read as decimal text) and its currency. Every path
that settles from the provider compares it with the intent first: the
webhook and its replay (`WebhooksService.reconcile`), the checkout return,
the pending sweep and `payments reconcile` (`payment-lookup.service.ts`),
and an autopay charge's look-up (`mandate-charges.service.ts`). Only the
exact amount in the same currency settles, so a partial capture and an
over-capture both count as mismatches. On a mismatch nothing is marked paid. The capture is
recorded once per provider payment as `CAPTURED_NEEDS_REFUND` with
`rawResponse.invoiceStatus` `AMOUNT_MISMATCH` and both figures, an error is
logged, and an open intent fails as a decline does: an order goes UNPAID to
FAILED, an invoice raises the team's "Payment failed" alert, an autopay
renewal logs RENEWAL_FAILED with reason AMOUNT_MISMATCH, and the customer
can pay again. A look-up must report the amount. A signed webhook that
carries none is settled on the provider order's amount, as before. Code:
`payments/capture-mismatch.ts`. Tests: `capture-mismatch.spec.ts`,
`webhooks.service.spec.ts` (PAY-06), `payment-lookup.db.spec.ts` and
`subscriptions.charge.db.spec.ts`.

**Follow-up done** (owner decision 9 Oct): a mismatch on an intent that is
now FAILED used to miss Home's "refunds owed" list, which read SUCCEEDED
intents only. Now every mismatch not yet refunded is its own row there,
whatever its intent's status, at what it captured, with the order or invoice
it was for (`home/home-mismatch-refunds.ts`), and carries **Refund**
(`order:refund`, while its provider is connected). Refund sends exactly the
captured amount against that payment through the provider, as a
PaymentRefund on the intent keyed to the attempt (`amount-mismatch:<attempt>`,
`payments/mismatch-refund.ts`, `POST …/payment-attempts/:attemptId/refund`);
it is idempotent, looks before resending a lost answer, and sends a fresh row
after a refusal. The order or invoice is left as it is: no credit note, step
or stock. The provider's refund webhook for such a payment settles that row
(or, for a refund made in the dashboard, records one keyed to the attempt,
matched by the payment id Razorpay and Cashfree carry on the refund) before
the order's refund path, so it is never refused on a FAILED order. Tests:
`mismatch-refund.spec.ts`, `mismatch-refund.db.spec.ts`,
`home.refunds.spec.ts`, `home.inline.spec.ts`. Residual: a second capture on
an intent that had already succeeded (one provider order paid twice, which
neither provider takes) would have its refund read as part of that payment
going back.

## PAY-07: billing reconcile ordering — Risk

The subscription is read outside a transaction and updated unconditionally.
ACTIVE and PAST_DUE can each move to the other, so a delayed
`subscription.pending` arriving after `subscription.charged` moves an active
subscription back to PAST_DUE. **Fix:** lock the subscription row, and ignore
events older than the last one applied.

## PAY-08: public order endpoints unthrottled — Fixed

Each intent created without a key costs a provider API call and a row. One
leaked order id could open intents without end.
`public-payments.controller.ts` now allows 10 intents a minute per order, 30
per caller, and 240 receipt reads per caller (the checkout page polls). The
checkout runs in the buyer's browser, so the caller address is the buyer's.
Tests: `public-payments.controller.spec.ts`.

## PAY-09: replay window — Risk

Cashfree's signed `x-webhook-timestamp` is never age-checked. Razorpay's event-id
header is outside the HMAC, so a captured signed body can be re-sent under a new
id and gets past the inbox. Reconciliation is mostly idempotent. **Fix:** reject
Cashfree timestamps more than about 5 minutes old or ahead. For Razorpay, also
dedupe on `(intent, providerPaymentRef)`.

## PAY-10: credentials at rest — OK, hardening possible

AES-256-GCM, a fresh 12-byte IV per seal, the tag checked in `final()`, and the
key validated at 32 bytes. Responses expose only id, provider, status and
public key. Provider errors log only the HTTP status. Hardening:

- `authTagLength: 16` on decipher;
- the `organizationId:provider` pair as AAD, so blobs can't be swapped between
  rows;
- a key version, for rotation;
- keep the webhook secret apart from the API secret, so a webhook doesn't
  decrypt the API secret.

## PAY-11 – PAY-14: OK

- **Signatures.** `rawBody: true`. An empty body is 401. The order of checks is
  secret, then HMAC, then parse, then inbox write. `timingSafeEqual` is used
  with length checks. A missing org or platform secret is 401. Operational
  note: `webhookSecret` is optional at connect. An org without one never
  reconciles, so the UI should require it or warn.
- **Org scoping.** Intents are found by `(organizationId, provider, id|ref)`,
  and refunds and invoice locks are org-scoped. Public endpoints derive the
  org from the Order row or the pay-link token hash. A client-named provider
  must be connected by that org.
- **RLS cutover.** The webhook inbox and replay, the billing webhook and the
  public checkout run with no org context (the permissive branch), so they
  don't change when `RLS_ENFORCEMENT` is on. The pay link runs inside
  `runInOrgContext(invoice.organizationId)`, and every row it touches carries
  that org. No path under a context touches a NULL-organization row. Provider
  HTTP calls run outside any transaction.
- **Idempotency.** `(orderId|invoiceId, idempotencyKey)` is unique, and a lost
  race returns the winner. A move to the same status is a no-op. Refunds settle
  under a row lock, keyed on the provider's refund id or Saroh's reference.
  Caveat: replaying a key returns the intent at its original amount, even if
  the order's total has changed since.

## PAY-15: the pay link's limits see saroh.app's server, not the buyer — Risk

The pay link and the product-review link read and post **server-to-server**
from saroh.app (`apps/saroh.app/lib/invoice-pay.ts`, `lib/reviews.ts`), with no
forwarded client address. The API keys their limits on the caller's IP
(`public-invoices.controller.ts` `@Ip()`): 30 reads a minute, and 10 payment
attempts per 10 minutes. The caller it sees is saroh.app's egress address, so
every buyer behind the same Vercel egress IP shares one bucket. Under real
traffic, legitimate customers of different merchants could get 429s from each
other. Not measured: how many egress addresses Vercel spreads the calls over.

**Options (a decision):**

1. saroh.app forwards the buyer's address in a header signed with a secret
   shared with the API (the API can't trust a plain `X-Forwarded-For` from
   Vercel).
2. Key the limits on the token plus a coarse caller key, and raise the caller
   ceiling.
3. Move these two calls to the browser, as the checkout already is.
