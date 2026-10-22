# External providers and webhooks

> **Read when:** calling a payment, billing, messaging or storage provider;
> adding an adapter; receiving a webhook; or reporting a provider's health.
> Adapted from claude-patterns `backend/06-external-integrations.md`.
> Decisions: DEC-009 (storage), DEC-010 (payments), DEC-011 (communications).

## Ports and adapters — **Current**

Every provider sits behind a port, with adapters under the module's
`providers/` directory and a fake for tests.

| Port               | Where                     | For                                                                                                                                                    |
| ------------------ | ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `MerchantProvider` | `modules/payments`        | An Organization's own customer payments — Razorpay and Cashfree                                                                                        |
| `BillingProvider`  | `modules/billing`         | Saroh charging the Organization                                                                                                                        |
| `WebhookProvider`  | `modules/webhooks`        | Signed inbound events                                                                                                                                  |
| `CommsProvider`    | `modules/communications`  | Email and WhatsApp adapters, chosen by a factory per channel                                                                                           |
| `ObjectStorage`    | `packages/object-storage` | Media, with an R2 adapter and an in-memory adapter; `putObject` and `readObject` for what the server writes and copies itself (a data export, DEC-120) |
| `DomainHosting`    | `modules/domains`         | A verified custom domain's hostname on Cloudflare for SaaS                                                                                             |

