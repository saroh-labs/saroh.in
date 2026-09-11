# Universal rules

> **Read when:** before any change, in any app or package.
> Adapted from claude-patterns `00-universal-rules.md`.

## 1. Search before creating

Look for an existing component, hook, helper or service before writing one;
extend or promote it rather than copy it. Skipping this has a measured cost
here: `cn()` had five implementations, and `packages/utils` was an orphan
package nothing depended on.

## 2. One way to reach the API per app

- `app.saroh.in`: `lib/api/http.ts` (`apiFetch`, `getJson`, `getList`,
  `mutate`). Server-only; forwards the session cookie and the active
  organization. Domain adapters in `lib/<domain>/service.ts` use it, and
  nothing re-declares fetch plumbing.
- `admin.saroh.in`: `lib/control-plane.ts`, the same shape for `/admin/*`.
- Client components call a Server Action, never the API.
- Frontends never import `@saroh/database`, or a package that does (ESLint).

## 3. Failures carry their status

`apps/app.saroh.in/lib/api/errors.ts` `ApiError` keeps the HTTP status and
exposes `isUnauthorized`, `isForbidden`, `isNotFound` and `isServerError`.
Narrow on those, never on a number. A permission denial is explained, not
presented as a breakage (PRODUCT_STRATEGY §30).

## 4. Every user-initiated failure is visible

A toast, an inline message or a boundary — never a silent `catch {}` on
something the user did. See `frontend-error-feedback.md`.

## 5. Tokens, not colours

Semantic tokens in product apps, `--site-*` on merchant pages, and never a hex
literal or a raw palette class in a component. See `frontend-design-system.md`.

## 6. Keep files small enough to read

Past roughly 400 lines, split along seams that already exist — spec files often
show them (`backend-nestjs.md`). This is guidance, not a gate: 38 source files
were over it when this was written, led by `sites.service.ts`,
`site-editor.tsx` and `bookings.service.ts`, and seed data is exempt.

## 7. No `any`, no `@ts-ignore`

One `any` remains repo-wide. If you must suppress, use
`@ts-expect-error <reason>`.

## 8. `cn()` comes from `@saroh/ui/lib/utils`

`packages/site-blocks` keeps its own on purpose; its docstring says why.

## 9. No `alert()` or `confirm()`

Use `@saroh/ui/alert-dialog` or `@saroh/ui/dialog`, and `@saroh/ui/toast`.

## 10. Uploads go straight to storage

Presigned PUTs from `packages/object-storage`. The API never proxies file
bytes.

## 11. Environment through `env.ts`

Never `process.env` in an app. See `devops-environments-and-flags.md`.

## 12. Say what is true

A comment, a UI string or a doc must match what ships. Two comments claimed
booking notifications were delivered when no handler existed. Fix the claim or
ship the thing (`.agents/skills/saroh-architecture/SKILL.md`, rule 3).

## 13. Leave a trail

- Fixed something non-obvious: add an entry to
  `docs/architecture/DEV_LEARNINGS.md`.
- Changed a convention: update its pattern file and its AGENTS.md trigger in
  the same commit.
- Added a skill or a pattern file: add a row to AGENTS.md → Triggers.

## 14. Git

Don't commit or push unless asked. Never `--no-verify`: the pre-commit hook runs
lint-staged, so fix what it reports.

## Before calling anything done

Run the commands in AGENTS.md → Before you finish.
