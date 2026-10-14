# Error tracking and uptime (#103)

> **Status (2026-10-14): the tracker is PostHog (DEC-125, DEC-160).** Errors
> from every app, nine workspace milestones from the API, and in the
> workspace and on saroh.in session replay (Saroh's interface readable,
> business data masked; saroh.in behind the cookie notice) and page visits
> (which pages are opened and for how long). **Nothing is sent anywhere
> until a key is set**, and replay and page visits each stay off after that
> until their own switch is on: production only.
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
5. **Nothing else.** No autocapture, no feature flags, no surveys, no
   heatmaps, no dead-click or rage-click capture, no network or console
   capture, no cookies or browser storage, no `identify()` with personal
   data. Besides errors there are two things, in two apps, under the rules
   below: session replay, and page visits (`$pageview` and `$pageleave`,
   DEC-160, which replaced "no pageviews" on 14 Oct 2026 and nothing else).

## What is sent, from where

| App                                   | From the browser                                                                                                                       | From the server                                                                                                                                                                 |
| ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `api.saroh.in` (`api`)                | —                                                                                                                                      | Every 5xx (`AllExceptionsFilter` → `reportError`), Better Auth's included (below); a job that failed its **last** attempt (`reportJobError`); the nine milestones               |
| `app.saroh.in` (`application`)        | Errors: every boundary (`reportError`) and the window's uncaught errors. Session replay and page visits, each when switched on (below) | Errors while rendering, in a route handler, a Server Action or the proxy (`instrumentation.ts` → `onRequestError`); a crash before Next renders (`worker.ts` → `withCrashPage`) |
| `accounts.saroh.in` (`auth`)          | Errors only. Never replay: these are the sign-in, sign-up and password pages                                                           | The same two                                                                                                                                                                    |
| `admin.saroh.in` (`admin`)            | Errors only                                                                                                                            | The same two                                                                                                                                                                    |
| `saroh.in` (`web`)                    | Errors. Session replay and page visits, each when switched on and the cookie notice is accepted (below). Google Analytics is separate  | The same two                                                                                                                                                                    |
| Merchant sites, `saroh.app` (`sites`) | **Nothing, ever**                                                                                                                      | The same two, with the site's host and the route's template, and nothing about the visitor                                                                                      |
| docs, help, templates, the UI gallery | Nothing (their boundaries only log)                                                                                                    | Nothing                                                                                                                                                                         |

### Errors inside Better Auth

Better Auth answers `/api/auth/*` itself, outside Nest, so
`AllExceptionsFilter` never sees a failure there. `@saroh/auth`'s
`createAuth` takes `onServerError`, wired to Better Auth's own
`onAPIError.onError` (`packages/auth/src/server-errors.ts`), and the API
passes `reportAuthServerError` (`src/common/auth/report-auth-error.ts`),
which calls the same `reportError`.

- **Reported:** what Better Auth answered 5xx. A thrown value that isn't its
  own `APIError` (a missing provider key, the database, a mail sender that
  threw) is a 500; an `APIError` of 500 or more is its own status.
- **Never reported:** an `APIError` below 500. A wrong password, an
  unverified email, a rate limit, a failed validation and a redirect are
  outcomes, and would spend the quota on nothing.
- **Carries:** the error, the status, the method, the request id, and the
  route's shape: `/api/auth/reset-password/:token`, never the token. No
  body, header, cookie, query string, email or password. The log line's
  `path` is the same shape, and it has no `headers`.
- The hook is not handed the request. The method and the path come from the
  request's context, which `correlationIdMiddleware` sets before Better
  Auth's handler runs.
- Setting the hook replaces Better Auth's own logging of these errors:
  `unhandled_exception` is the line. `auth_error_report_failed` (WARN) means
  the reporter itself threw; any at all is a bug in it.
- Not covered: a failure Better Auth turns into a redirect to its error page
  (a failed provider callback is a 302), which is not a 5xx.

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

