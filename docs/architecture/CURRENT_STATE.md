# Current State

Audit date: 2026-07-17. Scope: the full pnpm/Turborepo monorepo at `saroh-labs/saroh.in` (local remote currently names `himohitmehta/saroh.io`).

> **⚠️ SUPERSEDED (2026-07-20) — pre-build snapshot.** This document describes the repo
> _before_ Stages 0–7 were built and was **not** refreshed as they landed. Several claims
> below are now false: "`Store` is the effective tenant root" (Organization is the tenant
> root since Stage 1 / B5 made `Store.organizationId` NOT NULL); "sites fetchers return
> null" / "publishing not implemented end to end" (Stage 2 shipped Site/Page/Publication +
> a working public renderer); "no job queue, entitlement enforcement or analytics"
> (S3-003 JobQueue, B4 entitlements, Stage 7 analytics); "CI/CD: No committed workflow"
> (`.github/workflows/ci.yml` exists). **For current status, use the live per-stage tables
> in [`IMPLEMENTATION_BACKLOG.md`](./IMPLEMENTATION_BACKLOG.md).** Read this file as
> historical context only.
>
> **2026-08-08:** the public renderer named `sites.saroh.in` below is now `apps/saroh.app`,
> served from `saroh.app`; merchant sites hang off `*.saroh.app`, not `*.saroh.in`.
> `saroh.in` is the marketing site only.

## Architecture summary

Saroh is a 21-workspace-project monorepo: 10 deployable applications, 7 product packages, and 3 tooling packages. Next.js frontends call a NestJS API. The API and `@saroh/auth` are the only runtime consumers of `@saroh/database`. PostgreSQL is accessed through Prisma 7 and `@prisma/adapter-pg`.

The implemented product is currently a store-oriented content and commerce dashboard, not yet the broader digital-business platform. `Store` is the effective tenant root. A `Workspace` model exists, but `Store.workspaceId` is optional and the schema calls workspaces a future enterprise feature.

## Application inventory

| Application                             | Current role                                                  | Status                                                                                                            |
| --------------------------------------- | ------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `accounts.saroh.in` (`auth`)            | Better Auth login, signup, verification and password reset UI | Implemented; auth server is now mounted by API, despite some comments/README text saying accounts issues sessions |
| `api.saroh.in` (`@saroh/api`)           | NestJS auth and business API                                  | Implemented for stores, members, products, categories, inventory, customers, orders and blog content              |
| `app.saroh.in` (`application`)          | Owner/staff dashboard                                         | Substantial vertical slices; uses server-side adapters to API, not Prisma                                         |
| `admin.saroh.in` (`admin`)              | Allowlisted platform admin shell                              | Minimal/scaffold                                                                                                  |
| `sites.saroh.in` (`sites`)              | Public custom-domain/site renderer                            | Placeholder: fetchers always return null/empty                                                                    |
| `templates.saroh.in` (`ecom-templates`) | Template showcase                                             | Scaffold only                                                                                                     |
| `ui.saroh.in` (`ui`)                    | UI/chart showcase                                             | Implemented as internal showcase                                                                                  |
| `docs.saroh.in` (`docs`)                | Developer documentation                                       | Runs on Nextra; content is materially stale                                                                       |
| `help.saroh.in` (`help`)                | End-user help                                                 | Small, partially populated                                                                                        |
| `saroh.in` (`web`)                      | Marketing site and waitlist                                   | UI exists; waitlist logs email and returns success without persistence                                            |

`.github/copilot-instructions.md` documents 15+ apps, including absent `dashboard`, `chatbot`, and `email` apps, while calling `app.saroh.in` legacy. The repository actually has the 10 apps above, and `app.saroh.in` is the active dashboard.

## Shared-package inventory

| Package            | Responsibility                                                           | Assessment                                                                            |
| ------------------ | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------- |
| `@saroh/auth`      | Better Auth factory, browser client, server session fetch and middleware | Correct shared boundary; some stale documentation                                     |
| `@saroh/database`  | Prisma schema/client and migrations                                      | Correct infrastructure boundary; schema/migration and tenant model need stabilization |
| `@saroh/ui`        | Radix/shadcn components                                                  | Large but coherent presentation package                                               |
| `@saroh/charts`    | Recharts examples/components                                             | Presentation-only; several entry points are effectively empty                         |
| `@saroh/emails`    | React Email templates                                                    | Templates exist; no provider abstraction, queue, delivery tests or business workflow  |
| `@saroh/templates` | Intended site templates                                                  | Empty package with a deliberately failing test script                                 |
| `@saroh/utils`     | Small generic utilities                                                  | Very shallow; duplicated utilities also remain in apps                                |

Tooling packages provide ESLint, Tailwind and TypeScript presets. Version catalogs exist but apps also pin divergent Next/React versions.

## Data and request flow

