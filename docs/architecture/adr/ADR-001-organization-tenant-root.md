# ADR-001 — Organization as the sole tenant root (S1-001)

**Status:** Accepted — 2026-07-18
**Implements:** [DEC-005](../DECISIONS.md) (Multi-tenancy, Organization and Project model)
**Blocks:** S1-002 (backfill migration), S1-003 (`OrganizationContext` + policy), and all later Stage 1 work.

This ADR codifies the tenant vocabulary so every subsequent ticket uses the same names, ownership rules, and legacy-compatibility mapping. It changes **no schema yet** — it is the contract the migration (S1-002) implements.

> **2026-08-08:** the public renderer called `sites.saroh.in` below is now `apps/saroh.app`, served from `saroh.app`; merchant sites hang off `*.saroh.app`. The tenant vocabulary is unaffected.

---

## 1. Context — where we are today

The deployed schema has **no single tenant root**:

- **`Store`** is the _effective_ tenant: every business entity (products, categories, orders, carts, customers, inventory, posts, payment configs, API keys, audit logs, …) hangs directly off `Store`.
- **`Workspace`** exists but is optional and nearly empty (`id, name, slug`, `stores[]`, `members[]`); `Store.workspaceId` is **nullable**. It is not enforced as a boundary.
- Ownership is per-Store and duplicated: **`StoreOwner`** (`role` OWNER/ADMIN) and **`StoreMembers`**, plus **`WorkspaceMember`** (`role` OWNER/ADMIN/MEMBER) — three overlapping membership tables.
- A user effectively "owns" data by having a `StoreOwner` row. `User` is therefore an ownership root, which DEC-005 forbids.

This ambiguity is the root problem S1-001 resolves.

## 2. Decision

**Organization is the single mandatory tenant root and the only business/ownership/billing/audit boundary.** Concretely:

1. **`Workspace` becomes `Organization`.** The existing `Workspace`/`WorkspaceMember` tables are the seed of the new model (rename + make mandatory), not a new parallel concept.
2. **`User` never owns business data.** A user's relationship to business data is _always_ mediated by a **`Membership`** row linking the user to an Organization with a role. A user may belong to many Organizations.
3. **`Store` becomes an Organization-owned commerce channel**, not a tenant. Every `Store` gets a mandatory `organizationId` (added nullable, dual-written, then constrained — S1-002).
4. **`Project` is an optional grouping beneath an Organization** — for related sites, forms, campaigns, assets, clients, brands, or initiatives. It is **never** a tenant, membership, billing, or ownership root. Small organizations use the platform with no Project.
5. **`Site` is a publishing property** (a public-facing property an Organization publishes), distinct from `Store` (a commerce channel). Today's public rendering of a Store via `sites.saroh.in`/`CustomDomain` is a Store-as-channel behavior; a first-class `Site` model is deferred to when publishing lands — this ADR only reserves the term.
6. **Public actors** (visitors, customers) are **not** members. Their access is only ever granted through explicit public-publication, form, and checkout commands.

### Role vocabulary (canonical)

- **Organization roles** (on `Membership`): `OWNER`, `ADMIN`, `MEMBER`. OWNER/ADMIN see every Project; MEMBER access is direct or Team-derived.
- **Project roles** (later, S1-010, on Team/direct `ProjectAccess`): `MANAGER`, `EDITOR`, `VIEWER`.
- These are the _only_ role enums. `StoreOwner.role` (OWNER/ADMIN) and `WorkspaceMember.role` (OWNER/ADMIN/MEMBER) collapse into Organization `Membership.role`.

## 3. Canonical vocabulary

| Term             | Definition                                                                                  | Is a tenant root?  |
| ---------------- | ------------------------------------------------------------------------------------------- | ------------------ |
| **Organization** | The one business boundary. Owns all business entities; membership/billing/audit root.       | **Yes (only one)** |
| **Membership**   | Links a `User` to one `Organization` with an Organization role. A user may have many.       | No                 |
| **Project**      | Optional grouping of Organization-owned resources. Never owns data or membership.           | No                 |
| **Store**        | An Organization-owned commerce channel (catalog, orders, customers, inventory).             | No                 |
| **Site**         | An Organization-owned publishing property (public web presence). Reserved; not yet modeled. | No                 |
| **User**         | An authenticated person. Never owns business data — always acts _through_ a Membership.     | No                 |
| **Team**         | (S1-010) A named group of members granted Project access together.                          | No                 |

## 4. Compatibility map (legacy → target)

| Legacy (today)                          | Target                                                      | Migration handling (S1-002)                                                                 |
| --------------------------------------- | ----------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `Workspace`                             | `Organization`                                              | Rename model/table; keep `id`/`slug`; make mandatory. Backfill one Organization per tenant. |
| `WorkspaceMember` (OWNER/ADMIN/MEMBER)  | `Membership`                                                | Rename; roles carry over 1:1.                                                               |
| `StoreOwner` (OWNER/ADMIN)              | `Membership` on the Store's Organization                    | For each `StoreOwner`, ensure a `Membership` with the same-or-higher role. Dual-read first. |
| `StoreMembers`                          | `Membership` (+ later Project/Team access, S1-010)          | Fold into Membership; retain table read-side during transition (S1-006).                    |
| `Store.workspaceId` (nullable)          | `Store.organizationId` (mandatory)                          | Add nullable `organizationId`, dual-write from API, backfill, then constrain NOT NULL.      |
| `User` as de-facto owner (`StoreOwner`) | `User` → `Membership` → `Organization` owns data            | No `User`-owned business rows; ownership always via Organization.                           |
| Store rendered on `sites.saroh.in`      | Store-as-channel publishing (Site model reserved for later) | No change now; term reserved.                                                               |

**Every existing active `Store` must map to exactly one verified `Organization`** (S1-002 acceptance). For a Store with `StoreOwner` rows but no `Workspace`, the migration synthesizes one Organization named after the Store, with the Store's OWNER as the Organization OWNER Membership.

## 5. Migration vocabulary (names S1-002+ must use)

- FK column: **`organizationId`** everywhere (never `orgId`, `workspaceId`, `tenantId`).
- Context object: **`OrganizationContext`** (S1-003) — carries `organizationId`, actor `userId`, resolved role.
- Backfill is **deterministic and idempotent**: one Organization per legacy tenant, re-runnable without duplicates (keyed on legacy `Workspace.id`/`Store.id`).
- New models get **mandatory** `organizationId` from creation; legacy business tables get a **nullable** `organizationId` + API dual-write, then a batched backfill, then a NOT NULL constraint (per TARGET_ARCHITECTURE §"Incremental schema migration strategy").
- Authorization switch is gated behind an **admin feature flag** (S1-012) before reads/authz move to Organization membership.

## 6. Consequences

- Ownership, membership, billing, and audit boundaries become unambiguous: **one Organization = one tenant**.
- Three membership tables (`WorkspaceMember`, `StoreOwner`, `StoreMembers`) converge on one `Membership` — with a dual-read transition (S1-006) so nothing breaks mid-migration.
- Small orgs need no Project; Project access is layered on later without touching ownership.
- `Store` stays as an Organization-owned channel — no big-bang removal; compatibility adapters remain during transition.
- **No schema is altered by this ADR.** S1-002 performs the first schema change, on the now-migration-tracked `saroh-dev` DB, using the careful add-nullable → dual-write → backfill → constrain sequence.
