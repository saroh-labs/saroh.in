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
 *   effect(RESERVED)  = { reserved: +q, quantity:  0 }   // held, not consumed
 *   effect(COMMITTED) = { reserved:  0, quantity: -q }   // consumed on fulfil
 *   effect(RELEASED)  = { reserved:  0, quantity:  0 }   // nothing held
 */

export type StockPhase = "RESERVED" | "COMMITTED" | "RELEASED";

export function phaseOf(status: string): StockPhase {
    switch (status) {
        case "PENDING":
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
        const inv = await tx.inventory.findUnique({
            where: { productId: line.productId },
            select: { quantity: true, reserved: true },
        });
        if (!inv) continue; // untracked product — no stock effect

        const a = effect(from, line.quantity);
        const b = effect(to, line.quantity);
        const newReserved = inv.reserved + (b.reserved - a.reserved);
        const newQuantity = inv.quantity + (b.quantity - a.quantity);

        // Only guard when the reservation is increasing; available must cover it.
        if (b.reserved - a.reserved > 0 && newReserved > newQuantity) {
            throw new ConflictException({
                message: "Not enough stock to reserve",
                field: "items",
            });
        }

        await tx.inventory.update({
            where: { productId: line.productId },
            data: { reserved: newReserved, quantity: newQuantity },
        });
    }
}