`DomainHosting` (#859) registers a domain's hostname as a custom hostname on
the merchant-sites zone once its TXT check passes, and deletes it there
before the Domain row goes (a failed delete is a 503 and removes nothing). A
failed call never undoes the verification: the row stays VERIFIED with
`hostingStatus` and `hostingError` in words, and the next check retries.
The next check is "Check now" or the `domains.recheck` chain (#860,
`backend-jobs.md`), which asks Cloudflare often until a domain is live and
daily after, at most 50 domains a run and stopping on repeated failures.
Either one moving a live domain to a problem, or back, tells the team once
per incident (#917, `team.alert` `domain`).
With `CLOUDFLARE_HOSTNAMES_TOKEN` or `CLOUDFLARE_HOSTNAMES_ZONE_ID` unset the
port is null, a WARN says so at boot, and the read says `hosting.state: "OFF"`
(`domain-hosting-sync.ts`).

A bare domain (`example.com`) is connected through `www` (DEC-140): the
claim turns it into `www.<domain>` unless its DNS already reaches the
hosting, and every check of a verified `www` domain also looks at its bare
domain and stores where it stands (`bare-domain.ts`, `bare-domain-sync.ts`,
`bare-forwarding.ts`). "Is it bare" is the Public Suffix List's answer
(`tldts`), never a list of suffixes kept here. The look is a notice: it never
changes the `www` domain's verification or hosting. Its requests go to a host
a merchant typed, so they use the link-preview guard and read no body.

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
  saroh.in's free tools share one email budget, `waitlist/tool-email-cap.ts`
  (3 a UTC day to an address, 300 a day in all): a new tool's gate claims
  from it rather than counting its own. The QR code maker's email
  (`tools/qr-maker-email.ts`) takes no input at all, because the API never
  receives what the visitor typed.
- **Current** (10 Oct 2026) — **A sentence the API writes formats its
  amount, day and time through `src/common/words-format.ts`**, the API's
  twin of the app's `lib/format`: `moneyWords` and `moneyWordsMinor`
  ("₹1,250", "₹1,250.50", Indian grouping, paise only when there are
  some), `dayWords` ("12 Oct", "12 Oct 2025", "Mon 12 Oct"), `timeWords`
  and `clockWords` ("9:30 am") and `whenWords` ("12 Oct, 9:30 am"). Every
  caller passes its own time zone: the business's for its notices, India's
  for Saroh's own billing mail. A notification, an email, a customer's
  notice, a Home row or a refusal never calls `Intl`, `toLocale…` or
  luxon's `toFormat` for words: `words-format.spec.ts` fails a file on the
  email and notification paths that does. A printed invoice's own columns
  (`paperMoney`, `paperDay`) are a document and stay with the paper, and a
  field the app formats itself (Home's `time`, the timetable's "HH:mm")
  stays a value. The words follow `saroh-product.md`: no long dash or
  semicolon, business, location, a time (never a slot), Try again.
- **Current** — **A stranger's host name is resolved off the thread pool.**
  Never `dns.lookup` (getaddrinfo on libuv's four threads) for an address a
  visitor typed: use `dns.promises.Resolver` with a short timeout and one
  try, cap how many such fetches run at once, and answer a typed "busy"
  past it (`link-preview/ssrf-guard.ts`). Any other fetch of a host a
  merchant or visitor named goes through the same guard (`checkUrl`,
  `resolveTarget`, `pinnedLookup`), each redirect included: the bare-domain
  check does (`domains/bare-forwarding.ts`).
- **Current** — **Merchant payments and Saroh billing never share** records,
  credentials, webhooks or contracts (DEC-010).
- **Current** — **The Organization connects its own messaging provider** for real
  sends; Saroh-owned email is only for identity mail and a template test to the
  signed-in user's own verified address (DEC-011). A business's customers
  are never emailed from Saroh's address: with no provider of its own, they
  are not emailed (DEC-086 reversed; its code removed in #1134, and
  `no-saroh-customer-mail.spec.ts` keeps it out).
- **Current** — **Settings → Providers is one row per provider, connected
  first** (DEC-036): a disconnected one stays listed as theirs, only what the
  API can connect is offered, and a row shows only what the API sends as
  public (a checkout's public key, a sending address), never a credential.
  Disconnecting a payment provider's confirm says it cancels none of the
  customers' autopay memberships there, with how many are active (owner,
  9 Oct, #921: `activeMemberships` on the list,
  `lib/payments/memberships-warning.ts`).
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
  again clears it, and so does a live call the provider accepts on the
  flagged row (`paymentProviderWorks`, `commsProviderWorks`); either
  queues the team's "working again" alert on the same transaction, told
  only when the stop was (#555, `notifications/provider-alerts.ts`: once
  per incident, bell and Saroh's email on the Payment failed row, fixed
  words, Settings › Providers). Only these two live calls flag today: a
  checkout's provider order and an email's send. A refund, a mandate call
  or a payment look-up that gets a 401 flags nothing yet. A provider order that fails at checkout is a deliberate
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
- **Current** — **Inboxes are idempotent, per business.** The merchant inbox
  (`WebhookEvent`) is unique on `(organizationId, provider, providerEventId)`
  (PAY-05), so a duplicate delivery hits P2002 and returns 200 without moving
  state twice, and another business can never claim an event id first. Saroh's
  own billing inbox (`BillingWebhookEvent`) has no business in its URL and
  stays `(provider, providerEventId)`. Reconciliation follows a state machine that rejects illegal
  transitions.
  A merchant delivery is stored, answered 200 and then applied: its row
  commits with a `webhook.process` retry job, the request tries once, an
  unexpected error is left to the job's backoff, and a 4xx refusal or the
  last try keeps the row FAILED for replay. Only a row that could not be
  stored is a 5xx, because a provider switches off a webhook that keeps
  failing (`webhooks/webhooks.service.ts`).
- **Current** — **Stored provider payloads are for verification and audit,**
  never read on a serving path (`WebhookEvent.payload`).
- **Current** — **A capture is compared before it pays anything** (PAY-06).
  Adapters normalise what the provider captured in paise
  (`capturedAmountCents`, Razorpay's `amount` as is, Cashfree's rupee
  `payment_amount` read as decimal text) and its currency. A webhook, a
  checkout return, the pending sweep or an autopay charge's look-up whose
  amount or currency differs from the intent's never marks the order or
  invoice paid: the capture is recorded once as `CAPTURED_NEEDS_REFUND`
  (`rawResponse.invoiceStatus` AMOUNT_MISMATCH, both figures), logged, and an
  open intent fails as a decline does (`payments/capture-mismatch.ts`). A
  look-up must report the amount; a signed webhook that carries none is
  settled on the provider order's own amount. Such a capture is the
  attempt's to refund, never the order's: Home lists it until refunded and
  offers Refund, which sends exactly what was captured against that payment
  as a PaymentRefund keyed `amount-mismatch:<attempt>`, touching no order,
  invoice or credit note; its refund webhook (Saroh's, or a dashboard
  refund matched by payment id) settles on that row before the order's
  refund path (`payments/mismatch-refund.ts`).
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
  The pay link pages (`/pay/<token>` for an invoice, `/pay/o/<token>` for
  an order) open the same window through the same helper
  (`PayLinkPay`, `site-blocks/src/pay-link/`): Pay starts the intent on the
  site's server, the window opens on it, and after "paid" the page re-reads
  itself until the server says so. A new page that takes money opens
  `openProviderCheckout`; never a second provider integration, and never
  the handoff drawn on the page.
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
  EMAIL provider (409 otherwise), no marketing opt-in, and a revoked email
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

**DEC-093 adds** (`checkout.service.ts`, `checkout-confirm.service.ts`):

- **How many charges.** A monthly subscription is made with `totalCount`
  set to the catalogue's `autopay.charges` for the plan's version (DEC-161;
  12 today, at most 1,200, the most Razorpay accepted in test mode; the
  adapter's open-ended 120 is only a fallback). An amount is never changed
  in place: a new price is a new subscription the business authorises. A yearly plan is a one-time
  Razorpay **order** (`orders` capability, `POST /orders`), stored where a
  subscription id would be, with `providerPlanId` `"one-time"`; its
  `order.paid` webhook reads as the charge. **Saroh's Razorpay webhook must
  subscribe to `order.paid`** as well as the `subscription.*` events. An
  order has nothing to cancel: the adapter asks Razorpay nothing for one.
- **Razorpay's own window, not its hosted page.** The checkout answers a
  `handoff` (the key id — public — the subscription or order id, and the
  owner's email, business name and phone pre-filled); the app opens
  Checkout over the page (`razorpay-window.ts`). The hosted page link stays
  as the fallback when the window can't open.
- **Back from paying, ask the provider.** `POST …/billing/checkout/confirm`
  reads the OPEN checkout's subscription or order (`statuses` capability:
  `GET /subscriptions/:id`, `GET /orders/:id` and its payments) and
  reconciles it by the webhook's own rule
  (`BillingWebhookService.reconcileCheckout`), under the subscription's and
  the checkout's row locks — so the plan moves without the webhook, and
  whichever of the two lands second changes nothing (the invoice is keyed
  once per charge). Rate-limited per business; an unanswered call is
  "still waiting", never a reason to pay again.
- **The billing profile as Razorpay's customer: one per profile (DEC-167,
  owner, 18 Oct 2026; it replaced DEC-165's one per business, which
  Razorpay's email-and-phone rule left 17 of 32 saroh.io businesses
  without)** (`billing-customer.ts`, `customers` capability). A business is
  billed to one `BillingProfile` (owned by a user; legal name, GSTIN,
  address with state, billing email, phone), which keeps the customer's id;
  every checkout, subscription and Saroh invoice copies it, with the
  profile's id beside it. It is never looked up by email or phone.
  Settings › Business is the business's own seller identity and is
  separate: saving it touches no customer.
    - **Made** by the `billing.profile.sync` job (`billing-profile-sync.ts`),
      queued in the transaction that made or saved the profile: `POST
/customers` with the profile's legal name, billing email, phone and
      GSTIN, `notes` holding only what never changes (`billing_profile_id`,
      `saroh_owner`, and `saroh_business`: the first business's slug; notes
      are create-only, so a billing snapshot there would go stale — it stays
      on each subscription's or order's notes), and `fail_existing: "1"`.
      Razorpay refuses a second customer with the same email and phone (400
      "Customer already exists for the merchant", checked in test mode 17
      Oct 2026). Saroh then asks which one with `fail_existing: "0"`: **its
      notes name this profile** (an earlier try whose answer was lost), or,
      made per business before profiles, one of its businesses — it is
      adopted; **anyone else's** and this one is made **without the phone**
      (`contactWithheld`; the phone stays in Saroh). Never adopted by email
      or phone alone. An owner's two profiles can't share a billing email
      (the service asks before saving; the database holds it unique per
      owner).
    - **Adopted, not made twice**: a profile whose businesses paid before
      DEC-165 has the customer Razorpay made at payment (their
      `Subscription`, else latest `BillingCheckout`, `providerCustomerId`).
      The job checks it with `GET /customers/:id`, skips one another profile
      holds or whose notes name another, adopts it and sends the current
      details by `PUT`.
    - **Never lost**: the advisory lock's transaction (per profile) only
      holds the lock (`SET LOCAL lock_timeout`); each id is stored the
      moment Razorpay answers it, on its own connection, only where none is
      stored.
    - **Kept current**: saving the profile (and a checkout's details step,
      which writes the profile) queues the same job, at most one waiting
      per profile; it sends `PUT /customers/:id` with the name, email,
      phone and GSTIN. **The address can't be updated**: the current
      address is on each subscription's or order's notes and on Saroh's
      invoice. An account email change or a change of owners touches no
      customer: the profile holds its own billing email. A profile's owner
      who stops being an owner of a business on it leaves billing as it is
      and raises one Needs action (`billing_profile_owner_left`,
      `billing-profile-owner.ts`). A `PUT` refused because the email and
      phone are another customer's is sent again without the phone; any
      other refusal is an admin note (`billing_customer_refused`) on each
      business on the profile, once until it is fixed.
    - **A checkout** uses the profile's stored id, and makes the customer
      then only when the job hasn't (under the same per-profile lock):
      `customer_id` on `POST /subscriptions`, and on the window for an
      order. A business with no profile can't check out until an owner
      chooses one. A refusal is logged (`billing_customer_refused`) and the
      checkout goes on with the notes and the prefill; a provider that
      can't answer stops the checkout with a 503 "try again" **before** the
      subscription is made — made without `customer_id`, Razorpay would
      make a second customer of its own.
    - **No keys, nothing asked**: where Saroh's Razorpay key id and secret
      aren't set (local, CI) the job skips (`billing_customer_skipped`, a
      warning in production) and the first checkout there makes it. A
      provider that can't answer is retried by the queue (10 tries; a 429
      is asked again after its `Retry-After`, at most 10 s, twice, in the
      adapter's `call`); the last error is kept on the profile
      (`lastError`), a refusal logged and not retried. DEC-165's queued
      `billing.customer.sync` jobs still run: their handler syncs the
      business's profile.
    - **Profiles from before**: `backfill/billing-profiles.cli.ts`
      (`packages/database`) queues the job for every profile without a
      customer and counts the businesses left without a profile;
      idempotent. Its order in a release: `PRICING_ROLLOUT.md` step 10.
    - **Admin**: the subscription sheet shows the profile, its customer and
      the other businesses on it; a `cust_` search finds every business on
      the profile; "Sync again" queues `billing.profile.sync` for it.

**After Saroh lets go (17 Oct 2026, DEC-164)**: a subscription is made with
`expire_by` (the checkout's `expiresAt`); a refused cancel asks
`statuses.subscriptionStanding` (`GET /subscriptions/:id`) and is retried
rather than dropped — Razorpay cancels only an active or authenticated
subscription; and a double charge is refunded through the `refunds`
capability (`POST /payments/:id/refund` with no amount, the whole payment,
its notes `saroh_ref`, `organizationId`, `saroh_subscription` and
`saroh_reason: double_charge`, so Razorpay's refunds list says whose and
why; `GET /payments/:id` first, so a repeat never refunds twice). Its 4xx is
`REFUSED` carrying Razorpay's `error.description` (`BillingProviderError.said`),
which the owner's admin note quotes; it is never retried. The payment's
`amount` for the notes is read from the webhook's `payload.payment.entity`
(`double-charge.ts`, `double-charge-refund.job.ts`). What to verify:
`PRICING_ROLLOUT.md` › "Money after Saroh let go (DEC-164)".

**What Saroh keeps of Razorpay's ids, and what Razorpay keeps of Saroh's
(owner, 17 Oct 2026: "so that we can track payments easily and dont get
confused")**:

- Saroh keeps the Razorpay customer (`cust_…`) on the checkout, the
  subscription and each of its invoices (`providerCustomerId`); the
  subscription or order (`providerSubscriptionId`, an order's id for a
  yearly plan); and the payment on the invoice (`providerPaymentId`). A
  checkout completes with Saroh's customer, else the one the provider names
  (`customer_id` on the webhook's subscription or payment, or on
  `GET /subscriptions/:id`); a checkout that names none never clears the
  subscription's, and a move to Free keeps it.
- A subscription carries no payment id, so the return from paying asks
  `GET /invoices?subscription_id=` for the latest paid invoice's
  `payment_id` (checked in test mode, 17 Oct 2026); an order's comes from
  `GET /orders/:id/payments`. Still unknown, the charge's
  `subscription.charged` fills it in on the invoice already written (the
  same `chargeKey` or period), never a second invoice.
- Razorpay keeps Saroh's: once an invoice has its payment, the
  `billing.payment.notes` job sets the payment's notes
  (`PATCH /payments/:id`, notes only, at most 15 pairs,
  https://razorpay.com/docs/api/payments/update/) to `saroh_invoice` (the
  number), `organizationId` and `saroh_checkout`, keeping the notes it had.
  A failure is logged (`billing_payment_notes_failed`) and never touches
  the invoice; a refusal or the last of its 10 tries leaves an admin note
  (`billing_payment_notes_given_up`). Subscriptions and orders already carry `saroh_ref` (the
  checkout) and the business in their notes.

**Matching Saroh and Razorpay both ways (DEC-166, 17 Oct 2026)**:

- **Read back daily**: `reconcile.paidCharges` (`providers/razorpay-reconcile.ts`,
  the adapter's own GET handed in, so `call()` is untouched) reads a
  subscription's paid invoices (`GET /invoices?subscription_id=&count=100`:
  `payment_id`, `amount_paid`, `paid_at`) or an order's captured payments
  (`GET /orders/:id/payments`) for `billing.reconcile`.
- **Refunds and disputes arrive by webhook**: `parseWebhook` reads
  `payload.refund.entity` on `refund.*` and `payload.dispute.entity` on
  `payment.dispute.*` into `ParsedBillingEvent.refund` / `.dispute`; the
  webhook keeps them as `BillingRefund` rows. **Saroh's Razorpay webhook
  must subscribe to `refund.created`, `refund.processed`, `refund.failed`
  and `payment.dispute.*`** besides the subscription and order events.
- **Nothing is dropped silently**: an event that names a subscription or
  order no Saroh row has, or a charge Saroh can't match, is an ERROR log
  and a Needs-action row, and stays without `processedAt` ("Not applied"
  in Admin › Billing › Provider events). Other unmatched events (a
  `payment.*` Saroh doesn't use) are ignored as before.
- Unverified: the refund and dispute field names and statuses, and
  `amount_paid` on subscription invoices, until production's first case.

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
  upload is marked FAILED and its object deleted. A type outside the list
  (SVG, HEIC, text) is refused before anything is signed, and a logo takes
  PNG, JPG or WebP only — both in the merchant's words, from
  `media/upload-checks.ts`, not as a server error. Where the adapter
  `seesUploads` (R2), no bytes at all is a failed upload too; only the
  in-memory adapter of local development, which never sees the browser's
  PUT, lets an unread photo through (#873).
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
- **Card and eMandate pre-debit notice (D6, U21).** Card: the issuing bank
  sends the notice (SMS or email) when the debit is asked for, and Razorpay
  debits ~36 hours later (an AFA link instead above ₹15,000); the order
  needs no `notification`. eMandate: Razorpay and the bank send none (the
  RBI framework covers cards, PPIs and UPI only), so **Saroh sends it**
  (DEC-180, below); its order carries no `notification` either
  (`PRE_DEBIT_METHODS` stays UPI only). Evidence:
  `docs/architecture/research/2026-10-pre-debit-notice.md`, DEC-174.
- **eMandate: Saroh's notice, or no debit (DEC-180, #1175).** For an
  eMandate (`sarohSendsNotice` in `subscriptions/autopay-timing.ts`) the
  debit is planned at least `PRE_DEBIT_LEAD_HOURS` (26 h) after the
  charge is prepared, as for UPI (`needsNotice`, `prepareCharge` holds
  `debitAfter` to `debitAt` though the provider answers `NOT_NEEDED`).
  Once prepared, the charge job queues `customer.notify`
  `AUTOPAY_PRE_DEBIT` (`site-accounts/notices/pre-debit.ts`, keyed
  `pre-debit:<intentId>`) for 26 h before the debit (`sarohNoticeAt`):
  "₹X will be taken from your bank account on ‹day› for ‹plan›", through
  the business's own email provider, no switch. Before the debit it reads
  `preDebitNoticeState`: the email SENT, the debit goes no sooner than
  `SAROH_NOTICE_MIN_HOURS` (24 h) after it (a late email moves the debit);
  otherwise (no provider, no address, email turned off, not sent) the
  charge is CANCELLED, the subscription's history gets
  NOT_CHARGED_NO_NOTICE with `data.reason`, and the renewal invoice takes
  U10's auto-send. Card and UPI are untouched.
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
