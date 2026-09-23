import { ConflictException } from "@nestjs/common";
import type { Prisma } from "@saroh/database";

/**
 * Inventory effect of an order, modelled as reserve → commit → release.
 *
 * Each order status maps to a stock PHASE; moving between phases applies the
 * delta between their effects on (reserved, quantity). Same phase → no-op, so
 * re-PATCHing a status never double-applies. Untracked products (no Inventory
 * row) are skipped. Reserving beyond availability is rejected (no oversell).
 *
 * Which row moves: when a line first holds stock it takes the variant's row
 * if that variant counts its own stock (products v2, #462), else the
 * product's, else none, and records that choice on the line (`stockRow`).
 * Every later move settles on the recorded row, so a product switching to
 * per-variant stock, or starting to count at all, never lands a release on a
 * row the line never reserved from. A line from before the choice was
 * recorded falls back to the old guess: the variant's row if it has one,
 * else the product's.
 *
 *   effect(RESERVED)  = { reserved: +q, quantity:  0 }   // held, not consumed
 *   effect(COMMITTED) = { reserved:  0, quantity: -q }   // consumed on fulfil
 *   effect(RELEASED)  = { reserved:  0, quantity:  0 }   // nothing held
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
            return "RELEASED";
        default:
            return "RELEASED";
    }
}

function effect(
    phase: StockPhase,
    q: number,
): {
    reserved: number;
    quantity: number;
} {
    if (phase === "RESERVED") return { reserved: q, quantity: 0 };
    if (phase === "COMMITTED") return { reserved: 0, quantity: -q };
    return { reserved: 0, quantity: 0 };
}

/** Where a line's reservation sits (OrderItem.stockRow). */
export type StockRowKind = "PRODUCT" | "VARIANT" | "NONE";

export interface OrderLine {
    /** The order item, which records the row its stock sits on. */
    id: string;
    productId: string;
    quantity: number;
    variantId?: string | null;
    /** Null on a line from before the row was recorded. */
    stockRow?: StockRowKind | null;
}

interface StockCount {
    quantity: number;
    reserved: number;
}

/** Apply one delta to one row, refusing to reserve more than is on hand. */
function nextStock(
    row: StockCount,
    from: StockPhase,
    to: StockPhase,
    q: number,
): StockCount {
    const a = effect(from, q);
    const b = effect(to, q);
    const reserved = row.reserved + (b.reserved - a.reserved);
    const quantity = row.quantity + (b.quantity - a.quantity);
    // Only guard when the reservation is increasing; available must cover it.
    if (b.reserved - a.reserved > 0 && reserved > quantity) {
        throw new ConflictException({
            message: "Not enough stock to reserve",
            field: "items",
        });
    }
    return { reserved, quantity };
}

/** The row a line would hold stock on now: its variant's, the product's, or none. */
async function currentRow(
    tx: Prisma.TransactionClient,
    line: OrderLine,
): Promise<StockRowKind> {
    if (
        line.variantId &&
        (await tx.variantInventory.count({
            where: { variantId: line.variantId },
        })) > 0
    ) {
        return "VARIANT";
    }
    return (await tx.inventory.count({
        where: { productId: line.productId },
    })) > 0
        ? "PRODUCT"
        : "NONE";
}

/**
 * The row a line holding stock settles on. Locks the product's row first, so
 * a switch to per-variant stock (which moves lines under the same lock)
 * can't move this line in between, then reads what the line recorded.
 */
async function heldRow(
    tx: Prisma.TransactionClient,
    line: OrderLine,
): Promise<{ row: StockRowKind; variantId: string | null }> {
    await tx.$queryRaw`SELECT id FROM "Inventory" WHERE "productId" = ${line.productId} FOR UPDATE`;
    const item = await tx.orderItem.findUnique({
        where: { id: line.id },
        select: { stockRow: true, variantId: true },
    });
    const variantId = item ? item.variantId : (line.variantId ?? null);
    const recorded = item ? item.stockRow : (line.stockRow ?? null);
    if (recorded) return { row: recorded, variantId };
    // A line from before the row was recorded: the old guess.
    return {
        row: await currentRow(tx, { ...line, variantId }),
        variantId,
    };
}

/**
 * Apply the inventory deltas for moving an order's lines from `from` to `to`.
 * MUST run inside the same transaction as the order write so stock and order
 * stay consistent. Throws ConflictException if a reserve would oversell.
 */
export async function applyInventoryTransition(
    tx: Prisma.TransactionClient,
    lines: OrderLine[],
    from: StockPhase,
    to: StockPhase,
): Promise<void> {
    if (from === to) return;
    for (const line of lines) {
        let row: StockRowKind;
        let variantId = line.variantId ?? null;
        if (from === "RELEASED") {
            // First hold: choose the row and record it on the line.
            row = await currentRow(tx, line);
            await tx.orderItem.update({
                where: { id: line.id },
                data: { stockRow: row },
            });
        } else {
            ({ row, variantId } = await heldRow(tx, line));
        }

        if (row === "VARIANT") {
            if (!variantId) continue; // the variant was removed since
            const own = await tx.variantInventory.findUnique({
                where: { variantId },
                select: { quantity: true, reserved: true },
            });
            if (!own) continue;
            await tx.variantInventory.update({
                where: { variantId },
                data: nextStock(own, from, to, line.quantity),
            });
        } else if (row === "PRODUCT") {
            const inv = await tx.inventory.findUnique({
                where: { productId: line.productId },
                select: { quantity: true, reserved: true },
            });
            if (!inv) continue;
            await tx.inventory.update({
                where: { productId: line.productId },
                data: nextStock(inv, from, to, line.quantity),
            });
        }
        // NONE: the product counted no stock when the line was placed.
    }
}
