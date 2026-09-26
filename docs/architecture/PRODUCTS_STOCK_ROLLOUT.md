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

**This release does not go out through the automatic push-to-deploy.** A
push to `main` or `development` runs the host's rollout in one go — backup,
migrate, deploy — and it can't stop for the backfill (step 3) or the checks
(step 4). Worse, the old API keeps serving while it migrates. The copy
migration (`20261002100001`) takes each shelf's count and each open line's
hold once, and nothing refreshes a row once it exists, so anything the old
API writes after it — a fulfilment taking units off `Inventory`, a new order
promising some — never reaches `StockLevel`: shelves read units that were
sold, and a line placed then holds nothing (it is fulfilled without leaving
the shelf). `HeldStockWatch` sees neither, because the promised-equals-held
invariant still holds after the repair. So: merge to the branch that deploys
only once the environment has been through the checklist below by hand, or
keep that push from deploying (disable the deploy workflow's run for it) and
run each step yourself.

## The migrations and their locks

Measured on a local copy with 50 businesses, 20,000 products, 40,000
variants, 20,000 `VariantInventory` rows and 200,000 order lines (50,000
orders). Each migration is one transaction.

| Migration                                        | Time   | Locks held until it commits                                                                                                                                                                                                                                                                    |
| ------------------------------------------------ | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `20261001110000_catalogue_settings_to_business`  | small  | Catalogue settings tables                                                                                                                                                                                                                                                                      |
| `20261002100000_catalogue_listings_stock_levels` | 0.33 s | **ACCESS EXCLUSIVE on `Product` and `OrderItem`** (SET NOT NULL, ADD COLUMN, foreign keys). Schema only.                                                                                                                                                                                       |
| `20261002100001_listings_stock_levels_copy`      | 7.5 s  | Row locks on the order lines it links (open and fulfilled); inserts into the new tables. Reads of `Product` are not blocked. An order edit or status change touching those lines waits.                                                                                                        |
| `20261003100000_stock_entries`                   | 1.5 s  | New table; its foreign keys take SHARE ROW EXCLUSIVE on `StockLevel`, `Store`, `Product` and `Order` (writes wait, reads don't).                                                                                                                                                               |
| `20261004300000_order_stock_sold_put_back`       | 2.0 s  | ACCESS EXCLUSIVE on `OrderItem` and `PaymentRefundLine` (ADD COLUMN) while it fills `soldQuantity`.                                                                                                                                                                                            |
| `20261005100000_stock_tracking`                  | 0.5 s  | ACCESS EXCLUSIVE on `Product` (ADD COLUMN) while it fills `stockTracked`.                                                                                                                                                                                                                      |
| `20261007100000_collection_product_position`     | 0.1 s  | ACCESS EXCLUSIVE on `StockEntry` (ADD COLUMN `system`, then three UPDATEs that find nothing on a first deploy); SHARE on `CollectionProduct`, `StockLevel` and `OrderItem` while their indexes build (writes wait, reads don't). The `OrderItem` partial index reads all 200,000 lines: 53 ms. |
| the rest                                         | < 0.1s | Additive.                                                                                                                                                                                                                                                                                      |

`20261007100000` was timed on the same dataset (`saroh-test-migtime`), which
already had it applied: its objects were dropped and the migration run again
inside a transaction that was rolled back, 0.10 s in all. Its three UPDATEs
mark the stock entries Saroh wrote before `StockEntry.system` existed; a
database this release reaches for the first time has none (the code that
writes them ships with it), so there they change nothing.

Until #5 of the PR review, the copy ran inside `20261002100000`, holding the
`Product` lock for 7.8 s. It is a migration of its own, not a script after
the deploy, because `stock_entries`, `order_stock_sold_put_back` and
`stock_tracking` read the rows it copies. Scale these times with the size of
the database; above about 10× this dataset, schedule the deploy for a quiet
hour.

## Checklist

0. **Stop the old API** before anything else: scale it to 0, or put the API
   and the storefronts into maintenance, so nothing writes orders or stock
   from here until step 6. Checkout and the workspace are down for the
   length of steps 1–6; on the dataset above that is under a minute plus
   the time you spend reading step 4. The new image starts only after
   step 4 (and step 5, if you run it) passes.
1. **Back up.** Take a fresh snapshot now that nothing writes (the host's
   rollout takes one before it migrates; run that part alone). Confirm it
   exists and note its name: **rollback is restoring it** (below).
2. **Migrate** with the new image, without starting it: `db:migrate:deploy`.
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
    it changed, and every row it left for Stock checks. Keep the output. On
    the dataset above it took 6.7 s, capping 16,000 rows. Run on the old
    rows without the SQL copy, doing the whole copy itself, it took 18.7 s.
    It works in chunks of 1,000 products or lines, one transaction each.

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

6. **Deploy** the new image and wait for `/health/ready`, then end the
   maintenance from step 0. On start the API checks held stock across every
   business (`HeldStockWatch`) and logs at ERROR if anything doesn't add up.
   Read the log after the start: no line means the invariant holds.
7. **The media host sends `X-Content-Type-Options: nosniff`.** Product
   videos (#517) are checked for a real MP4/MOV header when their upload
   completes, but the upload's presigned PUT stays valid until it expires,
   so the same key can be overwritten after the check; `nosniff` stops a
   browser from treating such a file as anything but its declared type. In
   Cloudflare, on the zone that serves `R2_PUBLIC_BASE_URL`, add a Response
   Header Transform Rule for that hostname that sets
   `X-Content-Type-Options` to `nosniff`. Check it:
   `curl -sI <R2_PUBLIC_BASE_URL>/<any object key> | grep -i x-content-type-options`
   shows `nosniff`. Once per environment; it isn't in this repo.

## A database that ran this branch before the migrations changed

The branch's migrations were edited in place twice before release, which is
safe only because no shared environment had applied them. A local database
that did apply an earlier version stops at `prisma migrate` with a checksum
mismatch ("was modified after it was applied"):

- **`20261002100000_catalogue_listings_stock_levels`**, if you migrated
  before the copy was split out into `20261002100001` (PR review #5,
  `4f6745b8`). Your database already did the copy, inside the old version.
  Set the recorded checksum to the file's (`shasum -a 256` of its
  `migration.sql`) in `_prisma_migrations`, and mark the copy applied
  rather than running it again:
  `prisma migrate resolve --applied 20261002100001_listings_stock_levels_copy`.
- **`20261007100000_collection_product_position`**, if you migrated before
  the second review: its backfill now also checks each entry's shape, and
  it adds two partial indexes (`StockLevel_promising_idx`,
  `OrderItem_holding_idx`). Create the two indexes by hand with the
  statements at the end of the file, then set the recorded checksum to the
  file's. Entries the old backfill marked stay marked.

Or drop the local database and build it again from the migrations and the
seed (`docs/architecture/LOCAL_DEV.md`). Never do either on a shared
database; one that applied these files is a reason to stop and ask.

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
