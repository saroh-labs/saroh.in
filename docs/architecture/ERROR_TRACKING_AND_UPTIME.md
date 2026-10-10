# Error tracking and uptime (#103)

> **Status (2026-10-10): the tracker is PostHog (DEC-123), wired and switched
> off.** Errors from every app, nine workspace milestones from the API, and
> a masked session replay in the workspace. **Nothing is sent anywhere until
> a key is set**, and replay stays off after that until its own switch is on.
> Uptime monitoring and log-based alerts are still open (the end of this
> page).

One PostHog project (EU cloud, free plan) holds development and production.
Every event says which with `environment` (`development` | `production`) and
which app with `app` (`api` | `application` | `auth` | `admin` | `web` |
`sites`).

## The rules

1. **No key, nothing.** Without a key no SDK is loaded, no client is made,
   no timer is set and no request is sent. The key is the project's public
   key (`phc_…`), the one browsers get: a setting, not a secret.
2. **Merchant sites: server-side only, for ever.** A site's visitors are the
   merchant's customers; Saroh processes their data only for the merchant.
   No PostHog script, SDK, key or request comes from a page a visitor loads.
   `pnpm run check:merchant-site-tracking` (prepush and CI) fails if one
   appears under `apps/saroh.app` or `packages/site-blocks`. The merchant's
   own tracker on their own site (#889) is theirs, and is not this.
3. **One scrubber, before every send** (`@saroh/error-tracking`, below).
   PostHog's own scrubbing is a second net, never the first.
4. **Never in the way.** PostHog being slow or down never slows or fails a
   request, a page or a sign-up, and an error is always in our own log first.
5. **Nothing else.** No autocapture, no pageviews, no feature flags, no
   surveys, no heatmaps, no cookies or browser storage, no `identify()` with
   personal data.

## What is sent, from where

| App                                   | From the browser                                                                                                  | From the server                                                                                                                                                                 |
| ------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `api.saroh.in` (`api`)                | —                                                                                                                 | Every 5xx (`AllExceptionsFilter` → `reportError`); a job that failed its **last** attempt (`reportJobError`); the nine milestones                                               |
| `app.saroh.in` (`application`)        | Errors: every boundary (`reportError`) and the window's uncaught errors. Session replay, when switched on (below) | Errors while rendering, in a route handler, a Server Action or the proxy (`instrumentation.ts` → `onRequestError`); a crash before Next renders (`worker.ts` → `withCrashPage`) |
| `accounts.saroh.in` (`auth`)          | Errors only. Never replay: these are the sign-in, sign-up and password pages                                      | The same two                                                                                                                                                                    |
| `admin.saroh.in` (`admin`)            | Errors only                                                                                                       | The same two                                                                                                                                                                    |
| `saroh.in` (`web`)                    | Errors only (Google Analytics is separate and unchanged)                                                          | The same two                                                                                                                                                                    |
| Merchant sites, `saroh.app` (`sites`) | **Nothing, ever**                                                                                                 | The same two, with the site's host and the route's template, and nothing about the visitor                                                                                      |
| docs, help, templates, the UI gallery | Nothing (their boundaries only log)                                                                               | Nothing                                                                                                                                                                         |

### An error carries

| Sent                                                                                                               | Never sent                                                    |
| ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------- |
| the error's name, message and stack, scrubbed                                                                      | request or response bodies, form values                       |
| API: correlation id, method, status, the route's template (`/orders/:orderId`), organization id, job type and id   | headers of any kind, cookies                                  |
| Next server: the route's template (`/[domain]/products/[slug]`), method, Next's digest; a merchant site's host too | query strings, and the address that was asked for             |
| Browser: which boundary caught it, Next's digest, the page's route template, the internal user and organization id | a name, an email, a phone number, an IP address (see "Owner") |
| `app`, `environment`                                                                                               | a job's payload                                               |

The organization id and user id are opaque internal ids: support can find
the business, and PostHog can't tell who it is. An API error is counted
against the organization id (`saroh-api` when there is none); a Worker's
against `saroh-<app>-server`; a browser's against an id the SDK makes up for
that page load and never stores.

### The scrubber

`packages/error-tracking/src/scrub.ts`, with tests. Every exception goes
through it before it is sent, whichever app sends it. In order:

1. `Authorization`, `Cookie`, `Set-Cookie` and API-key header lines: all of
   the value.
2. Query strings and fragments of any URL or path.
3. `Bearer …` and `Basic …` credentials.
4. A value written beside a sensitive name (`password=…`, `"token": "…"`,
   `secret`, `api_key`, `otp`, `session`, `signature`, …).
5. JSON Web Tokens, and keys with a provider's prefix (`sk_`, `rzp_`,
   `phc_`, `whsec_`, `ghp_`, `AKIA…`).
