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

## Not in place yet

- **No error tracker yet, but the seam is in** (#103). `AllExceptionsFilter`
  calls `reportError()` (`src/common/observability/report-error.ts`), and every
  frontend boundary calls `reportError()` from `@saroh/ui/lib/report-error`.
  Both log only until a tracker is installed. `ERROR_TRACKING_DSN` is the API's
  switch, off by default. What may be sent, the recommendation, and the
  decisions left are in `docs/architecture/ERROR_TRACKING_AND_UPTIME.md`.
- **No uptime monitor** on `/health/ready`, and no log-based alerting. Same
  document.
- **No post-deploy watch list.** Start one in a runbook: error rate before and
  after, readiness, job backlog and the age of the oldest unclaimed job, and the
  two job signals above.
