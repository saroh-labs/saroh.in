---
title: "feat: Products, rebuilt — the product page, catalogue settings and the editor v2, on a demo beauty & dresses store"
type: feat
status: active
date: 2026-09-23
origin: claude.ai design project 1fef6fb9-c3b1-4c04-bfc2-86d09cb32a65 — Saroh Product Detail.dc.html, Saroh Product Settings.dc.html, Saroh Product Editor v2.dc.html (+ support.js)
issues: [481, 460, 461, 462, 463, 464, 465, 466, 467, 468, 469, 470, 471, 472]
follow_ups: [473, 474, 475, 476, 477, 478, 479, 480]
---

# feat: Products, rebuilt — the product page, catalogue settings and the editor v2

## Summary

This plan rebuilds the products area of the merchant workspace (`app.saroh.in`) from three designs:

- **A product page.** A read-mostly page for one product with a Team view and a Customer view. The Team view has tabs and quick-edit sheets. The Customer view shows the shop page with numbered notes for the team.
- **Catalogue settings.** A store-wide page with three tabs: categories, variant options, and defaults for new products.
- **Editor v2.** The product editor becomes one page in which every section saves on its own.

It also brings the data model up to what the designs show:

- stock is kept per variant
- a product has an ordered set of photos
- a product can carry general product details and SEO fields
- the variant options are shared across the store

The work runs against a demo **beauty & dresses store** of about 30 products, with real photographs and verified-purchase reviews. The store is resettable, so the create and edit flows can be filmed for Saroh's video demos.

## Problem frame

**Who.** A small merchant who sells physical products in a few sizes or shades. Examples: a skincare brand with 30ml and 50ml bottles, or a boutique selling a dress in S/M/L.

**What breaks today.**

- **There is no place to _look at_ a product.** Opening a product opens the editor (`components/commerce/product-editor.tsx`). "How is this selling, what are people saying, what is promised to orders" has no screen.
- **Stock is one number per product** (`Inventory.productId @unique`). Order lines do not record a variant. A merchant with S/M/L therefore cannot know that M ran out while S did not. The design says it plainly: "Once a product has variants, a count per variant is the only honest one."
- **A product has one picture** (`Product.image`, a string). A beauty or clothing listing lives on 4–5 photos.
- **One Save covers the whole editor.** A bad variant blocks a price fix, and staged variants look saved (see the audit cards in Editor v2).
- **Catalogue housekeeping is scattered.** Categories have their own page. Nothing lets a merchant rename an option, merge two categories, or say "every new dress is non-returnable".
- **The only seeded catalogue is Northwind's packaging supplies.** They have no images and no reviews, so neither a film nor a design review can show what a real storefront catalogue looks like.

**Why now.** The designs are finished. The demo films need a products story. Reviews shipped two days ago (`docs/plans/2026-09-21-001-feat-product-reviews-plan.md`) but have no per-product home.

## Requirements

### Product page (Detail)

- **R1.** A product opens on a **product page**. The editor moves to its own address.
    - Header: cover thumbnail, name, status pill (Published / Draft / Archived), and a meta line with price range, how many can be sold, category and storefront.
    - Header actions: "Edit product", and "View on the shop" (disabled with a reason when the product is not published).
- **R2.** The Team view has tabs:
    - **Overview:** stat cards for can-sell, variants, last changed and reviews; the linked cards; "Everything about it"; the photo mosaic; the description and details.
    - **Variants and stock:** a table with a _Whole product_ row. Each row opens a **variant drawer** showing its stock, open orders, reviews and photo.
    - **Photos**
    - **Reviews:** a rating summary with its distribution, plus reply and hide/show.
    - **Orders:** filter between open and recent orders.
    - **Discounts:** the discounts that reach this product.
    - The tab is kept in the URL.
- **R3.** Quick-edit sheets save one section each: details, description, prices and stock, and photos.
    - Each shows a toast with Undo.
    - Closing a changed sheet asks first.
    - "More in the full editor" jumps to that section of the editor.
- **R4.** The **Customer view** shows the product as the shop page would.
    - It is **interactive**: picking a variant changes the price, stock word and photo. Nothing is added to a basket.
    - It respects each field's _shown on the shop_ switch.
    - It shows the latest visible reviews.
    - It has **numbered team notes** that can be switched off, each linking to the editor section it describes.
    - A draft shows "customers cannot see this yet".
- **R5.** The page covers these states:
    - loading
    - could not load
    - not found
    - no access
    - orders failed (partial; the rest of the page stays current)
    - a new draft, with the "Before it goes on the shop" checklist and empty tabs

### Catalogue settings

- **R6.** The settings page lives at `/commerce/products/settings`, with three tabs kept in the URL: Categories, Options, Defaults.
- **R7.** Categories:
    - add, with a duplicate-name check and a 40-character limit
    - rename in place
    - merge into another category
    - delete, which moves its products to Uncategorized
    - Uncategorized is locked and always listed last
    - Every change takes effect immediately and shows a toast with Undo, which reverses that one change.
- **R8.** Options:
    - Store-wide option names (e.g. Shade, Size, Colour, Volume) and their values.
    - A value a variant uses cannot be removed, and an option a product uses cannot be deleted. Each says why.
    - Duplicates and over-length names say why rather than failing silently.
