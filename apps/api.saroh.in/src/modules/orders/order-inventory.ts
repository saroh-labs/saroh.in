import { ConflictException } from "@nestjs/common";
import type { Prisma } from "@saroh/database";

import { lockStockLevels } from "../products/stock-levels";

/**
 * Inventory effect of an order, modelled as reserve → commit → release.
 *
 * Each order status maps to a stock PHASE; moving between phases applies the
 * delta between their effects on (promised, on hand). Same phase → no-op, so
 * re-PATCHing a status never double-applies. Products that count no stock at
 * the order's storefront (no StockLevel row there) are skipped. Reserving
 * beyond availability is rejected (no oversell).
 *
 * Which row moves (#510): stock is counted per storefront, in StockLevel.
 * When a line first holds stock it takes its variant's row at the order's
 * storefront if that variant counts its own stock, else the product's, else
 * none, and records that choice on the line (`stockRow`, `stockLevelId`).
 * Every later move settles on the recorded row, so a product switching to
 * per-variant stock, or starting to count at all, never lands a release on a
 * row the line never reserved from. A line from before the choice was
 * recorded falls back to the old guess: the variant's row if it has one,
 * else the product's. `heldQuantity` is how many units the line holds on its
 * row right now: its quantity while RESERVED, nothing otherwise.
 *
 * Rows are locked in id order before they are read (lock order: Order →
 * StockLevel), so two orders for the last unit take turns.
 *
 *   effect(RESERVED)  = { promised: +q, onHand:  0 }   // held, not consumed
 *   effect(COMMITTED) = { promised:  0, onHand: -q }   // consumed on fulfil
 *   effect(RELEASED)  = { promised:  0, onHand:  0 }   // nothing held
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
    promised: number;
    onHand: number;
} {
    if (phase === "RESERVED") return { promised: q, onHand: 0 };
    if (phase === "COMMITTED") return { promised: 0, onHand: -q };
    return { promised: 0, onHand: 0 };
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
    onHand: number;
    promised: number;
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
    const promised = row.promised + (b.promised - a.promised);
    const onHand = row.onHand + (b.onHand - a.onHand);
    // Only guard when the reservation is increasing; available must cover it.
    if (b.promised - a.promised > 0 && promised > onHand) {
        throw new ConflictException({
            message: "Not enough stock to reserve",
            field: "items",
        });
    }
    return { promised, onHand };
}

/** What a line records about its stock, read fresh inside the transaction. */
interface Recorded {
    id: string;
    productId: string;
    variantId: string | null;
    stockRow: StockRowKind | null;
    stockLevelId: string | null;
    storeId: string;
}

async function recordedLines(
    tx: Prisma.TransactionClient,
    lines: readonly OrderLine[],
): Promise<Map<string, Recorded>> {
    const items = await tx.orderItem.findMany({
        where: { id: { in: lines.map((l) => l.id) } },
        select: {
            id: true,
            productId: true,
            variantId: true,
            stockRow: true,
            stockLevelId: true,
            order: { select: { storeId: true } },
        },
    });
    return new Map(
        items.map((i) => [
            i.id,
            {
                id: i.id,
                productId: i.productId,
                variantId: i.variantId,
                stockRow: i.stockRow,
                stockLevelId: i.stockLevelId,
                storeId: i.order.storeId,
            },
        ]),
    );
}

/**
 * The rows a line could hold on at its storefront: its variant's and the
 * product's own. Locked (all lines' candidates at once, in id order), then
 * re-read, so a row another writer made or moved meanwhile is seen.
 */
async function candidateRows(
    tx: Prisma.TransactionClient,
    lines: readonly Recorded[],
): Promise<
    Map<string, { variantRow: string | null; productRow: string | null }>
> {
    const find = () =>
        Promise.all(
            lines.map(async (line) => {
                const [variantRow, productRow] = await Promise.all([
                    line.variantId
                        ? tx.stockLevel.findFirst({
                              where: {
                                  storeId: line.storeId,
                                  variantId: line.variantId,
                              },
                              select: { id: true },
                          })
                        : null,
                    tx.stockLevel.findFirst({
                        where: {
                            storeId: line.storeId,
                            productId: line.productId,
                            variantId: null,
                        },
                        select: { id: true },
                    }),
                ]);
                return [
                    line.id,
                    {
                        variantRow: variantRow?.id ?? null,
                        productRow: productRow?.id ?? null,
                    },
                ] as const;
            }),
        );
    const before = await find();
    await lockStockLevels(
        tx,
        before.flatMap(([, r]) =>
            [r.variantRow, r.productRow].filter((x): x is string => !!x),
        ),
    );
    return new Map(await find());
}

