/**
 * What open orders hold, and what the shelf says they hold (#510, #511).
 *
 * The invariant: a StockLevel's `promised` is the sum of `heldQuantity` over
 * the lines of its open orders (PENDING, PROCESSING); a closed order's lines
 * hold nothing. Reserve, release and commit (apps/api.saroh.in/src/modules/
 * stock/reserve.ts) keep it, and the Stock checks screen shows any row that
 * breaks it. This file is for everything that writes lines and rows without
 * going through them — the #510 backfill, the seeds, a repair:
 *
 * - `heldStockMismatches` lists every row and line that breaks it;
 * - `reconcileHeldStock` repairs what can be repaired safely (below) and
 *   reports every row it touched and every row it left;
 * - `holdOpenLines` makes a seed's open orders hold stock the way the API's
 *   reserve would have, raising on hand by what they hold so what the
 *   storefront can sell stays the number the seed designed.
 *
 * The repair rule, and why. A row whose open lines hold MORE than it
 * promised (the #510 backfill gave every open line its quantity; the old
 * counter, or a seed, never promised some of them): what the row promised is
 * all that is really set aside, so it is shared out to its lines oldest
 * first — the order placed first is the one the promise was made for — and
 * any line left with nothing holds nothing: `stockRow` NONE, no row,
 * `heldQuantity` 0, as a line for a product that counts no stock. Fulfilling
 * it takes nothing off the shelf, cancelling it gives nothing back, so the
 * row's numbers never move for units it never promised (the U2 bug: a cancel
 * releasing, or a fulfilment committing, units that were never promised,
 * driving promised negative or the shelf short). A line that sold units
 * already keeps its row, holding 0, so a return still lands on it. A row
 * that promises MORE than its lines hold is not touched — nothing says which
 * order the extra was for — and is reported; Stock checks shows it to the
 * merchant ("promised ≠ sum of held"). A closed order's line that still
 * holds units, or an open line holding on no row, is set to hold 0.
 *
 * Idempotent: once a run has capped a row, its lines hold what it promised,
 * and the next run finds nothing.
 */
import type { PrismaClient } from "@prisma/client";

import type { TransactionClient } from "../transaction";

export const OPEN_ORDER_STATUSES = ["PENDING", "PROCESSING"] as const;

type Queryable = PrismaClient | TransactionClient;

export interface HeldStockRow {
    stockLevelId: string;
    organizationId: string;
    storeId: string;
    productId: string;
    variantId: string | null;
    promised: number;
    /** Sum of heldQuantity over the row's open lines. */
    held: number;
}

export interface StrayHoldingLine {
    orderItemId: string;
    orderId: string;
    organizationId: string;
    status: string;
    heldQuantity: number;
    /** "closed": a closed order's line; "no row": an open line on no row. */
    why: "closed" | "no row";
}

export interface HeldStockMismatches {
    rows: HeldStockRow[];
    lines: StrayHoldingLine[];
}

/**
 * Every row whose promised is not what its open lines hold, and every line
 * that holds units it can't (a closed order's, or an open one on no row).
 * `organizationIds` narrows it; omitted, every business.
 */
export async function heldStockMismatches(
    db: Queryable,
    organizationIds?: readonly string[],
): Promise<HeldStockMismatches> {
    const orgs = organizationIds ? [...organizationIds] : null;
    const open = [...OPEN_ORDER_STATUSES];
    const rows = await db.$queryRaw<HeldStockRow[]>`
        SELECT s.id AS "stockLevelId", s."organizationId", s."storeId", s."productId",
               s."variantId", s.promised, COALESCE(h.held, 0)::int AS held
        FROM "StockLevel" s
        LEFT JOIN (
            SELECT i."stockLevelId", SUM(i."heldQuantity")::int AS held
            FROM "OrderItem" i
            JOIN "Order" o ON o.id = i."orderId"
            WHERE o.status::text = ANY(${open}::text[]) AND i."stockLevelId" IS NOT NULL
            GROUP BY i."stockLevelId"
        ) h ON h."stockLevelId" = s.id
        WHERE s.promised <> COALESCE(h.held, 0)
          AND (${orgs}::text[] IS NULL OR s."organizationId" = ANY(${orgs}::text[]))
        ORDER BY s."organizationId", s.id`;
    const lines = await db.$queryRaw<StrayHoldingLine[]>`
        SELECT i.id AS "orderItemId", i."orderId", o."organizationId", o.status::text AS status,
               i."heldQuantity",
               CASE WHEN o.status::text = ANY(${open}::text[]) THEN 'no row' ELSE 'closed' END AS why
        FROM "OrderItem" i
        JOIN "Order" o ON o.id = i."orderId"
        WHERE i."heldQuantity" <> 0
          AND (NOT (o.status::text = ANY(${open}::text[])) OR i."stockLevelId" IS NULL)
          AND (${orgs}::text[] IS NULL OR o."organizationId" = ANY(${orgs}::text[]))
        ORDER BY o."organizationId", i.id`;
    return { rows, lines };
}