1. A browser authenticates against Better Auth mounted at `api.saroh.in/api/auth`.
2. In production Better Auth emits a cookie scoped to `.saroh.in`.
3. Next middleware checks cookie presence and origin only; protected server components call `getServerSession`, which forwards the cookie to API for validation.
4. Dashboard server components/actions call module-specific adapters in `apps/app.saroh.in/lib/*/service.ts`.
5. Nest controllers derive `userId` from the validated session. Services check store ownership/membership and then query Prisma with `storeId`.
6. Prisma uses the PostgreSQL URL loaded by `packages/database/prisma.config.js` and `@prisma/adapter-pg`.

There is no general job queue, event bus, provider registry, observability layer, entitlement enforcement or analytics event pipeline.

## Authentication flow and migration status

Better Auth is the only authentication runtime found in application/package source. No NextAuth import or route remains. The migration is functionally farther along than README claims; remaining NextAuth references are documentation (`packages/auth/README.md`, developer docs and historical plans).

Cross-subdomain behavior is configured only for production using `.saroh.in`. Trusted origins are explicit. Mutating API and middleware requests reject an untrusted `Origin`/`Referer` when present. Full session validation is server-side. Missing origin headers are accepted, so sensitive cookie-authenticated mutations should additionally rely on Better Auth CSRF behavior and explicit integration tests.

## Tenant and authorization state

The API consistently derives the actor from the session and generally filters nested resources by `storeId`. Store reads hide existence with 404 responses. Write roles are string constants (`ADMIN`, `MANAGER`, `EDITOR`) duplicated in code/schema comments; there is no central policy engine or enum-backed RBAC.

Tenant ownership is split across `WorkspaceMember`, `StoreOwner`, and `StoreMembers`. Stores can have no workspace. Most business models carry `storeId`; child records such as variants/order items inherit ownership through parents, but the database cannot enforce that referenced `Customer`, `Product`, `Category`, and similar records belong to the same store. There is no PostgreSQL row-level security as a defense in depth.

## Site rendering and templates

The public renderer has route and component scaffolding, but `apps/sites.saroh.in/lib/fetchers.ts` deliberately returns no data. The schema has posts and custom domains but no first-class Site/Page/Section/TemplateVersion models. `@saroh/templates` is empty and the templates app is a showcase scaffold. Website creation and publishing are therefore not implemented end to end.

## AI, chatbot, email and storage

- No AI or chatbot application/module/package exists despite stale documentation.
- Email templates and SMTP-based auth email helpers exist, but there is no communication domain, delivery ledger, retry/job abstraction, inbound webhook processing or WhatsApp integration.
- S3/Spaces dependencies and environment names exist, but no shared storage provider package or verified upload lifecycle was found.

## Deployment assumptions

README states Vercel for frontends and a shared PostgreSQL/Neon database. No committed CI workflow, Dockerfile, deployment manifest or infrastructure-as-code exists. Builds require network access because the marketing app fetches Google Fonts at build time. Turborepo caches `.next` and `dist`, but its declared global environment list omits many build/runtime inputs.

## Feature status

Implemented: Better Auth core flows; session-gated dashboard; store CRUD; store membership/invitations; products/categories/variants/inventory; customers; orders/inventory transitions; blog posts/categories; platform admin allowlist shell.

Partial: email, custom domains, storage, docs/help, dashboard overview, templates showcase.

Placeholder: public site rendering, website/page builder, persisted waitlist, Organization/business-profile onboarding, Projects/Teams, forms/enquiries, contacts/leads/pipeline, bookings, payments, communications/WhatsApp, analytics, subscriptions/entitlements and marketplace. AI is intentionally deferred until the core platform operates.

Deprecated/duplicate: stale NextAuth docs; `saroh.io` branding and remote names versus `saroh.in` product domains; copied app utility/UI files; backup Prisma schema; absent apps still documented; empty templates package.

## Known build and test status

| Check                            | Result                                                                                                                                                                               |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `pnpm install --frozen-lockfile` | Exit 0; lockfile valid and Prisma generated. Registry metadata lookup failed offline; Husky could not lock `.git/config` in sandbox                                                  |
| Prisma generate                  | Pass                                                                                                                                                                                 |
| Auth typecheck                   | Pass                                                                                                                                                                                 |
| API typecheck                    | Pass                                                                                                                                                                                 |
| Auth tests                       | Pass: 10/10                                                                                                                                                                          |
| API tests                        | Guard suite passes 7 tests; 5 DB-backed suites fail (44 tests) because configured DB schema does not match current Prisma client; first run also required `--no-watchman` in sandbox |
| Root lint                        | Fail: Next 16 no longer supports `next lint`; API lint task is a no-op                                                                                                               |
| Root build                       | Fail: 6 tasks passed, then marketing build could not fetch Google Inter; Turbo cancelled remaining tasks                                                                             |
| CI/CD                            | No committed workflow found                                                                                                                                                          |
