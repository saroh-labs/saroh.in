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
 * Which row moves: a line naming a variant that counts its own stock moves
 * that variant's row (products v2, #462); every other line — a product with
 * no variants, a product still counting as a whole, or an order from before
 * lines named variants — moves the product's row, as it always has.
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

export interface OrderLine {
    productId: string;
    quantity: number;
    variantId?: string | null;
}

interface StockRow {
    quantity: number;
    reserved: number;
}

/** Apply one delta to one row, refusing to reserve more than is on hand. */
function nextStock(
    row: StockRow,
    from: StockPhase,
    to: StockPhase,
    q: number,
): StockRow {
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
        if (line.variantId) {
            const own = await tx.variantInventory.findUnique({
                where: { variantId: line.variantId },
                select: { quantity: true, reserved: true },
            });
            if (own) {
                await tx.variantInventory.update({
                    where: { variantId: line.variantId },
                    data: nextStock(own, from, to, line.quantity),
                });
                continue;
            }
        }

        const inv = await tx.inventory.findUnique({
            where: { productId: line.productId },
            select: { quantity: true, reserved: true },
        });
        if (!inv) continue; // untracked product — no stock effect

        await tx.inventory.update({
            where: { productId: line.productId },
            data: nextStock(inv, from, to, line.quantity),
        });
    }
}
