# Order fulfilment types rollout (plan B: B2a, B2c, B2d)

> **Read when:** deploying any of the three fulfilment-type releases to any
> environment, or rolling one back. Decision: DEC-045 (`DECISIONS.md`). Plan:
> `docs/plans/2026-09-26-002-feat-orders-fulfilment-plan.md` (Key Technical
> Decisions, "The enum changes by expand and contract"). Referenced from
> `docs/patterns/devops-tooling-and-deploy.md`.

An order used to be Collect or Delivery (`OrderFulfilment` COLLECT,
DELIVERY). It becomes one of six types — PICKUP, LOCAL_DELIVERY, SHIPPING,
DIGITAL, APPOINTMENT_IN_PERSON, APPOINTMENT_ONLINE — and `OrderStage` gains
OUT_FOR_DELIVERY and SENT. COLLECT means PICKUP and DELIVERY means
LOCAL_DELIVERY; nothing changes meaning.

The enum is never renamed in place. `ALTER TYPE … RENAME VALUE` would break
the API still serving while the migration runs (its Prisma client writes
COLLECT and can't read PICKUP), would make "deploy the previous tag" useless
as a rollback, and would break the separately deployed app, which still sends
COLLECT. So the change ships in **three releases**. Each is a normal release
(API first, then the app), and **each can be rolled back by deploying the
previous tag**:

| Release      | Unit | Database                                                                                               | API writes                                                                                                                         | API reads and answers                                                                                                                       |
| ------------ | ---- | ------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| 1 · expand   | B2a  | adds the six types, OUT_FOR_DELIVERY, SENT and `StoreSettings.fulfilmentTypes`; no `Order` row changes | exactly today's values and stages (COLLECT, DELIVERY, HANDED_TO_COURIER); the new types are refused (400 "… isn't available yet.") | both vocabularies in and out; every order read carries the legacy `fulfilment` **and** `fulfilmentType`, `steps`, `stepIndex`, `ticketName` |
| 2 · switch   | B2c  | backfills COLLECT → PICKUP and DELIVERY → LOCAL_DELIVERY; the column default becomes PICKUP            | only the new values; the new types and stages open                                                                                 | as release 1                                                                                                                                |
| 3 · contract | B2d  | re-runs the backfill for stragglers, then drops COLLECT and DELIVERY                                   | new values only                                                                                                                    | new values only; the legacy `fulfilment` field and the bare-array Orders list go                                                            |

The switch between "write old" and "write new" is a constant in
`apps/api.saroh.in/src/modules/orders/fulfilment.ts`
(`WRITES_NEW_FULFILMENT_VALUES`), off in release 1 and flipped by B2c's
change. It is deliberately **not** an environment flag: it must follow the
migration, not the environment.

**Order between releases.** Release 2 goes out only after release 1 has
been live (API and app) in that environment: the image serving while B2c's
backfill runs, and the tag B2c rolls back to, must be one that reads the new
values. Release 3 goes out one release after release 2, and only when every
caller of the Orders list is on `v=2` (B1) and no app build older than B2a's
is in production.

**Why each rollback is safe.** Rolling back release 1 lands on the image
before it, and release 1 wrote nothing that image can't read. Rolling back
release 2 lands on release 1, which reads every new value and stage. Rolling
back release 3 lands on release 2, which writes only values that still exist.
No release needs the snapshot to roll back; each still takes the usual backup
before it migrates.

---

## Release 1 · expand (B2a)

### The migrations and their locks

| Migration                                | What it does                                                                                                                                                                                                                                                  | Locks held until it commits                                                                                                                                                                                                                                | Time                                                                                                                                    |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `20261009130000_order_fulfilment_values` | `ALTER TYPE "OrderFulfilment" ADD VALUE` ×6, `ALTER TYPE "OrderStage" ADD VALUE` ×2. The values only, in a file of their own: Postgres can't use an enum value in the transaction that adds it.                                                               | A brief lock on each type's catalogue entry. **Rewrites no table** and takes no lock on `Order` or `OrderEvent`.                                                                                                                                           | Constant, independent of data size.                                                                                                     |
| `20261009130001_store_fulfilment_types`  | `ALTER TABLE "StoreSettings" ADD COLUMN "fulfilmentTypes" "OrderFulfilment"[] DEFAULT '{}'`, then one `UPDATE` that fills it: PICKUP where `collectionEnabled`, LOCAL_DELIVERY where the storefront has any DELIVERY order, SHIPPING where `shippingEnabled`. | ACCESS EXCLUSIVE on `StoreSettings` for the ADD COLUMN (a catalogue change with a constant default: no rewrite), then row locks on every `StoreSettings` row for the UPDATE. `Order` is only read, through its `storeId` index (one probe per storefront). | Measured on the showcase seed (5 storefronts, 190 orders): 0.9 ms for the UPDATE. It scales with the number of storefronts, not orders. |

Nothing in this release changes an `Order` row, so an order edit or a
kitchen move in flight is never blocked by it. Re-time on a restored copy of
production before the window once production has real data (as
`PRODUCTS_STOCK_ROLLOUT.md` does); for this release a normal window is
enough.

### Checklist

This release **can** go through the automatic push-to-deploy (backup,
migrate, deploy): its migrations only add, so the old image keeps serving
while they run, and there is no step after them that the new image depends
on.

1. **Back up** (the host's rollout does it before it migrates).
2. **Migrate** with the new image: `db:migrate:deploy` applies the two files
   in order. Both are additive.
3. **Deploy** the new API image and wait for `/health/ready`.
4. **Sweep storefronts the old image created during the deploy** (optional,
   idempotent, read-mostly). A storefront the previous image created after
   the backfill ran has an empty `fulfilmentTypes`. The new image fills it on
   the storefront's next settings save, and reads a storefront with no
   settings row as the column defaults (SHIPPING). To fill any such row
   now, re-run the backfill for empty rows only:

    ```sql
    UPDATE "StoreSettings" s
    SET "fulfilmentTypes" = ARRAY(
        SELECT t::"OrderFulfilment"
        FROM (
            SELECT 1 AS pos, 'PICKUP' AS t WHERE s."collectionEnabled"
            UNION ALL
            SELECT 2, 'LOCAL_DELIVERY'
            WHERE EXISTS (
                SELECT 1 FROM "Order" o
                WHERE o."storeId" = s."storeId" AND o.fulfilment = 'DELIVERY'
            )
            UNION ALL
            SELECT 3, 'SHIPPING' WHERE s."shippingEnabled"
        ) offered
        ORDER BY pos
    )
    WHERE s."fulfilmentTypes" = '{}';
    ```

5. **Verify** (read-only). Every query must return no rows:

    ```sql
    -- Release 1 writes nothing new: no order or event holds a new value.
    SELECT id FROM "Order"
    WHERE fulfilment NOT IN ('COLLECT', 'DELIVERY')
       OR stage IN ('OUT_FOR_DELIVERY', 'SENT');
    SELECT id FROM "OrderEvent"
    WHERE "fromStage" IN ('OUT_FOR_DELIVERY', 'SENT')
       OR "toStage" IN ('OUT_FOR_DELIVERY', 'SENT');

    -- Only a storefront's own ways are ever stored on it.
    SELECT "storeId" FROM "StoreSettings"
    WHERE NOT ("fulfilmentTypes" <@ ARRAY['PICKUP', 'LOCAL_DELIVERY', 'SHIPPING']::"OrderFulfilment"[]);
    ```

6. **Deploy the app** (Vercel) after the API, as always. An app built
   before B2a keeps working against this API: it still gets `fulfilment` as
   COLLECT or DELIVERY and may still send them, which the API accepts until
   release 3.

### What changes for callers

- `GET organizations/:org/orders/:orderId` (Order Detail), the Orders list
  rows (`v=2`) and the customer detail's orders carry `fulfilmentType`
  beside the legacy `fulfilment` word; the order read and the list rows also
  carry `fulfilmentLabel`, `steps` (stage and word), `stepIndex` and
  `ticketName`. Nothing is removed.
- Create and edit accept either vocabulary. PICKUP is stored as COLLECT and
  LOCAL_DELIVERY as DELIVERY. SHIPPING, DIGITAL and the appointment types
  are refused with 400 until release 2.
- **Deliberate change:** the store-scoped status PATCH (`PATCH
stores/:storeId/orders/:orderId`) no longer changes an order's type. It
  used to turn any order it marked SHIPPED into a delivery at
  HANDED_TO_COURIER. Now SHIPPED on a pick-up order is refused with 409 "A
  pick-up order isn't shipped. Change how it's fulfilled first.", and
  DELIVERED on an appointment with 409, before anything is written.
  Nothing in the app sends either; the API specs that used SHIPPED to sell a
  pick-up order's stock now use DELIVERED.
- The invoice's bill-to address and GST place of supply come from the
  delivery address for LOCAL_DELIVERY and SHIPPING (and DELIVERY), so a
  Shipping order is taxed where it goes.

### Rollback

Deploy the previous API tag. Release 1 wrote no value that image can't read:
the two new migrations stay applied (the enum values and the column are
unused by it, and Prisma never selects a column it doesn't know). Then
redeploy the previous app build if the app had already gone out; the app
also draws an order from the two old flows when the API sends no `steps`.

### Rehearsal (to do before production)

Start the previous API tag against a database migrated by this release, and
check that Orders, Order Detail and a kitchen move work. Plan B's
verification for B2a; the orchestrator runs it on the development
environment.

---

## Beside release 1 · the courier and the late rule (B2b)

Not one of the three releases: it changes no enum value and can ship with
release 1 or any release after it.

- **Migration** `20261010140000_order_courier_tracking`: `ALTER TABLE "Order"
ADD COLUMN "courierName" TEXT, ADD COLUMN "trackingNumber" TEXT`. Nullable,
  no default: a catalogue change under a brief ACCESS EXCLUSIVE lock on
  `Order`, no rewrite, constant time. The previous image never names either
  column, so it keeps serving during the migration, and **rollback** is
  deploying the previous tag (the columns stay, unused).
- **What changes for callers:**
    - the order read and the Orders list rows (`v=2`) carry `late`, `lateBy`
      and `lateAfterMinutes`, from `lateOf` in `fulfilment.ts` — the rule the
      list's Late filter runs in SQL — and `courierName` and `trackingNumber`;
    - `POST …/orders/:orderId/stage` to HANDED_TO_COURIER takes
      `courierName` and `trackingNumber` (optional, trimmed, ≤ 80 characters);
      any other step refuses them with 400;
    - `PATCH …/orders/:orderId` takes `courierName`, `trackingNumber` and
      `trackingUrl` once an order that goes by courier is handed over, with
      `order:stage`; every other field is refused with 409 from handover on
      (notes included — they used to stay editable until cancelled).
- **Deliberate change:** Order Detail's header no longer says an order is
  late after 20 minutes. It shows the API's `late`: a pick-up is late after
  2 hours, a local delivery after 24 and a shipment after 48 (default 16),
  until each storefront sets its own (B17, which should ship with this or in
  the release after it).

---

## Release 2 · switch (B2c)

To be filled in by B2c: the backfill migration
(`<ts>_order_fulfilment_switch`: COLLECT → PICKUP and DELIVERY →
LOCAL_DELIVERY, the column default PICKUP), its row count and timing from
the rehearsal, and what it locks. It rewrites `Order.fulfilment` for every
row, so it takes row locks on every order; time it on a production-sized
copy.

- The backfill rewrites values the running release-1 image already reads,
  so it keeps serving during the migration. It may still write COLLECT or
  DELIVERY until the new image serves; B2d catches those.
- A former DELIVERY order at HANDED_TO_COURIER becomes a LOCAL_DELIVERY
  order at HANDED_TO_COURIER, and moves on by the legacy
  HANDED_TO_COURIER → DELIVERED move (kept for good).
- Rollback: deploy the release-1 tag.

## Release 3 · contract (B2d)

To be filled in by B2d: the contract migration re-runs the backfill for
stragglers, fails loudly if any COLLECT or DELIVERY remains, builds the new
type without them, casts `Order.fulfilment`, `StoreSettings.fulfilmentTypes`
and `Product.fulfilmentTypes` (if B12 has shipped) to it, and swaps the
names. The cast rewrites `Order` under an ACCESS EXCLUSIVE lock: measure how
long on a production-sized copy and record it here before choosing the
window.

- Rollback: deploy the release-2 tag; it writes only values that remain.