6. Email addresses, plain and URL-encoded.
7. Any unbroken run of 32 or more letters and digits that mixes both.
8. Phone numbers and any other number of 10 or more digits.

A message is capped at 500 characters and a stack at 50 lines. A thrown
value that isn't an error is never turned into text: it may be a body.
`routeTemplate()` reduces an address to its route (`/customers/:id`) where
the framework's own template isn't known. `scrubContext()` lets through only
strings, numbers and booleans, and never under a key that could hold a body,
a header, a credential, money or a person's details.

### Limits

So one bad bug can't spend the month's quota (the free plan: 100,000
exceptions). The constants are in `packages/error-tracking/src/names.ts`.

- **Servers** (the API and each Worker isolate): `MAX_EXCEPTIONS_PER_MINUTE`
  (10) and `MAX_EXCEPTIONS_PER_HOUR` (100) per process. Past a cap an error
  is still logged; it is only not forwarded.
- **Browsers**: the same error (name, message and first frame) once per page
  load, and `MAX_BROWSER_EXCEPTIONS_PER_SESSION` (20) different ones at most.
- **Timeout**: `SEND_TIMEOUT_MS` (2 seconds) for one send from a server.

## The nine milestones

Sent by the API, from where the fact is written, so no browser script takes
part and they can't be faked or blocked
(`apps/api.saroh.in/src/modules/analytics/product-milestones.ts`).

