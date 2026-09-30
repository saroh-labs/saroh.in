---
name: saroh-browser-tests
description: Use when a change affects layout, cross-origin auth, touch targets, or anything only a real browser can answer — and when adding to e2e/
---

# Saroh Browser Tests

## Overview

`e2e/` is the only place that runs the apps together against a seeded database.

**Core principle:** if the question is about a cookie jar or a layout engine,
no unit test can answer it. Everything else in CI builds one app at a time and
never renders anything.

## Running it

```bash
pnpm dev                                          # stack, under portless
pnpm --filter @saroh/e2e install:browsers         # once
E2E_IGNORE_HTTPS_ERRORS=1 pnpm --filter @saroh/e2e test:e2e
```

`E2E_IGNORE_HTTPS_ERRORS` is for portless's local CA. CI runs on bare ports
and sets `E2E_APP_URL` / `E2E_ACCOUNTS_URL` / `E2E_API_URL` instead.

**Set `BETTER_AUTH_TRUSTED_ORIGINS` when you run the stack yourself.** Unset,
it falls back to the `*.saroh.in` production list, so a return-to on a
`.localhost` origin is correctly refused and sign-in lands on the launcher
instead of the page that was asked for. That is not a bug — it is the
open-redirect guard doing its job — but it will fail #222's test and waste an
hour if you do not know it.

## Signing in: once per person, reused

