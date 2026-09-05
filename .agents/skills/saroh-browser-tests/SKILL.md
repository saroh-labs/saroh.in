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

**A flaky harness gets ignored, which is worse than none.** Poll for readiness
rather than sleeping a fixed number of seconds; a cold Next server on a runner
is not reliably up in any particular time.

## Rules

- Specs share one seeded Organization, so the config runs them serially. A spec
  that mutates shared state (disabling a module, changing a role) must put it
  back.
- Keep credentials to the seeded demo user. They are fixture values for a
  throwaway database, printed by the seed itself.
- On failure CI uploads traces and screenshots. Without them a red build says
  "something looked wrong" and nothing else.
- Pair with [[saroh-four-scenes]] for what to check, and
  [[saroh-product-states]] for the states worth checking it in.
