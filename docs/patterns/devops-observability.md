# Observability

> **Read when:** adding logging, a fallback or degraded path, a health check, or
> error tracking.
> Adapted from claude-patterns `devops/04-observability.md`.

## In place — **Current** (`apps/api.saroh.in/src/common/logging`)

- **Correlation ids.** `correlationIdMiddleware` reads `x-request-id` or
  `x-correlation-id`, keeps it in `AsyncLocalStorage`, and returns
  `X-Request-Id`; error responses carry `correlationId`.
- **One structured line per request** from `LoggingInterceptor`, and
  `structuredLogger` for JSON events such as `api_started`.
- **Redaction** by denylist in `redact.ts`: `authorization`, `cookie`,
  `set-cookie`, API keys and sensitive fields never reach the sink.
- **5xx errors** are logged server-side with the stack and redacted headers; the
  client gets a generic message.
- **Health:** `GET /health`, `/health/live` and `/health/ready`. Readiness fails
  on an unreachable database, an unfinished migration and an unreadable job
  queue.
- **Activation metrics** go through the versioned analytics event contract only —
  never free-form logs, never customer identifiers (18 §3).
- **A business's way out is one grep** (#921): every provider call made
  while it is closing or after it is deleted — a refund's send, Saroh's
  billing cancel, a custom hostname or stored file removed, the autopay
  mandates read, keys removed — logs
  `deletion_provider_call org=… provider=… call=… result=… ref=…`
  (`organizations/deletion-provider-log.ts`): INFO when it worked, WARN
  when not, every value squeezed to an id's characters, so no personal
  data, card data or key can ride along. The steps and their results are on
  the admin ledger and the console's deletion trail.
- **What a legal hold stopped is in the log too** (DEC-122), ids only,
  WARN: `organization_deletion_cleanup_held org=… reason=legal-hold`
  (a clean-up stood aside), `organization_deletion_cleanup_step_held
org=… step=…` (a hold landed mid-run),
  `organization_retention_erase_held org=…` (the eraser stopped), and the
  deletion sweep's and the eraser's summary lines carry `held=<count>`. A
  steady `held` count is expected while a hold lasts; a `…_step_failed`
  line is the one to act on.
- **The retention jobs log counts only**: `organization_retention_erase
erased=… more=… failed=… waiting=… held=…` with business ids, one
  `organization_retention_erase_one org=… <step counts>` per business, and
  `security_logs_retention deleted=… <Table>=…`. Never a name, an address
  or an email.

## Rules

- **Current** — Log with the class `Logger` or `structuredLogger`, with
  identifiers (request, organization, job, external id) — never payloads, never
  `console.log` (none in `modules/`).
- **Adopted** — **Every degraded path logs at a level someone watches and says
  what volume means,** beside the code. Current for the job queue (lease lost:
  WARN; no handler: ERROR); not audited elsewhere.
- **Adopted** — Levels: ERROR when a user-visible operation failed or an invariant
  broke; WARN when a degraded path was taken; INFO for state transitions worth
  reconstructing.
- **Adopted** — Frontend boundaries show `error.digest` and log the error. Gap:
  `app.saroh.in/app/error.tsx` does not show the digest.

## How long logs are kept — **Current** (DEC-122)

The Privacy Policy: security logs (IP address, browser, sign-in times,
errors) are kept one year.

- **In the database, the API enforces it**: `SECURITY_LOG_RETENTION_DAYS`
  (365) in `apps/api.saroh.in/src/modules/organizations/retention.ts`, and
  the daily `security-logs.retention` job (`backend-jobs.md` → Retention)
  for sign-in sessions, customers' site sessions and sign-in codes, and the
  older store logs. The audit trails are records and are not pruned.
- **Outside the database, nothing in this repository sets it.** The API's
  own log is the container's stdout on its host: how long it is kept is the
  host's (Coolify's and Docker's log rotation). Requests and errors at the
  edge are Cloudflare's logs: their retention is the Cloudflare account's
  (Workers Logs, and Logpush if it is ever turned on). Whoever changes
  either sets it to match the policy and writes it down in the host's own
  runbook, which is not in this public repository.

## Error tracking and product events: PostHog — **Current** (DEC-125)

What is sent from where, the scrubber's rules, the limits and how to switch
it on: `docs/architecture/ERROR_TRACKING_AND_UPTIME.md`. The rules a change
must keep:

- **Off without a key.** No SDK loaded, no client made, nothing sent. A new
  call site never needs its own "is it on" check: it calls the seam.
- **Errors go through the seam, never straight to an SDK.** The API:
  `reportError()` and `reportJobError()`
  (`src/common/observability/report-error.ts`); only `posthog.ts` beside it
  imports `posthog-node`. The frontends: `reportError()` from
  `@saroh/ui/lib/report-error` in a boundary, and nothing else; each app's
  `instrumentation-client.ts`, `instrumentation.ts` and `worker.ts` do the
  rest.
- **Merchant sites report from the server only.** Nothing of PostHog's in
  `apps/saroh.app` or `packages/site-blocks` beyond the server reporter:
  `pnpm run check:merchant-site-tracking` fails the gate.
- **One scrubber**, `@saroh/error-tracking`. Send ids and route templates,
  never a body, a header, a query string, a name, an email, a phone number
  or an amount. A new fact beside an error goes through `scrubContext`.
- **A product milestone is sent by the API, once, from the activation
  ledger** (`modules/analytics/product-milestones.ts`). The list is nine
  events and is closed: a tenth is the owner's decision, not a call site's.
  Never capture a product event from a browser.
- **Session replay is the workspace's signed-in shell only**, masked, and
  off by default. Mark customer data that isn't text with `data-ph-block`
  (`frontend-design-system.md` → Session recordings).
- **Degraded paths it adds, and what volume means:**
  `posthog_send_failed` (WARN): PostHog refused a batch or couldn't be
  reached; a steady stream means the key or host is wrong, or PostHog is
  down. `error_sink_failed` (WARN): the forwarder itself threw; any at all
  is a bug in it. `posthog_environment_missing` (ERROR, once at boot): the
  host has a key and no `POSTHOG_ENVIRONMENT`, and nothing is being sent.
  `product_milestone_not_sent` (WARN): the ledger has the milestone and
  PostHog's copy is missing. `job_failed_final` (ERROR): a job failed its
  last attempt; any at all is worth a look.

## Not in place yet

- **No source maps at the tracker**, so a browser stack names built files.
  `ERROR_TRACKING_AND_UPTIME.md` → Later.
- **No uptime monitor** on `/health/ready`, and no log-based alerting. Same
  document.
- **No post-deploy watch list.** Start one in a runbook: error rate before and
  after, readiness, job backlog and the age of the oldest unclaimed job, and the
  two job signals above.
