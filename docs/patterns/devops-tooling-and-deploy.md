# Tooling, CI, tests and shipping

> **Read when:** changing lint or TypeScript config, CI, the test setup or
> dependencies, or how the API is built and deployed.
> Adapted from claude-patterns `devops/05-tooling-and-ci.md` and
> `devops/01-deployment.md`.

## Workspace

- pnpm workspaces (`apps/*`, `packages/*`, `tooling/*`, `e2e`) with pnpm
  catalogs, and Turborepo: `build`, `dev`, `lint` and `typecheck` depend on
  `^build`, so shared packages build first.
- Shared configuration: `tooling/eslint-config-custom` (`base`, `nextjs`,
  `react`), `tooling/tsconfig` and `tooling/tailwind-config`.

## Lint and types

- typescript-eslint recommended and type-checked configs. The shared `nextjs`
  config holds the boundary rules: no `@saroh/database` or auth package root in
  a frontend, no sonner `toast`, no `process.env`.
- `strict` is on in the product apps and in `tooling/tsconfig/base.json`.
  **`noUncheckedIndexedAccess` is off everywhere** — a known gap.
  `tooling/tsconfig/nextjs.json` sets `strict: false`, and only the Nextra docs
  apps extend it.
- An `eslint-disable` carries a reason after `--`. A type suppression is
  `@ts-expect-error <reason>`, never `@ts-ignore`.
- Prettier with organize-imports and the Tailwind plugin. The pre-commit hook
  (husky, lint-staged) formats staged files and runs `eslint --fix` on `.js`
  files; it does not typecheck. Never `--no-verify`.

## Invariant checks

| Script         | Guards                                                         |
| -------------- | -------------------------------------------------------------- |
| `check:routes` | Every emitted destination and static link resolves to a route  |
| `check:blocks` | G2 and G6: merchant sites stay merchant-coloured; one renderer |
| `check:cycles` | No circular imports across workspaces                          |

A repo-wide rule that a lint rule cannot express becomes a
`scripts/check-*.mjs` wired into CI and into AGENTS.md → Before you finish, not
a paragraph.

## CI — `.github/workflows/ci.yml`

Lint, cycles, routes, blocks, typecheck, API unit tests, build, and a
dependency audit that blocks on critical advisories; plus integration tests,
`migration-replay`, and gitleaks over the full history.

## Tests

| Layer       | Where                                                                         | Database                                                                                |
| ----------- | ----------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Unit        | `jest.config.js`, directories listed explicitly                               | None; Prisma mocked                                                                     |
| Integration | `jest.integration.config.js`                                                  | `TEST_DATABASE_URL`, whose name must contain `test`; reset with `db push --force-reset` |
| Structural  | Source-scanning specs (`module-annotations.spec.ts`, `job-consumers.spec.ts`) | None                                                                                    |
| Browser     | `e2e/`, Playwright                                                            | The running stack                                                                       |
| Migrations  | `db:verify:replay`                                                            | An empty throwaway database                                                             |

Show that a structural spec can fail: remove what it pins and watch it name the
break.

## Dependencies

- Before adding one, check it is not already installed under another name and
  was not removed on purpose.
- One library per job — `lucide-react` for icons, `date-fns` for dates.
- Remove what nothing imports.

## Shipping the API

- `.github/workflows/deploy-api.yml` builds `apps/api.saroh.in/Dockerfile` on
  pushes to `main` and pushes it to GHCR tagged `latest` and `sha-<commit>`.
  **It does not deploy.**
- Rollout is `./deploy.sh` on the VM — deliberately a human action, so a merge
  cannot restart production — and it pins the SHA tag, so rollback means naming
  the previous tag.
- The image builds in CI because the VM also runs Postgres, and a workspace
  build there would evict its page cache.
- Apply migrations (`db:migrate:deploy`) before the new image serves traffic.
  Never `migrate dev` against a shared database.
- **Production writes need explicit approval at the time** — restarts, deploys,
  migrations, database writes. Read-only inspection does not.
