# Current-state audit

> Audit-only cycle. Audited 2026-07-31 against `development` @ `9aa1899`.
> No application code, schema, migration, dependency, env or deploy config was
> modified during this cycle.
>
> Where this audit contradicts the transformation brief, **the repository won**.
>
> **2026-08-08:** `apps/sites.saroh.in` below is now `apps/saroh.app`, served from
> `saroh.app`; merchant sites hang off `*.saroh.app`.

**Confidence legend**

- **CONFIRMED** — reproduced against a running system, or read directly in code.
- **INFERRED** — read but not exercised; needs validation before acting.
- **RECOMMENDATION** — opinion, not a defect.

---

## 0. Corrections to the previous cycle

Two claims in the first audit pass were wrong. Both are corrected below and in
the backlog.

| Previous claim               | Reality                                                                                                                            | Where |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ----- |
| "Site publishing is a stub"  | **False.** The pipeline is real _and versioned_. `getSiteData` is dead legacy code with zero callers                               | §7    |
| "RLS is installed but inert" | **Understated.** The full enforcement layer exists — transaction-local context, ALS, an RLS-aware Prisma proxy — and is flag-gated | §8    |

This is the value of the audit-only cycle: both would have produced wasted work.

---

## 1. Applications, packages and request flows

**CONFIRMED.**

### Applications (10)

| App                                        | Role                                                           | Port (dev) |
| ------------------------------------------ | -------------------------------------------------------------- | ---------- |
| `apps/api.saroh.in`                        | NestJS. **Only** DB-facing service. 42 controllers, 180 routes | 3333       |
| `apps/app.saroh.in`                        | Merchant workspace, 44 routes                                  | 3003       |
| `apps/accounts.saroh.in`                   | Identity — sign-up/in, account settings                        | 3000       |
| `apps/admin.saroh.in`                      | Staff control plane                                            | 3001       |
| `apps/saroh.in`                            | Marketing                                                      | 3007       |
| `apps/sites.saroh.in`                      | Merchant site renderer (hostname → tenant)                     | 3009       |
| `apps/templates.saroh.in`                  | Template gallery                                               | 3006       |
| `apps/ui.saroh.in`                         | Design-system gallery                                          | 3011       |
| `apps/docs.saroh.in`, `apps/help.saroh.in` | Nextra docs                                                    | —          |

### Packages (8)

`database` · `ui` (49 components) · `auth` · `emails` · `object-storage` ·
`templates` · `charts` · `utils`

### Route counts

`@Get` 76 · `@Post` 54 · `@Delete` 27 · `@Put` 14 · `@Patch` 9 = **180**.

### Key request flows

1. **Authenticated org-scoped request.**
   `BetterAuthGuard` → `OrganizationGuard` (resolves tenant onto
   `request.organizationContext`) → `OrgRlsInterceptor` (opens the ALS org
   scope) → controller → service → RLS-aware `prisma` proxy.
   `apps/api.saroh.in/src/common/guards/organization.guard.ts`,
   `common/interceptors/org-rls.interceptor.ts`

2. **Admin request.** `BetterAuthGuard` → `PlatformAdminGuard` (resolves staff
   roles/permissions per request, uncached) → `PlatformPermissionGuard` →
   controller. `common/guards/platform-admin.guard.ts`

3. **Public/unauthenticated.** No guards by design. Owning org derived
   server-side from the target resource, never from the client.
   `modules/enquiry/enquiry.controller.ts`,
   `modules/payments/public-payments.controller.ts`,
   `modules/waitlist/waitlist.controller.ts`

4. **Merchant site render.** Request to a tenant hostname → `middleware.ts`
   rewrite to `/[domain]/*` → `getPublicationForHost` → API
   `public-sites.controller.ts` → `Site.currentPublication.snapshot`.

5. **Background work.** `JobWorkerService` polls `prisma-job-queue`, dispatches
   through `JobHandlerRegistry`. **Runs with no org context** (see §8.3).

---

## 2. The three defects — verification

All three **reproduced or read directly**. Full remediation detail in
[`security-remediation.md`](./security-remediation.md).

| ID      | Defect                                                       | Status                          |
| ------- | ------------------------------------------------------------ | ------------------------------- |
| SEC-001 | Idempotency replay silently discards a mutation              | **CONFIRMED — reproduced live** |
| SEC-002 | Admin authorization fails **open** on missing route metadata | **CONFIRMED — read**            |
| SEC-003 | `AdminAccessService.authorize()` has zero production callers | **CONFIRMED — grep**            |