| Event                        | The fact                                                            | Source                                           |
| ---------------------------- | ------------------------------------------------------------------- | ------------------------------------------------ |
| `signed_up`                  | A person's account row was first written                            | Better Auth's `user.create` hook (`common/auth`) |
| `onboarding_finished`        | The business was set up (the setup form)                            | ledger `organization.created`                    |
| `first_product_added`        | The first product                                                   | ledger `first.product.created`                   |
| `first_service_added`        | The first bookable service                                          | ledger `first.service.created`                   |
| `site_published`             | The first time one of the business's websites went live             | ledger `first.site.published`                    |
| `first_order_taken`          | The first order                                                     | ledger `first.order.created`                     |
| `first_booking_taken`        | The first booking                                                   | ledger `first.booking.created`                   |
| `payment_provider_connected` | The first payment provider connected                                | ledger `first.payment-provider.connected`        |
| `plan_upgraded`              | The first completed checkout onto a paid plan (not a trial's start) | ledger `first.plan.upgraded`                     |

- **Once per business.** The activation ledger (`ActivationEvents`, #176)
  stores each of those types once per organization. A milestone is sent only
  when its row was _stored_, never when the write was a repeat.
- **Id**: the organization's (the user's for `signed_up`).
  **Properties**: `plan_key`, `business_kind`, `environment`, `app`.
  Never a name, an email, a phone number, an address, an amount, or anything
  about a customer. Not even the order's or product's id: the ledger keeps
  that, PostHog doesn't.
- **Never in a request's way**: the SDK queues it in memory and sends in the
  background; the read of the plan and kind happens after the caller has
  its answer.
- "First" for the four types added on 10 Oct 2026 (service, site, provider,
  plan) is the first since then. And a ledger row expires after 400 days
  like any analytics row, so a business whose first order was that long ago
  sends `first_order_taken` once more on its next.
- `onboarding_finished` is the business being set up. The goal picker after
  it writes nothing of its own: it switches modules on one at a time and may
  be skipped, so there is no "finished" for the API to see.

## Session replay (the workspace only)

Off by default. It records only when **every** one of these holds
(`replayDecision` in `packages/error-tracking/src/browser.ts`):

1. The app is the workspace, and what is on screen is its signed-in shell
   (`AppShell` → `WorkspaceTracking`). Never accounts (sign-in, sign-up,
   passwords), the admin console, saroh.in or a merchant site.
2. `NEXT_PUBLIC_POSTHOG_REPLAY` is `on` for the environment, and there is a
   key.
3. The person shares: Settings › Your profile, "Help improve Saroh: share
   how I use the workspace (text and numbers are hidden)". Shown only where
   2 holds; on unless they turn it off; kept on their user row
   (`User.sharesUsage`), so it holds on every device and in every business.
   The server reads it before the page that could start the recorder is
   sent; a choice that can't be read is a no. Turning it off stops the
   recorder in that tab before the save is even sent.
4. Their browser sends neither Do Not Track nor Global Privacy Control.

What a recording can hold (`replayConfig`):

- **Every character of text is masked** (`maskTextSelector: "*"`) and
  **every input** (`maskAllInputs`).
- **Left out entirely**: `img`, `picture`, `video`, `audio`, `canvas`,
  `iframe`, `object`, `embed`, and anything marked `data-ph-block` (or the
  SDK's `ph-no-capture` class). Mark customer data drawn as something other
  than text: `docs/patterns/frontend-design-system.md` → Session recordings.
- **No network**: no request, response, header or body. **No console.**
- The page address inside a recording loses its query string.
- **One session in five** (`REPLAY_SAMPLE_RATE`). The free plan keeps 5,000
  recordings a month, so that is room for about 25,000 workspace sessions.
- Tied to the internal user id and organization id. No name, no email.
- The recorder is part of the workspace's own bundle, fetched only when a
  recording is allowed to start. Nothing is loaded from PostHog.

## Settings

| Variable                                              | Where it is read                                                                                                                   | Unset                                                 |
| ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| `POSTHOG_KEY`, `POSTHOG_HOST`                         | API: `src/env.ts` → `main.ts` → `common/observability/posthog.ts`. Merchant sites: `env.ts` → `lib/error-tracking.ts`; `worker.ts` | Nothing is sent. The host is the EU cloud             |
| `POSTHOG_ENVIRONMENT` (`development` \| `production`) | API only, `src/env.ts`                                                                                                             | With a key: nothing is sent, and an ERROR at start-up |
| `NEXT_PUBLIC_POSTHOG_KEY`, `NEXT_PUBLIC_POSTHOG_HOST` | Workspace, accounts, admin, saroh.in: `env.ts` → `lib/error-tracking.ts` (server) and `lib/error-tracking-browser.ts`; `worker.ts` | Nothing is loaded or sent                             |
| `NEXT_PUBLIC_POSTHOG_REPLAY` (`on` \| `off`)          | Workspace only: `env.ts` → `lib/error-tracking-browser.ts`, `app-shell.tsx`, the profile page                                      | Off                                                   |

The API's and the merchant sites' are set on their hosts. The four apps' go
in each app's `wrangler.jsonc` `vars` (commented out until the key exists),
where every setting that isn't secret lives: the deploy builds with them, so
the browser bundle and the Worker can't disagree. The merchant sites' key
is never `NEXT_PUBLIC_`: Next would compile it into the browser bundle.

The Next apps take their environment from the marker their Worker already
carries (`VERCEL_ENV`: only `production` is production). The API can't: the
dev API runs with `NODE_ENV=production` too. So it is told, and with a key
and no `POSTHOG_ENVIRONMENT` it stays off rather than guess.

**Browser security headers:** nothing to add. The apps' only
Content-Security-Policy is `frame-ancestors 'self'`; none sets `connect-src`,
`script-src` or `worker-src`, so a request to PostHog is not blocked, and
adding one of those directives for PostHog alone would block everything it
didn't list. If a full policy is ever written, the workspace, accounts,
admin and saroh.in need the PostHog host in `connect-src` (the workspace
`worker-src blob:` too, for the recorder), and the merchant sites must never
list it.

## Switching it on (owner)

1. Create the project in PostHog's EU cloud. In its settings: **discard
   client IP addresses**; for replay, set **retention to 30 days**, set a
   **minimum recording length** (the SDK counts recorded time,
   `strictMinimumDuration`), and leave "Record user sessions" off until 4.
2. Dev first. Set `POSTHOG_KEY` and `POSTHOG_ENVIRONMENT=development` on the
   dev API; put the key in the dev `vars` of the four apps' `wrangler.jsonc`
   (and `POSTHOG_KEY` in the merchant sites'), and deploy.
3. Production the same, with `POSTHOG_ENVIRONMENT=production`.
4. Replay, later and separately: turn "Record user sessions" on in PostHog,
   then set `NEXT_PUBLIC_POSTHOG_REPLAY` to `on` in the workspace's `vars`.
5. The same day, add PostHog and session recordings to the Privacy Policy
   (`apps/saroh.in/content/privacy.ts`, the owner's text).

## Later

- **Source maps.** A stack from a browser or a Worker names the built files
  until source maps are uploaded at build. That needs a private key, kept
  as the GitHub secret `POSTHOG_PERSONAL_API_KEY` in the
  `cloudflare-development` and `cloudflare-production` environments and
  used by `deploy-frontends.yml`; never served publicly. Not set up.
- **Internal traffic.** e2e and demo-store requests are not tagged. CI and
  local stacks have no key, so they send nothing; the demo stores on
  production would.
- **Uptime.** An off-host check on `https://api.saroh.in/health/ready` every
  1–3 minutes, alerting e-mail and one chat channel after 2 failures in a
  row, and a check on each public front door (`app.saroh.in`, a merchant
  site), which catches a Cloudflare or DNS outage the API probe can't see.
  It must run off the API's host: a monitor on the same box goes down with
  it. Still the owner's choice of service and of who is paged.
- **Log-based alerts** on `unhandled_exception` rate, `job_failed_final`,
  `error_sink_failed`, `posthog_send_failed` and job-queue ERRORs. Needs the
  logs shipped somewhere first.
- **PostHog web analytics for saroh.in.** Not built; Google Analytics stays.
