# Who sends the pre-debit notice for autopay (D6, U21, #1152)

**Date:** 2026-10-21 · **Decision:** DEC-174 (D6) · **Plan:** `docs/plans/2026-10-20-002-feat-automatic-notices-plan.md` U21

## The question

The RBI's rules for recurring payments want the customer told before each
autopay debit. Saroh charges through the business's own Razorpay account
by three methods (`providers/razorpay-mandates.ts`): UPI Autopay, card and
eMandate (bank account through NPCI's API e-mandate; paper NACH is out of
scope). Does Razorpay (or the bank) send that notice for card and
eMandate, or must Saroh?

## What was looked at

- **No calls to Razorpay were made for this note.** The laptop run had no
  servers or browsers, and Razorpay's test mode doesn't send real bank SMS
  or enforce the UPI window ("Test mode does not enforce the 24-hour
  Pre-Debit Notification window for UPI", integrate overview). Test mode
  can show the webhook events, not the customer's SMS; see "What the owner
  confirms" below.
- Razorpay's current docs (links below), the RBI framework as reported,
  and what the D11 spike already recorded in
  `docs/patterns/backend-integrations.md` → "Razorpay recurring payments".
- Saroh's charge path: `mandate-charges.service.ts` `prepareCharge` makes
  an order and sends Razorpay's `notification{token_id, payment_after}`
  only for methods in `PRE_DEBIT_METHODS` (UPI today); card and eMandate
  orders go without it.

## What the rule asks

The RBI's Digital Payments – E-mandate Framework, 2026 (21 Apr 2026, which
consolidates the 2019–2022 card, PPI and UPI e-mandate circulars):

- covers recurring payments by **cards, PPIs and UPI**;
- puts the pre-transaction notice on the **issuer** (the customer's bank or
  card issuer): "Issuers are required send pre-transaction notifications"
  ([SCC Online summary](https://www.scconline.com/blog/post/2026/04/24/rbi-issues-digital-payments-e-mandate-framework-2026/));
- at least 24 hours before the debit, with the merchant, amount, date and
  an opt-out;
- AFA on every debit above ₹15,000 (₹1,00,000 for some categories).

Bank-account e-mandates under NACH are NPCI's scheme and aren't named in
the framework's scope (cards, PPIs, UPI). Whether NPCI's NACH rules or the
business's own terms want a notice is for the CA.

## What Razorpay says

**UPI** (already known, D11 spike): Razorpay sends it; Saroh's order must
carry `notification`, and the debit is refused until it is delivered
(`pre_debit_notification_not_sent`).

- "Razorpay first sends a Pre-Debit Notification (PDN) to the customer"
  ([integrate overview](https://razorpay.com/docs/payments/recurring-payments/overview/integrate/)).

**Card: yes, the bank sends it, set off by Razorpay when Saroh asks for the debit.**

- "Bank will send a pre-debit notification SMS to the customer immediately."
  ([card FAQs](https://razorpay.com/docs/payments/recurring-payments/cards/faqs/),
  and the [RBI card mandate announcement](https://razorpay.com/docs/announcements/rbi-card-mandate-guidelines/recurring-payments/cards/))
- "The amount will be debited 36 hours after the notification." (same pages)
- Businesses only start the debit; "the rest will be taken care of by banks
  and Razorpay" (announcement).
- On the card order, `notification` is optional; without it Razorpay will
  "automatically try to debit after 36 hours and 5 minutes"
  ([card subsequent payments API](https://razorpay.com/docs/api/payments/recurring-payments/cards/create-subsequent-payments/))
- Above ₹15,000 the bank sends an AFA link valid 72 hours instead, and the
  debit waits for it. Saroh's mandate limit (`mandateLimitCents`) can exceed
  ₹15,000 for a large plan; such a debit simply waits for the customer.
- RuPay: no recurring debit above ₹15,000; a second notice for the same
  amount can't be raised until the last debit succeeds or the notice
  expires (T+3 days).

**eMandate: Razorpay sends none, and none is asked of it.**

- "For Cards and eMandate, the debit is being processed directly."
  (integrate overview; the PDN step there is described for UPI)
- The [eMandate subsequent payments API](https://razorpay.com/docs/api/payments/recurring-payments/emandate/create-subsequent-payments/)
  has no `notification` object and no pre-debit step.

## The answer

| Method | Pre-debit notice | Who sends it | Saroh needs to |
| --- | --- | --- | --- |
| UPI Autopay | Yes, 24 h ahead | Razorpay via NPCI and the customer's UPI app | nothing more (already sends `notification`) |
| Card | Yes, at the debit request; debit ~36 h later | The card issuer (SMS or email), set off by Razorpay | nothing; card stays on |
| eMandate (NACH API) | No | Nobody | nothing under the RBI framework (it doesn't cover NACH); ask the CA |

So the plan's "if Razorpay doesn't send it for card" branch doesn't apply:
**card autopay is not turned off**, and no Saroh-side pre-debit email is
needed for card. No code changed.

## Open, for the owner

1. **The CA:** does anything (NPCI NACH rules, consumer law, the business's
   terms) want eMandate customers told before each debit? If yes, the
   follow-up is a Saroh-side "you'll be charged ₹X on ‹date›" email through
   the business's own provider, ~24 h before `debitAfter`, for EMANDATE
   only (a new issue then).
2. **A real-card check** (not possible in test mode): set up card autopay on
   a live account with the owner's own card for ₹1-₹10 on a test plan, raise
   one charge, and note the bank's SMS or email and when the debit landed.
   In test mode the owner can only see the order created without
   `notification` and the payment move `created` → `authorized` → `captured`
   in the Dashboard.
3. **How many card and eMandate mandates exist** (count only, no personal
   data), to run read-only on production if wanted:

   ```sql
   SELECT provider, method, status, count(*)
   FROM "PaymentMandate"
   WHERE method IN ('CARD', 'EMANDATE')
   GROUP BY provider, method, status
   ORDER BY provider, method, status;
   ```

## A code comment that is out of date

`mandate-charges.service.ts` says a card's provider "would take it at
once". Per the docs above, Razorpay holds a card debit ~36 hours behind the
bank's notice; the planned-debit hold is still right, the reason is not.
Left as is (no behaviour change in this unit).