- **R9.** Defaults:
    - The fields are "How to use / care line", "Warn at" and "Returns".
    - They are set for All products, and each category can override them.
    - They save explicitly, from a sticky save bar showing the count of changed values.
    - Optionally, saving also updates the saved products that still hold the old default. The count is exact.
    - Leaving with unsaved defaults asks first.

### Editor v2

- **R10.** One page, with a sticky jump-nav through the sections:
    1. Basics
    2. Description
    3. Details
    4. Made by and returns
    5. Photos
    6. SEO
    7. Visibility
    8. Variants
    9. Stock

    Each section has its own Unsaved / Needs a fix chip, a save bar with Discard, and its own Save. **Save all** in the header saves the valid dirty sections and names the rest.

- **R11.** **Create** asks only for the product:
    - Name and price are required. Every other section is marked Optional.
    - Variants and Stock are explained up front.
    - After Create you **stay on the page**. It switches to edit mode and opens Variants and Stock.
- **R12.** Basics:
    - name
    - **MRP** (optional): the printed or compare-at price, shown struck through beside the price with the saving ("~~₹999~~ ₹799 · 20% off"). It must be at or above the price.
    - address (slug) derived from the name; changing it later warns that old links stop working
    - price with a fixed currency prefix
    - a searchable category menu that can create a category
    - picking a category in create applies that category's defaults