/** Describe mismatches in one line each, for a check or a CLI to print. */
export function describeHeldStockMismatches(m: HeldStockMismatches): string[] {
    return [
        ...m.rows.map(
            (r) =>
                `row ${r.stockLevelId} (product ${r.productId}${r.variantId ? `, variant ${r.variantId}` : ""}, storefront ${r.storeId}): promised ${r.promised}, open lines hold ${r.held}`,
        ),
        ...m.lines.map((l) =>
            l.why === "closed"
                ? `line ${l.orderItemId} of ${l.status} order ${l.orderId} still holds ${l.heldQuantity}`
                : `line ${l.orderItemId} of open order ${l.orderId} holds ${l.heldQuantity} on no row`,
        ),
    ];
}

// ---------------------------------------------------------------------------
// Repair
// ---------------------------------------------------------------------------

export interface CappedLine {
    orderItemId: string;
    orderId: string;
    orderCreatedAt: Date;
    quantity: number;
    /** heldQuantity before and after. */
    was: number;
    now: number;
    /** True when the line now holds nothing and no longer names the row. */
    unheld: boolean;
}

export interface HeldStockReport {
    /** Rows whose open lines held more than they promised: capped. */
    capped: (HeldStockRow & { lines: CappedLine[] })[];
    /** Rows that promise more than their open lines hold: left as they are. */
    promisedMore: HeldStockRow[];
    /** Lines that held units they could not (closed, or on no row): set to 0. */
    strayLinesCleared: StrayHoldingLine[];
    /** True when nothing was written (a dry run). */
    dryRun: boolean;
}

class DryRunRollback extends Error {}

/**
 * Apply the repair rule (above) to every business, or to those named. Each
 * business runs in its own transaction, locking the rows it changes in id
 * order before reading them again; a dry run does the same work and rolls it
 * back, so it reports exactly what a real run would do.
 */
export async function reconcileHeldStock(
    db: PrismaClient,
    options: { organizationIds?: readonly string[]; dryRun?: boolean } = {},
): Promise<HeldStockReport> {
    const dryRun = options.dryRun ?? false;
    const report: HeldStockReport = {
        capped: [],
        promisedMore: [],
        strayLinesCleared: [],
        dryRun,
    };
    const found = await heldStockMismatches(db, options.organizationIds);
    const orgs = Array.from(
        new Set([
            ...found.rows.map((r) => r.organizationId),
            ...found.lines.map((l) => l.organizationId),
        ]),
    ).sort();

    for (const organizationId of orgs) {
        const part: HeldStockReport = {
            capped: [],
            promisedMore: [],
            strayLinesCleared: [],
            dryRun,
        };
        try {
            await db.$transaction(
                async (tx) => {
                    await reconcileOrganization(tx, organizationId, part);
                    if (dryRun) throw new DryRunRollback();
                },
                { timeout: 120_000 },
            );
        } catch (e) {
            if (!(e instanceof DryRunRollback)) throw e;
        }
        report.capped.push(...part.capped);
        report.promisedMore.push(...part.promisedMore);
        report.strayLinesCleared.push(...part.strayLinesCleared);
    }
    return report;
}

