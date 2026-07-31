# Current-state audit

> Audited 2026-07-31 against `development` @ `3066a81`.
> Every claim below cites a file path. Where this audit contradicts the
> transformation brief, the repository won.

Legend for confidence:

- **CONFIRMED** — reproduced or read directly in the code.
- **INFERRED** — read from code but not exercised; needs validation.
- **RECOMMENDATION** — a product/architecture opinion, not a defect.

---

## 1. Four findings that change the plan

The brief makes reasonable assumptions that the code does not bear out. These
change sequencing and cost, so they are stated first.

### 1.1 Customer Core is ~80% built already — it is called `Contact`

**CONFIRMED.** `packages/database/prisma/schema.prisma:1592`

`Contact` is already the organization-level person record, and it already owns
the relationships Customer Core is supposed to own:

```prisma
model Contact {
  organizationId String        // org-scoped, not module-scoped
  email     String             // "the primary identity", deduped per org
  leads       Lead[]
  submissions Submission[]
  bookings    Booking[]        // Appointments already binds here
  messages    Message[]        // Communications already binds here
  consents    Consent[]        // consent already lives here
  identityLinks CustomerIdentityLink[]
}
```

`Booking.contactId` → `Contact` (`schema.prisma:1966`). So **Appointments and
Communications already depend on the Contact table, not on Sales-CRM concepts**
(`Lead`, `Pipeline`).

The dependency on CRM is declared at the _module_ level, not the data level:

```ts
// apps/api.saroh.in/src/modules/capabilities/module-registry.ts:129
{ key: "APPOINTMENTS", dependencies: ["CRM"], ... }
```

**Implication:** extracting Customer Core is largely a _repackaging and naming_
exercise plus an auto-link job — not building a new domain. This is
substantially cheaper than the brief assumes, and it can land early.

### 1.2 The real customer problem is `Customer` vs `Contact`, and it is worse than described

**CONFIRMED.** `schema.prisma:473`

```prisma
model Customer {
  storeId        String        // REQUIRED — scoped to a Store, not the org
  organizationId String?       // OPTIONAL
  email          String        // "NOT globally unique, unique per store"
  @@unique([storeId, email])
}
```

Three consequences:

1. One human buying from two of the same merchant's stores is **two `Customer`
   rows**.
2. `Customer.organizationId` being **nullable** means commerce customers are not
   reliably org-scoped — this is also an RLS blocker (§4.3).
3. Reconciling a `Customer` to a `Contact` is **manual**:
   `CustomerIdentityLink.linkedByUserId` (`schema.prisma:1253`) — a person has to
   press a button.

So "the same customer record sits behind an order and a booking" — which the
marketing site now claims — **is not true today** unless a human linked them by
hand.

### 1.3 The platform is far more globally ready than the brief assumes

**CONFIRMED.** Currency/timezone defaults in `schema.prisma`:

| Line          | Field              | Default                              |
| ------------- | ------------------ | ------------------------------------ |
| 388, 550, 769 | `currency`         | `"USD"`                              |
| 768           | `timezone`         | `"UTC"`                              |
| 1914          | `Service.currency` | ISO 4217, nullable                   |
| 1916, 1971    | `timezone`         | IANA, stored per Service/Booking     |
| **2385**      | `currency`         | **`"INR"`** ← the only India default |

Bookings already store absolute UTC plus the display timezone the booker saw,
DST-correct (`schema.prisma:1886-1887`). Country fields exist at `:192`, `:486`.

Hardcoded `INR`/`₹`/`en-IN` in non-test source is **one file**:
`apps/app.saroh.in/components/bookings/create-service-form.tsx`.

**Implication:** §9 of the brief ("remove India-only assumptions") is nearly
done. The remaining work is one schema default, one form, and money-as-minor-
units verification — not a platform-wide abstraction programme. Downgrade from
a phase to a handful of backlog items.

### 1.4 `Project` has no domain meaning at all