## Session replay (the workspace and saroh.in)

Off by default, on in production only (owner, 10 Oct). Two apps and no
other: never accounts (sign-in, sign-up, passwords), the admin console or a
merchant site. `pnpm run check:merchant-site-tracking` fails when any other
app names the recorder.

Both: every input is masked (`maskAllInputs`); **no network** (no request,
response, header or body) and **no console**; the page address inside a
recording loses its query string; the recorder is part of the app's own
bundle, fetched only when a recording is allowed to start, and nothing is
loaded from PostHog; nothing is stored in the browser
(`persistence: "memory"`), so a full page load starts a new recording.
**Every allowed session is recorded** (`REPLAY_SAMPLE_RATE` = 1). The free
plan gives 5,000 recordings a month across both apps;
`NEXT_PUBLIC_POSTHOG_REPLAY_SAMPLE` (0 to 1) lowers the share for an
environment.

**What a recording needs to play** (found the hard way, 14 Oct 2026;
`DEV_LEARNINGS.md`). A recording is rrweb's "meta" event (the page's
address, width and height), a full snapshot of the page, and the changes
after it. Without the meta event a player builds the page and never shows
it: a blank black screen. posthog-js asks
`session_recording.maskCapturedNetworkRequestFn` about the page's own
address before it keeps that event, so the function must answer it
(`replayAddressOnly`: the address without its query string or fragment)
and answer null only for a request the page made.
`replay-playback.*.test.ts` run the real SDK and fail without a meta event
and a full snapshot. The page's styles are inside the snapshot (rrweb
inlines every stylesheet it can read; ours are all same-origin), so a
player needs nothing from our hosts but fonts and, on saroh.in, pictures;
a font it can't fetch falls back to the system's.

**When the first request leaves.** The SDK holds a new recording until the
person first touches the page (a click or a key), then sends every two
seconds or so. A tab nobody touches sends nothing. And a browser driven by
automation (`navigator.webdriver`) sends nothing at all, errors and page
visits included: the SDK treats it as a bot.

### The workspace

It records only when **every** one of these holds (`replayDecision` in
`packages/error-tracking/src/browser.ts`):

1. The app is the workspace, and what is on screen is its signed-in shell
   or the goal picker after setup (`UsageRecording` → `WorkspaceTracking`).
   Not the first setup step (there is no business yet to read the person's
   choice through), the paused screen or the site editor.
2. `NEXT_PUBLIC_POSTHOG_REPLAY` is `on` for the environment, and there is a
   key.
3. The person shares: Settings › Your profile, "Help improve Saroh". Shown
   only where 2 holds; on unless they turn it off; kept on their user row
   (`User.sharesUsage`), so it holds on every device and in every business.
   The server reads it before the page that could start the recorder is
   sent; a choice that can't be read is a no. Turning it off stops the
   recorder in that tab before the save is even sent.
4. **They have been told.** The first time they open the workspace where 2
   and 3 hold, a notice sits above the page (`UsageNotice`): "We record how
   Saroh is used to make it easier. Your customers' details and
   anything you type are hidden. Turn it off in Settings › Your profile."
   The recorder starts only once that notice is on screen. "Got it" is kept
   on their user row (`User.usageNoticeSeenAt`, `POST
…/me/usage-sharing/notice-seen`), so it shows once, on any device.
5. Their browser sends neither Do Not Track nor Global Privacy Control.

What a recording can hold (`replayConfig`):

- **Masked by default.** `maskTextSelector: "*"` hands every text node to
  `maskTextFn` (`maskWorkspaceText`), posthog-js's documented way to unmask
  selectively (a selector's `:not()` can't: a mask covers an element's
  children).
- **Readable: Saroh's own words**, under an element marked
  `data-ph-unmask`. The shared components carry it: buttons, field labels,
  help text, form errors, column names, tabs, fixed page titles, the state
  cards, the navigation, the plan-ending banner, the notice, and the goal
  picker after setup.
