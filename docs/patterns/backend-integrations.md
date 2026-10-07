# External providers and webhooks

> **Read when:** calling a payment, billing, messaging or storage provider;
> adding an adapter; receiving a webhook; or reporting a provider's health.
> Adapted from claude-patterns `backend/06-external-integrations.md`.
> Decisions: DEC-009 (storage), DEC-010 (payments), DEC-011 (communications).

## Ports and adapters — **Current**

Every provider sits behind a port, with adapters under the module's
`providers/` directory and a fake for tests.

| Port               | Where                     | For                                                             |
| ------------------ | ------------------------- | --------------------------------------------------------------- |
| `MerchantProvider` | `modules/payments`        | An Organization's own customer payments — Razorpay and Cashfree |
| `BillingProvider`  | `modules/billing`         | Saroh charging the Organization                                 |
| `WebhookProvider`  | `modules/webhooks`        | Signed inbound events                                           |
| `CommsProvider`    | `modules/communications`  | Email and WhatsApp adapters, chosen by a factory per channel    |
| `ObjectStorage`    | `packages/object-storage` | Media, with an R2 adapter and an in-memory adapter              |

DEC-011 describes separate `EmailProvider` and `WhatsAppProvider` ports; the
code has one `CommsProvider` port with per-channel adapters. DECISIONS.md carries
a note saying so.

## Rules

