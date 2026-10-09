# Error tracking and uptime (#103)

> **Status (2026-09-26): a proposal plus a built seam; nothing is sent anywhere
> yet.** The vendor-neutral half ships now. Choosing a tracker is the user's
> decision (paid service, third-party data processor). The decisions are
> listed at the end.

## What exists

- **API:** `AllExceptionsFilter` sends every 5xx to `reportError()`
  (`apps/api.saroh.in/src/common/observability/report-error.ts`). It writes
  the same `unhandled_exception` log line as before, with the stack and
  redacted headers, and forwards a scrubbed `ServerErrorEvent` to a sink if one
  is installed. None is. `ERROR_TRACKING_DSN` (off when unset) is the switch.
  With it set, and no SDK wired, the API only logs `error_tracking_not_installed`
  at startup.
- **Frontends:** every `error.tsx` boundary, and the shared
  `SectionError`, calls `reportError()` from `@saroh/ui/lib/report-error`,
  where the eight `TODO(#103)` markers were. It logs to the console as before,
  and forwards to a reporter registered with `setErrorReporter()`. None is
  registered.
- **Health:** `/health/live` and `/health/ready`; readiness fails on the
  database, an unfinished migration and an unreadable job queue.

## What a tracker receives, and what it never does

| Sent                                                                                | Never sent                                   |
| ----------------------------------------------------------------------------------- | -------------------------------------------- |
| error name, stack                                                                   | request or response bodies, form values      |
| message, scrubbed (emails, long numbers, bearer tokens masked; capped at 500 chars) | headers of any kind, cookies                 |
| API: correlation id, method, path **without** query, status, organization id        | query strings (tokens and emails live there) |
| Frontend: which boundary caught it, Next's `digest`                                 | user id, email, name, IP address             |

The organization id is an opaque internal id; it lets support find the
business without the tracker knowing who it is. Configure the tracker to drop
IP addresses and to scrub again server-side (`sendDefaultPii: false` for a
Sentry SDK, plus its data scrubbing). That's a second net. The seam is the
first.

## Recommendation: smallest setup

1. **Error tracker: Sentry's free Developer plan**, or **GlitchTip** if data
   must stay on our own server.
    - Sentry Developer (checked 2026-09-26): 5k errors a month, one user,
      30-day lookback, 1 uptime monitor and 1 cron monitor. It has the best
      Next.js and NestJS support (source maps, `onRequestError`, releases). One
      user is the real limit: only one person can log in.
    - GlitchTip: open source and accepts the Sentry SDKs unchanged, so it can
      run on the Coolify host and nothing leaves our infrastructure. The cost
      is one more service to run and back up. Hosted free tier: 1,000 events a
      month.
    - Better Stack: free tier includes 100,000 exceptions a month with 90-day
      retention, **and** uptime (10 monitors, Slack and e-mail alerts). That's
      one vendor for both. Its SDK story for Next/Nest is thinner; it accepts
      Sentry SDK events.
    - Rejected for now: Rollbar and Honeybadger. They're similar, with smaller
      free tiers or nothing an alternative above lacks.
2. **Uptime: an off-host check on `https://api.saroh.in/health/ready`**, every
   1–3 minutes, alerting e-mail and one chat channel after 2 consecutive
   failures. Also a check on each public front door (`app.saroh.in`, a
   merchant site on `saroh.app`), which catches a Cloudflare Workers or DNS outage the API
   probe can't see. It must run **off** the Coolify host: a monitor on the
   same box goes down with it. Better Stack's free tier covers this, and so
   does Sentry's single uptime monitor (for the API only).
3. **Log-based alerting (second step):** alert on `unhandled_exception` rate,
   on `error_sink_failed`, and on job-queue ERRORs (`no handler`, final-attempt
   failures). That needs the logs shipped somewhere first (Better Stack Logs,
   or Coolify's log drain). Wait until the tracker is chosen.

## Wiring it, once chosen (about half a day)

- **API** (`installErrorTracking` in `report-error.ts`): initialise the SDK
  with the DSN, `sendDefaultPii: false`, `environment` from `NODE_ENV` and
  `release` from the image tag, and `setErrorSink({ capture: (e) =>
Sentry.captureException(...) })`. Don't turn on the SDK's HTTP
  auto-instrumentation body capture. Jobs: call `reportError` when a job
  fails its final attempt (`job-worker.service.ts`).
- **Next apps:** `NEXT_PUBLIC_ERROR_TRACKING_DSN` in each app's `env.ts`. In
  `instrumentation-client.ts`, initialise the SDK and
  `setErrorReporter((r) => Sentry.captureException(...))`. In
  `instrumentation.ts`, export `onRequestError` so server-rendered errors are
  reported with the same `digest` the boundary shows. Upload source maps at
  build and don't serve them publicly.
- **Merchant sites (`saroh.app`):** the customer is the merchant's visitor.
  Report errors only, never session replay.
- **Internal traffic:** tag e2e and demo-store requests (the e2e user agent
  and the showcase organizations) and drop them in the tracker, so demos and CI
  don't burn the quota.

## Decisions for the user

1. Which tracker: Sentry Developer (hosted, one seat), GlitchTip (self-hosted
   on Coolify), or Better Stack (hosted, errors and uptime together).
2. Which uptime monitor, and who gets paged, on which channel.
3. Whether the organization id may go to a third-party tracker (recommended:
   yes, it is opaque), and whether frontend reports from merchant sites go at
   all.
4. Where logs go for log-based alerting (after 1).
