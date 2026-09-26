import type { Prisma } from "@saroh/database";

import {
    changeHold,
    commitLines,
    holdLines,
    releaseLines,
    uncommitLines,
} from "../stock/reserve";

/**
 * Inventory effect of an order's status, modelled as reserve → commit →
 * release. A thin caller of the stock module (`stock/reserve.ts`, #511),
 * which holds, sells and gives back units at the order's storefront.
 *
 * Each order status maps to a stock PHASE; moving between phases is one
 * stock move on every line. Same phase → no-op, so re-PATCHing a status
 * never double-applies.
 *
 *   RELEASED → RESERVED   hold (placing an order; refused past what the
 *                          storefront can sell: "Sold out", "Only N left")
 *   RESERVED → COMMITTED  sell what each line holds (a SOLD entry)
 *   COMMITTED → RESERVED  the kitchen taking a fulfilment back (a REVERSED
 *                          entry; refused once money or items came back)
 *   RESERVED → RELEASED   give back what each line still holds (a cancel)
 *
 * Every move runs on the caller's transaction, after the order's row lock
 * (lock order: Order → StockLevel rows by id).
 */

export type StockPhase = "RESERVED" | "COMMITTED" | "RELEASED";

/** The statuses whose orders hold a reservation (phaseOf → RESERVED). */
export const RESERVING_STATUSES = ["PENDING", "PROCESSING"] as const;

export function phaseOf(status: string): StockPhase {
    switch (status) {
        case "PENDING": // RESERVING_STATUSES
        case "PROCESSING":
            return "RESERVED";
        case "SHIPPED":
        case "DELIVERED":
            return "COMMITTED";
        case "CANCELLED":
        default:
            return "RELEASED";
    }
}

/** Where a line's reservation sits (OrderItem.stockRow). */
export type StockRowKind = "PRODUCT" | "VARIANT" | "NONE";

export interface OrderLine {
    /** The order item, which records the row its stock sits on. */
    id: string;
}

/**
 * Change how much a line holds by `delta` units (U6 — an order edited
 * before preparing), on the row the line recorded. Growing a hold is refused
 * when the storefront cannot sell it; shrinking one is always allowed.
 */
export async function adjustReservation(
    tx: Prisma.TransactionClient,
    line: OrderLine,
    delta: number,
): Promise<void> {
    await changeHold(tx, line.id, delta);
}

/**
 * Apply the stock move for taking an order's lines from `from` to `to`.
 * MUST run inside the same transaction as the order write so stock and order
 * stay consistent. `actorUserId` is recorded on any shelf entry it writes.
 */
export async function applyInventoryTransition(
    tx: Prisma.TransactionClient,
    lines: readonly OrderLine[],
    from: StockPhase,
    to: StockPhase,
    actorUserId: string | null = null,
): Promise<void> {
    if (from === to || lines.length === 0) return;
    const ids = lines.map((l) => l.id);
    if (from === "RELEASED" && to === "RESERVED") {
        await holdLines(tx, ids);
    } else if (from === "RESERVED" && to === "COMMITTED") {
        await commitLines(tx, ids, actorUserId);
    } else if (from === "COMMITTED" && to === "RESERVED") {
        await uncommitLines(tx, ids, actorUserId);
    } else if (to === "RELEASED") {
        // From RESERVED; a fulfilled order is never released (the status
        // table has no such move), and would hold nothing to give back.
        await releaseLines(
            tx,
            ids.map((id) => ({ id })),
        );
    }
}
