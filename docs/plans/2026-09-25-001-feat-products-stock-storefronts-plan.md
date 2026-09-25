---
title: "feat: Products and Stock — several storefronts, one catalogue, a stock log, collections, and the four redesigned screens"
type: feat
status: active
date: 2026-09-25
origin: claude.ai design project 1fef6fb9-c3b1-4c04-bfc2-86d09cb32a65 — Saroh Products Screen.dc.html, Saroh Product Detail.dc.html, Saroh Product Editor v2.dc.html, Saroh Stock.dc.html (+ image-slot.js, saroh-fixtures.js)
builds_on: epic #481 (Products, rebuilt) — merged into feat/billing-bookings-screens
decisions: ADR-010, DEC-030, DEC-031, DEC-032
epic: 528
issues: [510, 511, 512, 513, 514, 515, 516, 517, 518, 519, 520, 527, 521, 522, 523, 524, 525, 526]
---

# Products and Stock

## Summary

The four product designs were updated after epic #481 was built. Products v2 is
already on the branch; this round closes the gap between it and the new
designs, and adds what the designs assume and the product does not yet have:

- **Several storefronts** selling from **one business catalogue**, with stock
  counted **per storefront** and moved between them (ADR-010).
- A **stock log** every change writes to, a **Stock** screen (Levels, Log,
  Checks), counting, and a stock-only permission (DEC-032).
- **Collections** — hand-picked and automatic — and where a product is shown on
  the website (DEC-031).
- The **Products list**, **Product Detail** and **Editor** updated to the new
  designs, including 15 photos and 3 videos per product.

## Decisions (agreed with the user, 25 Sep 2026)

| # | Decision | Where |
|---|---|---|
| D1 | Lift the one-storefront cap now. The catalogue belongs to the business; a storefront sells a product through a listing; stock is counted per storefront; stock can be moved. The website cap stays at one. | ADR-010 · DEC-030 |
| D2 | Build Collections now: hand-picked and automatic (by category), a Collections tab on products, "Shown on the website". | DEC-031 |
| D3 | "Stop selling" archives the product (with Undo); "Sell again" publishes it. No new Paused status. | DEC-032 |
| D4 | The stock log is never edited: Undo writes a reversing entry. | DEC-032 |
| D5 | A count may be saved below what is promised; the gap shows as "N short". | DEC-032 |
| D6 | A separate "Count and move stock" permission (`inventory:write`), so a role can change stock without editing prices. | DEC-032 |
| D7 | **No overselling.** A storefront sells `on hand − promised`; at 0 the product is Sold out there and new orders are refused, until an order is cancelled or refunded before it was fulfilled, which gives the units back. (User: "10 units and 10 orders — the 11th is not received; it shows out of stock until the order is cancelled or refunded.") | DEC-032 |

Defaults taken without a question (say so if any is wrong):

- **15 photos and 3 videos** per product, as the designs show (folds in #474).
- The Products list keeps a **photo** in the row tile (initials only when there is none); the design's initials were a prototype stand-in.
- The list keeps **each product's own warning level** and the working **status Filter**, which the design leaves inert.
- The Editor's **Tabs layout** is not built (KD13 in the #481 plan; it would break the one-take film).
- "Scheduled" publishing is not built (no backend, not asked for).
- "Ready time" is a label on the existing details field for food businesses, not a new field.

## Shared rules (one place each)

- `lib/stock/levels.ts` (app) and `modules/stock/stock-words.ts` (API): **can sell = on hand − promised**, **short = promised − on hand** when positive, **low** when can sell ≤ warning level, **sold out** when can sell ≤ 0. Every screen reads these; none recomputes.
- `components/commerce/needs-you.tsx`: the "Needs you" panel (out / low / short) used by the Products list and the Stock screen.
- `stockLine()`: the one sentence for a stock cell, used by the list, the quick look, Product Detail and Stock.

## Units

Phase 1 is foundations (data and API); Phase 2 is the screens. Each unit is one
issue and one PR; dependencies are listed. Every unit: tests with it, checked in
the browser on **Northwind** only (Rye, Pulse and Leela are read-only), and the
design compared side by side at 1440 and 390 before it is called done.

### Phase 1 — foundations

**F1. One catalogue, listings and stock per storefront (migration)** — #510
- `Product.organizationId` required; `ProductListing` (product × storefront, which variants it sells there); `StockLevel` (storefront × product or variant: on hand, promised, warning level) replacing `Inventory`/`VariantInventory` as the source.
- Backfill: every product gets its store's organization and a listing at its store; every inventory row becomes a stock level at that store. `Product.storeId` stays, read-only, until F2 lands.
- Products API reads and writes through listings; a product can be listed at several storefronts; "Sell it at" per variant.
- Tests: migration replay; backfill spec on a copy of the seed; org isolation; a product listed at two storefronts keeps one catalogue row.
- Depends on: —

**F2. Orders, checkout and the website read a storefront's listing and stock** — #511
- Orders reserve, commit and release at the order's storefront `StockLevel`; checkout refuses a product not listed there; `saroh.app` shows a storefront's listed products and its own Sold out.
- **D7:** cancelling an order, or refunding one that wasn't fulfilled, releases its promised units (today a refund doesn't); the 11th order against 10 units is refused with "Sold out".
- Tests: reservation per storefront; oversell refused; cancel and unfulfilled refund release; a fulfilled refund doesn't (returns are an explicit entry).
- Depends on: F1

**F3. Several storefronts: lift the cap, create and manage them** — #512
- `MAX_STOREFRONTS_PER_BUSINESS` becomes an entitlement (default 5). Sell › Storefronts gets "New storefront"; pickers and "across N storefronts" appear only when a business has more than one.
- Tests: the cap by plan; every existing single-storefront screen unchanged with one.
- Depends on: F1