async function reconcileOrganization(
    tx: TransactionClient,
    organizationId: string,
    report: HeldStockReport,
): Promise<void> {
    const first = await heldStockMismatches(tx, [organizationId]);
    const ids = first.rows.map((r) => r.stockLevelId).sort();
    if (ids.length > 0) {
        await tx.$queryRaw`
            SELECT id FROM "StockLevel" WHERE id = ANY(${ids}::text[])
            ORDER BY id FOR UPDATE`;
    }
    // Read again under the locks: a line may have moved meanwhile.
    const found = await heldStockMismatches(tx, [organizationId]);

    for (const line of found.lines) {
        await tx.orderItem.update({
            where: { id: line.orderItemId },
            data: { heldQuantity: 0 },
        });
        report.strayLinesCleared.push(line);
    }
    // Clearing an open line on no row changes no row's sum; a closed line
    // never counted. So `found.rows` still stands.
    for (const row of found.rows) {
        if (row.held < row.promised) {
            report.promisedMore.push(row);
            continue;
        }
        const lines = await tx.$queryRaw<
            {
                id: string;
                orderId: string;
                createdAt: Date;
                quantity: number;
                heldQuantity: number;
                soldQuantity: number;
            }[]
        >`
            SELECT i.id, i."orderId", o."createdAt", i.quantity, i."heldQuantity", i."soldQuantity"
            FROM "OrderItem" i
            JOIN "Order" o ON o.id = i."orderId"
            WHERE i."stockLevelId" = ${row.stockLevelId}
              AND o.status::text = ANY(${[...OPEN_ORDER_STATUSES]}::text[])
              AND i."heldQuantity" > 0
            ORDER BY o."createdAt", o.id, i.id`;
        let left = Math.max(0, row.promised);
        const capped: CappedLine[] = [];
        for (const line of lines) {
            const keep = Math.min(line.heldQuantity, left);
            left -= keep;
            if (keep === line.heldQuantity) continue;
            // A line that sold units keeps its row, so a return lands on it.
            const unheld = keep === 0 && line.soldQuantity === 0;
            await tx.orderItem.update({
                where: { id: line.id },
                data: unheld
                    ? { heldQuantity: 0, stockRow: "NONE", stockLevelId: null }
                    : { heldQuantity: keep },
            });
            capped.push({
                orderItemId: line.id,
                orderId: line.orderId,
                orderCreatedAt: line.createdAt,
                quantity: line.quantity,
                was: line.heldQuantity,
                now: keep,
                unheld,
            });
        }
        report.capped.push({ ...row, lines: capped });
    }
}

/** A repair report as lines a person can read, for the CLIs. */
export function describeHeldStockReport(r: HeldStockReport): string[] {
    const out: string[] = [];
    for (const row of r.capped) {
        out.push(
            `capped row ${row.stockLevelId} (product ${row.productId}${row.variantId ? `, variant ${row.variantId}` : ""}, storefront ${row.storeId}): promised ${row.promised}, open lines held ${row.held}`,
        );
        for (const l of row.lines) {
            out.push(
                `  line ${l.orderItemId} (order ${l.orderId}, placed ${l.orderCreatedAt.toISOString()}): held ${l.was} of ${l.quantity}, now ${l.now}${l.unheld ? " — holds nothing now (stockRow NONE)" : ""}`,
            );
        }
    }
    for (const row of r.promisedMore) {
        out.push(
            `left row ${row.stockLevelId} (product ${row.productId}${row.variantId ? `, variant ${row.variantId}` : ""}, storefront ${row.storeId}): promised ${row.promised}, open lines hold only ${row.held} — shown in Stock checks`,
        );
    }
    for (const l of r.strayLinesCleared) {
        out.push(
            l.why === "closed"
                ? `cleared line ${l.orderItemId} of ${l.status} order ${l.orderId}: held ${l.heldQuantity}, now 0`
                : `cleared line ${l.orderItemId} of open order ${l.orderId}: held ${l.heldQuantity} on no row, now 0`,
        );
    }
    return out;
}

// ---------------------------------------------------------------------------
// Seeds
// ---------------------------------------------------------------------------

