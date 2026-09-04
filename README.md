# Saroh.in

**Source-available** business platform: one place a small business sells, takes
bookings, follows up on enquiries, and keeps a website in step.

Free to use, modify and self-host — including to run your own business. The one
thing you may not do is offer it to other people as a hosted service. See
[Licence](#licence) below.

A pnpm + Turborepo monorepo: a set of Next.js apps and a single NestJS API, all
built on one Better Auth identity system and one PostgreSQL database.

> **What's built today:** an Organization-scoped workspace with Website
> (pages, posts, publishing, custom domains, draft previews), Appointments
> (services, availability, bookings, reschedule, outcomes), Commerce (catalog,
> orders, customers, CSV import), CRM (contacts, leads, pipeline) and a public
> renderer for merchant sites. Admin, Sales and Social are specified but not
> built. What remains is tracked in the issues and audited in
> [`docs/architecture/`](docs/architecture/) — start with
> [`PRODUCT_ROADMAP.md`](docs/architecture/PRODUCT_ROADMAP.md).

## Tech stack

- **Frontend:** Next.js 16, React 19, TypeScript 5, TailwindCSS 3, shadcn / Radix UI
- **Backend:** NestJS 11 modular monolith (`apps/api.saroh.in`)
- **Database:** PostgreSQL (AWS RDS) via **Prisma 7** with `@prisma/adapter-pg`
- **Auth:** **Better Auth 1.6.x** — the only identity system, hosted by `api.saroh.in` (_not NextAuth_)
- **Email:** React Email + Nodemailer (`@saroh/emails`)
- **Storage:** S3-compatible object storage (Cloudflare R2 is the accepted target — see DEC-009; not yet fully wired)
- **Hosting:** Vercel (frontends)
- **Tooling:** pnpm 9.9, Turborepo 2.9

## Architecture

`api.saroh.in` is the single business + authorization boundary. It **hosts the
Better Auth server** and owns all database access; frontends never import Prisma
and act only as thin, session-authenticated API clients. `accounts.saroh.in`
provides the auth **UI** (sign-in, signup, verification, password reset) but is
not a separate auth server. In production the session cookie is scoped to
`.saroh.in` so it works across every subdomain.

**Tenancy:** **Organization** is the single mandatory tenant boundary
(DEC-005), with optional **Projects** grouping resources beneath it, and
Organization-owned Sites and Stores. This is implemented, not planned:
`organizationId` is carried by 58 models, `OrganizationGuard` resolves a proven
`OrganizationContext` on every authenticated route, and PostgreSQL row-level
security enforces `org_isolation` on 66 tables — so a query that forgets to
scope is refused by the database rather than silently crossing tenants. See
[`TARGET_ARCHITECTURE.md`](docs/architecture/TARGET_ARCHITECTURE.md) and
[`DECISIONS.md`](docs/architecture/DECISIONS.md).

### Apps (`apps/*`) — 10 total

Every app answers locally at its production hostname with `.localhost`
appended, served over HTTPS by portless — no ports, and the same shape as
production, so a cookie scoped to `.saroh.in` behaves the same on
`.saroh.localhost`. Set it up once (step 4 below); the names come from each
app's `portless` field in its `package.json`.

| App                  | Production                               | Local (portless)                  | Role                                                                                         |
| -------------------- | ---------------------------------------- | --------------------------------- | -------------------------------------------------------------------------------------------- |
| `accounts.saroh.in`  | accounts.saroh.in                        | https://accounts.saroh.localhost  | **Auth UI** — login, signup, verification, password reset, OAuth (auth server runs in `api`) |
| `api.saroh.in`       | api.saroh.in                             | https://api.saroh.localhost       | NestJS backend; **hosts Better Auth** and owns all business logic + DB access                |
| `app.saroh.in`       | app.saroh.in                             | https://app.saroh.localhost       | The merchant workspace — website, schedule, services, sell, contacts, leads, insights        |
| `admin.saroh.in`     | admin.saroh.in                           | https://admin.saroh.localhost     | Platform admin — staff RBAC, permission guards, platform audit, feature flags (#128)         |
| `saroh.app`          | saroh.app, `*.saroh.app`, custom domains | https://saroh.app.localhost       | Public renderer for merchant sites — pages, posts, checkout, draft previews                  |
| `templates.saroh.in` | templates.saroh.in                       | https://templates.saroh.localhost | Design showcase — scaffold                                                                   |
| `ui.saroh.in`        | ui.saroh.in                              | https://ui.saroh.localhost        | Design-system / component showcase                                                           |
| `docs.saroh.in`      | docs.saroh.in                            | https://docs.saroh.localhost      | Developer documentation (Nextra)                                                             |
| `help.saroh.in`      | help.saroh.in                            | https://help.saroh.localhost      | End-user help guides (Nextra)                                                                |
| `saroh.in`           | saroh.in                                 | https://saroh.localhost           | Marketing site + waitlist                                                                    |

A **tenant site** is reached by its subdomain under the renderer, so the seeded
`northwind` site is https://northwind.saroh.app.localhost — the wildcard is why
`portless service install` takes `--wildcard`. A **draft preview** lives on the
renderer's own apex: `https://saroh.app.localhost/preview/<token>`.

### Shared packages (`packages/*`)

- `@saroh/auth` — shared Better Auth config: server instance + browser client + Next.js middleware/session helpers
- `@saroh/database` — Prisma schema + client (`@prisma/adapter-pg`)
- `@saroh/ui` — shared UI components / design system
- `@saroh/emails` — React Email templates (verification, password reset, …)
- `@saroh/charts` — chart components
- `@saroh/utils` — shared utilities

Tooling lives in `tooling/*` (eslint config, tailwind config, tsconfig).

## Implemented features

Store dashboard, all backed by the NestJS API with per-store ownership/membership
authorization:

- **Team members & invitations** — per-store members with email invitation + accept flow
- **Products catalog** — products, categories, variants and inventory
- **Orders & customers** — order lifecycle with reserve / commit / release inventory transitions
- **Content (blog)** — posts and post categories
- **Auth** — Better Auth email/password + OAuth, verification, password reset; session-gated dashboard

Placeholder / not yet implemented: public site rendering, page builder,
Organization/business-profile onboarding, forms/CRM, bookings, payments,
communications, analytics and subscriptions. AI work is intentionally deferred
(DEC-015). See [`CURRENT_STATE.md`](docs/architecture/CURRENT_STATE.md) for the
full audited status and [`RISKS_AND_TECH_DEBT.md`](docs/architecture/RISKS_AND_TECH_DEBT.md).

## Local setup

**Toolchain:** Node **>=24** (developed on 24.14.0) and pnpm **>=9.9** (9.9.0).
Corepack or a matching pnpm install is recommended; Turborepo drives the tasks.

```bash
# 1. Install
pnpm install

# 2. Configure env — copy the template and fill in real values
cp .env.example .env
# (each app may also read its own apps/<app>/.env)

# 3. Generate the Prisma client + sync the schema to your dev database
pnpm --filter @saroh/database build
pnpm --filter @saroh/database db:push

# 4. Once per machine, in a real terminal: the local HTTPS proxy that gives
#    every app its production hostname with `.localhost` appended
#    (prompts for sudo once; see docs/architecture/ENVIRONMENT.md)
npm install -g portless && portless service install --wildcard

# 5. Run apps. Every app answers at its own hostname over HTTPS — the table
#    above lists them all; details in docs/architecture/ENVIRONMENT.md
pnpm dev                 # everything
pnpm dev:api-auth        # api + accounts
pnpm dev:apps            # accounts + admin + sites
```

## Environment & secrets

- All `.env*` files are gitignored; only `.env.example` is committed. **Never
  commit a real `.env`.**
- If a real credential is ever exposed (e.g. a `DATABASE_URL` pasted somewhere
  shared), **rotate it immediately** in the provider dashboard — do not just
  delete the file.
- `BETTER_AUTH_SECRET` must be **identical** across `api` and any app that
  validates sessions, or cross-app login silently fails.

## Architecture & roadmap

The full audit, accepted architecture decisions, phased roadmap and
implementation backlog live in [`docs/architecture/`](docs/architecture/):

| Doc                                                                        | Contents                                           |
| -------------------------------------------------------------------------- | -------------------------------------------------- |
| [`CURRENT_STATE.md`](docs/architecture/CURRENT_STATE.md)                   | Audited current state of the monorepo              |
| [`DECISIONS.md`](docs/architecture/DECISIONS.md)                           | Accepted architecture decisions (DEC-001…015)      |
| [`TARGET_ARCHITECTURE.md`](docs/architecture/TARGET_ARCHITECTURE.md)       | Target modular-monolith design and ownership model |
| [`PRODUCT_ROADMAP.md`](docs/architecture/PRODUCT_ROADMAP.md)               | Stages 0–9 delivery plan                           |
| [`IMPLEMENTATION_BACKLOG.md`](docs/architecture/IMPLEMENTATION_BACKLOG.md) | Sized tickets (S0-001…S9-003)                      |
| [`RISKS_AND_TECH_DEBT.md`](docs/architecture/RISKS_AND_TECH_DEBT.md)       | Risk register (R-01…R-18)                          |

## Auth

**Better Auth is the only authentication system**, hosted by `api.saroh.in`; the
NextAuth migration is complete and no NextAuth code remains in source.
`accounts.saroh.in` provides the sign-in UI only — it is not a separate auth
server (see [DEC-001/002/003](docs/architecture/DECISIONS.md)). Documentation
was reconciled to this canonical host in S0-008; the only remaining
`next-auth` mentions are in local, gitignored `.env` files and in historical
migration plans under `docs/plans/` (kept as an accurate record). Advanced
Better Auth plugins (org, 2FA, OTP, API keys, admin roles) are a later milestone.

## Licence

Saroh is licensed under the **[Elastic License 2.0](LICENSE.md)** (ELv2).

| What you want to do                                      | Allowed?              |
| -------------------------------------------------------- | --------------------- |
| Read it, learn from it, take ideas from it               | Yes                   |
| Modify it, self-host it, run your own business on it     | Yes                   |
| Build client work on it, run it inside a company         | Yes                   |
| Offer it to third parties as a hosted or managed service | Not without asking us |

No fee, no registration, nothing to tell us. The single restriction exists so
that the hosted Saroh service — which funds the time that goes into this — is
not simply resold by someone else. If that is what you want to build,
[get in touch](mailto:mohit@saroh.in); it is a conversation, not a refusal.

**Two clauses that need context.** ELv2 forbids circumventing "license key
functionality" — Saroh has none, so that limitation is inert. And it requires
you to keep licensing and copyright notices intact in the source, and to mark
modified copies as modified.

### Credit

Keep the licence and copyright notices in the source. That is the only
requirement.

A "Built with Saroh" line in your README, or a link from your project page, is
genuinely appreciated and entirely optional.

**Nothing is required on your customers' websites.** Sites built with Saroh
carry no Saroh branding by design — your customers should see your business, not
the tool behind it — and the licence does not ask you to change that.

### Source-available, not open source

The [Open Source Definition](https://opensource.org/osd) does not allow
restrictions on field of use, and the hosted-service limitation is one. So this
is source-available. Said plainly here rather than left for someone to discover.

### Contributing

Contributions are welcome — see **[CONTRIBUTING.md](CONTRIBUTING.md)**.

One thing to know before you start: a first pull request needs the one-line
agreement in **[CLA.md](CLA.md)**. You keep your copyright; it grants permission
to include your work in the commercial licences sold to anyone running Saroh as
a hosted service. Without it, a single contributed file can block a commercial
licence covering the whole codebase — and that is much harder to unpick later
than to agree at the start.

### A note on pace

This is built part-time, mostly to learn in the open and to be useful to people
running small businesses. Issues and pull requests may sit a while before they
get proper attention — that is not disinterest, and a nudge after a week or two
is entirely fair.

## Contact

<mohit@saroh.in>
