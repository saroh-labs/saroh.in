# Tooling, CI, tests and shipping

> **Read when:** changing lint or TypeScript config, CI, the test setup or
> dependencies, or how the API is built and deployed.
> Adapted from claude-patterns `devops/05-tooling-and-ci.md` and
> `devops/01-deployment.md`.

## Workspace — **Current**

- **Adopted, implementation pending** — Saroh-managed client sites use one
  Saroh-owned Vercel multi-tenant project for `*.saroh.app` and verified custom
  domains. Next.js customer-facing server routes call the Saroh API; only the
  API accesses the database. Content publications are tenant-specific but code
  releases are shared. See [ADR-009](../architecture/adr/ADR-009-vercel-managed-multi-tenant-sites.md)
  and DEC-025 before changing this hosting boundary.

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

| Script         | Guards                                                         |
| -------------- | -------------------------------------------------------------- |
| `check:routes` | Every emitted destination and static link resolves to a route  |
| `check:blocks` | G2 and G6: merchant sites stay merchant-coloured; one renderer |
| `check:cycles` | No circular imports across workspaces                          |

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
- **Current** — **Each browser shard seeds and builds in one turbo run**, so
  the seed (~40s) overlaps the build. `db:seed:showcase` waits for
  `@saroh/database`'s own build, because its `prisma generate` rewrites the
  client the seed uses.
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

Every pushed branch starts five Vercel builds. Pushing one branch per unit
used up Vercel's deploy quota ("Resource is limited — try again in 24
hours") and blocked real deploys. So work reaches GitHub in batches:

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
   vitest, then the API integration tests in module groups (a full `test:int`
   run can crash a worker), then the browser specs for the screens the batch
   touched on both `desk` and `phone`. The browser step is a copy of CI's
   seeded-stack job, not of `pnpm dev`: from a detached worktree of HEAD it
   re-creates `E2E_DATABASE_URL` (a throwaway `*test*` database), migrates
   it, seeds the showcase, builds the api, accounts, app and renderer, and
   starts them on CI's bare ports (3333, 3000, 3003, 3005) with CI's
   placeholder env and `CI=1`. It tests committed work only and leaves the
   portless dev stack alone. A spec run against `saroh-dev` fails on data
   drift, not code (DEV_LEARNINGS). Push only when it ends with ALL PASS.
5. **Push once and open one PR into `development`.** Do it when a feature is
   complete, not on a timer. Merge when CI is green, then check the change on
   the development stack. Anything unfinished carries over into the next
   batch.
6. **Release when ready.** Don't hold finished work back for a later day.
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
- **Adopted** — **Production writes need explicit approval at the time** —
  restarts, deploys, migrations, database writes. Read-only inspection does not.
