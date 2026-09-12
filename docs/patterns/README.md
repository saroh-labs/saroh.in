# Saroh engineering patterns

How this codebase is built, written down so an agent or a new engineer can
follow it without reverse-engineering it. Adapted from the claude-patterns
library to what saroh.in actually does. Where the library and this repo
disagree, these files describe the repo and say why.

**AGENTS.md → Triggers** says which file to read before a given change, and
every file here opens with that trigger in its own words.

## Status labels

Every rule carries one of two labels:

- **Current** — saroh does this today. The evidence is named: a file, a spec, a
  count.
- **Adopted** — the rule to follow. It is not yet true everywhere, and the gap
  is named, with a count where one exists.

Don't copy an Adopted rule's gap into new code, and don't relabel a rule Current
without checking.

A pattern that a lint rule, a check script or a test can enforce is enforced
there, and the file names the enforcement. Trust the enforcement; read the file
for the reason, so the enforcement is not mistaken for bureaucracy and removed.

| File                                                                 | Read when                                                                                                               |
| -------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| [00-universal.md](00-universal.md)                                   | Before any change                                                                                                       |
| [saroh-product.md](saroh-product.md)                                 | Designing or changing anything a merchant sees, deciding what to build, or writing copy, a claim or a status            |
| [frontend-app-structure.md](frontend-app-structure.md)               | Adding a route, page, layout, component or `lib/` module in a Next app                                                  |
| [frontend-data-and-state.md](frontend-data-and-state.md)             | Reading or writing API data from a Next app, or adding client or URL state                                              |
| [frontend-forms.md](frontend-forms.md)                               | Building or changing a form                                                                                             |
| [frontend-error-feedback.md](frontend-error-feedback.md)             | Showing a toast, an error, an empty or loading state, or touching session redirects                                     |
| [frontend-design-system.md](frontend-design-system.md)               | Styling, tokens, skins, icons, motion, accessibility, or anything drawn on a merchant's page                            |
| [frontend-verification.md](frontend-verification.md)                 | Before calling a UI change done                                                                                         |
| [backend-nestjs.md](backend-nestjs.md)                               | Adding or changing an API module, controller, service, DTO or guard                                                     |
| [backend-data-and-money.md](backend-data-and-money.md)               | Changing the schema, adding a tenant-owned model, storing money, or shipping a migration                                |
| [backend-auth-and-access.md](backend-auth-and-access.md)             | Touching sessions, organization context, roles, membership, invitations, capability gates, entitlements or staff access |
| [backend-jobs.md](backend-jobs.md)                                   | Enqueueing a background job, or writing or registering a handler                                                        |
| [backend-integrations.md](backend-integrations.md)                   | Calling a payment, billing, messaging or storage provider, or receiving a webhook                                       |
| [devops-environments-and-flags.md](devops-environments-and-flags.md) | Adding an env variable, an environment check or a feature flag                                                          |
| [devops-secrets.md](devops-secrets.md)                               | Handling a credential, or finding one where it should not be                                                            |
| [devops-observability.md](devops-observability.md)                   | Adding logging, a degraded path, a health check or error tracking                                                       |
| [devops-tooling-and-deploy.md](devops-tooling-and-deploy.md)         | Changing lint, TypeScript, CI, tests or dependencies, or shipping the API                                               |

## Not adopted from the library

- **FastAPI, i18n and the domain solutions.** No Python, no `next-intl`, and
  none of those domains.
- **AI feature patterns.** DEC-015 defers AI, and no LLM code exists. Read
  claude-patterns `ai-features/` when that changes.
- **The `modules/<feature>/` frontend layout and React Query.** This repo is
  Server-Component-first; see `frontend-app-structure.md`.

## Keeping these true

One source for each truth (PRODUCT_STRATEGY §31). When these files disagree with
`PRODUCT.md`, `docs/design-system/`, an ADR or the code, fix whichever is wrong
in the same change — the `docs/design-system/` audit is from July 2026 and
carries dated update notes where it has gone stale. Change a pattern file in the
same commit as the code it describes, and add a row here and in AGENTS.md →
Triggers for a new one.