The `setup` project (`e2e/tests/auth.setup.ts`) signs each seeded person in
through the real form once per run and saves the session to `e2e/.auth/`
(gitignored): the demo owner, the site reviewer, Nisha (Rye's Member) and
Divya (Kavi's desk). `desk` and `phone` depend on it, so it runs first
whatever specs, shards or file filters are picked.

A spec that only needs to BE signed in carries a saved session into its
context with `useSession(page, "member")` (`e2e/fixtures/sessions.ts`, which
also takes a `{ email }`), then opens what it needs — usually
`/open/<org id>`. Never type a password in a spec that is not about signing
in; about 150 UI sign-ins a run became four.

- **A spec about signing in keeps the form** — `auth.spec.ts` (cross-origin
  session, #222's return-to, sign-out) and `site-sign-in.spec.ts`.
- **Never sign out, or revoke a session, on a saved one.** Signing out ends
  the session on the server and every later spec would land on /login. Sign
  in through the form in a fresh context instead, as `auth.spec.ts` does.
- **Choosing a business is safe.** The open business is the workspace's own
  cookie, written into that spec's context only.
- A new person: add them to `people` in `fixtures/sessions.ts`; the setup
  project picks them up.

## Waiting

No `waitForTimeout`. Wait on something that happens: `expect(...)` on the
screen, `expect.poll` on the API or on a measurement that must settle, and
for a timer in the page (a ten-second hold, an Undo toast) install
`page.clock` before the page loads and `runFor` past it.

Never read the page once with `page.evaluate` and assert on the result: CI's
runners are slower than this Mac, and a single look can land between two
pages (a redirect) or before a list has drawn. Put the measurement inside
`expect.poll(() => page.evaluate(…)).toEqual(…)`, so a slow runner waits and
a real problem still fails at the timeout (DEV_LEARNINGS, #718).

## Two projects, because the scenes differ

- **`desk`** — 1440, mouse. `pointer: fine`, so `coarse:` utilities are inert.
- **`phone`** — Pixel 7, a REAL touch pointer. This is what makes
  `pointer: coarse` match, which is the entire basis of the touch-target rules.

A touch test must **assert that the media query matches before asserting
anything else**. Without that guard, a misconfigured project makes every
`coarse:` utility inert and the test passes vacuously — reporting a pass for a
rule it never checked.

## What a browser test is for here

Write one when the answer depends on layout or on the browser's own behaviour:

- horizontal overflow at a given width
- two controls occupying the same pixels
- a control's rendered height on a touch pointer
- a cookie issued by one origin being sent by another
- a computed background in dark

Do **not** write one for logic a unit test can reach. These are slow and they
need a stack; spend them on what nothing else can see.

## Traps

**A page cannot forge its own Origin.** A CSRF test that calls `fetch` from the
workspace carries the workspace's origin, which is TRUSTED — so the request
succeeds, proves nothing, and performs whatever it asked for. The first draft
of ours left a stray Organization in the seeded database. Use Playwright's
`request` API, which is not bound by CORS, and assert the 403.

**Containment is not collision.** The row-wide "stretched link" pattern puts an
`absolute inset-0` anchor behind its own content on purpose. An overlap check
must skip ancestor/descendant pairs or it reports every row as a bug.

**Resizing the window cannot reach 320px.** Chrome has a ~500px minimum window
width, so a resize to 320 silently gives 500. Use viewport emulation.

**On the phone project, `innerWidth` lies about overflow.** The Pixel 7 is a
mobile viewport: content wider than the screen makes Chrome zoom the page
out and widen `innerWidth` to match, so `scrollWidth <= innerWidth` passes
on the very bug. Measure against the width you set (`page.viewportSize()`)
and fail when `innerWidth` has grown, as `phone-reflow.spec.ts` does. Test
with the values merchants have: a 60-character email with no hyphen (a
hyphen is a line break the layout didn't earn), and long names.

**A flaky harness gets ignored, which is worse than none.** Poll for readiness
rather than sleeping a fixed number of seconds; a cold Next server on a runner
is not reliably up in any particular time.

## Every spec says what it covers

The first line of every `e2e/tests/*.spec.ts` names what it exercises. The
local gate (`pnpm prepush --e2e`) runs only the specs whose keys a batch's
changes reach; CI runs them all.

```ts
// @covers accounts:/login app:/open app:/commerce/orders api:orders api:payments
```

- `app:/<route>`, `site:/<route>`, `accounts:/<route>`: a route the spec
  visits, route groups dropped. For the renderer, drop `[domain]`, so
  `${SITE}/shop` is `site:/shop`. A list key covers its dynamic children
  (`app:/customers` covers `/customers/[id]`) but not a static sibling, so a
  spec on `/billing/plans/new` names that route too.
- `api:<module>`: each module behind a screen it drives or an endpoint it
  calls, by folder under `apps/api.saroh.in/src/modules`.
- `pkg:<package>`: a shared package it renders, such as `pkg:site-blocks`
  for anything on a merchant site.

Name what the spec depends on, not everything the page imports. The import
scan in `scripts/e2e-affected.mjs` already follows components and `lib/` to
routes. `pnpm run check:e2e-covers` fails a spec with no line or a key that
names nothing real. To see what a diff would run:
`node scripts/e2e-affected.mjs --base origin/development --why`.

## Every test runs beside every other one

The suite is `fullyParallel`: any two tests — two files, two tests in one
file, the same test on desk and phone — may run at the same moment against
the same database. `e2e/run.mjs` (`pnpm --filter @saroh/e2e test:e2e`, CI's
shards, `pnpm prepush --e2e`) runs it in three phases: `setup` once, then
`desk` and `phone` in parallel on `PW_WORKERS` (4 locally, 2 in CI), then
the `@serial` tests one at a time. Every new spec follows these rules:

- **Own your data.** A test that changes a record makes that record first,
  through the API, and changes only it: a contact, an order, a plan and a
  subscription, a pack, a booking. `e2e/fixtures/own-data.ts` has the
  helpers (`makeContact`, `makeOrder`, `bookOwn`, `northwind`), and
  `fixtures/throwaway-products.ts` the products. Never change a seeded
  record another test reads: the seed's trolley, a named customer, "the
  first Preparing order". An order's line is `ORDER_LINE`, an untracked
  product the setup project makes once, so no order holds stock another
  test counts.
- **Unique stamps.** Names, emails and notes carry `stamp(testInfo)` —
  project, worker, time and a random tail — never a bare `Date.now()`,
  which desk and phone can hit in the same millisecond. A phone number is
  `phone()`. Keep an email short where a phone screen shows it whole.
- **No global counts.** Assert on your own records, found by their stamp
  or id. A count, a page of a list or "the first row" is read on Rye & Co.
  (as its owner), which no test writes to; on Northwind it moves under you.
- **`@serial` for business-wide settings.** A test that changes what every
  other test reads — a business setting, a storefront's ways, the allergen
  list, a service's deposit, a module, Northwind's one site, its team —
  gets `{ tag: "@serial" }` and runs after the parallel phase, alone. Put
  it back afterwards too: the other project's copy runs next. Keep the tag
  for what truly needs it; the serial phase is one worker.
- **Writes go to Northwind.** Rye & Co., Pulse Fitness and Kavi Dental are
  film sets and are only read (a Kavi visit is marked in CI only, @serial).
  Leela & Loom's product-editor film still makes and deletes its own
  product there.
- **Times and slots are claimed, not assumed.** Two tests reading "the
  third free time" book the same one a second apart. Take a day of your own
  (`public-booking.spec.ts`), or try the free times in order until one is
  yours (`bookOwn`). A visitor on a merchant's site gets an address per
  worker (`asNewVisitor`), since the site limits bookings and codes by
  address.
- **Days are chosen, not counted.** "Three days from today" is a Saturday
  every Wednesday, and Northwind's seeded services run Mon–Fri. Book on a
  day the service's rules say it runs (`serviceDays` in `bookings.spec.ts`)
  or one the test opens itself.
- A click that cannot land fails after 15s (`actionTimeout`), not at the
  test's timeout.

## Rules

- `pnpm prepush --e2e` copies the seeded database from a template rather
  than seeding each run, and CI restores a cached dump
  (`docs/patterns/devops-tooling-and-deploy.md`). A seed or migration change
  rebuilds both on its own; nothing to do by hand.
- One browser run per machine: a second `pnpm prepush --e2e` waits for the
  first's lock rather than taking its ports, and teardown stops only the
  servers its own run started.
- Keep credentials to the seeded demo user. They are fixture values for a
  throwaway database, printed by the seed itself.
- On failure CI uploads traces and screenshots. Without them a red build says
  "something looked wrong" and nothing else.
- Pair with [[saroh-four-scenes]] for what to check, and
  [[saroh-product-states]] for the states worth checking it in.