- **R13.** Description: rich text with six primary tools, the rest under More, and an HTML mode. The editor offers only what the sanitiser keeps. It shows the character and markup counts.
- **R14.** Details:
    - "How to use / care" line
    - "Ingredients or material"
    - Key points
    - "Made by" (made here, or by someone else, with maker, made in and a team-only supplier code)
    - Warranty
    - Returns (the storefront's rule, or its own)

    Every customer-facing field has an **On the shop / Team only** switch.

- **R15.** Photos:
    - Up to **5** per product, in order; the first is the cover.
    - Move earlier or later, make cover, and take off (with Undo; this never deletes the file from the library).
    - Add from the business's photo library, or upload with progress.
    - Every photo has **alt text**.
    - Limits and refusals are written out.
- **R16.** SEO:
    - SEO title, meta description, and a sharing image picked from the product's photos
    - A preview of how the listing reads
    - When empty, each field falls back to name, description and cover, and the section says so
    - The fields are stored and edited only. Nothing renders them yet.
- **R17.** Visibility: Published / Draft / Archived.
    - The pill in the header always shows the _saved_ status.
    - The pending change is written out ("Saving publishes it for the first time…").
- **R18.** Variants:
    - The product picks one store option ("Customers choose by Size"), and each variant picks a value of it.
    - Rows are edited in place: value, title, SKU (suggested), price and MRP (a blank price or MRP uses the product's).
    - More opens the photo shown when that variant is picked.
    - Add to list stages a row. Remove offers Undo.
    - Save variants saves the list.
- **R19.** Stock:
    - Without variants: On hand and Warn at, with Promised shown read-only.
    - With variants: one row per variant plus a _Whole product_ total.
    - A low-stock alert names the variants that are low.
- **R20.** Read-only roles (Member, Reviewer) see a banner, and every control is disabled.
- **R21.** Each section has a designed saving state and a designed failure (inline, with retry).
    - A create that succeeds while a later section fails keeps the product and says which section did not save.
    - Leaving with unsaved sections asks first, and names the sections. This applies to in-app links and to closing or refreshing the browser.

### Data

- **R22.** Stock per variant.
    - A product with variants counts stock per variant, and the product total is the sum.
    - Order lines record the variant bought, so reserving and committing stock moves that variant's count.
    - Products without variants behave exactly as today.
- **R23.** Products and variants carry an optional **MRP**. Products carry:
    - an ordered photo set (at most 5; each with alt text, dimensions and optional credit)
    - the Details fields from R14 and their shop switches
    - the SEO fields
    - the chosen option
- **R24.** Store options and values, and category defaults, are stored per store and scoped to the organization. RLS covers them like every tenant table.

### Demo store and verification

- **R25.** The demo store is a sixth showcase business owned by `demo@saroh.dev`: a beauty & dresses boutique. It has:
    - about 30 products: skincare for women, skincare for men, and women's dresses
    - details modelled on real listings, written fresh
    - 3–5 Unsplash photographs per product, all of which load, with no videos
    - variants with their own stock, including one sold out and one low
    - verified-purchase reviews behind seeded delivered orders, with some replied to and one hidden
    - ₹ prices

    It seeds deterministically and resets cleanly.

- **R26.** The walkthrough passes in a real browser under portless:
    1. Create a new product.
    2. Add 3 variants.
    3. Add photos (≤5).
    4. Set stock per variant.
    5. Fill details and SEO.
    6. Publish.
    7. See it on the product page in both views, with reviews.

    Every state from R5, R9, R20 and R21 is checked at 320, 390 and 1440 px, in light and dark. A Playwright test covers the create flow.

- **R27.** The film script for the editor is rewritten for v2 at 1440×900, light theme. The flows must hold their shape on camera: whole dialogs and sheets in frame, and no flicker between states.

## Scope boundaries

**In scope.** The three screens, the data and API work they need, the shared shop-page preview, the demo store, and the verification and film script.

### Deferred to follow-up work

These are noted here, and each gets a line in the epic, so none is lost:

- **The website.** Rendering the SEO fields on the website, and the public storefront product page. The preview component in U6 is built so that page can use it.
- **Media.** Video uploads, and the video limits from the design.
- **Detail-page links.** Collections, and the "Shown on the website" links. There is no collection model: discounts reach categories, storefronts or products.
- **Pricing and shipping fields.** Cost price and margin (team-only), weight and shipping, barcode. (MRP / compare-at is in scope.)
- **Option matrices.** Variants over two options at once, such as Shade × Size.
- **Local uploads.** Setting up R2 for local development.
- **Multi-storefront choices.** "Sell it at" storefront chips on a variant. One storefront per business (ADR-006) makes the choice moot today.
- **Food fields.** Allergens and a ready time as food-business fields. They return when a food business needs them.

### Outside this work

- Changing how reviews are collected. It stays verified-purchase via emailed invitation.
- The Products list screen. It keeps its layout and only links to the new product page.

## Key technical decisions

### Data and money

- **KD1. Stock per variant.** It lives in its own table, `VariantInventory` (one row per variant: on hand, promised, warn at). `Inventory` stays the product-level row, 1:1 as before.
    - A product counts per variant once it has `VariantInventory` rows. Otherwise it counts on its product row, exactly as today.
    - Switching a product to per-variant stock moves its on-hand count into the variants. The product row keeps only what legacy orders already promised, so releasing an old order still lands on the right row. Promised for the product = the product row's promised + the sum of the variants'.
    - Removing a variant with promised stock is refused, and the reason is written out.
    - `OrderItem` gains a nullable variant. `applyInventoryTransition` moves the variant's row when the line names one, and the product's row otherwise.
    - _Why:_ the design calls a single count dishonest once sizes exist. A separate table keeps every existing `product.inventory` read and order transition working unchanged, and needs no backfill guesswork about which size an old count belonged to.
- **KD2. An ordered photo table.** `ProductImage` holds product, organization, url, optional `mediaId`, alt, width, height, position and optional credit (name and link).
    - At most 5 per product, enforced by the API.
    - `Product.image` stays as a denormalised cover (position 0) so the list screen, orders and imports keep working. It is removed in a later two-deploy change, as the migration rules require.
    - A variant's photo is a reference to one of the product's photos, not a free string.
- **KD3. General product fields.** Details, made-by, returns and SEO are **typed columns**, not a JSON blob, so the DTOs validate them and the API sanitises them.
    - The per-field shop switches are one small JSON object checked against a closed key list.
    - Returns is a mode (the storefront's rule, or its own) plus text.
- **KD4. Store-wide options.** `ProductOption(storeId, organizationId, name, position)` and `ProductOptionValue(optionId, value, position)`.
    - A product points at one option. A variant points at one value, and its title defaults to that value.
    - The "in use" counts that block deletion are computed by the API.
- **KD5. Category defaults and Uncategorized.**
    - `CatalogueDefaults(storeId, categoryId?)` holds the three default fields, with a null category meaning _All products_.
    - Uncategorized is **not a row**: it is a null `categoryId`, rendered as a locked pseudo-category. Delete and merge therefore never need to create one.
- **KD6. Undo as reverse API calls.**
    - Settings changes that take effect immediately return what they changed: the moved product ids for a merge or delete, and the previous name for a rename.
    - Undo sends the reverse call. It does not restore a snapshot of the page.
    - Undo after "Defaults saved and N products updated" restores both the defaults and those N products, from the ids the save returned.
- **KD7. Money stays a decimal string** end to end, following `backend-data-and-money.md`. The currency prefix comes from the storefront's currency, not the product's.
- **KD7a. MRP.** `Product.mrp` and `ProductVariant.mrp` are nullable `Decimal(10,2)`.
    - A variant's blank MRP inherits the product's, the same way its price does.
    - The API refuses an MRP below the effective price, and computes the percent saving for display (rounded down to a whole percent).
    - The saving is only shown when MRP is above the price. Order lines snapshot the price, not the MRP.

### API shape

- **KD8. The API saves by section.** The product gets a `PATCH` that takes any subset of section fields, alongside the existing full `PUT`, which import still uses.
    - Photos, variants and stock keep their own endpoints. Photos gets a "replace the ordered set" call; variants gets update-in-place and reorder.
    - A section maps to exactly one call, so a failure belongs to one section.
- **KD9. One aggregate read for the product page.** A new product-overview read returns the product, its variants and their stock, and summaries of orders, reviews and discounts. Each summary is marked failed on its own, so the orders panel can fail while the rest of the page renders (the design's _Orders failed_ state).
    - It sits under the existing COMMERCE module gate and store-read check.
    - Reviews and orders need their own permissions. When the caller lacks one, that panel is left out and the page says why, rather than leaking or failing.

### Screens

- **KD10. The Customer view preview lives in `packages/site-blocks`.** It is a presentational component on the `--site-*` tokens, so it never takes Saroh's brand.
    - The workspace wraps it with the team-notes column.
    - The public storefront product page, when it is built, uses the same component.
    - Unsplash photos render with a plain `<img>` and explicit dimensions, the same as the editor's existing picture field. `next.config` therefore needs no `images.unsplash.com` entry.
- **KD11. Forms use react-hook-form and zod, one form per section.** This moves the editor off the hand-rolled state, as `frontend-forms.md` asks once a form is being changed.
    - The editor is split into a section-per-file directory, so no file passes about 400 lines.
    - The existing 1,161-line editor is retired, not adapted.
- **KD12. Routes.**
    - `/commerce/products/[productId]` becomes the product page.
    - `/commerce/products/[productId]/edit` and `/commerce/products/new` hold the editor.
    - `/commerce/products/settings` holds settings.
    - `/commerce/products/categories` redirects to `settings?tab=categories`.
    - Old `stores/[storeId]/products/*` redirects keep working.
    - `check:routes` covers all of them.
- **KD13. The editor is one page, not tabs.** It films in one continuous take and reads the same on a phone, where it stacks.
- **KD14. The design's colours map onto the workspace's tokens.** The design's amber accent maps to the workspace's existing brand and warning tokens, and its ok/danger colours to the semantic tokens. `--accent` is not redefined.
    - Dark mode is designed for the product page and the editor.
    - Settings has no dark values in its design, so it takes the token layer's.
    - The design's theme toggle is prototype chrome and is not built.

### Demo store

- **KD15. The demo store is a showcase business.**
    - It gets a new business entry with its own catalogue field, and `upsertCatalog` is generalised beyond Northwind.
    - Its reviews come from seeded DELIVERED orders plus completed invitations, so they are verified purchases by construction.
    - `deleteSeeded` gains every new table (reviews, invitations, product images, options and values, defaults, variant inventory).
    - `check.ts` gains invariants: stock sums, one cover per product, photos ≤5, every review behind a delivered order line of the same product and variant.
- **KD16. Product copy.**
    - Names and copy are **written fresh**, modelled on the structure of real Amazon listings: the bullet-point benefits, sizes, shade names, typical INR price bands, ingredients or fabric, and care.
    - Brands are invented, and no listing text is copied.
    - Photos are specific `images.unsplash.com/photo-…` URLs chosen by hand for each product, with the photographer's credit stored. A one-off check script confirms every URL answers 200 before the seed data is committed. The seed itself never touches the network.

## High-level technical design

_Directional sketch, not implementation specification._

```
Product ──1:n── ProductImage (≤5, ordered; position 0 = cover, mirrored to Product.image)
   │ optionId ─────────────► ProductOption ──1:n── ProductOptionValue
   ├──1:n── ProductVariant (optionValueId?, imageId? → ProductImage, position)
   │            └──1:1── Inventory (variantId set)   ← when the product has variants
   └──1:1── Inventory (variantId null)                ← when it has none
OrderItem (productId, variantId?) ──reserve/commit──► the matching Inventory row
CatalogueDefaults (storeId, categoryId? null = All products)
```

Workspace flow:

```
Products list ─► /products/[id]  (product page: Team view tabs | Customer view)
                    ├─ quick sheet ─► PATCH one section ─► toast + Undo
                    └─ Edit product ─► /products/[id]/edit#section
/products/new ─► Create (product only) ─► router.replace(/products/[id]/edit) ─► Variants + Stock open
/products/settings?tab=categories|options|defaults
```

## Implementation units

Phases: **A** data and API (U1–U5) → **B** screens (U6–U11) → **C** demo store and verification (U12–U13). U12 can start once U1 lands. It is the fixture every screen is checked against.

### U1. Schema: variant stock, product photos, details and SEO, options, defaults

> **Done — #460.** Migration `20260923150000_products_v2`: MRP on product and variant; details, shop switches and SEO on product; `ProductImage`, `ProductOption`, `ProductOptionValue`, `CatalogueDefaults`, `VariantInventory`; `OrderItem.variantId`. RLS `org_isolation` on all five new tables. The backfill turns `Product.image` into the cover photo and orders variants by creation. Verified: `db:verify:replay` clean; RLS checked as a non-superuser (another org reads 0 rows, a cross-org insert is refused); the backfill checked on seeded rows; API typecheck and 1,414 integration tests green.

- **Goal:** the model holds everything in R22–R24.
- **Files:**
    - `packages/database/prisma/schema.prisma`
    - `packages/database/prisma/migrations/<ts>_products_v2/migration.sql` (tables, columns, partial unique indexes on Inventory for product-only and per-variant rows, RLS policies for the new tables, and a backfill of `ProductImage` from `Product.image`)
- **Approach:** additive only (KD1–KD5). Follow `.agents/skills/saroh-migrations/SKILL.md`.
- **Patterns:** the RLS join policy used for `ProductVariant`; migration `20260923120000_admin_console` for shape.
- **Test scenarios:**
    - MRP columns accept null and two-decimal values.
    - The chain replays from empty (`db:verify:replay`) and matches the schema.
    - An existing product with an image gets one `ProductImage` at position 0.
    - A second product-level Inventory row for the same product is refused by the index; one row per variant is allowed.
    - RLS: another organization's session reads none of the new tables' rows.
- **Verification:** replay passes; `pnpm --filter @saroh/api test:int` stays green.

### U2. API: sections, photos, SEO, details; product-overview read

> **Done — #461.** Routes under `stores/:storeId/products/:productId`: `PATCH` (one section: any subset of name, address, description, category, option, price, MRP, status, details, shop switches and SEO), `GET`/`PUT …/images` (the ordered set of at most 5, from a kept photo, a READY library object or an https address), and `GET …/overview` (product, stock by variant, price range with the saving, and orders / reviews / discounts panels that are each `ok`, `failed` or `forbidden`). The rules are pure (`product-rules.ts`, `product-overview.ts`). Descriptions are sanitised on the site allowlist. The cover mirrors to `Product.image`. A library object a product still shows can't be deleted. Verified: 9 unit tests for the rules and arithmetic, 16 DB tests for sections, photos and the overview, plus the media refusal; the full API suites pass (unit 2,118, integration 1,431).

- **Goal:** the editor and the product page have calls matching their sections (KD8, KD9).
- **Files:**
    - `apps/api.saroh.in/src/modules/products/{dto.ts,products.service.ts,products.controller.ts,serialize.ts}`
    - new `product-images.service.ts` and `product-overview.service.ts`
    - specs `products.patch.spec.ts`, `product-images.spec.ts`, `product-overview.spec.ts`
- **Approach:**
    - The section PATCH validates each field group and sanitises the description on the existing allowlist.
    - Photos: replace the ordered set, and refuse more than 5 or a non-https URL. A `mediaId` must belong to the organization. Every write mirrors the cover to `Product.image`.
    - The overview read assembles its panels independently, each wrapped so one failure marks only that panel.
    - Reviews come through the product-reviews service with its own permission check; orders through the orders service with `order:read`.
- **Test scenarios:**
    - A PATCH touching only SEO leaves price and slug unchanged.
    - A slug conflict returns the field error.
    - An MRP of ₹700 against a price of ₹799 is refused; ₹999 is accepted and the overview reports 20% off.
    - A 6th photo is refused with a message naming the limit.
    - Reordering moves the cover and updates `Product.image`.
    - Taking a photo off leaves the library's Media row intact.
    - The overview for a MEMBER without `order:read` omits orders with a reason, rather than failing.
    - An orders query that throws marks the orders panel failed and still returns stock.
    - Another tenant's product returns not-found.
- **Verification:** unit and integration specs pass.

### U3. API: variants v2, stock per variant, orders by variant

> **Done — #462.** Variants take an option value (checked against the product's option), one of the product's photos, their own MRP (never below their price) and a position (`PUT …/variants/order`). A duplicate SKU returns the `sku` field. `PUT …/inventory/variants` sets every variant's count at once and switches the product to per-variant stock; the product's own row keeps only what old orders promise (quantity = promised), and a product-level count is then refused. A new variant starts at 0 once the product counts per variant. A variant with promised stock can't be removed, and the last counted variant hands its stock back to the product. Order lines take `variantId` (required when the product has variants), priced from the variant; reserve, ship and cancel move that variant's row, and every other line moves the product's row as before. The products list returns each product's variants; the workspace order form offers each variant as its own line, and the order page names it. Verified: 11 DB tests (option/photo/MRP/SKU checks; switching stock; an order for M reserves M only at the variant's price; cancel releases; ship takes it off the shelf; a missing variant and an oversell are refused; the promised-stock guard; reorder; the hand-back; the untouched product-level path). Full API suites pass (unit 2,118, integration 1,442), and the app's 288 tests pass. In the browser: an order for "Platform Trolley · 300kg" was placed and stored against that variant (then removed from the dev data).

- **Goal:** R18, R19 and R22 end to end, including order stock moves.
- **Files:**
    - `apps/api.saroh.in/src/modules/products/{variants.service.ts,variants.dto.ts,inventory.service.ts,inventory.dto.ts}`
    - `apps/api.saroh.in/src/modules/orders/{order-inventory.ts,orders.service.ts,dto.ts,serialize.ts}`
    - the workspace order form's line picker: `apps/app.saroh.in/components/orders/…`, located at implementation
    - specs `variants.v2.spec.ts`, `inventory.variants.spec.ts`, `orders.service.variant-stock.spec.ts`
- **Approach:**
    - Variants: create and update in place, with an option value, a photo reference and a position.
    - Stock: set per variant or per product, following KD1.
    - Order lines accept a variant id; when the product has variants, one is required.
    - A variant's price snapshots onto the line, replacing today's product-price-only rule. The seed comment about this is updated.
- **Test scenarios:**
    - Adding the first variant moves 12 on hand from the product row to that variant.
    - Removing the last variant moves it back.
    - A variant with 3 promised cannot be removed, and the message says why.
    - Placing an order for size M reserves from M only; cancelling releases it.
    - An order for a product with variants but no variant chosen is refused.
    - A legacy order line without a variant still moves product stock.
    - A duplicate SKU returns the field error.
    - A variant price of blank inherits the product's.
    - A variant with a blank MRP inherits the product's MRP; a variant MRP below its own price is refused.
- **Verification:** the order state specs and the new specs pass.

### U4. API: catalogue settings — categories, options, defaults

> **Done — #463.** Categories: names are unique ignoring case and ≤40 characters (the name is checked before the address, so the message is the useful one); `PATCH` renames in place and keeps the slug; `POST …/merge` and `DELETE` move products (to another category or Uncategorized = null) and return what moved, including the category's own defaults; `POST …/categories/restore` is Undo, moving back only products still where the change left them. A category a discount code reaches can't be merged or deleted. New `CatalogueModule`: `GET stores/:id/catalogue` (categories with counts, uncategorized count, options with what uses them, defaults with per-field "still on default" counts, and suggestions); options and values CRUD, with in-use guards and the removed values handed back for Undo; `PUT catalogue/defaults` (optionally updating saved products still on the old value, per field, including the stock rows' warning levels) and `POST catalogue/defaults/undo`, which restores the rows and exactly the products it changed. Resolution rules are pure (`catalogue-defaults.ts`). Verified: 3 unit tests plus 12 DB tests; full API suites green (unit 2,121, integration 1,454).

- **Goal:** R6–R9 on the server, with undo calls (KD5, KD6).
- **Files:**
    - `apps/api.saroh.in/src/modules/categories/*`, with merge and a delete that moves products
    - new `apps/api.saroh.in/src/modules/products/options.{controller,service}.ts`
    - new `catalogue-defaults.{controller,service}.ts`
    - specs for each
- **Approach:**
    - Merge and delete return the ids they moved, and Undo sends them back.
    - Option and value deletes are refused while in use, with the count.
    - Defaults save and return the exact number of products updated, with their ids when the merchant asked for them to be updated.
    - The suggestion ("5 of your 6 dresses say…") is computed as the most common value among the category's products, and is shown only above a threshold of 3.
- **Test scenarios:**
    - Merging Serums (4) into Face care moves 4 products and removes Serums; Undo recreates Serums and moves the same 4 back.
    - Deleting a category moves its products to Uncategorized.
    - Renaming to an existing name, including a case-only clash with another category, is refused.
    - A case-only rename of the category itself is allowed.
    - Removing the value "M" used by a variant is refused.
    - Saving defaults with update-existing changes only products still holding the old default, and the count matches.
    - The category override wins over All products; an empty override falls through.
- **Verification:** specs pass; the permissions contract spec covers the new routes.

### U5. API: permissions, module gate and the reviews filter

> **Done — #464.** No new vocabulary: the products area reads with `store:read` and writes with `store:write` through `StoresService`; the product page's orders and reviews panels also need `order:read` / `product-review:read`, and the discounts panel `discount:read`. A spec reads every products-area controller's own metadata (products, product details, categories, catalogue) and fails if one loses the session guard, the module guard or `@RequireModule("COMMERCE")`. A DB spec on the organization path checks that a Member reads the product page and settings but every write is not found, a Reviewer can't open either, and an Admin can change both. The workspace's `listReviews` takes a product and status filter. Verified: 4 gate tests and 4 role tests; full API suites green (unit 2,125, integration 1,458).

- **Goal:** the new routes follow the existing access model, and the workspace can read reviews for one product.
- **Files:**
    - the new controllers (store read/write via `StoresService`, `@RequireModule("COMMERCE")`)
    - `apps/app.saroh.in/lib/product-reviews/service.ts` (a `productId` filter)
    - `docs/patterns/backend-auth-and-access.md`, only if a rule is new
- **Approach:** no new `product:*` vocabulary. Catalogue settings writes are `store:write`; reads are `store:read`.
- **Test scenarios:**
    - A MEMBER can read the overview and settings but gets 404 or 403 on every write.
    - A REVIEWER cannot open products.
    - With COMMERCE off, every route refuses.
- **Verification:** the controller permission specs pass.

### U6. The shop-page preview component

> **Done — #465** (visual check in two skins happens with the Customer view, #467). `ProductPage` in `packages/site-blocks/src/product/` (exported from the package root, not a page block): a gallery with thumbnails, the price with MRP struck through and the saving rounded down, a "how to use / care" line, a variant picker that changes price, MRP, stock word and photo (starting on the first variant that can be sold; a sold-out one can be looked at, not bought), an inert "Add to basket" in preview that says so, description and key points, a Details list (ingredients or fabric, made by, warranty, returns — each absent when team only), and reviews with replies. Optional numbered markers 1–7 for the team notes. `--site-*` only; 44px targets on the picker and basket. Verified: 7 component tests; all 55 site-blocks tests and `check:blocks` pass.

- **Goal:** R4's preview, reusable by the future storefront page (KD10).
- **Files:**
    - `packages/site-blocks/src/blocks/product-page/{product-page.tsx,types.ts,index.ts}`
    - fixture and test in `packages/site-blocks/src/blocks.test.tsx`
    - `pnpm run check:blocks` registration if applicable
- **Approach:**
    - A presentational component that takes props only (product, variants with stock words, photos, visible fields, reviews, and optional numbered markers).
    - It has a gallery with thumbnails, a variant picker that changes price, stock word and photo, "Add to basket" shown but inert in preview mode, collapsible details, and a reviews summary.
    - It is styled only with `--site-*` tokens.
- **Test scenarios:**
    - Picking M shows M's price and "Only 2 left".
    - A variant with an MRP shows it struck through with the saving; without one, no strike-through.
    - A sold-out variant shows its stock word and cannot be added.
    - A field whose shop switch is off is absent.
    - Markers render only when asked for.
    - It renders with no photos and no reviews.
- **Verification:** block tests and `check:blocks` pass; it renders in two site skins.

### U7. The product page: Team view

> **Done — #466.** `/commerce/products/[id]` is now the product page; the existing editor moved to `/[id]/edit` until editor v2 (#468) replaces it. Links: `productHref(store, id, tab?)`, `productEditHref(store, id, section?)`, `productSettingsHref`. Header (cover, name that wraps, saved status, one meta line, "Edit product" for writers), URL tabs (Overview, Variants and stock, Photos, Reviews, Orders, Discounts) with badges that say what waits ("2 low", "3 to answer", "Couldn't load"), a draft checklist, stat cards, linked cards, "Everything about it" with On the shop / Team only tags, a photo mosaic, the description; a variants table with a Whole product row and a per-variant drawer (stock, open orders, reviews, photo); photos with alt text and credit; reviews with the spread and inline reply / hide with Undo; orders filtered open or recent in the URL; discounts that reach it. Each panel has its own failed and not-allowed state; a role without `store:read` gets an access page, a missing product a not-found page. "View on the shop" is left out: there is no public product page until #473. Display rules are pure (`lib/products/overview-rules.ts`, 7 tests). Verified in the browser on Northwind's Steel-Toe Safety Shoes at 1440 light and 320 dark (no page overflow; the variants table scrolls in its card; 44px targets), the variant drawer, the orders panel failing on its own with the `Order` table renamed (restored after), and the not-found page. Reviews and photos with real content are checked again on the demo store (#471).

- **Goal:** R1, R2 and R5.
- **Files:**
    - `apps/app.saroh.in/app/(shell)/commerce/products/[productId]/{page.tsx,loading.tsx,not-found.tsx}`
    - `components/commerce/product-page/{header,tabs,overview,variants-table,variant-drawer,photos-tab,reviews-tab,orders-tab,discounts-tab,new-product-checklist}.tsx`
    - `lib/products/{service.ts,overview.ts}` (types and read)
    - a vitest for the pure helpers (stock word, price range, can-sell, rating distribution) in `lib/products/overview.test.ts`
- **Approach:**
    - A Server Component reads the overview. The tab is a URL param.
    - The drawer and the reply and hide actions are client islands.
    - Reply and hide reuse `lib/product-reviews/actions.ts`, now with toasts and Undo for hide.
    - States use `@saroh/ui/data-state`.
- **Test scenarios (helpers):**
    - Price range "₹499 – ₹899" or a single price.
    - Can-sell never goes below 0.
    - The stock word is "Sold out", "Only n left" or "In stock" at the warn-at edge.
    - The distribution sums to the review count.
    - Plurals are correct at 0, 1 and n.
- **Verification:** the browser pass in U13.

### U8. The product page: quick-edit sheets and the Customer view

- **Goal:** R3 and R4.
- **Files:**
    - `components/commerce/product-page/sheets/{details,description,prices-stock,photos}-sheet.tsx`
    - `components/commerce/product-page/customer-view.tsx` (preview plus team notes)
    - `lib/products/actions.ts`
- **Approach:**
    - Each sheet is a section form (KD11) calling the section PATCH or its endpoint.
    - Cancel discards. Close, Escape or the backdrop ask when the sheet has changes.
    - The Customer view maps overview data into U6's props and builds the team notes from the same data. Each note's link targets an editor section.
- **Test scenarios:**
    - Covered by U13's walkthrough: save a sheet, then Undo; close a changed sheet and choose Keep editing; switch team notes off.

### U9. Editor v2: the shell, and Basics through SEO

- **Goal:** R10–R14, R16, R17, R20 and R21 for those sections.
- **Files:**
    - `apps/app.saroh.in/app/(shell)/commerce/products/[productId]/edit/page.tsx`
    - `app/(shell)/commerce/products/new/page.tsx`
    - `components/commerce/product-editor-v2/{editor-shell,section-card,section-nav,save-all,leave-dialog,basics,description,details,made-by,seo,visibility}.tsx`
    - `lib/products/editor-sections.ts` (the zod schemas per section, the slug and SKU suggestion helpers, and the dirty and valid roll-up)
    - `lib/products/editor-sections.test.ts`
    - retire `components/commerce/product-editor.tsx`
- **Approach:**
    - One react-hook-form per section. The shell reads each form's dirty and valid state for the chips, the nav dots, the header hint and Save all.
    - The leave guard extends `components/sites/use-leave-guard.ts` to name the dirty sections and adds a `beforeunload` handler.
    - Description reuses the Tiptap editor with its toolbar trimmed to the allowlist.
    - Create posts Basics, Details and Visibility together, then `router.replace`s to edit. A later section's failure is reported on that section.
- **Test scenarios (helpers):**
    - Slugify: diacritics stripped, "&" becomes "and", trimmed to 150, and an empty result falls back.
    - SKU suggestion "HGS-50ML" from "Hydra Glow Serum" plus "50ml".
    - The price regex, and MRP ≥ price.
    - The header hint for 0, 1 and n dirty sections, with and without fixes needed.
    - Save all partitions dirty sections into valid and invalid.
    - The SEO fallback text is derived from the name and description.
- **Verification:** the browser pass in U13.

### U10. Editor v2: Photos, Variants, Stock

- **Goal:** R15, R18 and R19.
- **Files:**
    - `components/commerce/product-editor-v2/{photos,photo-library,variants,variant-row,stock}.tsx`
    - `lib/media/actions.ts` (a `product-image` purpose)
    - `components/sites/media-picker.tsx` (reuse its upload path, and read dimensions before upload)
- **Approach:**
    - Photos: tiles with move earlier, move later, Cover and take off with Undo; the library panel; upload with XHR progress; an alt text field on each tile.
    - Variants: the option picker from the store's options, "Manage options" linking to settings, staged rows and in-place edits.
    - Stock: the simple or per-variant grid, following KD1.
- **Test scenarios:**
    - Covered by U13's walkthrough: add a 6th photo and read the refusal; take a photo off and Undo; add 3 variants with suggested SKUs and set stock for each; the low-stock alert names the right variant.

### U11. The catalogue settings page

- **Goal:** R6–R9 in the workspace.
- **Files:**
    - `apps/app.saroh.in/app/(shell)/commerce/products/settings/{page.tsx,loading.tsx}`
    - `components/commerce/product-settings/{categories-tab,options-tab,defaults-tab,defaults-save-bar}.tsx`
    - `lib/products/settings.ts`
    - a redirect at `commerce/products/categories/page.tsx`
    - retire `components/stores/categories-manager.tsx`
    - a "Settings" entry on the Products page header
- **Approach:**
    - Changes that take effect immediately call U4 and show a toast whose Undo sends the reverse call.
    - Defaults is a single form with a sticky save bar and a leave guard.
- **Test scenarios:**
    - Covered by U13: rename, merge and delete with Undo; a blocked value removal; save defaults with update-existing.

### U12. The demo store: beauty & dresses

- **Goal:** R25 (KD15, KD16).
- **Files:**
    - `packages/database/src/seed/showcase/{data.ts,run.ts,commerce.ts,check.ts,boutique.ts}`
    - `packages/database/src/seed/run.ts` (`deleteSeeded` gains the new tables)
    - `scripts/check-demo-images.mjs` (a one-off URL check)
    - `docs/architecture/LOCAL_DEV.md` (the "Showcase" section)
- **Approach:**
    - A new `ShowcaseBusiness` for a boutique (name chosen at implementation, e.g. "Mira & Mauve"), with categories, store options (Size, Shade, Volume, Colour) and category defaults.
    - About 30 products in three groups:
        - women's skincare, about 12: serums, moisturisers, sunscreen, cleansers
        - men's skincare, about 8: face wash, beard oil, moisturiser, sunscreen
        - women's dresses, about 10: in S/M/L/XL or colours
    - Most products carry an MRP above the selling price, as Indian listings do; a few sell at MRP.
    - Each product has 3–5 photos with alt text and credit, a description with key points, and ingredients or fabric and care. SEO is left empty on some products so the fallbacks show.
    - Stock is shaped so the demo has one variant sold out and one low.
    - Seeded delivered orders by variant feed reviews: ratings are spread 1–5, a few carry replies, and one is hidden.
    - Listing structure and price bands are researched from real Amazon.in listings at implementation.
- **Test scenarios:**
    - The seed runs twice with an identical result.
    - A reset removes every seeded row, and no review or image is orphaned.
    - `check.ts` invariants hold: stock sums, ≤5 photos, exactly one cover, reviews behind delivered lines of the same variant.
    - The image-check script reports 200 for every URL.
- **Verification:**
    - `pnpm --filter @saroh/database db:seed:showcase` runs clean.
    - The boutique appears in the workspace switcher for `demo@saroh.dev`.

### U13. Verification, the film script and the docs

- **Goal:** R26 and R27, and the decisions written down.
- **Files:**
    - `e2e/tests/product-editor.spec.ts`: create a product, add 3 variants, add photos from the library, set stock, publish, then open the product page. Both desk and phone projects; it cleans up after itself.
    - `docs/demos/crud-flows/01-product-editor.md`, rewritten for v2 on the boutique
    - `docs/architecture/DECISIONS.md` (DEC-022: stock per variant, the photo set, sections as the save unit, Uncategorized as null)
    - `docs/patterns/frontend-forms.md` (point the reference at editor v2)
    - this plan's "What shipped"
- **Approach:**
    - A browser pass under portless using the devtools MCP (never the user's own Chrome window). Emulate 320×740, 390×844 and 1440×900 in light and dark.
    - Walk every state of the three screens:
        - loading
        - failed: break the API and look
        - partial: orders failed
        - not found
        - no access: sign in as a Reviewer
        - read-only: Member
        - empty and new-draft
        - every validation message
        - every Undo
        - every leave guard
    - Check `scrollWidth`, overlapping controls, target sizes and contrast.
- **Test scenarios:**
    - The Playwright spec on desk and phone.
    - The existing four-scenes spec still passes.
- **Verification:**
    - The before-you-finish commands in `AGENTS.md` all pass.
    - Screenshots of each state are attached to the epic.

## Risks

- **Changing order stock moves (U3) touches money-adjacent code.** Mitigation: specs first for each transition, including legacy null-variant lines, and the existing order-state suites kept green.
- **The film depends on third-party image URLs.** Mitigation: the check script, dimensions stored so layouts never reflow, and a fallback tile that says the photo does not load.
- **Plan size.** Thirteen units. Mitigation: they ship as one epic but land as separate commits in phase order, and the screens are verifiable against the seed from U12 onward.

## Sources

- The designs, and the design specs derived from them in this session, covering all three files.
- `docs/plans/2026-06-07-001-feat-store-products-catalog-plan.md`
- `docs/plans/2026-09-21-001-feat-product-reviews-plan.md`
- `docs/demos/crud-flows/01-product-editor.md`
- `docs/patterns/{backend-data-and-money,frontend-forms,frontend-data-and-state,frontend-error-feedback}.md`
- `.agents/skills/{saroh-four-scenes,saroh-product-states,saroh-migrations}/SKILL.md`
- ADR-001, ADR-006, DEC-009
