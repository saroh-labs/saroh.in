# Dev learnings

Problems that cost real time, written down once so nobody pays for them twice.
**Search this file before debugging anything non-obvious**, and add an entry
after fixing one.

One entry per incident: the symptom as you would have described it before you
understood it, then the cause, the fix, and where the rule now lives. If a rule
can be enforced by a lint rule, a check script or a test, that is where it
belongs — an entry here is the story behind it, so the enforcement is not
mistaken for bureaucracy and removed.

---

## Local dev — sign-in from an app refused, nothing in the API log

**Problem**: An app started with `next dev -p <port>` could not sign in, and the
API logged no request at all.
**Root cause**: `api.saroh.in` builds its CORS allowlist from the portless
`.localhost` hostnames (`main.ts`), so the browser refused the call before it
left the page. Separately, Better Auth scopes its cookie to the shared parent
domain, which apps on different ports of bare `localhost` do not share — so
even a successful sign-in bounces back to the login screen.
**Fix**: Run apps through portless at their `.localhost` names (`pnpm dev`).
**Category**: local dev · rule in `AGENTS.md`

## API — `PORT` default never applies, app binds a random port

**Problem**: The API listened on a random port in CI and containers, while
working locally.
**Root cause**: With `SKIP_ENV_VALIDATION` set, the typed env module returns
`process.env` untouched — skipping the schema's defaults along with its
validation. `app.listen(undefined)` picks a random port. Locally
`apps/api.saroh.in/.env` sets `PORT`, which hides it.
**Fix**: Anywhere without a `.env`, pass every value the app needs, including
the ones that "have a default". This cost a red CI run.
**Category**: env · rule in `AGENTS.md`

## Auth — sign-in lands on the app launcher, not the page asked for (#222)

**Problem**: Signing in from a deep link on a `.localhost` app ended on the app
launcher.
**Root cause**: With `BETTER_AUTH_TRUSTED_ORIGINS` unset, trusted origins fall
back to the `*.saroh.in` production list, so a return-to on a `.localhost`
origin is — correctly — refused.
**Fix**: Set `BETTER_AUTH_TRUSTED_ORIGINS` when running the stack yourself;
`.env.example` has the value. An ad-hoc `turbo run dev` does not inherit it.
**Category**: auth · rule in `AGENTS.md`

## Auth — every signed-in user sent to sign-in during an api restart

**Problem**: A deploy, a timeout or a 502 from `api.saroh.in` redirected
signed-in users to the accounts login page on their next server render.
**Root cause**: `getServerSession` returned `null` for three different answers:
no cookie, a session the api rejected, and an api that never answered.
`requireSession()` redirected on all three.
**Fix**: `resolveServerSession()` returns `authenticated | anonymous |
unavailable`, and only a 401/403 is `anonymous`. Gates throw
`SessionUnavailableError` so the nearest `error.tsx` offers a retry
(`7867fa8`).
**Category**: auth · rule in `.agents/skills/saroh-product-states`

## Renderer — `text-site-muted` renders in the inherited colour

**Problem**: Muted text on the tenant 404 and checkout looked like body text,
and `border-site-border` borders were invisible.
**Root cause**: `siteColors` maps `muted` and `border` to `--site-muted` and
`--site-border`, and `SiteTheme`'s defaults declared neither. `hsl()` of an
unset variable is an invalid declaration, which the browser drops without a
word. Published sites were fine because the publisher derives both per
publication; only the fallback was broken — which is what renders when
something has already gone wrong.
**Fix**: Defaults added to `SiteTheme`, using the values `siteStyleVariables()`
derives for the default style (`00cd219`). Every key in `siteColors` needs a
default in `SiteTheme`.
**Category**: CSS

## Renderer — `rounded-[--site-radius]` produces no CSS

**Problem**: An arbitrary-value radius class had no effect.
**Root cause**: The apps run Tailwind 3.4. The bare custom-property shorthand is
Tailwind 4 syntax.
**Fix**: `rounded-[var(--site-radius)]`, or `ctaClasses()`, which already
carries the radius.
**Category**: CSS

## Blocks gate — a new renderer surface fails `check:blocks` (G6)

**Problem**: Adding `error.tsx` and `loading.tsx` under `apps/saroh.app` failed
`pnpm run check:blocks`.
**Root cause**: G6 bans the `--site-*` layer outside `packages/site-blocks`,
except for an allowlist of Saroh surfaces that sit on a merchant's page.
**Fix**: A surface that draws no block — a 404, an error boundary, checkout —
goes into `SITE_LAYER_ALLOWED` in `scripts/check-blocks.mjs`, with its reason. A
file that draws a block does not: move the block into the package.
**Category**: blocks

## Git — a TypeScript file shows as "Bin" and grep cannot see inside it

**Problem**: `git diff` rendered `analytics-aggregate.handler.ts` as binary,
and a search for a constant defined in it found only its import.
**Root cause**: A raw 0x00 byte typed directly inside a string literal, as a
join separator. One NUL byte makes git, `git grep` and `grep` treat the whole
file as binary.
**Fix**: Write control characters as escape sequences, never as the raw byte
(`73465a4`). To find files grep considers binary:
`grep -rIL . --include='*.ts' apps packages` — `-I` stops binary files matching,
so `-L` lists exactly those.
**Category**: tooling

## Jobs — a stale worker re-sends a notification that was already delivered

**Problem**: Possible duplicate sends after a handler ran past the visibility
timeout.
**Root cause**: `claimDue` reclaims PROCESSING rows past `JOB_VISIBILITY_MS`,
but `complete()` and `fail()` wrote by `id` alone. A stale worker failing after
the reclaiming worker finished rescheduled a DONE job to PENDING.
**Fix**: Every terminal write on `Job` is `updateMany` fenced on
`(id, status: PROCESSING, lockedBy: workerId)` and reports whether it won
(`76f7a47`). A new terminal write must carry the same WHERE.
**Category**: jobs

## Jobs — booking notifications recorded as delivered, never sent

**Problem**: Every `booking.notify` job in the table was DONE, and no booker or
merchant had ever received one.
**Root cause**: No handler for `booking.notify` was ever registered — S4-002 left
it to a later ticket — and the registry's fallback for an unknown type was a
no-op that resolved, so the worker completed each job.
**Fix**: Unhandled types dead-letter as FAILED with the reason in `lastError`.
`apps/api.saroh.in/src/modules/jobs/job-consumers.spec.ts` pins every enqueued
type to a registered handler and lists the gaps still open. The handler itself
is still unwritten.
**Category**: jobs
