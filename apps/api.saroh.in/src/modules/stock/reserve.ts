import { ConflictException } from "@nestjs/common";
import type { Prisma, StockRow } from "@saroh/database";

import { CAPTURED_NEEDS_REFUND } from "../invoices/invoice-state";
import { lockStockLevels } from "../products/stock-levels";
import {
    putBackRefusal,
    RETURNED_CANT_UNDO,
    sellRefusal,
    SOLD_OUT_WHILE_PAYING,
} from "./stock-words";
import { recordReturned, recordSold, reverseSale } from "./stock.service";

/**
 * Orders and the shelf (#511): how an order's lines hold, sell and give back
 * units at the order's storefront. Every function runs on the caller's
 * transaction.
 *
 * A line records the row it holds on (`stockLevelId`, with `stockRow`) the
 * first time it holds, and how many units it holds there right now
 * (`heldQuantity`) and took off the shelf when fulfilled (`soldQuantity`).
 * Every later move reads those under the row's lock:
 *
 * - hold      — promised += q; refused past on hand − promised ("Sold out",
 *               "Only N left at Hill Road"). Writes no entry: a promise is
 *               not a shelf change.
 * - release   — promised −= min(n, held). A line released already (a line
 *               refund, then a cancel) gives back only what it still holds.
 * - commit    — a SOLD entry for what the line holds, not its quantity.
 * - uncommit  — the kitchen taking a fulfilment back: a REVERSED entry, and
 *               the units held again; refused once money or items came back.
 * - return    — a RETURNED entry, at most sold less what went back already.
 *
 * A line whose product counted no stock when it was placed (`stockRow`
 * NONE) never holds, so it stays untracked for life. A line with no
 * `stockRow` has never held (an online order not yet paid).
 *
 * Lock order, every flow (docs/patterns/backend-billing-and-classes.md):
 * Order → StockLevel rows (by id) → PaymentRefund → payment intent →
 * Invoice → Booking. The caller holds the order's lock; these take the row
 * locks. `reserveOnPayment` is the one entry point that starts earlier: it
 * takes the intent, then the order, then the rows — and never an intent
 * while it holds a row.
 */

type Tx = Prisma.TransactionClient;

interface Line {
    id: string;
    orderId: string;
    storeId: string;
    productId: string;
    productName: string;
    variantId: string | null;
    quantity: number;
    stockRow: StockRow | null;
    stockLevelId: string | null;
    heldQuantity: number;
    soldQuantity: number;
}

const LINE_SELECT = {
    id: true,
    orderId: true,
    productId: true,
    variantId: true,
    quantity: true,
    stockRow: true,
    stockLevelId: true,
    heldQuantity: true,
    soldQuantity: true,
    product: { select: { name: true } },
    order: { select: { storeId: true } },
} satisfies Prisma.OrderItemSelect;

async function loadLines(
    tx: Tx,
    where: Prisma.OrderItemWhereInput,
): Promise<Line[]> {
    const rows = await tx.orderItem.findMany({
        where,
        orderBy: { id: "asc" },
        select: LINE_SELECT,
    });
    return rows.map(({ product, order, ...line }) => ({
        ...line,
        productName: product.name,
        storeId: order.storeId,
    }));
}

function heldRowIds(lines: readonly Line[]): string[] {
    return lines.flatMap((l) => (l.stockLevelId ? [l.stockLevelId] : []));
}

/**
 * Lock every shelf an order's lines sit on, in id order. The caller holds
 * the order's lock; a flow that may touch any of the order's lines (a refund
 * settling, a cancel) takes them all here, before a PaymentRefund.
 */
export async function lockOrderShelves(tx: Tx, orderId: string): Promise<void> {
    const rows = await tx.orderItem.findMany({
        where: { orderId, stockLevelId: { not: null } },
        select: { stockLevelId: true },
    });
    await lockStockLevels(
        tx,
        rows.flatMap((r) => (r.stockLevelId ? [r.stockLevelId] : [])),
    );
}

// ---------------------------------------------------------------------------
// Holding
// ---------------------------------------------------------------------------

/** Why a hold was refused, as the order form and the checkout say it. */
export interface HoldRefusal {
    productId: string;
    variantId: string | null;
    /** What the storefront can still sell of it (on hand − promised, ≥ 0). */
    available: number;
    storefront: string;
    message: string;
}