- **`data-ph-mask` always wins**, above or inside an unmask: table cells,
  list rows, avatars, stat figures, a page title that is a record's name
  (`PageHeader holdsData`), and any button or label a screen says holds a
  record's data.
- **Digits and emails are hidden even in readable words** (`hideFigures`).
- **Attributes** that hold words (`title`, `aria-label`, `placeholder`,
  `alt`, …) follow the same rule; a link keeps only its path, and a
  `mailto:`, `tel:` or outside link is hidden (`maskWorkspaceAttribute`).
- **Left out entirely**: `img`, `picture`, `video`, `audio`, `canvas`,
  `iframe`, `object`, `embed`, and anything marked `data-ph-block` (or the
  SDK's `ph-no-capture` class).
- **Still masked, on purpose**: toasts, and a dialog's or sheet's title and
  description (computed far more often than fixed), and every hand-rolled
  heading, button and label a screen has not marked. The tab's title too,
  which names the business and sometimes a record (`lib/page-title.ts`):
  `<title>` sits under no `data-ph-unmask`, so never mark `<html>` or
  `<head>`.
- Tied to the internal user id and organization id. No name, no email.

The convention, and the test that holds it
(`apps/app.saroh.in/lib/usage-sharing/replay-marks.test.ts`):
`docs/patterns/frontend-design-system.md` → Session recordings.

### saroh.in

It records only when **every** one of these holds (`siteReplayDecision`;
`apps/saroh.in/app/site-tags.tsx`, and `startRecording` in `lib/tags.ts`,
the one way it starts):

1. `NEXT_PUBLIC_POSTHOG_REPLAY` is `on` for the deployment, and there is a
   key.
2. **The visitor accepted the cookie notice**, and the notice they accepted
   said it records. It is the one answer Google Analytics waits for too
   (`lib/consent.ts`): the notice's first question is "understanding the
   site", visit counts and recording together; advertising (DEC-127) is its
   second, and has nothing to do with recording. Before an answer, after
   "Refuse", and after "Cookie choices" forgets it, nothing is loaded;
   taking it back stops the recorder at once.
3. It is not a Saroh team browser (`saroh_team=1`).
4. The browser sends neither Do Not Track nor Global Privacy Control.
5. It is not a pricing draft preview, nor the sign-up hand-off (`/welcome`).
6. **The page's address has been cut back** to the allow-list in
   `lib/page-address.ts`, as it is before a tag loads (DEC-127, Decision
   4a), and every later address is cut as it is set. So a recording never
   shows `ref`, `invite`, `email`, `token` or anything unlisted in an
   address. (`replayBeforeSend` drops the whole query string from what is
   sent as well.)

**An accept from before the notice said it records** (combined model, 10
Oct). What an accept covered is kept beside it
(`saroh-analytics-consent-scope`: `analytics`, `analytics+recording` or
`analytics-only`). An accept given to the older notice, or where recording
was off, was for visit counts: Google Analytics carries on as agreed,
nothing is recorded, and the notice asks once, about recording alone ("You
accepted Google Analytics cookies that count visits. May saroh.in also
record how the site is used, so we can make it clearer? …"). "Accept" there
starts the recorder; "Refuse" keeps the visit counts they had agreed to
(`analytics-only`) and they are not asked again. An older refusal is left
alone.

What a recording holds (`siteReplayConfig`): the page's own text and
pictures (Saroh's public content, Help included: it is the same app); every
input masked; text a page marks `data-ph-mask` masked (the waitlist's
"you're in", a checked link's results) and a picture inside it left out;
embedded frames and anything marked `data-ph-block` left out. **Nobody is
identified**: no id is handed in, none is kept, no person profile is made.

## Page visits (the workspace and saroh.in)

Which pages people open and how long they stay (DEC-160, owner, 14 Oct
2026). Off by default, on in production only, with its own switch
(`NEXT_PUBLIC_POSTHOG_ANALYTICS`). The same two apps as replay and no
other, **under exactly the rules replay has** (`replayDecision`,
`siteReplayDecision`, asked of this switch): never accounts, the admin
console or a merchant site.

- **What is sent**: `$pageview` for the first page and each page after it,
  and `$pageleave` when the tab closes or leaves. Each view says how long
  the page before it was open (`$prev_pageview_duration`), which is how
  PostHog knows the time on a page. Nothing else: no click, no scroll
  depth, no heatmap.
- **The app names the page, never the address bar**
  (`BrowserTracking.pageview(route)`; posthog-js's own
  `capture_pageview: "history_change"` is off, because it reads the address
  at the moment it changes, before the app knows the route).
    - **The workspace** names the route's shape,
      `/commerce/orders/[orderId]` (`lib/usage-sharing/route-shape.ts`, from
      Next's own `useParams`): no record's id, no invitation token, no
      business name, no query string.
    - **saroh.in** names its public path and, of its query, only what the
      allow-list in `lib/page-address.ts` keeps (`utm_…`, `plan`, `src`):
      no `ref`, `invite`, `email` or `token` (`pageRoute` in `lib/tags.ts`).
- **Never sent** (`pageBeforeSend`, the last gate): the tab's title (in
  the workspace it names the business and sometimes a record), the
  referrer, where the session began, any person property (`$set`,
  `$set_once`), scroll figures.
- **Who**: the workspace, the signed-in person who shares usage and has
  been told (one choice, "Help improve Saroh", and one notice for both
  recording and page visits), by internal user id and organization id.
  saroh.in, nobody: an id the SDK makes up for that page load, no person
  profile; only after the cookie notice's first answer is accepted (the one
  that says saroh.in "records how the site is used"), never in a team
  browser, never with Do Not Track or Global Privacy Control, never on a
  pricing draft preview or the sign-up hand-off.
- **One instance with the recorder**, so a page's visits and its
  recordings carry the same session id, and a visit is still sent for a
  session whose recording was sampled out. Where only page visits are
  switched on, the recorder is never fetched and no request is made at
  start-up.
- **Nothing is stored** (`persistence: "memory"`), so in PostHog a
  "visitor" and a "session" on saroh.in are **one page load and what is
  browsed from it**: a reload, a new tab or a return tomorrow is a new
  visitor. Time on a page and views per page are right; unique visitors
  and sessions are over-counted, and Google Analytics remains the count of
  visitors. PostHog's cookieless mode would count a visitor once a day
  without storing anything, but posthog-js sends no recording in that mode
  and its sessions are made on PostHog's side, so a page's visits could no
  longer be tied to its recordings: not used (DEC-160).

**What posthog-js sends when recording and page visits are on** (both
apps): one `GET …/array/<key>/config` when the instance is made (the
project's settings: a recording starts only if the project records at
all), `POST …/s/` with the recording (`$snapshot` events), and `POST
…/e/` or `…/i/v0/e/` with each `$pageview` and `$pageleave`.
`before_send` drops every other event, and autocapture, heatmaps, web
vitals, exceptions, surveys and flags are switched off in the config as
well. An error is one `POST …/e/` from the browser (`$exception`), and
one `POST …/i/v0/e/` from the server when the server threw it.

### Checking it by hand

Use a real browser, not one driven by a test tool, and click something:
the SDK sends nothing from an automated browser, and nothing of a
recording before the first click or key. Then, within a few seconds: a
`POST` to `…/s/` (the recording) and one to `…/e/` or `…/i/v0/e/` per
page opened. In a recording, look for the page itself, not a black frame.

## Settings

| Variable                                              | Where it is read                                                                                                                                                               | Unset                                                 |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------- |
| `POSTHOG_KEY`, `POSTHOG_HOST`                         | API: `src/env.ts` → `main.ts` → `common/observability/posthog.ts`. Merchant sites: `env.ts` → `lib/error-tracking.ts`; `worker.ts`                                             | Nothing is sent. The host is the EU cloud             |
| `POSTHOG_ENVIRONMENT` (`development` \| `production`) | API only, `src/env.ts`                                                                                                                                                         | With a key: nothing is sent, and an ERROR at start-up |
| `NEXT_PUBLIC_POSTHOG_KEY`, `NEXT_PUBLIC_POSTHOG_HOST` | Workspace, accounts, admin, saroh.in: `env.ts` → `lib/error-tracking.ts` (server) and `lib/error-tracking-browser.ts`; `worker.ts`                                             | Nothing is loaded or sent                             |
| `NEXT_PUBLIC_POSTHOG_REPLAY` (`on` \| `off`)          | Workspace: `env.ts` → `lib/error-tracking-browser.ts`, `usage-recording.tsx`, the profile page. saroh.in: `env.ts` → `lib/error-tracking-browser.ts`, `app/layout.tsx`         | Off                                                   |
| `NEXT_PUBLIC_POSTHOG_REPLAY_SAMPLE` (`0` to `1`)      | Workspace and saroh.in: `env.ts` → `lib/error-tracking-browser.ts`                                                                                                             | Every allowed session (`REPLAY_SAMPLE_RATE`)          |
| `NEXT_PUBLIC_POSTHOG_ANALYTICS` (`on` \| `off`)       | Workspace: `env.ts` → `lib/error-tracking-browser.ts`, `usage-recording.tsx`, the profile page. saroh.in: `env.ts` → `lib/error-tracking-browser.ts`, `lib/site-tag-config.ts` | Off                                                   |

The API's and the merchant sites' are set on their hosts. The four apps' go
in each app's `wrangler.jsonc` `vars` (commented out until the key exists),
where every setting that isn't secret lives: the deploy builds with them, so
the browser bundle and the Worker can't disagree. The merchant sites' key
is never `NEXT_PUBLIC_`: Next would compile it into the browser bundle.

The Next apps take their environment from the marker their Worker already
carries (`VERCEL_ENV`: only `production` is production). The API can't: the
dev API runs with `NODE_ENV=production` too. So it is told, and with a key
and no `POSTHOG_ENVIRONMENT` it stays off rather than guess.

**Browser security headers:** nothing to add, for the recorder on saroh.in
either (checked 10 Oct). The apps' only Content-Security-Policy is
`frame-ancestors 'self'`; none sets `connect-src`, `script-src` or
`worker-src`, so a request to PostHog is not blocked, and adding one of
those directives for PostHog alone would block everything it didn't list.
If a full policy is ever written, the workspace, accounts, admin and
saroh.in need the PostHog host in `connect-src` (the workspace and saroh.in
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
4. Page visits (DEC-160): nothing to turn on in PostHog; Web analytics
   reads `$pageview` and `$pageleave` as they arrive. In the project's
   settings leave **autocapture, heatmaps, dead clicks, web vitals and
   exception autocapture off** (the SDK has them off whatever is set
   there), leave "Cookieless server hash mode" off (not used), and keep
   **discard client IP data** on. The production `vars` of the workspace
   and saroh.in say `NEXT_PUBLIC_POSTHOG_ANALYTICS: "on"`; development's
   say `off`.
5. Replay: turn "Record user sessions" on in PostHog. Leave the project's
   "Privacy and masking" settings for replay alone: the SDK's own settings
   win where both are set, and "mask all element attributes" there would
   switch off the function that keeps a link's path. The production `vars`
   of the workspace and saroh.in already say `NEXT_PUBLIC_POSTHOG_REPLAY:
"on"` (owner, 10 Oct), so the next production deploy of each starts it;
   development's say `off`. The API must be released first: the notice's
   dismissal is kept by it (migration
   `20261108120000_user_usage_notice_seen`).
6. **Before that deploy**, the Privacy Policy must say so: session
   recordings of the workspace and of saroh.in under "What we collect", and
   that the cookie notice's answer covers recording under "Cookies"
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