**CONFIRMED.** `schema.prisma:1153`

`Project` carries `name`, `slug`, `access[]`, `modules[]` — and nothing else. It
is a permission-and-module scoping container with no business semantics. It is
_not_ a Store: `Store` is its own model and `Customer.storeId` points there.

So there are currently **two competing sub-org containers** — `Project` and
`Store` — and commerce data hangs off `Store` while module selection hangs off
`Project`. That, not the word "Project", is the actual problem.

---

## 2. Confirmed security and correctness defects

All three were **reproduced live** during the 2026-07-31 session, not read.

### 2.1 P0 — Idempotency replay silently discards a mutation

**CONFIRMED (reproduced).**
`apps/api.saroh.in/src/modules/admin/admin.controller.ts:190-195`,
`apps/api.saroh.in/src/modules/feature-flags/feature-flags.service.ts:82`

The key omits the value being written:

```ts
idempotencyKey: [user.id, "flags.global.set", flagKey, dto.idempotencyKey].join(
    ":",
);
```

Reproduced against a running API:

```
PUT enabled=false key=K  → flag = false
PUT enabled=true  key=K  → HTTP 200 {"ok":true}, flag STILL false, no audit row
```

**Impact:** an incident-time rollback run from a script with a stable key
reports success and changes nothing. The flag history shows only the first
write. The admin UI dodges it only because `flag-card.tsx` mints a random UUID
per click — the API is the contract, and the API is wrong.

### 2.2 P0 — Access-session replay returns a revoked session as a fresh grant

**CONFIRMED (reproduced).**
`apps/api.saroh.in/src/modules/admin/admin-access.service.ts:107-110`

```ts
const replay = await tx.adminAccessSession.findUnique({
    where: { idempotencyKey },
});
if (replay) return replay; // returns BEFORE the lifecycle checks at :112-126
```

Reproduced: open → revoke → replay same key → `201` with the same session id and
the original `expiresAt`, still `revokedAt` in the DB, no audit event written,
and the `DELETED_RETAINED` org check at `:119-126` never runs.

### 2.3 P0 — Authorization fails **open** on missing route metadata

**CONFIRMED (read).**
`apps/api.saroh.in/src/common/guards/platform-permission.guard.ts:32`

```ts
if (!required || required.length === 0) return true;
```

Compounded by the contract test being a hand-maintained list — a newly added
handler is simply absent from `AdminMethod` and the spec still passes
(`admin.controller.permissions.spec.ts:12-25`).

Nothing is ungated _today_ (every current route carries
`@RequireAdminPermission` except the deliberately identity-only `/admin/me`),
but the default for the next route added is ungated.

### 2.4 P1 — `AdminAccessService.authorize()` has zero production callers

**CONFIRMED.** A repo-wide search for `.authorize(` returns the definition plus
five calls, all in `admin-access.service.spec.ts`.

The ledger writes `organization.access.open` events asserting a gated
support-access control that is not wired to anything. `expire()` is only
reachable from `authorize()`, so sessions are never marked expired — rows sit at
`revokedAt: null` past `expiresAt` indefinitely.

### 2.5 P2 — lower-severity admin issues

- **Nobody can revoke another staff member's session.** `revoke()` requires
  `actorUserId === staff.userId` (`admin-access.service.ts:233-240`), so a
  Platform Owner cannot close a compromised engineer's session.
- **Denials audit through an error-swallowing path.** `deny()` uses
  `recordRead()` (`admin-audit.service.ts:84-96`), which catches and logs. A
  denial is the signal the ledger exists to capture; it should fail closed.
- **Concurrent duplicate keys surface as 500,** not 409 — `wasAlreadyAudited` is
  SELECT-then-INSERT under READ COMMITTED and the loser's `P2002` is unmapped.

---

## 3. Multi-tenancy and isolation

### 3.1 RLS is installed but inert — CONFIRMED

Policies exist in migrations, but the enforcement flag is off and the runtime
role has `BYPASSRLS`. Tenant isolation today is **entirely application-layer**
`organizationId` scoping.