/** The row a line would hold on at its storefront: variant's, product's, none. */
async function candidateRow(
    tx: Tx,
    line: Line,
): Promise<{ kind: StockRow; id: string | null }> {
    if (line.variantId) {
        const variantRow = await tx.stockLevel.findFirst({
            where: { storeId: line.storeId, variantId: line.variantId },
            select: { id: true },
        });
        if (variantRow) return { kind: "VARIANT", id: variantRow.id };
    }
    const productRow = await tx.stockLevel.findFirst({
        where: {
            storeId: line.storeId,
            productId: line.productId,
            variantId: null,
        },
        select: { id: true },
    });
    return productRow
        ? { kind: "PRODUCT", id: productRow.id }
        : { kind: "NONE", id: null };
}

async function storefrontName(tx: Tx, storeId: string): Promise<string> {
    const store = await tx.store.findUnique({
        where: { id: storeId },
        select: { name: true },
    });
    return store?.name ?? "this storefront";
}

/**
 * Hold what the lines that have never held need, or say why not. Chooses
 * each line's row, locks the rows in id order (re-choosing under the lock,
 * so a row counted into being meanwhile is seen), and checks each row can
 * sell what all the lines on it ask for. Nothing is written on a refusal.
 */
async function tryHold(
    tx: Tx,
    lines: readonly Line[],
): Promise<HoldRefusal | null> {
    const fresh = lines.filter((l) => l.stockRow === null);
    if (fresh.length === 0) return null;

    const choose = () => Promise.all(fresh.map((l) => candidateRow(tx, l)));
    const first = await choose();
    await lockStockLevels(
        tx,
        first.flatMap((c) => (c.id ? [c.id] : [])),
    );
    const chosen = await choose();
    await lockStockLevels(
        tx,
        chosen.flatMap((c) => (c.id ? [c.id] : [])),
    );

    // What each row is asked for, over every line on it.
    const need = new Map<string, { units: number; line: Line }>();
    for (const [i, line] of fresh.entries()) {
        const rowId = chosen[i].id;
        if (!rowId) continue;
        const was = need.get(rowId);
        need.set(rowId, {
            units: (was?.units ?? 0) + line.quantity,
            line: was?.line ?? line,
        });
    }
    const rows = await tx.stockLevel.findMany({
        where: { id: { in: Array.from(need.keys()) } },
        select: { id: true, onHand: true, promised: true },
    });
    for (const row of rows.sort((a, b) => (a.id < b.id ? -1 : 1))) {
        const asked = need.get(row.id);
        if (!asked) continue;
        const available = Math.max(0, row.onHand - row.promised);
        if (asked.units > available) {
            const storefront = await storefrontName(tx, asked.line.storeId);
            return {
                productId: asked.line.productId,
                variantId: asked.line.variantId,
                available,
                storefront,
                message: sellRefusal(
                    asked.line.productName,
                    available,
                    storefront,
                ),
            };
        }
    }

    for (const [rowId, asked] of need) {
        // Conditional as well as locked: the row sells only what it has.
        const moved = await tx.$executeRaw`
            UPDATE "StockLevel" SET "promised" = "promised" + ${asked.units}
            WHERE id = ${rowId} AND "onHand" - "promised" >= ${asked.units}`;
        if (moved !== 1) {
            throw new ConflictException(
                sellRefusal(asked.line.productName, 0, "this storefront"),
            );
        }
    }
    for (const [i, line] of fresh.entries()) {
        const { kind, id } = chosen[i];
        await tx.orderItem.update({
            where: { id: line.id },
            data: {
                stockRow: kind,
                stockLevelId: id,
                heldQuantity: id ? line.quantity : 0,
            },
        });
    }
    return null;
}

function refusalException(refusal: HoldRefusal): ConflictException {
    return new ConflictException({
        message: refusal.message,
        details: {
            field: "items",
            reason: refusal.available > 0 ? "ONLY_LEFT" : "SOLD_OUT",
            productId: refusal.productId,
            variantId: refusal.variantId,
            available: refusal.available,
            storefront: refusal.storefront,
        },
    });
}

/**
 * Hold stock for lines placed by staff (an order made in the workspace, or a
 * line added before preparing): each takes its units at the order's
 * storefront, or the whole order is refused with the storefront's words.
 * Lines that held before are left alone.
 */
export async function holdLines(
    tx: Tx,
    lineIds: readonly string[],
): Promise<void> {
    if (lineIds.length === 0) return;
    const lines = await loadLines(tx, { id: { in: [...lineIds] } });
    const refusal = await tryHold(tx, lines);
    if (refusal) throw refusalException(refusal);
}

/**
 * An edit before preparing changes a line's quantity by `delta`: its hold
 * grows (refused past what the storefront can sell) or shrinks. A promise,
 * not a shelf change, so no entry.
 */
