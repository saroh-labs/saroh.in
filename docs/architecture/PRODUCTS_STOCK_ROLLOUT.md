# Products and Stock rollout (#510–#531)

> **Read when:** deploying the Products and Stock release (PR #533) to any
> environment, or when `HeldStockWatch` logs "Held stock doesn't add up".
> Decisions: DEC-030, DEC-031, DEC-032 (`DECISIONS.md`), ADR-010.
> Referenced from `docs/patterns/devops-tooling-and-deploy.md`.

This release changes a product from a storefront's to the business's, adds a
listing per storefront, moves stock from `Inventory` / `VariantInventory` to
one `StockLevel` row per storefront × product × variant, and makes every
open order line record what it holds. Most of it is migrations, but one step
after them is a script, and it has to run before the new image takes
traffic. Run the steps below in order.

## The migrations and their locks

Measured on a local copy with 50 businesses, 20,000 products, 40,000
variants, 20,000 `VariantInventory` rows and 200,000 order lines (50,000
orders). Each migration is one transaction.

| Migration                                        | Time   | Locks held until it commits                                                                                                                                                             |
| ------------------------------------------------ | ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `20261001110000_catalogue_settings_to_business`  | small  | Catalogue settings tables                                                                                                                                                               |
| `20261002100000_catalogue_listings_stock_levels` | 0.33 s | **ACCESS EXCLUSIVE on `Product` and `OrderItem`** (SET NOT NULL, ADD COLUMN, foreign keys). Schema only.                                                                                |
| `20261002100001_listings_stock_levels_copy`      | 7.5 s  | Row locks on the order lines it links (open and fulfilled); inserts into the new tables. Reads of `Product` are not blocked. An order edit or status change touching those lines waits. |
| `20261003100000_stock_entries`                   | 1.5 s  | New table; its foreign keys take SHARE ROW EXCLUSIVE on `StockLevel`, `Store`, `Product` and `Order` (writes wait, reads don't).                                                        |
| `20261004300000_order_stock_sold_put_back`       | 2.0 s  | ACCESS EXCLUSIVE on `OrderItem` and `PaymentRefundLine` (ADD COLUMN) while it fills `soldQuantity`.                                                                                     |
| `20261005100000_stock_tracking`                  | 0.5 s  | ACCESS EXCLUSIVE on `Product` (ADD COLUMN) while it fills `stockTracked`.                                                                                                               |
| the rest                                         | < 0.1s | Additive.                                                                                                                                                                               |

Until #5 of the PR review, the copy ran inside `20261002100000`, holding the
`Product` lock for 7.8 s. It is a migration of its own, not a script after
the deploy, because `stock_entries`, `order_stock_sold_put_back` and
`stock_tracking` read the rows it copies. Scale these times with the size of
the database; above about 10× this dataset, schedule the deploy for a quiet
hour.

## Checklist

1. **Back up.** The host's rollout takes a fresh snapshot before it
   migrates. Confirm it exists and note its name: **rollback is restoring
   it** (below).
2. **Migrate** with the new image: `db:migrate:deploy`.
    - If `20261001110000_catalogue_settings_to_business` stops ("the same
      category, option or defaults at two storefronts"), run
      `packages/database/src/backfill/catalogue-settings.cli.ts`, mark the
      migration rolled back (`prisma migrate resolve --rolled-back <name>`),
      and migrate again.
    - If `20261002100000_catalogue_listings_stock_levels` stops ("a product
      has no business", "two products of one business share an address"),
      run `listings-stock-levels.cli.ts` (step 3) first. It fills in each
      product's business and suffixes the clashing addresses, reporting each
      one. Then mark the migration rolled back and migrate again.
3. **Run the listings and stock backfill**, before the new image serves
   traffic:

    ```bash
    DATABASE_URL=... DATABASE_TARGET_CONFIRM=<database> \
      pnpm --filter @saroh/database exec tsx src/backfill/listings-stock-levels.cli.ts
    ```

    After the migrations its copy steps find nothing left to do. The step
    that matters is the last one, the held-stock repair (`held-stock.ts`).
    The copy gave every open line its whole quantity, but the old counter
    may never have set those units aside. Where a row's open lines hold more
    than it promised, it shares what was promised out oldest order first,
    and a line left with nothing stops holding. It prints every row and line
    it changed, and every row it left for Stock checks. Keep the output.

4. **Verify** (read-only). Both queries must return no rows:

    ```sql
    -- Every row promises exactly what its open orders hold.
    SELECT s.id, s."organizationId", s.promised, COALESCE(h.held, 0) AS held
    FROM "StockLevel" s
    LEFT JOIN (
      SELECT i."stockLevelId", SUM(i."heldQuantity") AS held
      FROM "OrderItem" i JOIN "Order" o ON o.id = i."orderId"
      WHERE o.status IN ('PENDING', 'PROCESSING') AND i."stockLevelId" IS NOT NULL
      GROUP BY i."stockLevelId"
    ) h ON h."stockLevelId" = s.id
    WHERE s.promised <> COALESCE(h.held, 0);

    -- Every row's stock log adds up to what is on the shelf.
    SELECT s.id, s."organizationId", s."onHand", COALESCE(SUM(e.quantity), 0) AS logged
    FROM "StockLevel" s
    LEFT JOIN "StockEntry" e ON e."stockLevelId" = s.id
    GROUP BY s.id
    HAVING s."onHand" <> COALESCE(SUM(e.quantity), 0);
    ```

    A row in the first query that the backfill reported as "left" (it
    promises more than its lines hold) is expected. The repair never guesses
    which order the extra was for. The merchant sees it in Stock checks as
    "Promised doesn't add up". Anything else: stop and look before going on.

5. **Merge same products** (optional; #530). This joins products that were
   made once per storefront into one product sold at each:

    ```bash
    DATABASE_URL=... DATABASE_TARGET_CONFIRM=<database> \
      pnpm --filter @saroh/database exec tsx src/backfill/merge-same-products.cli.ts
    ```

    It refuses to run before step 3. A merge that would widen a live
    discount's reach is kept apart. Each business with anything to say gets
    its report in the audit stream and a notice in the Owner/Admin inbox.
    Run step 4 again afterwards.

6. **Deploy** the new image and wait for `/health/ready`. On start the API
   checks held stock across every business (`HeldStockWatch`) and logs at
   ERROR if anything doesn't add up. Read the log after the start: no line
   means the invariant holds.

## If something is wrong

- **Rollback is restoring the snapshot from step 1**, then deploying the
  previous image tag. The migrations are forward-only: nothing reverses
  them, and the old code can't read stock from `StockLevel`. Anything written
  after the snapshot is lost.
- **"Held stock doesn't add up" in the API log** on a later start means
  something wrote order lines or rows outside `stock/reserve.ts` (a seed, a
  script, a bug). See what the repair would do, then run it:

    ```bash
    DATABASE_URL=... DATABASE_TARGET_CONFIRM=<database> \
      pnpm --filter @saroh/database exec tsx src/backfill/held-stock.cli.ts --dry-run [--org <id>]
    ```

    Take a snapshot, then run it again without `--dry-run`. It takes each open
    order's lock before the rows, as every stock flow does, so it is safe
    while the API serves traffic.
