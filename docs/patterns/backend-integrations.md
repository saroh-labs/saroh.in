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

- **Current** — **Merchant payments and Saroh billing never share** records,
  credentials, webhooks or contracts (DEC-010).
- **Current** — **The Organization connects its own messaging provider** for real
  sends; Saroh-owned email is only for identity mail and a template test to the
  signed-in user's own verified address (DEC-011).
- **Current** — **Credentials are encrypted at rest** (AES-256-GCM,
  `payments/crypto.ts`) and never returned; reads are redacted views.
- **Current** — **Adapters sanitise errors:** never surface an auth header, a
  credential or the raw provider body (`CommsProvider` contract).
- **Current** — **Verify before you parse.** A webhook's signature is checked
  against the raw body before anything in it is trusted; a missing secret or a
  bad signature is a 401 and writes nothing.
- **Current** — **Inboxes are idempotent.** `(provider, providerEventId)` is
  unique, so a duplicate delivery hits P2002 and returns 200 without moving state
  twice. Reconciliation follows a state machine that rejects illegal
  transitions.
- **Current** — **Stored provider payloads are for verification and audit,**
  never read on a serving path (`WebhookEvent.payload`).
- **Current** — **The server derives amounts.** A payment intent's amount comes
  from the Order, never from the request.
- **Current** — **Consent gates the send.** A revoked consent makes a message
  `SUPPRESSED`: no job, no delivery.
- **Current** — **Storage keys are server-derived and tenant-scoped**
  (`org/<organizationId>/…`), and uploads are presigned PUTs checked against a
  content-type allowlist and a size cap.
- **Current** — **Health has more than two values.** `provider-health` reports
  `NOT_CONFIGURED`, `PENDING`, `ACTIVE`, `DEGRADED` or `FAILED` from persisted
  state, never a live probe carrying secrets, and each state maps to where to fix
  it.
- **Adopted** — **Classify every negative outcome** — genuinely empty, provider
  error, rate limited, not configured — and never let a failed or partial call
  become "nothing found" or "done". Gap: results carry provider ids, failures
  are thrown, and a refund's `status` is the provider's raw string; there is no
  shared outcome classification.
- **Adopted** — **No fallback that can produce a plausible wrong answer.** When a
  wrong result is costly, fail loudly. Not audited across adapters.
