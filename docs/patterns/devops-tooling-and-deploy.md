# Tooling, CI, tests and shipping

> **Read when:** changing lint or TypeScript config, CI, the test setup or
> dependencies, or how the API is built and deployed.
> Adapted from claude-patterns `devops/05-tooling-and-ci.md` and
> `devops/01-deployment.md`.

## Workspace — **Current**

- **Current** (DEC-107, 2026-10-08; Vercel retired 2026-10-09) — every Saroh
  web app runs on Cloudflare Workers, built with OpenNext and deployed by
  GitHub Actions (`.github/workflows/deploy-frontends.yml`): the marketing site,
  the workspace, accounts, admin and the merchant sites. Each app is one Worker
  per environment (`saroh-<app>`, `saroh-<app>-dev`); `development` deploys dev,
  `main` deploys production, and settings that aren't secret live in each app's
  `wrangler.jsonc`. One merchant-sites Worker serves `*.saroh.app` and verified
  custom domains: its server routes call the Saroh API, only the API accesses
  the database, content publications are tenant-specific and code releases
  are shared. The API deploys on its own (below). ADR-009 and DEC-025 (Vercel)
  are superseded.

- pnpm workspaces (`apps/*`, `packages/*`, `tooling/*`, `e2e`) with pnpm
  catalogs, and Turborepo: `build`, `dev`, `lint` and `typecheck` depend on
  `^build`, so shared packages build first.
- Shared configuration: `tooling/eslint-config-custom` (`base`, `nextjs`,
  `react`), `tooling/tsconfig` and `tooling/tailwind-config`.
- Next.js 16 App Router, React 19, Tailwind 3.4 (`PRODUCT.md`).

## Lint and types

- **Current** — typescript-eslint recommended and type-checked configs. The
  shared `nextjs` config holds the boundary rules: no `@saroh/database` or auth
  package root in a frontend, no sonner `toast`, no `process.env`.
- **Current** — `strict` is on in the product apps and in
  `tooling/tsconfig/base.json`; `tooling/tsconfig/nextjs.json` sets
  `strict: false`, and only the Nextra docs apps extend it.
- **Adopted** — `noUncheckedIndexedAccess`. Gap: off everywhere.
- **Adopted** — An `eslint-disable` carries a reason after `--`; a type
  suppression is `@ts-expect-error <reason>`, never `@ts-ignore`. Gap: 7
  `eslint-disable` comments have no reason.
- **Current** — Prettier with organize-imports and the Tailwind plugin. The
  pre-commit hook (husky, lint-staged) formats staged files and runs
  `eslint --fix` on `.js` files; it does not typecheck. Never `--no-verify`.

## Invariant checks — **Current**

| Script             | Guards                                                                                                      |
| ------------------ | ----------------------------------------------------------------------------------------------------------- |
| `check:routes`     | Every emitted destination and static link resolves to a route                                               |
| `check:blocks`     | G2 and G6: merchant sites stay merchant-coloured; one renderer                                              |
| `check:cycles`     | No circular imports across workspaces                                                                       |
| `check:deploy-env` | Every Worker's environment marker is set and its deploy build passes next.config's required-variables check |

**Adopted** — a repo-wide rule that a lint rule cannot express becomes a
`scripts/check-*.mjs` wired into CI and AGENTS.md → Before you finish, not a
paragraph.

## CI — **Current** (`.github/workflows/ci.yml`)

Lint, cycles, routes, blocks, typecheck, API unit tests, build, and a dependency
audit that blocks on critical advisories; plus integration tests,
`migration-replay`, and gitleaks over the full history.

**Layout.** Every job starts in parallel after `What changed` (a few
seconds). Shared setup is `.github/actions/setup`.

