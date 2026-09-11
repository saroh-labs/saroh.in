# Observability

> **Read when:** adding logging, a fallback or degraded path, a health check, or
> error tracking.
> Adapted from claude-patterns `devops/04-observability.md`.

## In place — `apps/api.saroh.in/src/common/logging`

- **Correlation ids.** `correlationIdMiddleware` reads `x-request-id` or
  `x-correlation-id`, keeps it in `AsyncLocalStorage`, and returns
  `X-Request-Id`. Error responses carry `correlationId`.
- **One structured line per request** from `LoggingInterceptor`, and
  `structuredLogger` for JSON events such as `api_started`.
- **Redaction** by denylist in `redact.ts`: `authorization`, `cookie`,
  `set-cookie`, API keys and sensitive fields never reach the sink.
- **5xx errors** are logged server-side with the stack and redacted headers; the
  client gets a generic message.
- **Health:** `GET /health`, `/health/live` and `/health/ready`. Readiness fails
  on an unreachable database, an unfinished migration and an unreadable job
  queue.

## Rules

- Log with the class `Logger` or `structuredLogger`, with identifiers (request,
  organization, job, external id) — never payloads, never `console.log`.
- **Every degraded path logs at a level someone watches, and says what volume
  means,** beside the code that emits it. Today:
    - a lost job lease (WARN): a steady stream means a handler outlives
      `JOB_VISIBILITY_MS`;
    - a job with no handler (ERROR): a producer shipped without its consumer.
- Levels: ERROR when a user-visible operation failed or an invariant broke; WARN
  when a degraded path was taken; INFO for state transitions worth
  reconstructing later.
- Frontend boundaries show `error.digest` and log the error.

## Not in place yet

- **No error tracker.** Seven `TODO(#103)` markers wait for one. When it lands,
  forward from every `error.tsx` and from `AllExceptionsFilter`, upload source
  maps, and exclude internal traffic.
- **No post-deploy watch list.** Start one in a runbook: error rate before and
  after, readiness, job backlog and the age of the oldest unclaimed job, and
  the two job signals above.
