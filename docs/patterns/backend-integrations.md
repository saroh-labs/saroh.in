# External providers and webhooks

> **Read when:** calling a payment, billing, messaging or storage provider;
> adding an adapter; receiving a webhook; or reporting a provider's health.
> Adapted from claude-patterns `backend/06-external-integrations.md`.

## Ports and adapters

Every provider sits behind a port, with adapters under the module's
`providers/` directory and a fake for tests.

| Port               | Where                     | For                                                |
| ------------------ | ------------------------- | -------------------------------------------------- |
| `MerchantProvider` | `modules/payments`        | An Organization's own customer payments            |
| `BillingProvider`  | `modules/billing`         | Saroh charging the Organization                    |
| `WebhookProvider`  | `modules/webhooks`        | Signed inbound events                              |
| `CommsProvider`    | `modules/communications`  | Business messaging                                 |
| `ObjectStorage`    | `packages/object-storage` | Media, with an R2 adapter and an in-memory adapter |

Merchant payments and Saroh billing never share records, credentials, webhooks
or contracts (DEC-010).

## Rules

- **Credentials are encrypted at rest** (AES-256-GCM, `payments/crypto.ts`) and
  never returned; reads are redacted views.
- **Verify before you parse.** A webhook's signature is checked against the raw
  body before anything in it is trusted. A missing secret or a bad signature is
  a 401 and writes nothing.
- **Inboxes are idempotent.** `(provider, providerEventId)` is unique, so a
  duplicate delivery hits P2002 and returns 200 without moving state twice.
  Reconciliation follows a state machine that rejects illegal transitions.
- **The server derives amounts.** A payment intent's amount comes from the
  Order, never from the request.
- **Empty is not success, and an error is not empty.** Classify every negative
  outcome — genuinely empty, provider error, rate limited, not configured — and
  never let a failed or partial call become "nothing found" or "done".
- **Health has more than two values.** `provider-health` reports
  `NOT_CONFIGURED`, `PENDING`, `ACTIVE`, `DEGRADED` or `FAILED` from persisted
  state, never from a live probe that carries secrets, and each state maps to
  the place to fix it.
- **No fallback that can produce a plausible wrong answer.** When a wrong result
  is costly, fail loudly.
- **Consent gates the send.** A revoked consent makes a message `SUPPRESSED`: no
  job, no delivery.
- **Storage keys are server-derived and tenant-scoped** (`org/<organizationId>/…`),
  and uploads are presigned PUTs checked against a content-type allowlist and a
  size cap.
- **Raw provider payloads are for debugging and replay,** never the serving
  path.