/** The row a line would hold stock on now: its variant's, the product's, or none. */
function choose(rows: {
    variantRow: string | null;
    productRow: string | null;
}): { kind: StockRowKind; rowId: string | null } {
    if (rows.variantRow) return { kind: "VARIANT", rowId: rows.variantRow };
    if (rows.productRow) return { kind: "PRODUCT", rowId: rows.productRow };
    return { kind: "NONE", rowId: null };
}

/**
 * The row each line holding stock settles on: the one it recorded, or for a
 * line from before rows were recorded, the old guess. Rows are locked in id
 * order before the caller moves them.
 */
async function heldRows(
    tx: Prisma.TransactionClient,
    recorded: Map<string, Recorded>,
): Promise<Map<string, string | null>> {
    const out = new Map<string, string | null>();
    const guess: Recorded[] = [];
    for (const line of Array.from(recorded.values())) {
        if (line.stockLevelId) out.set(line.id, line.stockLevelId);
        else if (line.stockRow === null) guess.push(line);
        else out.set(line.id, null); // NONE, or its row has gone
    }
    if (guess.length > 0) {
        const rows = await candidateRows(tx, guess);
        for (const line of guess) {
            const r = rows.get(line.id);
            out.set(line.id, r ? choose(r).rowId : null);
        }
    }
    await lockStockLevels(
        tx,
        Array.from(out.values()).filter((x): x is string => !!x),
    );
    return out;
}

async function move(
    tx: Prisma.TransactionClient,
    rowId: string,
    from: StockPhase,
    to: StockPhase,
    q: number,
): Promise<boolean> {
    const row = await tx.stockLevel.findUnique({
        where: { id: rowId },
        select: { onHand: true, promised: true },
    });
    if (!row) return false;
    await tx.stockLevel.update({
        where: { id: rowId },
        data: nextStock(row, from, to, q),
    });
    return true;
}

/**
 * Change how much a RESERVED line holds by `delta` units (U6 — an order
 * edited before preparing). Settles on the row the line recorded, like every
 * other move, so an edit never lands a release on a row the line did not
 * reserve from. Growing a hold is refused when the stock is not there (no
 * oversell); shrinking one is always allowed. MUST run inside the order
 * write's transaction.
 */
export async function adjustReservation(
    tx: Prisma.TransactionClient,
    line: OrderLine,
    delta: number,
): Promise<void> {
    if (delta === 0) return;
    const recorded = await recordedLines(tx, [line]);
    const rowId = (await heldRows(tx, recorded)).get(line.id);
    if (!rowId) return;
    const [from, to]: [StockPhase, StockPhase] =
        delta > 0 ? ["RELEASED", "RESERVED"] : ["RESERVED", "RELEASED"];
    if (await move(tx, rowId, from, to, Math.abs(delta))) {
        await tx.orderItem.update({
            where: { id: line.id },
            data: { heldQuantity: { increment: delta } },
        });
    }
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
    if (from === to || lines.length === 0) return;
    const recorded = await recordedLines(tx, lines);

    let rowOf: Map<string, string | null>;
    if (from === "RELEASED") {
        // First hold: choose the row and record it on the line.
        const candidates = await candidateRows(
            tx,
            Array.from(recorded.values()),
        );
        rowOf = new Map();
        for (const line of lines) {
            const r = candidates.get(line.id);
            const { kind, rowId } = r
                ? choose(r)
                : { kind: "NONE" as const, rowId: null };
            rowOf.set(line.id, rowId);
            await tx.orderItem.update({
                where: { id: line.id },
                data: { stockRow: kind, stockLevelId: rowId },
            });
        }
        // A row made after the candidates were locked is locked now too.
        await lockStockLevels(
            tx,
            Array.from(rowOf.values()).filter((x): x is string => !!x),
        );
    } else {
        rowOf = await heldRows(tx, recorded);
    }

    for (const line of lines) {
        const rowId = rowOf.get(line.id);
        // NONE: the product counted no stock when the line was placed.
        if (!rowId) continue;
        if (await move(tx, rowId, from, to, line.quantity)) {
            await tx.orderItem.update({
                where: { id: line.id },
                data: {
                    stockLevelId: rowId,
                    heldQuantity: to === "RESERVED" ? line.quantity : 0,
                },
            });
        }
    }
}
