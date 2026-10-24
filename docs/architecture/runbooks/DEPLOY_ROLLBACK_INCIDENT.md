# Deploy, roll back, handle an incident (#1192)

> **Read when:** shipping a release, checking one afterwards, or when
> something is down or wrong in production. Background:
> `docs/patterns/devops-tooling-and-deploy.md` (how things ship) and
> `docs/patterns/devops-observability.md` (logs and PostHog).

One page for anyone on the team. Host names, keys and the host's own
steps are not here: the repository is public. They stay in GitHub's
secrets, on the host and in the operator's notes.

**Production changes need the owner's OK at the time.** A deploy, a
rollback, a restart or a database write in production is the owner's call
(`devops-tooling-and-deploy.md`). Looking is always fine.

## Roles

| Role       | Who                                                                     | Does                                                          |
| ---------- | ----------------------------------------------------------------------- | ------------------------------------------------------------- |
| The owner  | The person who merges `main` and decides on production                  | Says yes to a rollback, tells businesses                      |
| On-call    | Whoever merged or released last, or whoever the owner names for the day | Checks first, rolls back or fixes, keeps notes with the times |
| A reporter | Anyone: a business, a teammate, an alert in PostHog                     | Tells on-call what broke, where and when                      |

On a small team one person may be all three. The steps don't change.

## How each app deploys

### The Cloudflare apps (Workers)

Five apps run on Cloudflare Workers, built with OpenNext. Each has one
Worker per environment (name in the app's `wrangler.jsonc`):

| App in the workflow | Folder                   | Production Worker | Dev Worker           |
| ------------------- | ------------------------ | ----------------- | -------------------- |
| `web`               | `apps/saroh.in`          | `saroh-web`       | `saroh-web-dev`      |
| `application`       | `apps/app.saroh.in`      | `saroh-app`       | `saroh-app-dev`      |
| `auth`              | `apps/accounts.saroh.in` | `saroh-accounts`  | `saroh-accounts-dev` |
| `admin`             | `apps/admin.saroh.in`    | `saroh-admin`     | `saroh-admin-dev`    |
| `sites`             | `apps/saroh.app`         | `saroh-sites`     | `saroh-sites-dev`    |

The other folders under `apps/` (docs, help, templates, ui) are not
deployed by any workflow in this repository.

`.github/workflows/deploy-frontends.yml` deploys them:

- **A push to `development`** deploys the dev Workers.
- **A push to `main`** (a merged release PR) deploys the production Workers.
- **Only what changed deploys.** Each Worker carries its build's
  fingerprint. A push deploys only the apps whose fingerprint differs from
  the live one. A docs-only push deploys nothing.
- **By hand:** run the workflow from GitHub Actions with an app (or `all`)
  and an environment. Or use the admin console's **Deployments** page:
  Platform Owners only, each console deploys only its own environment, and
  production asks you to type the Worker's name first. Both build from the
  branch head; neither picks an older version.
- Nothing deploys on a schedule.

### The API

`.github/workflows/deploy-api.yml` deploys `apps/api.saroh.in`:

- It builds one image and tags it `sha-<full commit>` (and `latest` on
  `main`). The tag never moves, so every past release stays deployable.
- **A push to `main`** goes to production, **a push to `development`** to
  the dev API, when the API, a package or the build changed. A manual run
  deploys to the target you pick (development by default).
- The deploy hands the tag to **the host's rollout script**. It backs up
  the database, runs the migrations, starts the new image and waits for
  `/health/ready`. CI's key can run that script and nothing else.
- The run's summary names the tag it deployed ("Deployed `sha-…` to
  production").

A release with steps after its migrations has its own rollout file in
`docs/architecture/`; follow that one instead.

## How to roll each back

### A Worker: go back to its previous version

Cloudflare keeps every deployed version of a Worker. Rolling back makes an
older one live again in seconds, with no build.

**In the Cloudflare dashboard (easiest):** Workers & Pages → the Worker
(for example `saroh-accounts`) → **Deployments** → the version before the
bad one → **Rollback**. Write a short reason.

**From a terminal** (logged in to Cloudflare, in the app's folder):

```bash
pnpm exec wrangler deployments list --env production    # find the last good version
pnpm exec wrangler rollback <version-id> --env production -m "why"
```

The repository has no rollback script; these are Cloudflare's own tools.
Drop `--env production` for a dev Worker.

Know before you roll back a Worker:

- **The next push to `main` deploys it forward again.** The old version
  carries the old fingerprint, so the next production plan sees a
  difference and redeploys `main`'s build. Get the fix onto `main` before
  anything else merges.
- **Roll back every app the release broke**, not only the one you noticed.
- **`saroh-sites` has a Durable Object.** Cloudflare won't roll back past
  a version that changed its Durable Object migrations. If it refuses, fix
  forward.
- **A Worker and the API that must match go back together.** A release's
  rollout file says so when it applies (for example, saroh.app with the
  API in `ROUND_2_PHASE_1_ROLLOUT.md`).

### The API: deploy the previous image tag

1. Find the last good tag: the summary of the last good "Build and deploy
   API" run on `main` in GitHub Actions, or the package's tags in GitHub's
   container registry.
2. Hand that `sha-<commit>` tag to the host's rollout script. How to reach
   it is in the operator's notes, not here.
3. Wait for `/health/ready` to answer 200, then run the watch list below.

Or revert the bad commit on `main`: the push builds and deploys a new
image the usual way. It's slower (a full build) but leaves `main` right.

Know before you roll back the API:

- **Migrations don't roll back.** The previous image runs on the new
  schema. Releases are written so it can (expand and contract; see
  `devops-tooling-and-deploy.md`). If a release's rollout file says
  otherwise, its rollback is restoring the snapshot taken before it
  (`RESTORE_DRILL.md` shows how a restore runs).
- A backfill the release ran is not undone by an older image.

## When something breaks

### 1. Check first (on-call, within minutes)

- **What is broken, for whom?** Sign-in, the workspace, merchant sites,
  bookings, checkout, the API? One business or all?
- **When did it start?** Compare with the last deploy: GitHub Actions
  (both deploy workflows) and the admin console's Deployments page.
- **Look:** the admin console's Health page and Operations › Jobs, PostHog
  errors, the Worker's logs in Cloudflare, `/health/ready` on the API.
- Write down the times as you go. You'll need them for the update and the
  learning.

### 2. Roll back or fix forward

Roll back when **all** of these hold:

- It started with a deploy, and the version before it worked.
- Businesses or their customers can't do something they could do before
  (sign in, book, pay, see their site).
- No migration or backfill in that release stops the old version working.

Fix forward when:

- The fix is small, understood and can ship faster than a rollback, or
- Rolling back is unsafe (a migration the old image can't run on, a
  Durable Object change), or
- It wasn't a deploy (a provider is down, a setting changed). Then fix the
  cause; a rollback won't help.

When unsure, roll back. A rollback is minutes and can be undone. A fix
under pressure is often wrong the first time.

### 3. Tell businesses (the owner)

The owner decides whether to tell businesses and does the telling. Saroh
has no status page yet. Use the channels businesses already hear from
Saroh on: email from Saroh to the affected businesses, and a reply to
anyone who wrote in. Tell them if they or their customers could see the
problem for more than a few minutes.

Plain words. No error codes, no blame, no guessed times.

**First message**

> Some of you can't [sign in / take bookings / take payments / open your
> site] right now. We know, and we're fixing it. Your data is safe. We'll
> write again within the hour, or sooner when it's fixed.

**Update**

> Still working on it. [What works now, for example: Your site is back;
> sign-in still fails for some of you.] Nothing you've done is lost. Next
> update by [time].

**Resolved**

> It's fixed. Between [start] and [end] (IST), [what didn't work]. [What
> to check, if anything, for example: A booking made in that time may not
> have reached you. Please check your Bookings page.] Sorry for the
> trouble.

