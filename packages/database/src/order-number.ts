/**
 * Order numbers: one series per business (P3, DEC-066).
 *
 * Every storefront used to count its own orders from ORD-001, so one
 * business's Orders list could hold two #ORD-001s. Now every order a
 * business takes — at a site's checkout, by staff (New order, a walk-in),
 * or as a treatment booked — is numbered here, from the business's one
 * `OrderNumberSequence` row, in the order's own transaction.
 *
 * "The business's orders" are the orders at its storefronts (`Store` is
 * always a business's), so an old order with no `organizationId` of its own
 * still counts.
 */
import type { TransactionClient } from "./transaction";

/** What every number Saroh gives starts with. */
export const ORDER_NUMBER_STEM = "ORD-";

/** "ORD-007", "ORD-1234": at least three digits, as always. */
export function formatOrderNumber(n: number): string {
    return `${ORDER_NUMBER_STEM}${String(n).padStart(3, "0")}`;
}

/**
 * The counter an ORD-number stands for, or null for any other shape (a
 * seed's "1001", a boutique's "LL-1001"): those never collide with the
 * series. At most nine digits, as the SQL below reads them.
 */
export function orderNumberValue(orderId: string): number | null {
    const m = /^ORD-([0-9]{1,9})$/.exec(orderId);
    return m ? Number(m[1]) : null;
}

/** Only raw SQL: a caller's transaction, or the client itself. */
export type OrderNumberDb = Pick<
    TransactionClient,
    "$queryRaw" | "$executeRaw"
>;

/** The business's highest ORD-number at any of its storefronts, or 0. */
export async function highestOrderNumber(
    db: OrderNumberDb,
    organizationId: string,
): Promise<number> {
    const rows = await db.$queryRaw<{ highest: number }[]>`
        SELECT COALESCE(MAX(substring(o."orderId" FROM '^ORD-([0-9]{1,9})$')::int), 0)::int AS highest
        FROM "Order" o
        JOIN "Store" s ON s.id = o."storeId"
        WHERE s."organizationId" = ${organizationId}`;
    return rows.at(0)?.highest ?? 0;
}

/** Whether one of the business's orders, at any storefront, has it. */
export async function orderNumberTaken(
    db: OrderNumberDb,
    organizationId: string,
    orderId: string,
): Promise<boolean> {
    const rows = await db.$queryRaw<{ one: number }[]>`
        SELECT 1 AS one
        FROM "Order" o
        JOIN "Store" s ON s.id = o."storeId"
        WHERE s."organizationId" = ${organizationId}
          AND o."orderId" = ${orderId}
        LIMIT 1`;
    return rows.length > 0;
}

/** How many times a clash moves the counter before giving up. */
const CLASH_ATTEMPTS = 5;

/**
 * The business's next order number, taken inside the order's transaction.
 *
 * One statement increments the business's row, and the row lock it takes
 * is what serialises two orders: they get distinct numbers without
 * count-and-retry, whatever the transaction's isolation level. The lock is
 * held until the order commits, and if anything after this fails, the
 * increment rolls back with it and no number is skipped. The business's
 * first order after P3 makes the row, starting after its highest
 * ORD-number (two first orders at once: one inserts, the other waits for it
 * and increments).
 *
 * The number is checked before it is handed out: while the API before P3
 * still serves it numbers per storefront, and it may have used this one.
 * Taken, the counter moves past the business's highest number.
 *
 * Under a SERIALIZABLE transaction (an order with a discount code), a
 * concurrent order's increment is a serialization failure: the caller
 * retries the whole order.
 */
export async function nextOrderNumberInTx(
    tx: OrderNumberDb,
    organizationId: string,
): Promise<string> {
    let n = await bump(tx, organizationId);
    for (let attempt = 0; attempt < CLASH_ATTEMPTS; attempt++) {
        const number = formatOrderNumber(n);
        if (!(await orderNumberTaken(tx, organizationId, number))) {
            return number;
        }
        n = Math.max(n, await highestOrderNumber(tx, organizationId)) + 1;
        await tx.$executeRaw`
            UPDATE "OrderNumberSequence"
            SET "lastNumber" = ${n}, "updatedAt" = now()
            WHERE "organizationId" = ${organizationId}`;
    }
    throw new Error(
        `No free order number for organization ${organizationId} after ${CLASH_ATTEMPTS} tries`,
    );
}

/** The row's next value: incremented, or made after the highest number. */
async function bump(tx: OrderNumberDb, organizationId: string) {
    const bumped = await tx.$queryRaw<{ lastNumber: number }[]>`
        UPDATE "OrderNumberSequence"
        SET "lastNumber" = "lastNumber" + 1, "updatedAt" = now()
        WHERE "organizationId" = ${organizationId}
        RETURNING "lastNumber"`;
    const found = bumped.at(0);
    if (found) return found.lastNumber;
    const start = (await highestOrderNumber(tx, organizationId)) + 1;
    const made = await tx.$queryRaw<{ lastNumber: number }[]>`
        INSERT INTO "OrderNumberSequence" AS q ("organizationId", "lastNumber", "updatedAt")
        VALUES (${organizationId}, ${start}, now())
        ON CONFLICT ("organizationId") DO UPDATE
        SET "lastNumber" = q."lastNumber" + 1, "updatedAt" = now()
        RETURNING "lastNumber"`;
    const row = made.at(0);
    if (!row) throw new Error("The order number counter returned no row");
    return row.lastNumber;
}

/**
 * Set the business's counter to its highest ORD-number, never lower than it
 * is: a seed after writing fixed numbers, and the backfill. Returns the
 * counter's value and whether it changed.
 */
export async function alignOrderNumberSequence(
    db: OrderNumberDb,
    organizationId: string,
    atLeast = 0,
): Promise<{ lastNumber: number; changed: boolean }> {
    const target = Math.max(
        atLeast,
        await highestOrderNumber(db, organizationId),
    );
    const rows = await db.$queryRaw<{ lastNumber: number; changed: boolean }[]>`
        WITH before AS (
            SELECT "lastNumber" FROM "OrderNumberSequence"
            WHERE "organizationId" = ${organizationId}
        ), up AS (
            INSERT INTO "OrderNumberSequence" AS q ("organizationId", "lastNumber", "updatedAt")
            VALUES (${organizationId}, ${target}, now())
            ON CONFLICT ("organizationId") DO UPDATE
            SET "lastNumber" = GREATEST(q."lastNumber", EXCLUDED."lastNumber"),
                "updatedAt" = CASE WHEN q."lastNumber" < EXCLUDED."lastNumber" THEN now() ELSE q."updatedAt" END
            RETURNING "lastNumber"
        )
        SELECT up."lastNumber",
               (SELECT "lastNumber" FROM before) IS DISTINCT FROM up."lastNumber" AS changed
        FROM up`;
    const row = rows.at(0);
    if (!row) throw new Error("The order number counter returned no row");
    return row;
}