### 3.2 Blockers that must be fixed _before_ RLS can be switched on

**CONFIRMED.** These are why "just enable RLS" is not a one-step task:

1. **`Customer.organizationId` is nullable** (`schema.prisma:477`). A tenant
   policy keyed on `organizationId` cannot protect rows where it is null.
2. **`Customer` is Store-scoped**, so the tenant predicate has to traverse
   `Store → Organization` rather than read a local column — slower and easier to
   get wrong.
3. Pooled connections mean tenant context must be **transaction-local**, not
   session-local, or context leaks between requests.

**Recommendation:** backfill and require `Customer.organizationId` _before_ any
RLS work. It is a prerequisite, not a parallel task.

---

## 4. Product architecture

### 4.1 Module dependencies overstate coupling — CONFIRMED

`module-registry.ts` declares `APPOINTMENTS → CRM`, `COMMUNICATIONS → CRM`,
`AUTOMATIONS → CRM`. As §1.1 shows, the true data dependency is on `Contact`,
not on `Lead`/`Pipeline`.

**Impact:** a merchant who only wants bookings is told they need a CRM, and the
onboarding shows them pipeline concepts they will never use.

### 4.2 Navigation exposes architecture, not outcomes — CONFIRMED

`apps/app.saroh.in` sidebar groups are CUSTOMERS / APPOINTMENTS / COMMERCE /
WEBSITE / INSIGHTS / SETTINGS — i.e. the module registry rendered as navigation.
Verified in-browser 2026-07-31.

The onboarding screen (`/onboarding/modules`) is **already outcome-framed**
("Show up online", "Sell products", "Take appointments") — so the vocabulary the
brief asks for exists; it is just abandoned after onboarding.

### 4.3 Site publishing is a stub — CONFIRMED

- `apps/sites.saroh.in/lib/fetchers.ts:51` — `getSiteData()` returns
  `Promise.resolve(null)`, always.
- The publication snapshot (`lib/publication.ts`) carries **no brand fields** —
  grep for theme/colour/font returns nothing. Content types are `HeroContent`,
  `CtaContent`, `GalleryContent` etc. only.
- A `--site-*` token layer now exists (`app/[domain]/layout.tsx`, commit
  `2b2add5`) with defaults matching the previous hardcoded greys, so the
  _rendering_ side is ready. Nothing feeds it.

---

## 5. Delivery and environment

**CONFIRMED.**

- Repo-root `.env` `DATABASE_URL` → Neon project `neondb` (7 tables). The API's
  `apps/api.saroh.in/.env` → `saroh-dev` (81 tables). Root-level `pnpm db:seed`
  or `db:migrate:deploy` therefore targets the **wrong database**.
- `.github/workflows/` contains `ci.yml` only — **no CD**.
- No tracing, metrics, or error aggregation anywhere.
- The API cannot start from `pnpm start` alone: `createAuth()` runs at import
  time and throws before `ConfigModule` loads `.env`. Env must be sourced first.
- Two admin migrations sat unapplied on the dev DB until 2026-07-31 — there is
  no migration-status visibility in any pipeline.

---

## 6. Testing

**CONFIRMED.** 675 unit tests / 72 suites, all passing. Separate DB-backed
integration project with a guard that refuses to run against dev or prod. A
bootstrap/DI smoke test compiles the whole module graph.

**Gap:** no cross-tenant negative tests. Isolation is the platform's core safety
property and nothing asserts it.

---

## 7. What this audit does _not_ cover

Stated so the backlog is not mistaken for complete:

- `admin-metrics.service.ts` and several spec files were not read in depth.
- Commerce, Orders, Payments and Automations internals were not audited beyond
  their schema and module registration.
- No performance, load or cost analysis.
- No review of `packages/emails`, `packages/charts`, `packages/object-storage`.
- Frontend accessibility was verified for the design tokens only, not per screen.
