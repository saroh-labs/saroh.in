---
title: "fix: configuration that silently falls back to production"
type: fix
status: active
date: 2026-10-05
origin: the hard-coded config scan of origin/development @ 17f01066 (5 Oct 2026)
---

# Configuration that silently falls back to production

## Problem

On 5 Oct the waitlist turned out to have dropped every join for two days: the
marketing site's `API_URL` was missing on Vercel, and nothing failed loudly
(DEV_LEARNINGS). A scan of the repo for the same failure class found no
secrets committed, but three ways test or preview traffic can reach real
money or production data, and about twenty production fallbacks that hide a
missing variable.

## Decisions

- **KTD-1 One switch per provider environment, owned by the API.** Cashfree's
  host is chosen by `CASHFREE_ENV` (`production` | `sandbox`, default
  `production`) on the API. The API returns the mode with the checkout's
  client parameters, so the browser drop-in always opens where the order was
  made — no second variable to drift.
- **KTD-2 The API fails at start, not at send.** Outside local development
  (`NODE_ENV=production`), `RENDERER_URL` and `APP_URL` are required by
  `src/env.ts`: a missing one stops the API booting, where today it emails
  customers or staff production links. Both are set on production before the
  release that requires them (`RENDERER_URL=https://saroh.app`, `APP_URL`
  already set).
- **KTD-3 Production builds fail loudly; previews keep their fallbacks.**
  Each Vercel app's `next.config.js` refuses a `VERCEL_ENV=production` build
  without the variables it can't work without — as saroh.in already does for
  `API_URL`. Previews still fall back to production addresses: a preview runs
  on a `*.vercel.app` host that shares no session cookie with saroh.in, and
  requiring preview variables would fail five preview builds per push.
- **KTD-4 One resolver per app.** The renderer's origin is worked out in one
  API helper (three copies today); saroh.app's API base in one helper (about
  twelve copies with different precedence today).

## Units

| #   | What                                                                                                                                                                | Files                                                                                                                                                                                    |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| U1  | `CASHFREE_ENV` on the API: the host for merchant payments and Saroh's own billing; `clientParams.mode` with every Cashfree checkout; the drop-in opens in that mode | `apps/api.saroh.in/src/env.ts`, `modules/payments/providers/cashfree.provider.ts`, `modules/billing/providers/cashfree.provider.ts`, `packages/site-blocks/src/booking-flow/checkout.ts` |
| U2  | `rendererBase()` once; `RENDERER_URL` and `APP_URL` required in production; the self-test email links from `APP_URL`                                                | `src/env.ts`, `invoices/pay-link-url.ts`, `sites/site-origin.ts`, `product-reviews/product-reviews.service.ts`, `notifications/*`, `self-test/self-test.templates.ts`                    |
| U3  | Production build guards: app, admin, accounts, saroh.app, templates; saroh.in adds `SITE_RELAY_SECRET`                                                              | each app's `next.config.js`                                                                                                                                                              |
| U4  | saroh.app's API base from one helper, `API_URL` first, everywhere                                                                                                   | `apps/saroh.app/lib/*`                                                                                                                                                                   |
| U5  | Clean-up: the unused constants file in app.saroh.in; `NEXT_PUBLIC_APP_DOMAIN` (read by nothing) out of CI and `prepush`                                             | `apps/app.saroh.in/lib/constants/index.ts`, `.github/workflows/ci.yml`, `scripts/prepush.sh`                                                                                             |
| U6  | `EMAIL_FROM` required in production                                                                                                                                 | `src/env.ts`                                                                                                                                                                             |

## Release order

1. Before the release: `RENDERER_URL=https://saroh.app` on saroh-api (Coolify).
   `APP_URL` and `EMAIL_FROM` are already set; check by name.
2. The release: the API refuses to boot without them, so a missed step shows
   at deploy, and `saroh-deploy` keeps the old container running.
3. Vercel: every production variable the guards require is already set
   (5 Oct). A guard that fails names the variable.

## Tests

- Unit: the Cashfree host and `clientParams.mode` per `CASHFREE_ENV`; the
  drop-in opens in the mode it's given and production when none; `rendererBase`
  per env; the env schema refuses a production config without `RENDERER_URL`,
  `APP_URL` or `EMAIL_FROM`.
- The full gate, including the browser specs, whose stack must set the new
  required variables.

## Out of scope

A staging environment (previews keep using the production API by design,
KTD-3); moving public contact addresses into one constant.
