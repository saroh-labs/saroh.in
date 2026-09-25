# ADR-010 — Several storefronts, one catalogue, stock counted per storefront

**Status:** Accepted — 2026-09-25
**Supersedes (for storefronts):** [ADR-006](./ADR-006-one-storefront-one-website.md) — the one-website cap stays
**Part of:** the Products and Stock epic (plan `docs/plans/2026-09-25-001-feat-products-stock-storefronts-plan.md`)
**Builds on:** [ADR-001](./ADR-001-organization-tenant-root.md) (Organization is the tenant root) · DEC-022 (stock per variant) · DEC-023 (an invoice for every order)

---

## 1. Context

ADR-006 capped a business at one storefront so the single case could be built
properly first. The designs for Products, Product Detail, the Editor and the new
Stock screen (claude.ai design project, 25 Sep 2026) now assume a bakery with a
counter on Hill Road and an online shop that **count stock separately**, sell
from **one catalogue**, and **move stock** between them.

Today a `Product` belongs to one `Store` (`Product.storeId`), stock lives on the
product (`Inventory`) or its variants (`VariantInventory`), and the workspace
merges "the same product" across storefronts by SKU (`mergeCatalogue`). That
merge is a guess: two products with one SKU are not one product, and a product
cannot be sold in two places without being copied.

## 2. Decision

1. **A business may have several storefronts.** `MAX_STOREFRONTS_PER_BUSINESS`
   is lifted (to a plan entitlement, default 5). The website cap stays at one.
2. **The catalogue belongs to the business.** A product is the business's
   (`Product.organizationId`, required). **A storefront sells a product through
   a listing** (`ProductListing`: product × storefront). A product with no
   listing is in the catalogue but sold nowhere. A variant may be left out of a
   storefront ("Sell it at").
3. **Stock is counted per storefront.** On hand, promised (reserved) and the
   warning level live on a stock row keyed by storefront and variant (or the
   whole product when it has no variants). An order belongs to one storefront
   and reserves at that storefront's row.
4. **No overselling, ever.** A storefront can sell `on hand − promised`. When
   that is 0 the product shows **Sold out** there and new orders are refused.
   Promised units come back only when an order is cancelled, or refunded before
   it was fulfilled. A count may still be saved below promised: the shelf is the
   truth, and the gap shows as "N short" with what to do.
5. **Moving stock** between storefronts is a pair of stock-log entries in one
   transaction, and can only move what isn't promised.
6. **Migration is additive with a backfill.** Every existing product gets its
   `organizationId` from its store and a listing at that store; every
   `Inventory`/`VariantInventory` row becomes the stock row at that store.
   `Product.storeId` is kept, read-only, until every reader moves to listings,
   then dropped in a later migration.

## 3. Options considered

- **Keep products per storefront and match by SKU** (today). No migration, but
  the catalogue stays a guess, edits must be copied, and "Sell it at" is
  impossible. Rejected.
- **One catalogue, one shared stock count.** Simpler, but a counter and an
  online shop really do hold different shelves. Rejected — the design counts
  per storefront.

## 4. Consequences

- Checkout, the storefront site (`saroh.app`), orders, invoices and the
  calendar read a product through its listing at the order's storefront.
- Every screen that says "your storefront" gains a storefront where it matters,
  and stays quiet when a business has one (no pickers for a single storefront).
- The stock log (DEC-032) is keyed by storefront.
- Reports and takings can be read per storefront or for the business.
- Rollback: the backfill is reversible until `Product.storeId` is dropped.
