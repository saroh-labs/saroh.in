# Razorpay in US dollars: what Saroh's own billing relies on

Saroh bills a Global business (saroh.tech) for its plan in US dollars through
Saroh's own Razorpay account (stage 9, DEC-211). This page records what was
checked, when and how, so the code's choices can be traced. No price is here.

## Probe of 6 Nov 2026 (test mode, Saroh's test keys)

| Call                                           | Result                                                                                 |
| ---------------------------------------------- | -------------------------------------------------------------------------------------- |
| Order in USD (`POST /v1/orders`)               | Accepted.                                                                              |
| Payment link in USD (`POST /v1/payment_links`) | Accepted.                                                                              |
| Plan in USD (`POST /v1/plans`)                 | Refused: "Currency provided is not supported". EUR refused the same way; INR accepted. |
| Invoice in USD (`POST /v1/invoices`)           | Refused: "The merchant doesn't have international activated".                          |
| Order in USD on a saved card                   | Refused: "The merchant doesn't have international activated".                          |

International payments were switched on for the live account the same day
(Payment Gateway, Pages, Links and Invoices). They can't be switched on in
test mode.

## What follows (U1 settled, owner 8 Nov 2026)

- **A USD subscription renewal can't be proved in test mode**, because
  Razorpay refuses a USD Plan there. Razorpay's docs and its dashboard
  assistant say a USD plan's subscription charges international cards
  monthly, but nothing has shown it on Saroh's account.
- **So Global's monthly route is one payment a month, never autopay**
  (KTD5b, DEC-210). Each month is a USD order paid in Razorpay's window,
  card only: the first month at checkout; each month after through a payment
  due that opens when the paid month ends, with Pay now in the workspace and
  an email. The business keeps its plan for 7 days, then moves to Free if
  nothing is paid (`payment-due.ts`). Code: `autopayTakes()` in
  `billing/autopay-currency.ts`.
- **Autopay in USD comes later**, only once Razorpay confirms USD
  Subscriptions in writing for Saroh's account and a live renewal is watched.
  Then the currency joins `AUTOPAY_CURRENCIES` and the provider plan sync
  starts making USD plans.
- **Coupons**: a coupon on an autopay rides a Razorpay Offer; a one-time
  order takes the discount off its own amount, so a Global coupon needs no
  Offer.

## Payment entity fields read for a non-INR payment

From Razorpay's payment entity docs
(https://razorpay.com/docs/api/payments/): `amount` and `currency` are in the
charged currency; `base_amount` and `base_currency` are in INR for a non-INR
payment; `international` is true for a card issued outside India. Fees are
on the INR base. The webhook stores the INR base on Saroh's invoice for the
books, FIRC and export reporting; it is not printed until the CA names the
rate.

## Limits

- A card payment in USD is at least USD 1.00 (Razorpay's minimum); smaller
  amounts are refused at the order (`providerMinimumMinor`).
- Only cards take international currencies; UPI and eMandate are INR only
  (https://razorpay.com/docs/payments/subscriptions/faqs/), so a non-INR
  checkout opens card only (`cardOnly` in the handoff).
- A dummy email or phone fails an international payment: checkout needs a
  real billing email and phone first.

## Owner's questions for Razorpay support

1. Will live USD Subscriptions renew on foreign cards for Saroh's account?
   In writing, with any limits.
2. Which purpose code applies to Saroh's plan payments from abroad.
3. Whether the website needs a Shipping policy page as well as Terms,
   Privacy and Refunds.
4. Whether a Razorpay Offer made for coupons is tied to one currency.