Reproduction of SEC-001 against a running API (2026-07-31):

```
PUT /admin/flags/MODULE_INSIGHTS {enabled:false, idempotencyKey:K} → flag=false
PUT /admin/flags/MODULE_INSIGHTS {enabled:true,  idempotencyKey:K} → HTTP 200 {"ok":true}
                                                                     flag STILL false
                                                                     no FeatureFlagAudit row
```

Reproduction of the related access-session replay:

```
POST .../access-sessions {key:K}   → 201 id=S, expiresAt=T
DELETE .../access-sessions/S       → 200, revokedAt set in DB
POST .../access-sessions {key:K}   → 201 id=S, expiresAt=T   ← revoked session returned as fresh
```

---

## 3. Module dependency graph

**CONFIRMED.** `apps/api.saroh.in/src/modules/capabilities/module-registry.ts`

```
WEBSITE      ──▶ (none)
COMMERCE     ──▶ (none)
CRM          ──▶ (none)
INSIGHTS     ──▶ (none)          readiness: needs an event-producing module
PAYMENTS     ──▶ (none)          readiness: needs Commerce|Appointments + healthy provider
APPOINTMENTS ──▶ CRM
COMMUNICATIONS ▶ CRM
AUTOMATIONS  ──▶ CRM
```

**Finding — the declared dependency overstates the real one.**
`Booking.contactId → Contact` (`schema.prisma:1966`) and `Message → Contact`.
Neither touches `Lead` or `Pipeline`. The dependency is on the **`Contact`
table**, not on Sales-CRM concepts. See §4.

**User impact.** A studio that only takes bookings is told it needs a CRM and is
shown pipeline concepts it will never use.

---

## 4. Where customer, contact, CRM, order and booking live

**CONFIRMED.** `packages/database/prisma/schema.prisma`

| Concept              | Model                  | Line | Scope                                                     |
| -------------------- | ---------------------- | ---- | --------------------------------------------------------- |
| Commerce customer    | `Customer`             | 473  | **Store** (`storeId` required, `organizationId` NULLABLE) |
| Person / CRM contact | `Contact`              | 1592 | Organization                                              |
| Link between them    | `CustomerIdentityLink` | 1244 | Organization — **manual**, `linkedByUserId`               |
| Sales pipeline       | `Lead`                 | 1738 | Organization                                              |
| Consent              | `Consent`              | 2227 | attached to `Contact`                                     |
| Order                | `Order`                | —    | Store                                                     |
| Booking              | `Booking`              | 1966 | `contactId → Contact`                                     |

### 4.1 `Contact` is already ~80% of "Customer Core"

```prisma
model Contact {
  organizationId String       // org-scoped
  email     String            // "the primary identity", deduped per org
  leads       Lead[]
  submissions Submission[]
  bookings    Booking[]       // Appointments already binds here
  messages    Message[]       // Communications already binds here
  consents    Consent[]       // consent already lives here
  identityLinks CustomerIdentityLink[]
}
```

**Implication.** Extracting Customer Core is a **repackaging and dependency
retarget**, not a greenfield domain build. Substantially cheaper than the brief
assumes, and it can land early.

### 4.2 The real problem: `Customer` ≠ `Contact`

```prisma
model Customer {
  storeId        String       // REQUIRED
  organizationId String?      // OPTIONAL  ← RLS blocker
  email          String       // "NOT globally unique, unique per store"
  @@unique([storeId, email])
}
```

Consequences:

1. One person buying from two of a merchant's stores = **two `Customer` rows**.
2. `organizationId` nullable ⇒ commerce customers are **not reliably
   org-scoped**. A tenant policy keyed on that column cannot protect them.
3. Reconciliation is **manual** (`linkedByUserId`).

**User impact.** The merchant sees the same human as separate records.
**Business impact.** The marketing site now claims "the same customer record is
behind an order and a booking" — **that claim is currently false**.
**Data-integrity impact.** Nullable tenant key on a customer-data table.

---

## 5. Organization and Project — actual meaning

**CONFIRMED.** `schema.prisma:1153`