**F4. The stock log and the stock rules (migration)** — #513
- `StockEntry` (storefront, product/variant, kind: sold · returned · baked · received · wasted · counted · moved · reversed, signed quantity, before, after, order, pair, person, note, time). Never edited or deleted.
- Every stock change writes one in the same transaction: counts (below promised allowed, D5), order commits (sold), releases never write, moves write a pair, Undo writes a reversal (D4).
- `inventory:write` permission ("Count and move stock", D6), granted by `store:write` too; price and name still need `store:write`.
- Tests: before + quantity = after for every entry; exactly one entry per change; reversal; permission 403s.
- Depends on: F1

**F5. Stock API** — #514
- `GET …/stock` (levels per storefront × variant, untracked products), `GET …/stock/log` (kind, storefront, product, cursor), `POST …/stock/counts` (batch), `POST …/stock/entries` (received, baked, wasted), `POST …/stock/adjust` (+N, for the quick look), `POST …/stock/moves`, `POST …/stock/reverse`, `GET …/stock/checks` (short; count didn't match; sale not taken from stock) with a small resolutions table.
- Tests: integration per endpoint incl. permissions and org isolation.
- Depends on: F4

**F6. Track stock on and off (migration)** — #515
- `Product.stockTracked` (backfilled from whether rows exist) and a business switch; untracked products always sell, show "Not tracked", and are listed on the Stock screen's footer. Turning it back on starts from 0.
- Depends on: F1

**F7. Collections (migration)** — #516
- `Collection` (hand-picked or automatic by category), membership, and where the website shows it or the product (read from published site blocks). API: list, create, edit, add/remove products; a product's collections and website pages.
- Tests: an automatic collection follows its category; membership edits locked on automatic ones; org isolation.
- Depends on: F1

**F8. 15 photos and 3 videos (migration)** — #517
- Limits 5 → 15 photos; `ProductImage.kind` (photo/video), duration and poster; video uploads up to 50 MB (MP4, MOV); the storefront site plays them. Folds in #474.
- Depends on: —

**F9. Product endpoints the screens need** — #518
- Duplicate a product (a draft copy, "-copy" SKUs, photos copied, stock 0); the list payload carries promised and per-variant stock; reviews owed a reply first and `canReply`; `canStock` in the overview.
- Depends on: F1 (payload), —

### Phase 2 — screens

**S1. Products list** — #519
- Header "More ▾" (Import from a spreadsheet, Product settings) and New product; tabs All · Collections · Inventory · Reviews with counts; the shared Needs you panel with Restock; row menu Preview · Edit · Duplicate · Archive · Delete; variant price range; storefront filter and "N in this view" in the bulk bar; loading, failed ("Couldn't load products…"), partial and no-results states with the design's copy; phone layout.
- Depends on: F9 (duplicate), F7 (Collections tab)

**S2. The list's quick look** — #520
- Status pill, "3 of 12" with J/K and arrows; can sell · on hand · promised per storefront; the short alert; per-variant "+N · Add"; Open product page · Edit · Stop selling / Sell again (archive, D3).
- Depends on: F5 (adjust), S1

**S3. Stock screen — Levels and counting** — #527
- Sell › Stock (shown when anything is tracked): Levels with a column per storefront, chips and search, Needs you, the untracked footer; Count stock inline with the sticky bar and Undo; locked and tracking-off states.
- Depends on: F5, F6

**S4. Stock screen — Log, Checks, Move stock, entries** — #521
- The Log tab (filters, grouped by day, the footer rules), the Checks tab (the three check kinds and their actions), the Move stock dialog, and a sheet to record received, baked or wasted stock.
- Depends on: S3

**S5. Product Detail — header, tabs, Overview** — #522
- Team/Customer switch in the crumb row, the cover opens Photos, "Changed …" in the meta; tabs Overview · Stock · Photos and videos · Reviews · Orders · Discounts · Collections with scroll fades; the Overview's two stat cards, the short alert, Linked to this product (Orders, Discounts, Collections, Website, Reviews), Details grouped "How it's sold" / "On the product page" with their tags; product-specific error, 404 and locked copy.
- Depends on: F7 (Collections, Website cards)

**S6. Product Detail — Stock tab and stock sheet** — #523
- Sizes and stock with Shop shows / Warns at, a row per storefront under each variant, Total, Recent changes with the week line and "See the full log"; the stock sheet per storefront; per-permission gating (stock-only sees read-only prices) and the access line; reviews owed first.
- Depends on: F4, F5, F9

**S7. Collections on screens** — #524
- Product Detail's Collections tab and edit sheet (automatic ones locked); the list's Collections tab (create, edit, hand-pick, by category).
- Depends on: F7, S1, S5

**S8. Editor v2 to the new design** — #525
- Read-only banner with the role; stock-only editing of the Stock section; "You can't open this product"; allergens while creating; description copy; details label by business type; Track stock switch (F6); "Sell it at" per variant (F1); Photos and videos with the new limits and copy (F8). Film script updated in the same PR.
- Depends on: F1, F6, F8, F4 (permission)

**S9. Demo data, film script and verification** — #526
- Northwind and the beauty & dresses demo store gain a second storefront ("Online") with its own stock and a week of stock log; the film script and `docs/demos/crud-flows` updated; an e2e pass over list → detail → edit → stock → move.
- Depends on: all of the above

## Also found (not in this epic)

- Disconnecting a payment or email provider isn't recorded in Activity (#509 covers settings changes only).

## Scope boundaries

- One website per business stays (ADR-006 for websites).
- No Paused status (D3), no Scheduled publishing, no Tabs layout in the Editor.
- Stock checks cover the three kinds in the design; automated reconciliation is later.