export async function changeHold(
    tx: Tx,
    lineId: string,
    delta: number,
): Promise<void> {
    if (delta === 0) return;
    const line = (await loadLines(tx, { id: lineId })).find(
        (l) => l.id === lineId,
    );
    if (!line?.stockLevelId) return; // untracked, or never held
    await lockStockLevels(tx, [line.stockLevelId]);
    if (delta < 0) {
        await releaseOne(tx, line, -delta);
        return;
    }
    const moved = await tx.$executeRaw`
        UPDATE "StockLevel" SET "promised" = "promised" + ${delta}
        WHERE id = ${line.stockLevelId} AND "onHand" - "promised" >= ${delta}`;
    if (moved !== 1) {
        const row = await tx.stockLevel.findUniqueOrThrow({
            where: { id: line.stockLevelId },
            select: { onHand: true, promised: true },
        });
        const available = Math.max(0, row.onHand - row.promised);
        const storefront = await storefrontName(tx, line.storeId);
        throw refusalException({
            productId: line.productId,
            variantId: line.variantId,
            available,
            storefront,
            message: sellRefusal(line.productName, available, storefront),
        });
    }
    await tx.orderItem.update({
        where: { id: line.id },
        data: { heldQuantity: { increment: delta } },
    });
}

// ---------------------------------------------------------------------------
// Releasing
// ---------------------------------------------------------------------------

/** Give back min(units, held) of one line; the caller holds its row lock. */
async function releaseOne(tx: Tx, line: Line, units: number): Promise<number> {
    const n = Math.min(Math.max(0, units), line.heldQuantity);
    if (n === 0 || !line.stockLevelId) return 0;
    await tx.stockLevel.update({
        where: { id: line.stockLevelId },
        data: { promised: { decrement: n } },
    });
    await tx.orderItem.update({
        where: { id: line.id },
        data: { heldQuantity: { decrement: n } },
    });
    line.heldQuantity -= n;
    return n;
}

/**
 * Give back what lines hold: all of it (a cancel, a line removed), or up to
 * `units` of each (a line refund confirmed). Never more than a line holds,
 * so releasing twice gives back once.
 */
export async function releaseLines(
    tx: Tx,
    lines: readonly { id: string; units?: number }[],
): Promise<void> {
    if (lines.length === 0) return;
    const loaded = await loadLines(tx, {
        id: { in: lines.map((l) => l.id) },
    });
    await lockStockLevels(tx, heldRowIds(loaded));
    const asked = new Map(lines.map((l) => [l.id, l.units]));
    for (const line of loaded) {
        await releaseOne(tx, line, asked.get(line.id) ?? line.heldQuantity);
    }
}

// ---------------------------------------------------------------------------
// Selling
// ---------------------------------------------------------------------------

/**
 * Fulfilled: each line's held units leave the shelf, one SOLD entry per
 * line, recorded as the person who handed it over. A line that holds
 * nothing (refunded before it went) sells nothing.
 */
export async function commitLines(
    tx: Tx,
    lineIds: readonly string[],
    actorUserId: string | null,
): Promise<void> {
    if (lineIds.length === 0) return;
    const lines = await loadLines(tx, { id: { in: [...lineIds] } });
    await lockStockLevels(tx, heldRowIds(lines));
    for (const line of lines) {
        if (!line.stockLevelId || line.heldQuantity <= 0) continue;
        await recordSold(tx, {
            stockLevelId: line.stockLevelId,
            units: line.heldQuantity,
            orderId: line.orderId,
            actorUserId,
            releasePromised: line.heldQuantity,
        });
        await tx.orderItem.update({
            where: { id: line.id },
            data: {
                heldQuantity: 0,
                soldQuantity: { increment: line.heldQuantity },
            },
        });
    }
}

/**
 * The kitchen takes a fulfilment back: each line's sale is reversed and its
 * units held again. Refused once the order has a confirmed refund of a line
 * or a Returned entry — the shelf and the money have moved on.
 */
