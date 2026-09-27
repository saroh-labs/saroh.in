import { Prisma } from "@saroh/database";

/**
 * What an open order is — the ONE definition the Orders list's Open tab
 * (`order-list.ts`) and Home's open-order count, its evidence and Today's
 * pick-ups all read, in SQL for the list and as a Prisma `where` for Home.
 * Both forms are built from the constants here, so they cannot drift; a DB
 * spec (`home.open-orders.db.spec.ts`) proves Home's count equals the list's
 * `counts.open` for the same orders.
 *
 * Open: the goods have not reached the customer (a shipped order is open
 * until it is delivered), it is not refunded in full, and it is a real order
 * — never an abandoned online checkout (a `placedOnline` order still UNPAID).
 */

/** Statuses of an order whose goods have not reached the customer yet. */
export const OPEN_ORDER_STATUSES = [
    "PENDING",
    "PROCESSING",
    "SHIPPED",
] as const;

/** Not an abandoned checkout: a `placedOnline` order still UNPAID. */
export function realOrderWhere(): Prisma.OrderWhereInput {
    return { NOT: { placedOnline: true, paymentStatus: "UNPAID" } };
}

/** {@link realOrderWhere} in SQL, over the list's `o` alias. */
export function realOrderSql(): Prisma.Sql {
    return Prisma.sql`NOT (o."placedOnline" AND o."paymentStatus" = 'UNPAID')`;
}

/**
 * Open, before the real-order condition — the Open tab's own column, which
 * the list reads under `orderConditions` (which already keeps real orders
 * only), over the `o` alias.
 */
export function openSql(): Prisma.Sql {
    return Prisma.sql`(o.status::text = ANY(${[...OPEN_ORDER_STATUSES]}) AND o."paymentStatus" <> 'REFUNDED')`;
}

/** A business's open orders, real ones only, as a Prisma `where`. */
export function openOrderWhere(organizationId: string): Prisma.OrderWhereInput {
    return {
        organizationId,
        status: { in: [...OPEN_ORDER_STATUSES] },
        paymentStatus: { not: "REFUNDED" },
        ...realOrderWhere(),
    };
}

/** The same, in SQL over the `o` alias, for a raw read. */
export function openOrderSql(organizationId: string): Prisma.Sql {
    return Prisma.sql`(o."organizationId" = ${organizationId} AND ${openSql()} AND ${realOrderSql()})`;
}
