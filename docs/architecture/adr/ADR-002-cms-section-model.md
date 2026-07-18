# ADR-002 — CMS section model & versioned section contract (S2-001)

**Status:** Accepted — 2026-07-18
**Implements:** Stage 2 (Site management, CMS & section-based page builder) — [PRODUCT_ROADMAP.md](../PRODUCT_ROADMAP.md)
**Builds on:** [ADR-001](./ADR-001-organization-tenant-root.md) (Organization is the sole tenant root)
**Blocks:** S2-004 (section editor), S2-005 (publish), S2-006 (public renderer), S2-007 (custom subdomain/domain).

This ADR fixes the Stage 2 CMS data model and the versioned section contract. It defines schema (`packages/database/prisma/schema.prisma`) and one typed contract module (`packages/database/src/cms/section-contract.ts`). It performs **no migration** — the migration is applied separately.

---

## 1. Context

Stage 2 lets an Organization create a site from a template and publish it. The roadmap invariants are non-negotiable:

- **Drafts are private.** In-progress edits must never be publicly reachable.
- **The public renderer reads only immutable publications.** No draft table is ever on the public read path.
- **Rich content must be sanitizable**, and **templates must be versioned.**

Everything CMS is Organization-owned (ADR-001): every model carries an indexed `organizationId`.

## 2. Decision — draft set vs immutable publication set

The model is split into two halves with a one-way flow `draft → publish → immutable snapshot`:

**Draft / working set (mutable, PRIVATE):**

- **`Site`** — an Organization-owned publishing property (distinct from `Store`, a commerce channel — ADR-001). Holds `slug` (unique per org), optional globally-unique `subdomain`, a `currentPublicationId` pointer to the live publication, and a soft-delete `deletedAt`. A reserved `customDomainId` placeholder is left for S2-007 (no verification built here).
- **`Page`** — a routable page in a Site, keyed by `path` (`@@unique([siteId, path])`). Carries a denormalized `organizationId` for tenant scoping / RLS.
- **`PageVersion`** — a DRAFT/working version of a Page (`status` = `DRAFT | PUBLISHED | ARCHIVED`). Editing happens here; publishing snapshots it. Optional `createdByUserId`.
- **`Section`** — a typed content block in a PageVersion: `type` (registry key), `contractVersion` (Int), `order` (Int, `@@index([pageVersionId, order])`), and `content` (Json validated against the contract).

Relationships: `Site 1—* Page 1—* PageVersion 1—* Section`, and `Site 1—* Publication`.

**Immutable publication set (append-only, PUBLIC read model):**

- **`Publication`** — a fully-resolved, sanitized snapshot produced at publish time. It stores `snapshot` (Json — the resolved page(s) + sections, self-contained), the `templateId`/`templateVersion` it was built with, `publishedByUserId`, and `publishedAt`. It has **no `updatedAt`**: rows are **append-only** — a republish inserts a new row, and `Site.currentPublicationId` is repointed. Index `@@index([siteId, publishedAt])`.

### Why the renderer reads only Publications

The `snapshot` is self-contained and already sanitized, so the public renderer (S2-006) never touches `Page`/`PageVersion`/`Section`. This gives us, by construction: drafts stay private (they are simply not on the public path); publishes are atomic and immutable (a snapshot can't change under a live site); rollback is trivial (repoint `currentPublicationId` at an older row); and caching/invalidation keys cleanly off an immutable publication id.

## 3. Versioned section contract

`packages/database/src/cms/section-contract.ts` is the **single source of truth** for what a `Section.content` may hold, keyed by `(sectionType, contractVersion)`. A Zod schema per (type, version) validates and normalizes content. The editor (S2-004), publish (S2-005), and renderer (S2-006) all validate through `parseSectionContent(type, version, content)`, which returns normalized data or a typed error (`UNKNOWN_CONTRACT` for an unregistered pair, `INVALID_CONTENT` for a schema failure).

**Starter registry (all at version 1):** `hero` (heading, optional subheading/cta/image), `richText` (format + value), `cta` (label, href, style), `gallery` (images[], layout).

**Versioning rule:** a breaking change to a section's content shape ships as a **new version alongside** the old one, never an in-place edit — so existing Sections and Publications keep validating.

### Sanitization boundary

The contract validates **shape only; it never sanitizes.** Types carrying authorable HTML/markdown declare their rich fields in `sanitizedFields` (today: `richText.value`); `requiresSanitization(type, version)` reports this. **Publish (S2-005) MUST run those fields through an HTML sanitizer before writing the immutable `Publication.snapshot`.** Because sanitization happens on the way _in_, the renderer only ever reads already-safe content. The sanitizer implementation is out of scope for this ticket — only the boundary is defined here.

## 4. Mapping plan for existing models (DEFERRED)

The store-scoped blog `Post`/`PostCategory` and the store `CustomDomain` are **left untouched** by this ticket. They map into the CMS later, not now:

- **`Post` → `Page` (+ `PageVersion`/`Section`s):** a published post becomes a Page whose body maps to a `richText` section (existing markdown/HTML flows through the sanitization boundary at publish). Deferred to a Stage 2 mapping ticket.
- **`CustomDomain` (store-scoped) → `Site` custom-domain claim (S2-007):** the new `Site.customDomainId` is a reserved placeholder; claim/verification is built in S2-007, which is also where existing verified store domains can be re-associated to Sites. No verification logic exists here.

Keeping these deferred avoids overloading the store commerce models during the schema-evolution transition (same incremental posture as ADR-001).

## 5. Consequences

- Drafts are private and publishes are immutable **by construction** — the invariants are structural, not enforced by scattered checks.
- One typed contract governs section content everywhere; adding a section type or version is a localized change.
- Rich-content safety has a single, explicit enforcement point (publish), keyed off `sanitizedFields`.
- No migration is applied by this ADR; existing `Post`/`PostCategory`/`CustomDomain` are unchanged and mapped later.