export async function uncommitLines(
    tx: Tx,
    lineIds: readonly string[],
    actorUserId: string | null,
): Promise<void> {
    if (lineIds.length === 0) return;
    const lines = await loadLines(tx, { id: { in: [...lineIds] } });
    const orderIds = Array.from(new Set(lines.map((l) => l.orderId)));
    const [refunded, returned] = await Promise.all([
        tx.paymentRefundLine.count({
            where: {
                orderItemId: { in: [...lineIds] },
                paymentRefund: { status: "SUCCEEDED" },
            },
        }),
        tx.stockEntry.count({
            where: { orderId: { in: orderIds }, kind: "RETURNED" },
        }),
    ]);
    if (refunded > 0 || returned > 0) {
        throw new ConflictException({
            message: RETURNED_CANT_UNDO,
            field: "eventId",
        });
    }
    await lockStockLevels(tx, heldRowIds(lines));
    for (const line of lines) {
        if (!line.stockLevelId || line.soldQuantity <= 0) continue;
        await reverseSale(tx, {
            stockLevelId: line.stockLevelId,
            units: line.soldQuantity,
            orderId: line.orderId,
            actorUserId,
            rehold: line.soldQuantity,
        });
        await tx.orderItem.update({
            where: { id: line.id },
            data: {
                heldQuantity: { increment: line.soldQuantity },
                soldQuantity: 0,
            },
        });
    }
}

// ---------------------------------------------------------------------------
// Refunds
// ---------------------------------------------------------------------------

/**
 * How many of each line a refund may put back on the shelf: what it sold
 * less what refunds (pending or settled) already put back. Read under the
 * order's lock, when the refund is asked for.
 */
export async function returnableUnits(
    tx: Tx,
    orderId: string,
): Promise<Map<string, number>> {
    const items = await tx.orderItem.findMany({
        where: { orderId },
        select: {
            id: true,
            soldQuantity: true,
            stockLevelId: true,
            refundLines: {
                where: { paymentRefund: { status: { not: "FAILED" } } },
                select: { putBackQuantity: true },
            },
        },
    });
    return new Map(
        items.map((i) => [
            i.id,
            i.stockLevelId
                ? Math.max(
                      0,
                      i.soldQuantity -
                          i.refundLines.reduce(
                              (s, r) => s + r.putBackQuantity,
                              0,
                          ),
                  )
                : 0,
        ]),
    );
}

/** Refuse a put-back of more than a line can take back. */
export function assertPutBack(
    returnable: ReadonlyMap<string, number>,
    asked: readonly { itemId: string; quantity: number }[],
): void {
    for (const a of asked) {
        const can = returnable.get(a.itemId) ?? 0;
        if (!Number.isInteger(a.quantity) || a.quantity < 0) {
            throw new ConflictException({
                message: "Put back a whole number of items.",
                field: "putBack",
            });
        }
        if (a.quantity > can) {
            throw new ConflictException({
                message: putBackRefusal(can),
                field: "putBack",
            });
        }
    }
}

/**
 * A refund has just moved into SUCCEEDED — the provider confirmed it
 * (DEC-026) — and this is the one transaction that does (a redelivered
 * webhook finds it SUCCEEDED already and never gets here). The caller holds
 * the order's lock and its shelves' (`lockOrderShelves`), then the refund's.
 *
 * - By line: each line gives back min(refunded, held) — a line already
 *   fulfilled holds nothing and releases nothing — and puts back what the
 *   refund asked, at most what it sold less what went back before: a
 *   RETURNED entry.
 * - With no lines (made in the provider's dashboard): nothing, unless it
 *   brought the order to fully refunded — then every line gives back what it
 *   still holds. A partial one is left for Stock checks.
 * - An edit's difference: nothing — the edit moved the holds itself.
 */
export async function settleRefundStock(
    tx: Tx,
    refundId: string,
    opts: { orderFullyRefunded: boolean; actorUserId?: string | null },
): Promise<void> {
    const refund = await tx.paymentRefund.findUniqueOrThrow({
        where: { id: refundId },
        select: {
            forEdit: true,
            paymentIntent: { select: { orderId: true } },
            lines: {
                select: {
                    orderItemId: true,
                    quantity: true,
                    putBackQuantity: true,
                },
            },
        },
    });
    const orderId = refund.paymentIntent.orderId;
    if (!orderId || refund.forEdit) return;

    if (refund.lines.length === 0) {
        if (!opts.orderFullyRefunded) return;
        const lines = await loadLines(tx, { orderId });
        await lockStockLevels(tx, heldRowIds(lines));
        for (const line of lines) {
            await releaseOne(tx, line, line.heldQuantity);
        }
        return;
    }

    const lines = await loadLines(tx, {
        id: { in: refund.lines.map((l) => l.orderItemId) },
    });
    await lockStockLevels(tx, heldRowIds(lines));
    const byId = new Map(lines.map((l) => [l.id, l]));
    for (const asked of refund.lines) {
        const line = byId.get(asked.orderItemId);
        if (!line) continue;
        await releaseOne(tx, line, asked.quantity);
        if (asked.putBackQuantity <= 0 || !line.stockLevelId) continue;
        // What went back before this refund, settled only.
        const before = await tx.paymentRefundLine.aggregate({
            where: {
                orderItemId: line.id,
                paymentRefundId: { not: refundId },
                paymentRefund: { status: "SUCCEEDED" },
            },
            _sum: { putBackQuantity: true },
        });
        const units = Math.min(
            asked.putBackQuantity,
            line.soldQuantity - (before._sum.putBackQuantity ?? 0),
        );
        if (units <= 0) continue;
        await recordReturned(tx, {
            stockLevelId: line.stockLevelId,
            units,
            orderId: line.orderId,
            actorUserId: opts.actorUserId ?? null,
        });
    }
}

