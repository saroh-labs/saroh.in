# Tooling, CI, tests and shipping

> **Read when:** changing lint or TypeScript config, CI, the test setup or
> dependencies, or how the API is built and deployed.
> Adapted from claude-patterns `devops/05-tooling-and-ci.md` and
> `devops/01-deployment.md`.

## Workspace — **Current**

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
- **Adopted** — **Production writes need explicit approval at the time** —
  restarts, deploys, migrations, database writes. Read-only inspection does not.