/**
 * Make a seed's open orders hold stock as the API's reserve would have: each
 * open line of an order whose id starts with `orderIdPrefix` holds its
 * quantity on its variant's row at the order's storefront, else the
 * product's; with neither, or when its product counts no stock (its
 * `stockTracked` or the business's `stockTracking` off, #515), it holds
 * nothing (`stockRow` NONE). The seed's
 * closed lines hold nothing. Then every row of the business promises what
 * its open lines hold — lines added by hand included — and its on hand moves
 * by the same amount, so what it can sell (on hand − promised) stays the
 * number the seed set: a product seeded with 0 is still sold out, one
 * seeded with 4 still low, and none is short.
 *
 * Call it after the seed has set each row's on hand with promised 0 (or
 * after a previous call): it reads the available count as on hand −
 * promised. Idempotent: a second call changes nothing.
 */
export async function holdOpenLines(
    db: Queryable,
    a: { organizationId: string; orderIdPrefix: string },
): Promise<void> {
    const open = [...OPEN_ORDER_STATUSES];
    await db.$executeRaw`
        WITH choice AS (
            SELECT i.id, i.quantity,
                   COALESCE(v.id, p.id) AS row,
                   CASE WHEN v.id IS NOT NULL THEN 'VARIANT'
                        WHEN p.id IS NOT NULL THEN 'PRODUCT'
                        ELSE 'NONE' END AS kind
            FROM "OrderItem" i
            JOIN "Order" o ON o.id = i."orderId"
            JOIN "Product" pr ON pr.id = i."productId"
            LEFT JOIN "BusinessProfile" bp ON bp."organizationId" = pr."organizationId"
            -- Only a product that counts stock holds (#515): its switch and
            -- the business's (no profile: on), as reserve reads them; else
            -- no row is found and the line is NONE.
            LEFT JOIN "StockLevel" v
              ON pr."stockTracked" AND COALESCE(bp."stockTracking", true)
             AND i."variantId" IS NOT NULL AND v."storeId" = o."storeId" AND v."variantId" = i."variantId"
            LEFT JOIN "StockLevel" p
              ON pr."stockTracked" AND COALESCE(bp."stockTracking", true)
             AND p."storeId" = o."storeId" AND p."productId" = i."productId" AND p."variantId" IS NULL
            WHERE o."organizationId" = ${a.organizationId}
              AND starts_with(o.id, ${a.orderIdPrefix})
              AND o.status::text = ANY(${open}::text[])
        )
        UPDATE "OrderItem" i
        SET "stockRow" = c.kind::"StockRow",
            "stockLevelId" = c.row,
            "heldQuantity" = CASE WHEN c.row IS NULL THEN 0 ELSE c.quantity END
        FROM choice c
        WHERE i.id = c.id
          AND (i."stockRow" IS DISTINCT FROM c.kind::"StockRow"
               OR i."stockLevelId" IS DISTINCT FROM c.row
               OR i."heldQuantity" <> CASE WHEN c.row IS NULL THEN 0 ELSE c.quantity END)`;
    await db.$executeRaw`
        UPDATE "OrderItem" i SET "heldQuantity" = 0
        FROM "Order" o
        WHERE o.id = i."orderId"
          AND o."organizationId" = ${a.organizationId}
          AND starts_with(o.id, ${a.orderIdPrefix})
          AND NOT (o.status::text = ANY(${open}::text[]))
          AND i."heldQuantity" <> 0`;
    await db.$executeRaw`
        UPDATE "StockLevel" s
        SET "onHand" = GREATEST(0, s."onHand" - s.promised + h.held),
            promised = h.held
        FROM (
            SELECT s2.id, COALESCE(SUM(i."heldQuantity"), 0)::int AS held
            FROM "StockLevel" s2
            LEFT JOIN "OrderItem" i ON i."stockLevelId" = s2.id
                AND EXISTS (SELECT 1 FROM "Order" o
                            WHERE o.id = i."orderId" AND o.status::text = ANY(${open}::text[]))
            WHERE s2."organizationId" = ${a.organizationId}
            GROUP BY s2.id
        ) h
        WHERE s.id = h.id AND s.promised <> h.held`;
}