`Project` carries `name`, `slug`, `access[]`, `modules[]` — **and nothing else**.
It is a permission-and-module scoping container with no business semantics.

Critically, it is **not** the commerce container: `Store` is its own model and
`Customer.storeId`/`Order` hang off `Store`, not `Project`.

**Finding.** There are two competing sub-organization containers:

```
Organization ──▶ Project ──▶ ProjectModule      (capability selection, access)
     └────────▶ Store   ──▶ Customer, Order     (commerce data)
```

The problem is not the _word_ "Project" — it is that module selection and
commerce data hang off different containers.

**RECOMMENDATION.** ADR before any rename. Migration consequences must be
written down first.

---

## 6. Merchant navigation, dashboard, onboarding, empty states

**CONFIRMED** — inspected in-browser 2026-07-31 as an org owner with all 8
modules enabled.

### 6.1 Navigation mirrors the module registry

Sidebar groups: `CUSTOMERS` · `APPOINTMENTS` · `COMMERCE` · `WEBSITE` ·
`INSIGHTS` · `SETTINGS` — i.e. the architecture rendered as navigation.

### 6.2 Onboarding is already outcome-framed — then abandoned

`apps/app.saroh.in/app/onboarding/modules/page.tsx` asks _"What does your
business need to do?"_ with cards: **Show up online · Manage customers & leads ·
Take appointments · Sell products · Take payments · Message customers · Automate
follow-ups · See performance**.

This is precisely the vocabulary the brief asks for — and it is **discarded the
moment onboarding ends**. The user is handed a sidebar of module names instead.

**This is the single highest-leverage UX finding in the audit:** the language
already exists and tests well; it just needs to survive into the shell.

### 6.3 Home is action-oriented already

`/` renders "Do this next" plus a next-best-action list with `Setup` / `Overdue`
badges. A reasonable foundation for the command centre — extend, don't replace.

### 6.4 Empty states are competent but terminal

`Commerce` renders "No sales channels yet → Create a store". It explains and
offers one action, but offers no import, no sample data, and no illustration of
what the populated state looks like.

**Blocked finding.** Every screen reviewed was an empty state, because the dev
DB has 0 contacts, 0 services, 0 bookings, 3 products, 2 orders. **UX work on
populated states is blocked until seed data exists.**

---

## 7. Website publication pipeline — CORRECTED

**CONFIRMED.** The pipeline is **real and already versioned**. The previous
audit's "stub" claim was wrong.

```
Merchant edits Site/Page
   → POST /sites/:siteId/publish            sites.controller.ts:109 (requires site:publish)
   → Publication row created                schema.prisma:1504
       snapshot Json                        "fully-resolved, sanitized page(s)+sections"
       templateId + templateVersion
       publishedAt                          "immutable; republish == new row"
   → Site.currentPublication pointer updated
   ─────────────────────────────────────────
Visitor hits tenant hostname
   → sites middleware.ts rewrites to /[domain]/*
   → getPublicationForHost()                sites.saroh.in/lib/publication.ts:219
   → GET api /public/sites/...              public-sites.controller.ts
       "serves nothing but currentPublication.snapshot; drafts and unpublished are 404"
   → section-renderer.tsx renders sections
```

**Already present:** immutable versioned snapshots · republish-as-new-row (so
rollback is a pointer move) · template versioning · draft/unpublished never
served · org-scoped.

**The actual gaps:**

1. **No brand fields in the snapshot.** `lib/publication.ts` content types are
   `HeroContent`, `CtaContent`, `GalleryContent`, `EnquiryField` — grep for
   colour/font/theme returns nothing. A `--site-*` token layer exists
   (`app/[domain]/layout.tsx`, commit `2b2add5`) and is fed **defaults only**.
2. **No rollback UI** — the data model supports it; nothing exposes it.
3. **`getSiteData` (`lib/fetchers.ts:51`) is dead legacy** returning `null`
   always, with zero callers. Delete, don't "fix".

---

## 8. Tenant isolation, Prisma access, RLS — CORRECTED

**CONFIRMED.** Far more complete than the previous audit stated.

### 8.1 What exists

- **113 policies across 65 tables**, in four migrations
  (`20260718123258_rls_org_isolation`, `..._stage2_7`, `..._empty_string_safe`,
  `..._rls_child_tables`).