- **Current** — **An optional panel never fails the read it sits on.** Anything
  a flag, a provider or a module decides (an autopay offer, a pay link, a
  provider status) degrades to "not offered" and is logged. Check the flag
  first and open credentials last: an environment with connected providers
  and no `PAYMENTS_ENC_KEY` (CI's browser stack, until 2026-09-29) had a
  decrypt throw and take Subscription Detail down
  (`mandate-setup.service.ts`, DEV_LEARNINGS "Subscription Detail could not be
  loaded").
- **Current** — **An email a stranger can trigger carries only our words.**
  When anyone on the internet can make Saroh send an email to an address
  they type (a public tool, a "send me a copy" box), the email quotes
  nothing they or a page they control chose: no titles, descriptions,
  names, links or values from the request — not even a domain in the
  subject. Say what happened in our own fixed text and link to our own
  page, which shows the details. Its caps are durable (counted in the
  database, per address and per day in all), the route is server-to-server
  behind the signed relay, and no consent is taken from an unverified
  address (`link-preview/report-email.ts`, DEV_LEARNINGS "a public tool
  that emails stranger-supplied text is a relay").
- **Current** — **A stranger's host name is resolved off the thread pool.**
  Never `dns.lookup` (getaddrinfo on libuv's four threads) for an address a
  visitor typed: use `dns.promises.Resolver` with a short timeout and one
  try, cap how many such fetches run at once, and answer a typed "busy"
  past it (`link-preview/ssrf-guard.ts`).
- **Current** — **Merchant payments and Saroh billing never share** records,
  credentials, webhooks or contracts (DEC-010).
- **Current** — **The Organization connects its own messaging provider** for real
  sends; Saroh-owned email is only for identity mail and a template test to the
  signed-in user's own verified address (DEC-011) — and, while a business has
  no email provider, its booking notices, sent from `notify.saroh.in` under
  one rule (`emailRoute` → `sarohDecision`) and counted against its plan's
  `sarohEmailsPerMonth`, failing closed (DEC-086).
- **Current** — **Settings → Providers is one row per provider, connected
  first** (DEC-036): a disconnected one stays listed as theirs, only what the
  API can connect is offered, and a row shows only what the API sends as
  public (a checkout's public key, a sending address), never a credential.
- **Current** (UX-012) — **Keys are checked before they are kept, and
  watched after.** Connecting a provider asks it one cheap authenticated
  read with the typed keys (`verifyCredentials` on the port: Razorpay
  `GET /payments?count=1`, Cashfree an order look-up that should 404,
  Resend `GET /domains`, whose list must hold the sending address's domain
  as verified; a sending-only Resend key is accepted on its
  `restricted_api_key` answer). A refusal is a 400 under the field
  (`keySecret`, `apiKey` or `fromAddress`); no answer is a deliberate 503
  (`provider-unreachable`) — nothing is stored either way. Relays (SMTP,
  SendGrid, a Resend `baseUrl`) aren't checked. Later, an adapter that gets
  a 401 or 403 on a live call throws `ProviderKeysRefusedError`
  (`common/providers/provider-attention.ts`); the caller marks the row
  (`attentionReason` `KEYS_REFUSED`, `attentionAt`), which the redacted
  view sends as `attention: { reason, since } | null` and provider health
  reads as FAILED, and queues the team's `provider` alert on the same
  transaction, only when the row wasn't flagged already. Entering keys
  again clears it. A provider order that fails at checkout is a deliberate
  503 in the customer's words (`provider-keys-refused` or
  `provider-unavailable`), never an unhandled 500
  (`payments/provider-keys.ts`).
- **Current** — **Credentials are encrypted at rest** (AES-256-GCM,
  `payments/crypto.ts`) and never returned; reads are redacted views.
- **Current** — **Adapters sanitise errors:** never surface an auth header, a
  credential or the raw provider body (`CommsProvider` contract).
- **Current** — **A provider call has a deadline.** Node's `fetch` never
  times out on its own, so a payment provider's lookups and mandate calls
  pass `signal: providerCallSignal()` (`payments/providers/provider-call.ts`,
  15 s); the abort lands in the adapter's network-error path (UNKNOWN, or a
  lookup's ERROR). A new call to a provider a job or a sweep waits on does
  the same.
- **Current** — **Verify before you parse.** A webhook's signature is checked
  against the raw body before anything in it is trusted; a missing secret or a
  bad signature is a 401 and writes nothing.
- **Current** — **A payment connection holds the secret its webhooks are
  signed with** (DEC-063). Connecting Razorpay requires its own webhook secret
  (a 400 without it). Cashfree signs with the key secret, so it needs nothing
  more. `payments/webhook-secret.ts` says which, and
  `payments/webhook-setup.ts` flags a connection saved without one
  (`webhookSecretMissing`, readiness `PAYMENTS_WEBHOOK_SECRET_MISSING`) and
  builds the webhook URL setup shows. A new provider declares its signing
  scheme there.
- **Current** — **Inboxes are idempotent.** `(provider, providerEventId)` is
  unique, so a duplicate delivery hits P2002 and returns 200 without moving state
  twice. Reconciliation follows a state machine that rejects illegal
  transitions.
- **Current** — **Stored provider payloads are for verification and audit,**
  never read on a serving path (`WebhookEvent.payload`).
- **Current** — **The server derives amounts.** A payment intent's amount comes
  from the Order or, for an invoice pay link, the Invoice — never from the
  request. The public invoice intent route reads its body by hand, so an
  amount sent anyway is ignored rather than refused (ADR-007).
- **Current** (E11) — **The booking page opens the provider's own window**
  (`packages/site-blocks/src/booking-flow/checkout.ts`): Razorpay Checkout on
  the handoff's order with the business's _public key_, or Cashfree's drop-in
  on its payment session. Razorpay's is set to UPI and
  card only; Cashfree's shows what the account has on. What the
  window says is a hint ("Paying…"); the API confirms the booking.
  The invoice pay page still shows the handoff, not the window.
- **Current** (P1, #710) — **A payment is confirmed by asking the
  provider, with the webhook as backup.** Every merchant-site window posts
  its return (`CheckoutRequest.apiUrl`) to `POST /public/payments/return`:
  Razorpay's `razorpay_signature` (HMAC-SHA256 of `order_id|payment_id` by
  the key secret, `verifyCheckoutReturn`) is checked first — a bad one is a
  400 and writes nothing — then the order's payments are read from the
  provider (`MerchantProvider.findOrderPayments`), never from the browser.
  Only a CAPTURED payment at the intent's exact amount and currency
  settles, through `WebhooksService.settleLookedUp` — the webhook's own
  reconciliation, so whichever comes first settles and the other finds it
  settled. The `payments.confirm-pending` sweep asks about open intents on
  a pause that grows with their age (`webhooks/payment-lookup-schedule.ts`),
  the hold release asks before letting a hold go, and `payments reconcile`
  (`src/cli/payments-reconcile.cli.ts`) asks for one business on demand.
  A provider failure the look-up sees is left to its webhook. Code:
  `webhooks/payment-lookup.service.ts`.
- **Current** (D22, DEC-054) — **Razorpay's key id is its public key.**
  Setup checks the key id (`rzp_live_…` / `rzp_test_…`) and the secret, and
  stores the key id as the connection's `publicKey` beside the sealed pair
  (`payments/public-key.ts`); a public key sent that names another key is
  refused. A Razorpay connection without one gets no provider order (409),
  the booking page doesn't offer Pay now for it (`OPENS_CHECKOUT`), and
  Providers shows it as Needs attention. The key id is never read out of
  the sealed blob on a serving path: connections made before D22 were
  filled by the `razorpay-public-keys` backfill
  (`ROUND_2_PHASE_2_ROLLOUT.md`). Cashfree's public key stays optional.
- **Current** — **Money that arrives for something already settled is kept,
  not lost.** A webhook success on a paid or void invoice marks the intent
  SUCCEEDED and records a `CAPTURED_NEEDS_REFUND` attempt, which Home raises
  until a refund is recorded.
- **Current** — **Consent gates the send.** A revoked consent makes a message
  `SUPPRESSED`: no job, no delivery.
- **Current** (D17) — **One transactional path.** A message about a
  customer's own invoice (and, with A14, order, booking or waitlist) goes
  through `CommunicationsService.queueTransactional` on the caller's
  transaction: fixed templates (`communications/transactional.ts`), only to
  the bill-to email or a verified site-account email (never a typed
  address, never a DEC-049 placeholder), only through the business's own
  EMAIL provider (409 otherwise; a booking notice given as its values may go
  through Saroh instead, DEC-086), no marketing opt-in, and a revoked email
  consent still suppresses it. A secret link in it (a pay link) is sealed
  into the `message.send` job with the credentials' key and filled in only
  as the email goes to the provider; the stored body keeps a slot, so
  `message:read` never shows the token. A suppressed send never makes the
  link, so the one already shared keeps working.
- **Current** (A14) — **A confirmation proves an address.** When the email
  of a booking confirmation, or an order's Ready or handover, is accepted
  by the provider, and the contact made that booking or order online with
  that very email, `message.send` stamps the contact's email verified
  (`communications/confirmation-stamp.ts`, DEC-049). The notice ledger
  (`CustomerNotice`) says which booking or order a message confirmed. A
  failed send, a placeholder address or a booking made by staff stamps
  nothing, and a stamp that fails never re-sends the email.
- **Current** — **Storage keys are server-derived and tenant-scoped**
  (`org/<organizationId>/…`), and uploads are presigned PUTs checked against a
  content-type allowlist and a size cap.
- **Current** — **Health has more than two values.** `provider-health` reports
  `NOT_CONFIGURED`, `PENDING`, `ACTIVE`, `DEGRADED` or `FAILED` from persisted
  state, never a live probe carrying secrets, and each state maps to where to fix
  it.
- **Current** — **A refund is sent under Saroh's reference, and an unsure
  answer holds the money** (DEC-026). The PaymentRefund row's id is the
  provider's idempotency key or `refund_id`; adapters throw `RefundCallError`
  with `REFUSED` (a 4xx it would give again — the row goes FAILED) or
  `UNKNOWN` (network, timeout, 5xx, 429, 409, a duplicate id — the row stays
  PENDING, money held). Try-again asks the provider first (`findRefund`) and
  re-sends only when it has none. Never match a refund by amount alone.
- **Current** (D20, D11) — **Autopay is an optional capability of the
  merchant port.** `MerchantProvider.mandates?: MandateCapability`; a
  provider without it never offers autopay (`supportsMandates`) — Cashfree
  this round. An adapter may name a `rolloutFlag` (Razorpay:
  `RAZORPAY_AUTOPAY`, D19): `MandateSetupService.mandateMethods` offers it
  only where that flag is on, so a screen asks that, never
  `supportsMandates` alone. A renewal's charge waits on it too (D13,
  `payments/mandate-charge-gate.ts`): off, renewals are invoiced with a pay
  link as before; reading and cancelling a mandate already made never
  wait on the flag. The capability has `mandateMethods`,
  `createSetup`, `get`, `prepareCharge`, `getPreDebit`, `charge`,
  `findCharge` (D13: what became of a debit, so an unsure answer is looked
  up before anything is charged again) and `cancel`; the fake implements all of it (`providers/fake.provider.ts`).
  Adapters throw `MandateCallError` with `REFUSED`, `UNKNOWN` or `NOT_YET`
  (the provider won't debit yet; nothing was charged); cancelling a
  mandate the provider has already cancelled is a success. Saroh marks a
  mandate CANCELLED before it asks, so an unsure answer never leaves it
  chargeable (`payments/mandates.service.ts`). Set-up is
  `mandate-setup.service.ts`, the charge `mandate-charges.service.ts`, and
  what a provider reports (webhook or read) is applied by
  `mandate-events.ts` in the caller's transaction.
- **Current** (D11) — **The customer picks the autopay method from all the
  account offers.** A provider's authorisation takes exactly one method, so
  `mandateMethods` returns what the business's account can set up (UPI,
  CARD, EMANDATE) and the customer chooses; Saroh never narrows the list
  (DEC-059). The mandate stores the method and only a displayable hint (a
  masked UPI handle, a card's last four — `safeDisplayHint` drops anything
  else), never a card or bank detail.
- **Current** (D11) — **A mandate charge is two steps.** `prepareCharge`
  makes the provider's order with a pre-debit notice and records it on the
  invoice's PaymentIntent (`viaMandateId`, `debitAfter`, `preDebitStatus`,
  `preDebitRef`); `charge` asks for the debit only when the mandate is
  still ACTIVE and the invoice's subscription is its own, the invoice is
  ISSUED and within the limit, the notice is DELIVERED (or NOT_NEEDED) and
  `debitAfter` has passed. It claims the intent (REQUIRES_PAYMENT →
  PROCESSING) before the call, so it is asked once; the payment's own
  webhook settles the invoice as a pay link's does. Ask for a debit at
  least `PRE_DEBIT_LEAD_HOURS` (26) ahead: `earliestDebitAt`.
- **Current** (D12) — **Setting autopay up pays the invoice in the same
  flow, where the method allows.** For UPI and card the authorisation's
  first payment is the invoice's: `createSetup` gets `firstAmountCents` =
  the invoice, and the invoice's PaymentIntent is recorded under the
  set-up's `setupReference` (the adapter must make that the provider order
  the first payment is taken on), so its capture webhook pays the invoice
  as a pay link's does. eMandate authorises for ₹0 after a normal payment.
  The customer comes back to `returnUrl`, a page on the business's own site
  (`sites/site-origin.ts`); a Razorpay window takes `clientParams`
  `razorpayOrderId`, `razorpayCustomerId` and `recurring: true`
  (`site-blocks/booking-flow/checkout.ts`). A plan joined online has no
  subscription until paid (DEC-062), so its set-up is kept on the draft's
  `planTerms.autopay` (`payments/join-autopay.ts`), a provider report that
  comes first is held there, and the mandate row is made when the payment
  starts the subscription (`subscriptions/plan-join-autopay.ts`). Code:
  `payments/autopay.service.ts`.
- **Current** (D12B, DEC-064) — **Nothing owed: UPI and card take the ₹1
  check, and it is refunded automatically.** A method whose authorisation
  must take a payment says its minimum on the mandate capability
  (`authorisationMinimumCents`; Razorpay UPI and card 100 paise) — never a
  literal in a service; eMandate names none and stays ₹0. `createSetup`
  with `firstAmountCents` 0 sends that minimum and records it as an
  AUTHORISATION PaymentIntent on no order or invoice
  (`checkForMandateId` = the set-up), under the provider order its payment
  is made on (`MandateSetupResult.paymentReference`, else
  `setupReference`). Its capture — the webhook, or `refresh` finding the
  payment (`ProviderMandate.setupPayment`) when the webhook is lost —
  reserves one refund keyed per payment (`CHECK_REFUND_KEY`) with its
  `payments.send-refund` job on the same transaction; the job looks before
  it sends and sends under the refund's id (DEC-026), and `refund.*`
  settle it (matched by the check's own intent, since it has no order or
  invoice). It is never a sale: no invoice, no credit note, and the
  calendar's fees leave out `purpose` AUTHORISATION. A set-up that fails
  after the capture is refunded all the same. Code:
  `payments/authorisation-check.ts`.
- **Current** (D14) — **Staff send a set-up link: the provider's hosted
  page for one method they pick.** `POST subscriptions/:id/autopay/link`
  (`subscription:write`) makes a PENDING mandate with `handoff`
  `HOSTED_LINK` (Razorpay: a registration link), `setupSource`
  `SETUP_LINK`, a week to approve (`LINK_SETUP_TTL_MS`) and a limit over
  the larger of the price, a booked plan change and any unpaid invoice —
  so a link sent after MANDATE_LIMIT_LOW covers the renewal that didn't
  fit. The picker lists every method the account offers (DEC-059); nothing
  is owed on the link, so UPI and card take the ₹1 check (DEC-064). No
  `callback_url` is sent: the D11 spike never saw a registration link take
  one. The link is answered once and never stored (the log keeps the
  mandate id); emailing it goes through D17's transactional path
  (`AUTOPAY_SET_UP_LINK`, the link sealed into the job like a pay link).
  403 while `mandateMethods` is empty — the provider can't, or its rollout
  flag is off. "Cancel autopay" (`…/autopay/cancel`) is `cancelFor` with
  reason STAFF and the team member as the event's actor, and never waits on
  the flag. Code: `subscriptions/subscription-autopay.service.ts`.
- **Current** — **The refund webhook settles at the provider's amount**
  (#508 U2). Adapters normalise the refunded amount in paise, Saroh's
  reference and a `REFUND_FAILED` outcome (Razorpay `refund.failed`; Cashfree
  CANCELLED, FAILED or REJECTED). `settleRefund` matches by provider refund
  id, then by Saroh's reference on the same order or invoice, under the
  row's lock; only an unmatched success (a dashboard refund) makes a row, at
  the event's amount. Whichever of the webhook and the refund path attaches
  the provider's id writes the REFUND step, so it is written once. A failed
  refund moves a PENDING row to FAILED — no credit note, the order as it
  was. Razorpay: only `refund.processed` is money back (`refund.created` can
  still fail). Its docs' `refund.*` payloads carry the refund entity with
  `amount`, `receipt` and `notes`, and `payload.payment.entity.order_id`;
  Saroh reads the reference from `receipt`, then `notes.saroh_refund_id`.
  Not yet confirmed against a live or test-mode delivery — if a delivery
  lacks both, the row stays PENDING until try-again's lookup settles it.
  Cashfree reports one refund more than once (PENDING, then SUCCESS or
  CANCELLED), so its inbox key carries the status; its `order_id` and
  `refund_amount` (rupees, parsed as decimal text) are on `data.refund`.
- **Adopted** — **Classify every negative outcome** — genuinely empty, provider
  error, rate limited, not configured — and never let a failed or partial call
  become "nothing found" or "done". Gap: refund and mandate calls classify
  their failures (`RefundCallError`, `MandateCallError`, above); every other
  provider call throws a plain error,
  and a refund's `status` is still the provider's raw string. There is no
  shared outcome classification.
- **Adopted** — **No fallback that can produce a plausible wrong answer.** When a
  wrong result is costly, fail loudly. Not audited across adapters.

## Saroh billing on Razorpay Subscriptions (U15) — **Current**, unverified

Saroh charging a business for its plan goes through `BillingProvider`
(`modules/billing/providers`), never the merchant port. U15 adds an optional
`plans` capability (provider plan objects, made once per catalogue row ×
cycle and looked up by Saroh's reference before a retry makes another),
subscriptions on a provider plan with `start_at` and an upfront charge, and
cancel now or at the cycle's end. Adapters throw `BillingProviderError`
(`REFUSED` a 4xx, `UNKNOWN` anything that may have worked) and keep only the
HTTP status. The fake (`providers/fake.provider.ts`) implements all of it.
**Not yet run against Razorpay test mode**: the open questions and the
assumptions made are listed in `docs/architecture/PRICING_ROLLOUT.md` →
"Razorpay test-mode spike". The webhook inbox applies an event in the same
transaction as its row and ignores one older than the last applied
(`Subscription.providerEventAt`).

## Media storage — **Current**

One R2 bucket per environment in the Saroh labs Cloudflare account:
`saroh-media` (`media.saroh.in`) and `saroh-media-dev` (`media.saroh.io`),
each with its own Object Read & Write key that can't reach the other. With
the `R2_*` variables unset the API falls back to in-memory storage and the
admin health page says so; a deployed API must not run that way.

- **Public by address, never listable.** Everything in these buckets is meant
  to be seen (logos, site and product images). Keys are server-built and carry
  a random UUID, so a file can't be guessed. **Nothing private goes in them**
  — invoices, customer documents or ID proofs need a separate private bucket
  with no public domain, served through short-lived signed GETs after an
  access check.
- **Images and videos only.** The allowlist is JPEG, PNG, WebP, GIF and AVIF;
  MP4 and MOV join under the video purpose. No documents, no text, no SVG.
  On completion the first bytes must be the format the type says, or the
  upload is marked FAILED and its object deleted.
- **A presigned upload fixes its type and size.** The adapter signs
  `content-type` and `content-length`, so R2 refuses any other. When a test
  fakes the presigner, keep one that signs for real and reads the URL.
- **CORS allows only the uploader's origin**, PUT, `Content-Type`. Images are
  shown with plain `<img>` and fetched server-side by Next, so no GET rule.
  An app that starts uploading gets its origin added then.
- `r2.dev` access stays off; the custom domain is the only public way in.
- **Same parent domain, for now (5 Oct 2026).** Media is served from
  `media.saroh.in` rather than a separate domain (the way Google uses
  `googleusercontent.com`). With images and videos only, signed types, byte
  checks and the sandbox headers, a separate domain adds little. Revisit it
  if Saroh ever accepts other file types. Stored URLs (`logoUrl`, site
  content) would then need rewriting, so it is cheapest early.
- **The media domains can't run a page.** A Cloudflare response-header rule
  on `media.saroh.in` and `media.saroh.io` sets `Content-Security-Policy:
default-src 'none'; img-src 'self'; media-src 'self'; sandbox` and
  `X-Content-Type-Options: nosniff`, so even a mislabelled file is inert.

## Razorpay recurring payments (D11 spike) — **Current**

Test mode, 2026-09-29, on a business's own connection (Northwind). Docs:
[authorisation](https://razorpay.com/docs/api/payments/recurring-payments/upi/create-authorization-transaction/),
[subsequent payments](https://razorpay.com/docs/payments/payment-gateway/s2s-integration/recurring-payments/upi/subsequent-payments/),
[tokens](https://razorpay.com/docs/api/payments/recurring-payments/upi/tokens/),
[webhooks](https://razorpay.com/docs/api/payments/recurring-payments/webhooks/).

- **Objects.** A mandate is a **token** (`token_…`) on a **customer**
  (`cust_…`), made by an authorisation payment on an order carrying a
  `token{max_amount, expire_at, frequency}` block. Not a Razorpay
  Subscription. Saroh keeps `providerCustomerId` and `providerMandateId`
  (the token id). A registration link (`POST
/subscription_registration/auth_links`, `inv_…`) gives a hosted
  `short_url`; the paid link's payment names the `token_id` and
  `customer_id`, so the token is found without a webhook.
- **One method per authorisation.** An order carries `upi`, `card` or
  `emandate` (`nach` needs a paper form: out of scope). Without one,
  Checkout with `recurring: "1"` shows cards only.
- **First payment.** UPI and card: a real charge of at least ₹1 (captured;
  in test mode its fee was more than the amount). eMandate: ₹0. D12 makes
  the invoice's payment the authorisation's own.
- **The charge is two-phase for UPI.** `POST /payments/create/recurring`
  on an order without `notification` answers 400. The order must carry
  `notification{token_id, payment_after}` with `payment_after` at least 25
  hours ahead ("Debit can be attempted 25 hours after sending the pre-debit
  notification"); the debit asked before the notice is delivered answers
  400 `pre_debit_notification_not_sent` (`NOT_YET`). **Razorpay sends the
  pre-debit notice** to the customer's UPI app; Saroh sends none. A
  renewal's invoice must be raised at least ~26 hours before its charge.
- **Unanswered charges.** A UPI debit can take 24–36 hours to be answered,
  more when the notice fails; some banks leave the payment `created`.
  Razorpay doesn't retry a failed debit on an order with `notification`;
  don't create another debit until the previous one is answered.
- **Webhook events** to subscribe to: `token.confirmed` (ACTIVE),
  `token.rejected` (FAILED), `token.paused` (PAUSED, UPI only),
  `token.cancelled` (CANCELLED), `order.notification.delivered` /
  `.failed` (the notice), `payment.authorized` / `.captured` / `.failed`,
  `order.paid`, and `invoice.paid` / `.expired` for a registration link.
  The docs have no `token.resumed`: a resumed mandate is expected as
  `token.confirmed` (not yet seen).
- **Displayable.** The token's `vpa{username, handle}` → a masked hint
  (`te•••@razorpay`); a card token's last four.
- **Limit and headroom.** UPI `max_amount` is ₹1–₹99,999 for most
  businesses; Razorpay advises keeping it near the real charge. Saroh asks
  for `mandateLimitCents(price)`: half again, rounded up to ₹100
  (`mandate-rules.ts`); an invoice above it isn't charged (D13).
- **Cancel** is `PUT /customers/:c/tokens/:t/cancel`, confirmed by
  `token.cancelled`; `DELETE …/tokens/:t` does not cancel the mandate and
  is never used.
- **The adapter** (D19, `providers/razorpay-mandates.ts`). Set-up has two
  handoffs. **`CHECKOUT`** (the default; D12's window on the business's
  site): `POST /customers` (`fail_existing: "0"`), then the authorisation
  order `POST /orders` with `method`, `customer_id`, `receipt` = the
  mandate id and `token{max_amount, expire_at, frequency}` (no frequency
  for eMandate), for `firstAmountCents`. `setupReference` = that
  `order_…`, so for UPI and card the invoice's intent is recorded under it
  and one `payment.captured` pays the invoice and links the token;
  `clientParams` = `razorpayOrderId`, `razorpayCustomerId`,
  `recurring: true`, `method` and `callbackUrl` (the `returnUrl`, sent as
  Checkout's `callback_url`). **`HOSTED_LINK`** (a set-up link sent to the
  customer, D13/D14): a registration link (`setupReference` = its
  `inv_…`); no `callback_url` is sent to it until a test-mode run shows
  the API takes one. `get` reads the token, or before one is known the
  order's (or link's) payment → the token. `prepareCharge` first looks
  for its order by `receipt` (the charge key), so a retry never makes a
  second; UPI orders carry the notice, card and eMandate orders none
  (`NOT_NEEDED`, still to confirm). `charge` first reads the order's
  payments, so a retry never debits twice. A refused cancel is re-read:
  a token already cancelled is a success. Errors keep only the HTTP
  status and Razorpay's `reason` code.
- **Webhooks** (D19, `webhooks/providers/razorpay-mandate-events.ts`).
  `token.confirmed` / `.paused` / `.cancelled` / `.rejected` → MANDATE
  ACTIVE / PAUSED / CANCELLED / FAILED by the token id;
  `invoice.expired` → FAILED by the link; `order.notification.*` →
  PRE_DEBIT by the charge order; a recurring charge's `payment.captured`
  / `.failed` settle its order's intent as any pay link's. **Token events
  name no customer, order or link**, so an authorisation's
  `payment.captured` (or `invoice.paid`) carries a `mandateLink` that
  writes the token id onto the PENDING mandate it paid for; a token event
  that arrived first (acknowledged, nothing written) is then read again
  from the inbox and applied (`webhooks/mandate-link.ts`). The link runs
  after the payment's own effect, so a plan joined with autopay has its
  mandate row made by that payment first, and the look-back starts when
  the set-up did (`setupExpiresAt` − the set-up TTL), not when the row was
  made.
- **Still open** (D19's test-mode run): the notice's delivery and the debit
  after `payment_after` in test mode, a debit above `max_amount`, a cancel
  answered twice, and whether card and eMandate debits need the notice
  step at all — the port lets a method answer `NOT_NEEDED`. The ₹0 UPI
  or card authorisation question is settled: with nothing owed the set-up
  takes the ₹1 check and refunds it (DEC-064, above); still to see in test
  mode is the check's own `refund.processed` delivery.