// ---------------------------------------------------------------------------
// Online orders: hold when paid
// ---------------------------------------------------------------------------

/** The idempotency key of the automatic refund for a lost last unit. */
export function soldOutRefundKey(paymentIntentId: string): string {
    return `sold-out:${paymentIntentId}`;
}

export type ReserveOnPaymentResult =
    | { kind: "HELD" }
    | {
          kind: "REFUSED";
          /** The automatic refund, PENDING until the provider takes it. */
          refundId: string;
          /** False when an earlier call recorded this refusal. */
          created: boolean;
          refusal: HoldRefusal | null;
          /** What the customer is told. */
          message: string;
      };

/**
 * An online order is paid (R5): hold its units now, or — when another
 * payment took the last of them — record the refusal and the automatic
 * refund of the whole payment (DEC-032). Idempotent per payment intent: a
 * second call for a held order changes nothing, and for a refused one
 * returns the same refusal and the same refund, never a second.
 *
 * Locks the intent, then the order, then the rows. The caller (the success
 * webhook, when the online checkout exists) must hold nothing below the
 * intent. The refund row is PENDING with the idempotency key
 * `sold-out:<intent>` (unique per intent), so its id — Saroh's reference to
 * the provider (DEC-026) — is the same on every call; the caller sends it
 * after this transaction commits (`PaymentsService.sendAutomaticRefund`),
 * and the refund webhook confirms it.
 */
export async function reserveOnPayment(
    tx: Tx,
    input: { organizationId: string; orderId: string; paymentIntentId: string },
): Promise<ReserveOnPaymentResult> {
    const intents = await tx.$queryRaw<
        { amountCents: number; currency: string; provider: string }[]
    >`SELECT "amountCents", currency, provider FROM "PaymentIntent"
      WHERE id = ${input.paymentIntentId}
        AND "organizationId" = ${input.organizationId}
        AND "orderId" = ${input.orderId}
      FOR NO KEY UPDATE`;
    if (intents.length === 0) {
        throw new ConflictException("That payment is not this order's.");
    }
    const [intent] = intents;
    await tx.$queryRaw`SELECT id FROM "Order" WHERE id = ${input.orderId} FOR UPDATE`;

    const key = soldOutRefundKey(input.paymentIntentId);
    const refused = await tx.paymentRefund.findFirst({
        where: { paymentIntentId: input.paymentIntentId, idempotencyKey: key },
        select: { id: true },
    });
    if (refused) {
        return {
            kind: "REFUSED",
            refundId: refused.id,
            created: false,
            refusal: null,
            message: SOLD_OUT_WHILE_PAYING,
        };
    }

    const lines = await loadLines(tx, { orderId: input.orderId });
    const refusal = await tryHold(tx, lines);
    if (!refusal) return { kind: "HELD" };

    await tx.paymentAttempt.create({
        data: {
            organizationId: input.organizationId,
            paymentIntentId: input.paymentIntentId,
            provider: intent.provider,
            status: CAPTURED_NEEDS_REFUND,
            rawResponse: {
                reason: "SOLD_OUT",
                productId: refusal.productId,
                variantId: refusal.variantId,
                available: refusal.available,
            },
        },
    });
    const refund = await tx.paymentRefund.create({
        data: {
            organizationId: input.organizationId,
            paymentIntentId: input.paymentIntentId,
            amountCents: intent.amountCents,
            currency: intent.currency,
            status: "PENDING",
            reason: SOLD_OUT_WHILE_PAYING,
            idempotencyKey: key,
        },
        select: { id: true },
    });
    return {
        kind: "REFUSED",
        refundId: refund.id,
        created: true,
        refusal,
        message: SOLD_OUT_WHILE_PAYING,
    };
}