- **`runInOrgContext(orgId, fn)`** — `AsyncLocalStorage` scope
  (`packages/database/src/rls-proxy.ts`).
- **RLS-aware Prisma proxy** that wraps the ambient client so every org-scoped
  operation runs in a short transaction whose first statement is
  `set_config('app.current_organization_id', …, is_local => true)`.
- **`OrgRlsInterceptor`** opens that scope per org-scoped request, subscribing
  _inside_ the ALS scope so async continuations inherit it.
- **Per-operation micro-transactions**, deliberately not one long transaction —
  so a handler making an external call mid-request never holds a transaction
  open across network I/O.

This is a correct design for pooled connections. Transaction-local, not
session-local.

### 8.2 Why it is not active

1. `RLS_ENFORCEMENT` flag is **off** — the proxy is a transparent pass-through.
2. The runtime DB role still has **`BYPASSRLS`**.

### 8.3 The policy design is **fail-open** — key finding

```sql
CREATE POLICY "org_isolation" ON "Store"
  USING (current_setting('app.current_organization_id', true) IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true));
```

If the GUC is unset, **the policy permits everything**. Per the proxy docstring
this is deliberate — "background jobs and public endpoints run with NO org id in
the ALS … the policies' permissive branch → cross-org access, as the job worker
requires."

**Consequences.**

- RLS protects the **org-scoped HTTP path only**. Jobs, webhooks and public
  endpoints are unprotected by RLS _by design_.
- Any future code path that forgets to establish context silently gets
  full-table access rather than an error.
- The brief's §7 asks for RLS tests covering jobs/webhooks/public endpoints —
  under this design those tests would pass **trivially and misleadingly**.

**RECOMMENDATION.** Keep the permissive branch for the job worker, but pair it
with an explicit, auditable "system context" rather than absence-of-context, so
"no context" can eventually become deny.

### 8.4 Blocker before enforcement

`Customer.organizationId` is nullable (§4.2). A tenant policy keyed on it cannot
protect those rows. **Backfill and require it before enabling RLS.**

### 8.5 No cross-tenant tests

**CONFIRMED.** Isolation is the platform's core safety property and nothing
asserts it. No negative test attempts a cross-tenant read or write.

---

## 9. Environment, migrations, seeding, deployment

**CONFIRMED.**

| Finding                                                                                                                                                | Evidence                             |
| ------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------ |
| Root `.env` → Neon `neondb` (7 tables); API `.env` → `saroh-dev` (81 tables). Root-level `pnpm db:seed` / `db:migrate:deploy` targets the **wrong DB** | both `.env` files                    |
| **No CD** — `.github/workflows/` contains `ci.yml` only                                                                                                | filesystem                           |
| API cannot start via `pnpm start` alone — `createAuth()` runs at import time and throws before `ConfigModule` loads `.env`                             | `common/auth/auth.ts`                |
| Two admin migrations sat unapplied on dev until 2026-07-31; no migration-status visibility in any pipeline                                             | `prisma migrate status`              |
| Integration tests **do** have a DB guard refusing to run against non-test databases                                                                    | `apps/api.saroh.in/test/db-guard.ts` |
| Seed exists but is thin — `packages/database/src/seed.ts` creates no credential, so the seeded user cannot log in                                      | `seed.ts`                            |

---

## 10. Observability, logging, jobs, webhooks

**CONFIRMED.** Better than the brief assumes on logging; absent on metrics.

### Present

- **Correlation IDs** — `common/logging/correlation-id.middleware.ts`
- **Structured JSON logger** — `common/logging/structured-logger.ts`
- **Redaction** — `common/logging/redact.ts` covers `authorization`, `cookie`,
  `set-cookie`, `x-api-key`, `x-auth-token`, `password*`, `token`
- **Guard-denial logging** — `http-request-log.ts` with a symbol marker so
  interceptor and exception filter cannot double-log (added because guards run
  before interceptors, so 401/403 were previously invisible)
- **Durable job queue** — `prisma-job-queue.ts`, `job-worker.service.ts`,
  typed `JobHandlerRegistry`, attempt tracking, unknown-type no-op with error log
- **Webhook inbox** — signature verified before write; replay idempotent

### Absent

- No metrics of any kind (latency, error rate, queue depth, job failures)
- No tracing
- No error aggregation
- `/health` returns a **static object** — `status:"ok"` unconditionally, with no
  DB or queue check. It cannot fail, so it is not a readiness probe
  (`modules/health/health.controller.ts`)