| Job                                      | Runs when                       | Typical time             |
| ---------------------------------------- | ------------------------------- | ------------------------ |
| What changed, Secret scan (gitleaks)     | always                          | 10s                      |
| Lint, typecheck and repo checks          | code changed                    | 2–3 min                  |
| Unit tests                               | code changed                    | 2–2.5 min                |
| Build (+ critical-only dependency audit) | code changed                    | 1.5 min warm, 4 min cold |
| Integration (plain, rls) × 4 shards      | api or `packages/` changed      | 3–4 min, one up to 5     |
| Migration replay from empty              | `packages/database` changed     | 1 min                    |
| Browser E2E × 4 shards                   | `apps/ packages/ e2e/ scripts/` | 5–7 min (the long pole)  |
| Permission states (production build)     | as E2E                          | 3 min                    |

- **Current** — **Required checks keep their names.** The aggregates
  `Lint, typecheck, test & build` (`ci`) and `Browser E2E (seeded stack)`
  pass when every gate they gather passed or was skipped as out of reach.
  Rename neither; branch rules and the PR page know them.
- **Current** — **Only code decides what runs.** `What changed` drops `docs/`
  and every `*.md` before matching paths, so a docs-only change runs only the
  secret scan and the two aggregates, which report green. A change to CI, the
  root manifests, the lockfile or `tooling/` runs everything, and so do the
  weekly run and a manual run.
- **Current** — **Only non-PR runs write the build caches.** Turbo and Next
  caches are saved by pushes to main and development, the weekly run and
  manual runs. A PR restores the newest of its base branch's caches and writes
  nothing. The repository has 10 GB of Actions cache. When every PR push saved
  about 1.3 GB, GitHub evicted the pnpm store and Playwright's Chromium, and
  every job downloaded them again. See DEV_LEARNINGS. A saving run drops Turbo
  entries older than a week. Playwright's browser is keyed on its version.
- **Current** — **The integration shards read the unit job's Turbo cache**
  for the api's workspace packages. The env is the same, so the hashes match,
  and the shards write no cache of their own.
- **Current** — **A browser shard that must seed (no cached dump, below)
  seeds and builds in one turbo run**, so
  the seed (~40s) overlaps the build. `db:seed:showcase` waits for
  `@saroh/database`'s own build, because its `prisma generate` rewrites the
  client the seed uses.
