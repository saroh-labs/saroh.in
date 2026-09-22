# ADR-006 — One storefront and one website per business, for now

**Status:** Accepted — 2026-09-22
**Part of:** [#386](https://github.com/saroh-labs/saroh.in/issues/386) — the CRUD flows for every module
**Builds on:** [ADR-001](./ADR-001-organization-tenant-root.md) (Organization is the tenant root) · [ADR-003](./ADR-003-organization-modules.md) (modules) · [ADR-004](./ADR-004-site-owns-a-post.md) (a Site owns a Post) · DEC-014 (entitlements)

---

## 1. Context

A business — an Organization, the workspace where the merchant turns modules
on — can hold any number of `Store`s and `Site`s. The schema has always allowed
it, and the workspace grew to match: a storefront picker on every Sell screen,
a site picker in Website, "across 3 storefronts" counts, a "New storefront"
button beside the one they already have.

For the businesses Saroh serves that is mostly confusion. A bakery has one shop
and one website. Every picker asks a question they have no reason to answer,
and every "which storefront?" is a place to get it wrong. The seeded demo
business had three sites, so the confusion was visible in every screenshot.

We want to build the single case properly first: one storefront, one website,
screens that assume it, and copy that says "your storefront" rather than
"storefronts".

## 2. Decision — one of each, enforced at creation

A business has **at most one storefront and at most one website** for now.

- **The schema stays multi.** Organization → many Stores, many Sites is
  unchanged. No unique constraint, no migration. We are designing for several
  and shipping one.
- **The cap is enforced where one is created**, in the API, and nowhere else:
  `StoresService.createForUser` and `SitesService.createFromTemplate` are the
  only two creation paths. A second one is refused with a `409` and a sentence
  a merchant can act on, not a plan-limit error.
- **One constant each** — `MAX_STOREFRONTS_PER_BUSINESS` and
  `MAX_WEBSITES_PER_BUSINESS`, both `1` — so lifting it is a one-line change
  plus the screens.
- Soft-deleted rows (`deletedAt` set) do not count.

### Beside the plan's `sites` entitlement

Sites already carry a plan limit (DEC-014, `EntitlementService`, FREE = 1). The
product cap is a different thing: the entitlement says what a business has
paid for, the cap says what the product supports today. Both apply and the
lower wins, so a paid plan that allows three sites still gets one until this
decision is lifted. The product cap is checked first, so a merchant hears
"your business already has its website" rather than "upgrade to add more" —
upgrading would not help.

Stores have no entitlement; the cap is the only limit on them.

## 3. What this is not

- **Not a merge of storefront and website.** They stay separate things. When
  businesses can have several of each, the merchant will map storefronts to
  websites — which shop sells on which site — and decide what goes where.
  That mapping is future work, not designed here.
- **Posts stay inside the website** (ADR-004 stands). Lifting posts out into
  business-level content that is then placed on a site — a blog, or anything
  else — is an idea to revisit, not a decision.

## 4. Existing businesses with more than one

Nothing is deleted or hidden. A business that already has two storefronts or
three sites keeps them all, and every screen keeps working for them: the
pickers stay, but **appear only when there is more than one** to pick from.
They just cannot create another.

The seeded demo business (Northwind Supply) keeps its main site, the one with
the posts; its other two sites move into separate demo businesses so the seed
shows the single case.

## 5. Consequences

- The workspace assumes one. "New storefront" and "New site" appear only when
  the business has none; `/commerce/storefronts/new` and `/sites/new` explain
  that the business already has one and link to it.
- Copy is singular: "Storefront" in the rail, no "across N storefronts" unless
  there really are N.
- Lifting the cap later means: raise the constant, bring back the create
  entry points, and design the storefront ↔ website mapping. The data model
  needs nothing.