---

## 11. Test, lint and typecheck baseline

**Commands run this cycle** — see §13.

| Gate                                                                      | Result                     |
| ------------------------------------------------------------------------- | -------------------------- |
| API unit tests                                                            | **675 passed / 72 suites** |
| Typecheck — api, application, auth, web, sites, ecom-templates, ui, admin | **0 errors, all 8**        |
| Lint — api, auth, sites, ecom-templates, ui, admin                        | **0 errors**               |
| Lint — `application` (`app.saroh.in`)                                     | **28 errors, 6 warnings**  |
| Lint — `web` (`saroh.in`)                                                 | 0 errors, **1 warning**    |

Integration tests were **not** run — they require `TEST_DATABASE_URL` pointing at
a dedicated test database, which is not provisioned locally.

---

## 12. Pre-existing vs newly discovered failures

**No new failures were introduced this cycle** — no code was modified.

### Pre-existing (present before any 2026-07-31 work)

| Failure                                       | Detail                                                                                                              |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| 28 lint errors + 6 warnings in `app.saroh.in` | mostly `@typescript-eslint/prefer-nullish-coalescing`; verified pre-existing by stashing all changes and re-running |
| 1 lint warning in `saroh.in`                  | `react-hooks/incompatible-library` on RHF `watch`                                                                   |
| SEC-001/002/003                               | all predate this session                                                                                            |

### Newly discovered this cycle (not new _failures_ — newly _found_)

| Finding                                                          | Section    |
| ---------------------------------------------------------------- | ---------- |
| RLS policies are fail-open when the GUC is unset                 | §8.3       |
| `Customer.organizationId` nullable blocks RLS                    | §4.2, §8.4 |
| `/health` cannot fail — not a readiness probe                    | §10        |
| Money is `Decimal(_,2)`, **not** minor units                     | §14        |
| No cross-tenant negative tests exist                             | §8.5       |
| Publication pipeline is versioned already (corrects prior claim) | §7         |

---

## 13. Commands run

```bash
pnpm --filter @saroh/api test                      # 675 passed / 72 suites
pnpm --filter <each of 8> typecheck                # 0 errors each
pnpm --filter <each of 8> lint                     # baseline recorded §11
grep/find across schema, module registry, guards, interceptors, migrations
```

No mutating command was run. No migration applied. No dependency installed.

---

## 14. Global-commerce readiness

**CONFIRMED.** Much further along than the brief assumes — with one real gap.

| Aspect                   | State                                                                                                                             |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------- |
| Currency defaults        | `"USD"` at `schema.prisma:388, 550, 769`                                                                                          |
| Timezone                 | `"UTC"` default; bookings store absolute UTC **plus** the IANA tz the booker saw, DST-correct (`:1886-1887, 1916, 1971`)          |
| Country fields           | present at `:192, :486`                                                                                                           |
| India-specific residue   | **one** `@default("INR")` at `:2385`; **one** hardcoded `₹` in `app.saroh.in/components/bookings/create-service-form.tsx`         |
| **Money representation** | **`Decimal(_,2)`, not minor units** — `apps/api.saroh.in/src/common/money.ts` renders a fixed 2-dp string from a Prisma `Decimal` |

**The money finding is the substantive one.** `Decimal(_,2)` is safe from float
error (the helper is careful to use string ops only), but it hard-codes a
**two-decimal assumption**. Zero-decimal currencies (JPY, KRW) and
three-decimal ones (KWD, BHD) do not fit. This is a genuine
global-commerce blocker that the brief's "store minor units" instruction
correctly anticipates.

Everything else in brief §9 is close to done.

---

## 15. What this audit did not cover

Stated so the backlog is not mistaken for complete.

- Commerce, Orders, Payments, Automations **internals** — only their schema,
  module registration and public surfaces were read.
- `admin-metrics.service.ts` and most spec files were not read in depth.
- `packages/emails`, `packages/charts`, `packages/object-storage` unreviewed.
- Integration test suite not executed (no test DB provisioned).
- No performance, load, cost or bundle-size analysis.
- Per-screen accessibility was not audited; only design tokens were verified
  (50 pairs, WCAG AA, both themes).
- `docs.saroh.in` / `help.saroh.in` content not reviewed.
