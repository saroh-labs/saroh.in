# Order fulfilment types rollout (plan B: B2a, B2c, B2d)

> **Read when:** deploying any of the three fulfilment-type releases to any
> environment, or rolling one back. Decision: DEC-045 (`DECISIONS.md`). Plan:
> `docs/plans/2026-09-26-002-feat-orders-fulfilment-plan.md` (Key Technical
> Decisions, "The enum changes by expand and contract"). Referenced from
> `docs/patterns/devops-tooling-and-deploy.md`.
>
> Release 1 (B2a) ships to production inside round 2's Phase 1 release: its
> whole checklist, deploy order, backfills and rollback are in
> `ROUND_2_PHASE_1_ROLLOUT.md`. The steps below still apply within it.

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

**Release 1 (B2a) must be live in production, API and app, before this
release deploys.** B2c ships in a PR of its own, one release after the one
that carries B2a (round 2's Phase 1 branch). The image that serves while its
migration runs, and the tag a rollback lands on, must be one that reads the
new values; an app built before B2a would still offer "Hand to courier" on a
ready local delivery, which this API refuses. Check before you start:

- the API that production serves is release 1 or later: its
  `GET organizations/:org/orders/:orderId` answers `fulfilmentType` and
  `steps`;
- both release-1 migrations are applied:

    ```sql
    SELECT migration_name, finished_at FROM "_prisma_migrations"
    WHERE migration_name IN ('20261009130000_order_fulfilment_values',
                             '20261009130001_store_fulfilment_types');
    -- two rows, both finished
    ```

- the app in production was built from release 1 or later.

### The migration and its locks

| Migration                                | What it does                                                                                                                                                                                   | Locks held until it commits                                                                                                                                                                                                                                                                                                                          | Time                                                                                                                                                                                                            |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `20261011100000_order_fulfilment_switch` | One `UPDATE "Order"`: COLLECT → PICKUP and DELIVERY → LOCAL_DELIVERY, on every row still in a legacy word. Then `ALTER COLUMN "fulfilment" SET DEFAULT 'PICKUP'`. Stages and `updatedAt` stay. | A row lock on **every order it renames**, from the UPDATE until the commit (a new tuple each; no table lock, no index on the column). An order edit, kitchen move, status PATCH or payment webhook that updates an order row waits for the commit. Reads never wait. The default change is a brief ACCESS EXCLUSIVE lock on `Order` with no rewrite. | Measured locally (Postgres 17, `Order` with its 5 indexes): the showcase seed, **667 orders, 17.9 ms**; the same rows copied to **200,767 orders, 5.55 s** (about 28 µs a row). Linear in the number of orders. |

At today's production size this is milliseconds, and a normal window is
enough. If production holds more than about 50,000 orders when this ships
(over a second of row locks), re-time it on a restored copy (as
`PRODUCTS_STOCK_ROLLOUT.md` does) and pick a quiet hour: every kitchen move
waits for the whole UPDATE.

### Checklist

This release **can** go through the automatic push-to-deploy (backup,
migrate, deploy), once the checks above hold: the migration only renames
values the running release-1 image already reads, so that image keeps
serving while it runs, and nothing after it is needed by the new image.

1. **Back up** (the host's rollout does it before it migrates).
2. **Migrate** with the new image: `db:migrate:deploy` applies
   `20261011100000_order_fulfilment_switch`.
3. **Deploy** the new API image and wait for `/health/ready`.
4. **Sweep orders the old image wrote during the deploy** (optional,
   idempotent). Between the migration and the new image serving, the
   release-1 image may still create or edit an order in COLLECT or
   DELIVERY. They read and move exactly as the renamed ones do, and B2d's
   migration converts them. To convert them now, run the migration's
   UPDATE again; it touches only the stragglers:

    ```sql
    UPDATE "Order"
    SET "fulfilment" = CASE "fulfilment"
            WHEN 'COLLECT' THEN 'PICKUP'::"OrderFulfilment"
            ELSE 'LOCAL_DELIVERY'::"OrderFulfilment"
        END
    WHERE "fulfilment" IN ('COLLECT', 'DELIVERY');
    ```

5. **Verify** (read-only). Every query must return no rows, the first once
   step 4 has run (before it, only orders placed or edited during the deploy
   window may appear):

    ```sql
    -- Every order is in its type's own name.
    SELECT id, fulfilment FROM "Order"
    WHERE fulfilment IN ('COLLECT', 'DELIVERY');

    -- New orders default to Pick-up.
    SELECT column_default FROM information_schema.columns
    WHERE table_name = 'Order' AND column_name = 'fulfilment'
      AND column_default <> '''PICKUP''::"OrderFulfilment"';

    -- Each new stage only on its own type: Out for delivery is a local
    -- delivery's, Sent a digital order's.
    SELECT id, fulfilment, stage FROM "Order"
    WHERE (stage = 'OUT_FOR_DELIVERY' AND fulfilment <> 'LOCAL_DELIVERY')
       OR (stage = 'SENT' AND fulfilment <> 'DIGITAL');

    -- No appointment order yet: they come only by booking (E9).
    SELECT id FROM "Order"
    WHERE fulfilment IN ('APPOINTMENT_IN_PERSON', 'APPOINTMENT_ONLINE');

    -- Only a storefront's own ways are ever stored on it (as release 1).
    SELECT "storeId" FROM "StoreSettings"
    WHERE NOT ("fulfilmentTypes" <@ ARRAY['PICKUP', 'LOCAL_DELIVERY', 'SHIPPING']::"OrderFulfilment"[]);
    ```

    And one that should return rows on a business that delivered before
    the switch: the local deliveries still with a courier move on by the
    legacy step.

    ```sql
    SELECT id, stage FROM "Order"
    WHERE fulfilment = 'LOCAL_DELIVERY' AND stage = 'HANDED_TO_COURIER';
    ```

6. **Deploy the app** (Vercel) after the API, as always. The release-1 app
   already draws what the API sends (`steps`, `next.stages`), so it needs no
   change for this release; redeploy it only if it changed.

### What changes for callers

- **Writes use the types' own names.** Create and edit still accept either
  vocabulary, and store PICKUP, LOCAL_DELIVERY, SHIPPING or DIGITAL. Every
  read still answers the legacy `fulfilment` word beside `fulfilmentType`
  until release 3.
- **Shipping and Digital open.** Create and edit take SHIPPING (it needs an
  address, like a delivery) and DIGITAL (no address). The appointment types
  are refused with 400 "An appointment is made by booking it, not by adding
  an order.": they are written only by booking (E9).
- **A local delivery goes out for delivery.** A ready local delivery is
  offered `OUT_FOR_DELIVERY` (SHIPPED), then DELIVERED. `HANDED_TO_COURIER`
  from READY is refused with 400 "This order is a local delivery, so it goes
  out for delivery, not to a courier."; a courier's name or tracking number
  on a local delivery is refused with 409 "A local delivery isn't handed to
  a courier." A shipment is the order that goes by courier.
- **In-flight courier orders.** A former DELIVERY order already
  HANDED_TO_COURIER is now LOCAL_DELIVERY at HANDED_TO_COURIER. It keeps its
  step ("Handed to courier" in its `steps`), its courier and tracking
  number, and moves on by the legacy HANDED_TO_COURIER → DELIVERED move
  (kept for good). A handover made before the switch can still be undone in
  its window; the order is then ready and goes out for delivery.
- **Digital** moves NEW → SENT (PENDING → DELIVERED) in one step, only once
  paid; it has no Preparing step.
- The store-scoped status PATCH to SHIPPED puts a local delivery at
  `OUT_FOR_DELIVERY` (one already with a courier stays there) and a
  shipment at `HANDED_TO_COURIER`.

### Rollback

Deploy the release-1 tag. It reads every value and stage this release
writes: PICKUP, LOCAL_DELIVERY, SHIPPING and DIGITAL orders, and orders at
`OUT_FOR_DELIVERY` or `SENT`, and it moves each on (release 1 keeps the
moves out of the new stages; its tests cover a row stored as
LOCAL_DELIVERY, one Out for delivery, and a Shipping one). Leave the
migration applied: the renamed rows are exactly what release 1 reads, and
the PICKUP default is a value it reads (it always writes a value of its
own). After a rollback it writes COLLECT and DELIVERY again, beside the
renamed rows; B2d's migration converts those. Redeploy the previous app
build only if the app had changed.

### Rehearsal (to do before production)

Start the release-1 tag against a database migrated by this release, and
check that Orders, Order Detail and a kitchen move work, including a local
delivery Out for delivery, a Shipping order and a Digital one. Plan B's
verification for B2c; the orchestrator runs it on the development
environment. The row count and timing above came from B2c's local run on
the showcase seed (`db:seed:showcase`, then put back in the legacy words)
and a copy grown to 200,767 orders.

---

## Release 3 · contract (B2d)

To be filled in by B2d: the contract migration re-runs the backfill for
stragglers, fails loudly if any COLLECT or DELIVERY remains, builds the new
type without them, casts `Order.fulfilment`, `StoreSettings.fulfilmentTypes`
and `Product.fulfilmentTypes` (if B12 has shipped) to it, and swaps the
names. The cast rewrites `Order` under an ACCESS EXCLUSIVE lock: measure how
long on a production-sized copy and record it here before choosing the
window.

- Rollback: deploy the release-2 tag; it writes only values that remain.