### 4. Afterwards

- Add an entry to `docs/architecture/DEV_LEARNINGS.md`: symptom, cause,
  fix, rule. Add the check that would have caught it (AGENTS.md › Learn
  from every miss).
- Fix forward on `main` if you rolled back, so the next deploy is safe.

## Worked example: 23 Oct 2026, every Cloudflare page returned 500

What happened (`DEV_LEARNINGS.md`, "Every Cloudflare page returned 500
after a Next.js bump"): release #1176 merged at 10:19 UTC. It moved
Next.js to a version our OpenNext build didn't support. From about 10:26,
every server-rendered page on the Workers returned 500: accounts' sign-in
pages (nobody could sign in), some saroh.in pages and the merchant sites.
The API was fine. It was fixed forward in #1180, about 50 minutes later.

With this page:

1. **Check:** sign-in returns 500; the last production deploy was #1176
   minutes earlier; `/health/ready` is fine, so the API is not the cause.
2. **Decide:** it started with a deploy, the version before worked,
   businesses can't sign in and no migration was involved. Roll back.
3. **Roll back** `saroh-accounts`, `saroh-web` and `saroh-sites` (and
   `saroh-app`, `saroh-admin` if #1176 deployed them) to the versions
   before #1176, in the dashboard. Leave the API alone. Down for minutes,
   not 50.
4. **Tell:** first message ("Some of you can't sign in or open your site
   right now…"), then resolved once the rollback is live.
5. **Fix forward:** the OpenNext upgrade (#1179) goes to `main` before
   anything else merges. Otherwise the next push redeploys the broken
   build. The learning added the Workers runtime check
   (`scripts/check-cf-runtime.sh`) to CI and `pnpm prepush`.

## After every production deploy: the watch list

Run it after each release (and after a rollback), within about 15 minutes.
Read-only: use a test business, never save on the demo stores.

| Check              | How                                                                                    | Good                                    |
| ------------------ | -------------------------------------------------------------------------------------- | --------------------------------------- |
| Sign-in pages      | Open accounts' /login, /signup and /forgot-password                                    | Each loads, no error page               |
| The workspace      | Sign in, open Home and one list (Bookings or Orders)                                   | Loads with data                         |
| A merchant site    | Open a published site on saroh.app and one on a custom domain, home and one inner page | Loads, looks as before                  |
| A booking          | On a test business's site, go to the booking page and pick a time                      | Times show; booking goes through        |
| A checkout         | On a test business's site, add a product and reach the payment step                    | The payment step opens                  |
| The marketing site | Open saroh.in's home and pricing                                                       | Loads                                   |
| API health         | `/health/ready` on the API                                                             | 200                                     |
| Errors             | PostHog errors, before and after the deploy                                            | No new error, no jump in count          |
| Jobs               | Admin console › Operations › Jobs, and the Health page                                 | Backlog and oldest unclaimed job normal |
| Job signals        | API logs: lease lost (WARN), no handler (ERROR), `job_failed_final`                    | None new                                |

If a check fails, go to "When something breaks" above.