- **Current** (2026-09-29) — **Browser shards restore a cached, seeded
  database** instead of migrating and seeding. The shard keys a
  `pg_dump -Fc` on `hashFiles` of the migrations, schema, `packages/database/src`
  (the seed and showcase), the block contract and the lockfile, plus a
  four-hour window of the Indian day (the showcase is laid out relative to
  when it runs, so an older dump is never used; there are no restore-keys).
  A hit runs `pg_restore` inside the Postgres service container (its version
  is the server's) and then `turbo run build`; a miss migrates, seeds and
  builds in one turbo run as before, dumps the database before the stack
  starts, and saves it (`continue-on-error`, since four shards race to save
  one key). Saves ~40s per shard on a hit.
- **Current** (2026-09-29) — **Specs sign in once per person.** The
  Playwright `setup` project runs in every shard and signs the four seeded
  people in; the specs reuse the sessions (browser-tests skill).
- **Current** (2026-09-29) — **Browser shards run the suite in parallel.**
  Each shard runs `pnpm --filter @saroh/e2e test:e2e --shard=N/4`
  (`e2e/run.mjs`): `setup` once, then `desk` and `phone` `fullyParallel` on
  `PW_WORKERS=2` (the stack shares the runner's two vCPUs), then that
  shard's `@serial` tests on one worker. With `fullyParallel` Playwright
  shards by test, not by file: 88–89 parallel and 8–9 serial tests a shard,
  and the local timings put the four within ~20% of each other (was 135s
  on shards 1 and 3 against 195s on 2 and 4, where desk and phone split
  by file). Each phase keeps its traces under `e2e/test-results/<phase>/`,
  all uploaded on failure. Every spec owns its data
  (browser-tests skill), which is what makes this safe.
- **Current** — **Postgres services poll `pg_isready -h 127.0.0.1` every 2s.**
  The check goes over TCP because the image's init server listens on the
  socket only.
- **Current** — **Superseded PR runs are cancelled.** Runs on main and
  development never are, because each push there is checked against the one
  before it.
- **Rejected** (2026-09-29) — **Building the browser stack once and passing
  it to the shards.** The shards build with their own env
  (`NEXT_PUBLIC_ROOT_DOMAIN=localhost`), so the Build job's output does not
  fit. A build job in front of the shards puts ~3 min in series with the
  tests. **More browser shards** were also rejected: a run already starts 19
  jobs, and overlapping runs queued for up to 6 min on the account's
  concurrent-job limit.
- **Adopted** — Check the cache before tuning jobs when CI slows down:
  `gh api repos/saroh-labs/saroh.in/actions/cache/usage`. Close to 10 GB means
  entries are being evicted.

## Tests

| Layer       | Where                                                                         | Database                                                                                |
| ----------- | ----------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Unit        | `jest.config.js`, directories listed explicitly                               | None; Prisma mocked                                                                     |
| Integration | `jest.integration.config.js`                                                  | `TEST_DATABASE_URL`, whose name must contain `test`; reset with `db push --force-reset` |
| Structural  | Source-scanning specs (`module-annotations.spec.ts`, `job-consumers.spec.ts`) | None                                                                                    |
| Browser     | `e2e/`, Playwright                                                            | The running stack                                                                       |
| Migrations  | `db:verify:replay`                                                            | An empty throwaway database                                                             |

- **Current** — all five layers exist.
- **Adopted** — **Show that a structural spec can fail:** remove what it pins and
  watch it name the break.
- **Current** — **A race test waits on `pg_locks`, never on a sleep.** Hold
  one transaction open at a known point, start the other, and
  `waitUntilBlockedBy(pid)` (`apps/api.saroh.in/test/lock-wait.ts`) until
  Postgres shows it waiting on the first; only then let the first go on. A
  sleep only guesses the overlap, so on a slow run the race never happens
  and the test passes with its lock removed. Prove it: run it five times,
  then five times with the lock removed, and it must fail every time.
  `src/common/db-spec-sleeps.spec.ts` fails on a new `setTimeout` in a
  `*.db.spec.ts`.
- **Adopted** — **Production confidence is more than unit tests** — critical
  journeys get browser coverage (PRODUCT_STRATEGY §27, `frontend-verification.md`).

## Dependencies

- **Adopted** — Before adding one, check it is not already installed under another
  name and was not removed on purpose.
- **Adopted** — One library per job: `lucide-react` for icons, `date-fns` for
  dates. Gap: `react-icons` in two files.
- **Adopted** — Remove what nothing imports. Gap: `@radix-ui/react-toast` is
  declared in `apps/app.saroh.in/package.json` and imported nowhere.

## Branches, batches and pull requests — **Adopted** (2026-09-29)

Every pushed PR is a full CI run, about twenty minutes, and a merge into
`development` or `main` deploys the Workers whose build changed. The rule
began on Vercel (retired 9 Oct 2026, DEC-107), where pushing one branch per
unit used up the deploy quota ("Resource is limited — try again in 24 hours")
and blocked real deploys. So work reaches GitHub in batches:

1. **Open a batch.** Branch `batch-<YYYY-MM-DD>-<n>` from the latest
   `development`, in its own worktree under `.claude/worktrees/`. `n` counts
   from 1, and a day can have several batches.
2. **One worktree per unit.** Each feature or unit gets its own worktree and
   branch, cut from the batch, and several can run at once. Build and test
   it there.
3. **Land units locally.** Merge each finished unit into the batch branch
   with `--no-ff` and a message naming the unit, then remove its worktree and
   branch. **Never push a unit branch, and never open a PR per unit.**
4. **Run `pnpm prepush --all` on the batch** before it leaves the machine.
   It runs gitleaks, lint, typecheck, the `check:*` scripts, unit tests and
   vitest, then the API integration tests in shards (a full `test:int` run
   can crash a worker), plain and again under RLS, the browser specs for the
   screens the batch touched on both `desk` and `phone`, and the permission
   specs they reach on the app's production build. The browser step is a copy of CI's
   seeded-stack job, not of `pnpm dev`: from a detached worktree of HEAD it
   re-creates `E2E_DATABASE_URL` (a throwaway `*test*` database), migrates
   it, seeds the showcase while building the api, accounts, app and
   renderer, and starts them on CI's bare ports (3333, 3000, 3003, 3005)
   with CI's placeholder env and `CI=1`. It tests committed work only. A spec
   run against `saroh-dev` fails on data drift, not code (DEV_LEARNINGS).
   Push only when it ends with ALL PASS.

### How the gate stays fast — **Current** (2026-09-29)

`scripts/prepush.sh` never does the same work twice:

- **Pass cache.** A passed step is recorded as
  `<git common dir>/prepush-cache/<HEAD^{tree}>-<step>`, only when no tracked
  file is modified. The next run on that tree prints `PASS (cached)`. Steps
  are recorded one by one, so `--int` reuses the quick run's lint, and a full
  unit pass counts for the hook's changed-only one. A tree that differs from
  a passed one only in `docs/` or `*.md` counts as passed, as CI's `changes`
  job treats it. Secrets are never cached: a leak lives in history. The
  browser step is keyed on HEAD's tree, since that is what it builds.
  `--no-cache` runs everything and bypasses turbo's cache too.
- **Turbo, affected packages only.** lint, typecheck, the api's unit tests
  (`test:unit`) and every vitest suite (`test`) run through turbo with
  CI's `--filter=...[<merge base>]` and turbo's local cache, which turbo
  shares between a checkout and its worktrees. The builds they import run
  once first and the checks run with `--only`. A run's pass-through
  arguments go into every task's hash, so `-- --changed=<sha>` made every
  `^build` miss the cache.
- **Changed-only tests in the hook.** The quick run uses jest
  `--changedSince` and vitest `--changed`, counted from the newest commit on
  the branch whose tree passed that step (else the merge base). `--int` and
  `--all` run the full suites.
- **Capped workers in the static burst.** Lint, typecheck and the unit tests
  start together beside the browser run's production builds, so the gate caps
  them: turbo `--concurrency=3` (`PREPUSH_TURBO_CONCURRENCY`), Jest
  `--maxWorkers=4` (`PREPUSH_JEST_WORKERS`), Vitest `--maxWorkers=2` per
  package (`PREPUSH_VITEST_WORKERS`). Uncapped, every runner started a worker
  per core and vitest ran 7x slower than alone, timing out a seed test. The
  database package's demo-seed tests run as their own `seeds` step after the
  burst. CI is unchanged: each job has its own machine.
- **Parallel integration.** `jest --shard=k/16` on `PREPUSH_INT_DBS`
  (default 3) databases named after `TEST_DATABASE_URL` plus `-1`, `-2`, …,
  created if missing. Each worker owns one database and its own `TMPDIR`,
  and each shard's globalSetup resets it. A shard that dies without a jest
  summary (the segfault) is retried once. The replay check runs alongside on
  `REPLAY_DATABASE_URL`, which it drops and re-creates.
- **Browser beside integration.** Under `--all` the browser stack builds and
  runs in the background from the start. It has its own database and CI's
  ports, and the integration specs bind none (they listen on port 0).
  `--e2e` and `--all` first stop this repo's `pnpm dev` stack (turbo dev,
  next dev, nest watch, matched by command line and a path under one of the
  repo's checkouts, plus their children), print what they stopped and the
  command that started it. `PREPUSH_KEEP_DEV=1` leaves it running. The quick
  run never stops anything.
- **Targeted integration and browser runs** (2026-09-29). Locally `--int`,
  `--e2e` and `--all` run only what the batch reaches. CI still runs
  everything, and `--full` does the same locally (on its own it means
  `--all --full`).
    - **Integration:** `jest --findRelatedTests` over the changed api files and
      the api files that import a changed workspace package. It always adds
      the permission, RLS and `module-annotations` specs. A change under
      `packages/database` or `packages/auth`, the api's `common/`, `src/*.ts`,
      `test/`, jest config, `package.json` or the lockfile runs the whole
      suite. The selected specs are sharded as before, about three to a shard.
    - **Browser:** every spec's first line names what it exercises:
      `// @covers app:/commerce/orders api:orders site:/shop pkg:site-blocks`.
      `scripts/e2e-affected.mjs` maps changed files onto those keys and prints
      each chosen spec with its reason. App, renderer and accounts files go
      through an import scan to the routes that use them; a layout reaches
      the routes beneath it. An api file reaches its own module and the
      modules that import it (one step, not `*.module.ts` wiring). A package
      reaches `pkg:` and whatever imports it. The schema, seed, `ui`, `auth`,
      tooling, CI, the playwright config and root configs pick every spec.
    - `pnpm run check:e2e-covers` (in the gate and CI's static job) fails a
      spec with no `@covers` line or a key that names no real route, module
      or package. Try a diff with
      `node scripts/e2e-affected.mjs --base <ref> --why`, or
      `--files <paths…>`.
    - A full pass counts for a targeted one, never the other way round.
    - Measured on a commit that touches one screen and one api module:
      `--e2e` picked 2 of 34 spec files (24 tests) and took 105s end to end
      instead of 657s. `--int` picked 10 of 381 specs (4 related, 6 always)
      and its integration step took 9s instead of 84s. The whole run took
      66s, most of it lint, which ran beside another browser run.
- **Seeded template for the browser step.** The first `--e2e` run migrates
  and seeds `<E2E db>` as CI does, then copies it to `<E2E db>-template`
  (`CREATE DATABASE … TEMPLATE`) and writes a key on the template's
  COMMENT: the object ids of the migrations, schema, `packages/database/src`,
  the block contract and the lockfile at HEAD, plus the Indian date, and the
  time it was seeded. A later run whose key matches, within
  `PREPUSH_E2E_TEMPLATE_HOURS` (default 4), copies the template in about a
  second and only builds. `--no-cache` reseeds. The template's name keeps
  "test" in it, and nothing but this connects to it.
- **Parallel browser specs, one browser run per machine** (2026-09-29).
  The browser step runs `e2e/run.mjs` on `PW_WORKERS` (default 4): all 34
  spec files on desk and phone in ~220s end to end on a template hit
  (parallel phase 2.0 min, serial phase 1.4 min), against 553s one at a
  time. Two runs share CI's ports, `$E2E_DIR` and the E2E database, so the
  background job first takes `<git common dir>/prepush-e2e.lock` (a
  directory holding its PID; one whose PID is dead is taken over). A second
  `--e2e` says whose run it waits on and waits up to
  `PREPUSH_E2E_LOCK_WAIT` seconds (1800), then fails clearly; it checks the
  ports only once it holds the lock. Teardown stops the PIDs its own run
  started and their children, never "whatever listens on 3000".
- **Both integration modes** (2026-09-30). CI runs every integration spec
  twice, plain and under RLS (`TEST_RLS=on`: the schema from the migrations,
  a NOBYPASSRLS role, every service call in its org context). `--int` does
  too: plain first, then the same selection under RLS (less the three
  owner-DDL backfill specs the RLS config leaves out), on the same
  `PREPUSH_INT_DBS` databases and the same sharding. Never side by side:
  every shard's reset takes ~800 locks in one transaction from a lock table
  every database shares, and twice the resets at once can end in "out of
  shared memory". Each mode has its own pass (`int:affected`/`int`,
  `int-rls:affected`/`int-rls`), so a tree that passed plain re-runs only
  RLS. The RLS role is one per cluster and each shard re-sets its password;
  Homebrew's Postgres trusts local connections, but one that checks
  passwords needs `PREPUSH_INT_DBS=1`.
- **The permission suite** (2026-09-30). CI's "Permission states
  (production build)" runs `e2e/permissions/` against the app's production
  build (`turbo run build`, then `next start` on 3004) and a fake api on
  3334 that answers per role, started by Playwright's `webServer`
  (`e2e/permissions.config.ts`). It never uses the seeded stack, and its
  `NEXT_PUBLIC_*` urls point at the fake api, so its build can't be the
  browser step's. `--e2e` runs it the same way, after the browser specs, in
  the same worktree of HEAD and under the same lock (one production build
  of the app at a time), with CI's env and nothing from the shell but
  `PATH`, `HOME`, `USER`, `TMPDIR` and `LANG`. Specs are chosen by
  `@covers`, like the browser specs
  (`node scripts/e2e-affected.mjs --suite permissions`): each names the app
  routes it opens, so a change to Team, roles, the nav or a screen's
  permission gate reaches it through the import scan, and its config, fake
  api, the ui and auth packages, tooling and root configs pick it whole. No
  api file does: the suite never runs the api. Its pass is
  `e2e-permissions:affected` (`e2e-permissions` under `--full`), keyed on
  HEAD's tree.

Measured on the 12-core Mac on 2026-09-29, on a batch 209 files ahead of
development (the browser step picked 25 spec files):

| Mode                  | Before  | New tree                                | Same tree again | `--no-cache` |
| --------------------- | ------- | --------------------------------------- | --------------- | ------------ |
| `pnpm prepush` (hook) | 75s     | 19s api change, 32s app change, 3s docs | 3s              | 73s          |
| `--int`               | ~7 min  | 95s (int 84s: 16 shards on 3 databases) | 4s              | 3 min        |
| `--e2e`               | ~17 min | 11 min (build ~1 min, specs ~10 min)    | cached on pass  | —            |
| `--all`               | ~25 min | 10.7 min (browser run is the long pole) | cached on pass  | —            |

These are full runs. A batch that changes the schema, seed or CI still gets
them, as batch 2 did. For a batch that touches a few screens and modules,
see the targeted timings above.

What the two CI mirrors added on 2026-09-30 (the same Mac, batch 4's tip,
PREPUSH_KEEP_DEV=1):

| Step                        | Typical tree (one screen + one api file)                 | Full run (`--all` on the batch: whole suite, every spec)                          |
| --------------------------- | -------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `int-rls` after plain `int` | +26s (30 of 388 specs, 10 shards; plain took 16s)        | +98s under `--int` (plain 85s); under `--all` 161s, hidden behind the browser run |
| `e2e-permissions` after e2e | +83s (1 spec file, 36 tests, the app's build from turbo) | +102s (both files, 44 tests, the app built fresh for the new tree)                |
| `--all` end to end          | —                                                        | 392s: browser 286s then permissions 102s; int + int-rls (321s) ran beside them    |

The app's production build for the permission suite takes about 20s when
Next's own cache is warm, and replays from turbo on a tree that has passed
it. One of four runs took 17.8 min in Playwright for the same 36 tests,
unexplained; the other three took 77–102s.

A small app change costs about 30s because ESLint over `app.saroh.in` takes
27s on its own. ESLint's `--cache` would cut that to seconds, but the config
uses type-aware rules, and a cached file can miss an error that a change in
another file caused, so the gate does not use it. 5. **Push once and open one PR into `development`.** Do it when a feature is
complete, not on a timer. Merge when CI is green, then check the change on
the development stack. Anything unfinished carries over into the next
batch. 6. **Release when ready.** Don't hold finished work back for a later day.
Open the `development` → `main` release PR as soon as development is
verified. **A person merges `main`; an agent never does.** After that
merge, the API is deployed as described under Shipping the API, with any
backfills the release names.

On each unit's GitHub issue, comment when the unit lands on development.

## Shipping the API

- **Current** — `.github/workflows/deploy-api.yml` builds
  `apps/api.saroh.in/Dockerfile`, pushes it to GHCR tagged `latest` and
  `sha-<commit>`, **and deploys that SHA tag**: a push to `main` goes to
  production, a push to `development` goes to the development API, and a manual
  run deploys to the `target` it is given (development by default). Each
  environment has its own deploy key, and the development key cannot reach
  production. Rollback means deploying the previous tag. The image builds in
  CI because the host also runs Postgres, and a workspace build there would
  evict its page cache.
- **Current** — The rollout itself lives on the host, not in this public repo:
  backup, `db:migrate:deploy` with the new image, deploy, and wait until that
  image reports `/health/ready`. CI's SSH key can run only that command. Host
  details and credentials stay in repository secrets and on the host — never
  commit them.
- **Current** — **Migrations apply before the new image serves traffic**, and
  never without a fresh backup.
- **Current** — **A release with a step after its migrations writes an
  ordered checklist** in `docs/architecture/`, and this file points at it. The
  Products and Stock release (#510–#531) is
  `docs/architecture/PRODUCTS_STOCK_ROLLOUT.md`: stop the old API first (it
  must not write between the stock copy and the new image), back up, migrate,
  run `listings-stock-levels.cli.ts` (which repairs held stock), verify with
  its two queries, optionally merge same products, then start the new image.
  It does not go through the automatic push-to-deploy. Rollback is
  restoring the snapshot. The same file records how long each migration takes
  and which table locks it holds.
- **Current** — **An enum value is changed by expand and contract, never
  renamed in place.** The order fulfilment types (DEC-045, plan B) ship in
  three releases — add the values (in a migration of their own; Postgres
  can't use a value in the transaction that adds it) while still writing the
  old ones, then switch writes and backfill, then drop the old values — each
  rolled back by deploying the previous tag. The ordered checklist, each
  migration's locks and timing, and each release's rollback are in
  `docs/architecture/ORDER_FULFILMENT_ROLLOUT.md` (B2a writes it; B2c and
  B2d keep it up).
- **Current** — **Round 2's Phase 1 release** (customer sign-in on merchant
  sites, Needs attention, a contact for every paying customer, and order
  fulfilment release 1) is `docs/architecture/ROUND_2_PHASE_1_ROLLOUT.md`:
  check the PostgreSQL version and the site sign-in secrets before deploy;
  back up, migrate, deploy the API and wait for `/health/ready`, then
  saroh.app, then the other frontends; run the C1 and C2 backfills after;
  roll saroh.app back together with the API.
- **Current** — **Round 2's Phase 2 checkpoints** keep their release steps in
  `docs/architecture/ROUND_2_PHASE_2_ROLLOUT.md`, one section per unit that
  needs one. D22 (CP-1): run the Razorpay public key backfill **before** the
  new API serves — that API takes no online payment through a Razorpay
  connection without one — and again after.
- **Current** — **The launch-readiness release** (everything after #708:
  round-2 follow-ups, DEC-069, DEC-070, DEC-071) is
  `docs/architecture/LAUNCH_READINESS_ROLLOUT.md`: pre-flight checks and the
  Z1/Z2a gates, build the image by hand, back up, migrate, order-number
  backfill, roll the API out at once (DEC-074's role update), then the
  `pvt` backfill; the release PR's merge ships the frontends last. Its four
  new flags stay off in production until their conditions are met.
- **Current** — **The pricing catalogue's release** is
  `docs/architecture/PRICING_ROLLOUT.md`: the API that reads plan overrides
  goes out before the grandfather backfill, which runs dry first with the
  owner's end date and the release time as its cutoff, then the Free-rows
  backfill (U12) with the same cutoff; the catalogue replaces
  `FREE_ENTITLEMENTS` only where both have run, and `PLAN_ENFORCEMENT` goes
  on last.
- **Adopted** — **Production writes need explicit approval at the time** —
  restarts, deploys, migrations, database writes. Read-only inspection does not.
