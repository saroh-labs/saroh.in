# Universal rules

> **Read when:** before any change, in any app or package.
> Adapted from claude-patterns `00-universal-rules.md`. For product rules, read
> `saroh-product.md`; for how an AI agent should work here, `PRODUCT_STRATEGY.md`
> §33 applies in full.

## 1. Search before creating

**Adopted** — Look for an existing component, hook, helper or service before
writing one; extend or promote it rather than copy it. Five `cn()`
implementations and an orphan `packages/utils` existed until `5ec5560`; no known
duplicate remains, and the rule is what keeps it that way.

## 2. One way to reach the API per app

**Current** — `app.saroh.in` goes through `lib/api/http.ts` (`apiFetch`,
`getJson`, `getList`, `mutate`), server-only, forwarding the session cookie and
the active organization; domain adapters in `lib/<domain>/service.ts` use it.
`admin.saroh.in` uses `lib/control-plane.ts`, the same shape for `/admin/*`.
Client components call a Server Action, never the API. Frontends never import
`@saroh/database` or a package that does (ESLint). `accounts.saroh.in` is the
exception by design: it talks to Better Auth through `authClient`.

## 3. Failures carry their status

**Current** in `app.saroh.in` — `lib/api/errors.ts` `ApiError` keeps the HTTP
status and exposes `isUnauthorized`, `isForbidden`, `isNotFound` and
`isServerError`. Narrow on those, never on a number. A permission denial is
explained, not presented as a breakage (PRODUCT_STRATEGY §30). No other app has
a typed error yet.

## 4. Every user-initiated failure is visible

**Current** — A toast, an inline message or a boundary; the only silent
`catch {}` in the repo is the pre-paint theme script in the accounts layout. See
`frontend-error-feedback.md`.

## 5. Tokens, not colours

**Adopted** — Semantic tokens in product apps, `--site-*` on merchant pages, and
never a hex literal, a raw palette class or an arbitrary value in app code.
Gap: one raw palette class remains in `app.saroh.in`. See
`frontend-design-system.md`.

## 6. Keep files small enough to read

**Adopted** — Past roughly 400 lines, split along seams that already exist; spec
files often show them (`backend-nestjs.md`). Gap: 38 source files were over when
this was written, led by `sites.service.ts`, `site-editor.tsx` and
`bookings.service.ts`. Seed data is exempt.

## 7. No `any`, no `@ts-ignore`

**Adopted** — Gap: one `any` (`payments/crypto.ts`); no `@ts-ignore`. Suppress
with `@ts-expect-error <reason>` if you must.

## 8. `cn()` comes from `@saroh/ui/lib/utils`

**Current** — `packages/site-blocks` keeps its own on purpose; its docstring
says why.

## 9. No `alert()` or `confirm()`

**Current** — none in app code. Use `@saroh/ui/alert-dialog` or
`@saroh/ui/dialog`, and `@saroh/ui/toast`.

## 10. Uploads go straight to storage

**Current** — presigned PUTs from `packages/object-storage`; the API never
proxies file bytes.

## 11. Environment through `env.ts`

**Current** — never `process.env` in an app (ESLint `restrictEnvAccess`). See
`devops-environments-and-flags.md`.

## 12. Say what is true

**Adopted** — A comment, a UI string or a doc must match what ships (see
`saroh-product.md`). Gap: the Insights dashboard tells organizations "No views
recorded" when their rollups were never computed. Two booking comments that
claimed delivery were corrected in `fb778b9`.

## 13. Leave a trail

**Current** — `docs/architecture/DEV_LEARNINGS.md` for anything non-obvious you
fixed; the pattern file and its AGENTS.md trigger for any convention you change;
a row in AGENTS.md → Triggers for a new skill or pattern file.

## 14. Git

**Current** — don't commit or push unless asked. Never `--no-verify`: the
pre-commit hook runs lint-staged, so fix what it reports.

## Before calling anything done

Run the commands in AGENTS.md → Before you finish.
