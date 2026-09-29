/**
 * P3 backfill — one order-number series per business (DEC-066).
 *
 * Each storefront used to count its orders from ORD-001, so a business with
 * two storefronts has two ORD-001s. Since P3 the API numbers every order
 * from the business's `OrderNumberSequence` row (`nextOrderNumberInTx`).
 * This makes the orders already taken fit that series:
 *
 * - **The counter** is set to the business's highest ORD-number at any of
 *   its storefronts, never lowered.
 * - **Each number held by more than one order** stays with the order that
 *   took it first (oldest, then by id); every later one takes the business's
 *   next number, as a new order would. Its old number is kept in
 *   `renumberedFrom` (the first one, if it was ever renumbered before), so a
 *   customer quoting it still finds the order. Nothing links to an order by
 *   its number — everything uses the order's id — so nothing else moves.
 *
 * Each business runs in its own transaction and holds its counter row's lock
 * throughout, so an order the API takes meanwhile waits and then numbers
 * after the renumbered ones. The API before P3, which still numbers per
 * storefront, can make a new duplicate while it serves: run this again once
 * it is gone. Idempotent: a second run finds no duplicate and the counter
 * already at the highest number, and writes nothing. A dry run does the same
 * work and rolls it back, so it reports exactly what a real run would do.
 *
 * Run: `pnpm --filter @saroh/database exec tsx src/backfill/order-numbers.cli.ts [--dry-run] [--org <id>]...`
 */
import type { PrismaClient } from "@prisma/client";

import {
    alignOrderNumberSequence,
    formatOrderNumber,
    orderNumberTaken,
} from "../order-number";
import type { TransactionClient } from "../transaction";

export interface RenumberedOrder {
    organizationId: string;
    storeId: string;
    /** The order's id. */
    id: string;
    from: string;
    to: string;
}

export interface OrderNumbersReport {
    /** Businesses looked at: every one with an order, or those named. */
    organizations: number;
    /** Counters made or raised to the business's highest number. */
    countersSet: number;
    /** Orders that gave their number to an older order with it. */
    renumbered: RenumberedOrder[];
    /** True when nothing was written (a dry run). */
    dryRun: boolean;
}

class DryRunRollback extends Error {}

export async function backfillOrderNumbers(
    db: PrismaClient,
    options: { organizationIds?: readonly string[]; dryRun?: boolean } = {},
): Promise<OrderNumbersReport> {
    const dryRun = options.dryRun ?? false;
    const orgs = options.organizationIds
        ? [...options.organizationIds].sort()
        : (
              await db.$queryRaw<{ organizationId: string }[]>`
                  SELECT DISTINCT s."organizationId"
                  FROM "Order" o
                  JOIN "Store" s ON s.id = o."storeId"
                  ORDER BY s."organizationId"`
          ).map((r) => r.organizationId);
    const report: OrderNumbersReport = {
        organizations: orgs.length,
        countersSet: 0,
        renumbered: [],
        dryRun,
    };
    for (const organizationId of orgs) {
        let part: { counterSet: boolean; renumbered: RenumberedOrder[] } = {
            counterSet: false,
            renumbered: [],
        };
        try {
            await db.$transaction(
                async (tx) => {
                    part = await renumberOrganization(tx, organizationId);
                    if (dryRun) throw new DryRunRollback();
                },
                { timeout: 120_000 },
            );
        } catch (e) {
            if (!(e instanceof DryRunRollback)) throw e;
        }
        if (part.counterSet) report.countersSet += 1;
        report.renumbered.push(...part.renumbered);
    }
    return report;
}

async function renumberOrganization(
    tx: TransactionClient,
    organizationId: string,
): Promise<{ counterSet: boolean; renumbered: RenumberedOrder[] }> {
    // Made or raised first: the upsert's row lock is what an order the API
    // takes meanwhile waits on, until this commits.
    const aligned = await alignOrderNumberSequence(tx, organizationId);
    const held = await tx.$queryRaw<
        {
            id: string;
            storeId: string;
            orderId: string;
            renumberedFrom: string | null;
        }[]
    >`
        SELECT o.id, o."storeId", o."orderId", o."renumberedFrom"
        FROM "Order" o
        JOIN "Store" s ON s.id = o."storeId"
        WHERE s."organizationId" = ${organizationId}
          AND o."orderId" IN (
              SELECT o2."orderId"
              FROM "Order" o2
              JOIN "Store" s2 ON s2.id = o2."storeId"
              WHERE s2."organizationId" = ${organizationId}
              GROUP BY o2."orderId"
              HAVING COUNT(*) > 1
          )
        ORDER BY o."orderId", o."createdAt", o.id
        FOR UPDATE OF o`;
    const renumbered: RenumberedOrder[] = [];
    let n = aligned.lastNumber;
    let first: string | null = null;
    for (const order of held) {
        // The first of each number keeps it.
        if (order.orderId !== first) {
            first = order.orderId;
            continue;
        }
        let to = formatOrderNumber(++n);
        while (await orderNumberTaken(tx, organizationId, to)) {
            to = formatOrderNumber(++n);
        }
        await tx.order.update({
            where: { id: order.id },
            data: {
                orderId: to,
                renumberedFrom: order.renumberedFrom ?? order.orderId,
            },
            select: { id: true },
        });
        renumbered.push({
            organizationId,
            storeId: order.storeId,
            id: order.id,
            from: order.orderId,
            to,
        });
    }
    if (n > aligned.lastNumber) {
        await alignOrderNumberSequence(tx, organizationId, n);
    }
    return { counterSet: aligned.changed || renumbered.length > 0, renumbered };
}

/** One line per renumbered order, for the command's output. */
export function describeOrderNumbersReport(
    report: OrderNumbersReport,
): string[] {
    return report.renumbered.map(
        (r) =>
            `business ${r.organizationId}: order ${r.id} at storefront ${r.storeId} ${report.dryRun ? "would be" : "is now"} ${r.to} (was ${r.from})`,
    );
}
