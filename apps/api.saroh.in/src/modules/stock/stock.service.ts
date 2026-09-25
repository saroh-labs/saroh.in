import { randomUUID } from "node:crypto";

import {
    BadRequestException,
    ConflictException,
    Injectable,
    NotFoundException,
} from "@nestjs/common";
import type { Prisma, StockEntryKind } from "@saroh/database";

import { lockProduct, lockStockLevels } from "../products/stock-levels";
import { clearSoldOut } from "./sold-out";
import type { AdjustKind, StockSystemReason } from "./stock-words";
import {
    adjustDelta,
    ALREADY_UNDONE,
    belowZeroRefusal,
    BUSINESS_UNTRACKED,
    cantReverse,
    canUndoEntry,
    CLOSED_STOREFRONT,
    countMismatched,
    COUNTS_AS_A_WHOLE,
    COUNTS_PER_VARIANT,
    isHandMade,
    movable,
    moveRefusal,
    orderReturnRefusal,
    shortBy,
    SYSTEM_CANT_UNDO,
    UNTRACKED,
} from "./stock-words";
import { recordProductTracking } from "./tracking-audit";

/**
 * The stock module (#513): every change to what is on a shelf goes through
 * here and writes one StockEntry in the caller's transaction — two for a
 * move. Promises (StockLevel.promised) are not shelf changes and write
 * nothing; a caller that moves one alongside a shelf change passes
 * `promisedDelta`.
 *
 * Every function runs on the caller's transaction and takes the StockLevel
 * row locks itself, in id order, after whatever the caller already holds —
 * the lock order is Order → Product → StockLevel (sorted by id). A function
 * that is handed a row id rather than a target (`recordEntry`, `recordSold`,
 * `recordReturned`, `reverseSale`) expects the caller to hold that lock.
 *
 * The rules:
 * - A count saves whatever was counted, even below what is promised (the row
 *   then reads "N short"); it keeps what the counter was shown, and the entry
 *   reads "Count didn't match" when the locked shelf had moved since.
 * - A move takes only what is not promised, and writes a pair.
 * - Undo reverses the change (a count 10 → 8 undone after 3 sold leaves 7,
 *   never "back to 10"), is refused where taking units away would leave
 *   less than none (adding to a shelf sold below 0 is fine), is
 *   only for hand-made entries (a moved pair undoes both sides), is never
 *   itself undone, and a batch is all or nothing.
 * - Nothing changes at a closed storefront.
 */

type Tx = Prisma.TransactionClient;

/** Who is changing stock, in which business. */
export interface StockActor {
    organizationId: string;
    /** The person, recorded on the entry; null for the system. */
    userId: string | null;
    /**
     * The acting context's role key (`ctx.roleKey`), for the audit rows a
     * stock flow writes (Track stock, #515): an operator's reads as Saroh
     * support.
     */
    roleKey?: string;
}

/** A shelf: by its row, or by storefront × product × variant. */
export type StockTarget =
    | { stockLevelId: string }
    | { storeId: string; productId: string; variantId?: string | null };

export interface StockEntryView {
    id: string;
    stockLevelId: string;
    storeId: string;
    productId: string;
    variantId: string | null;
    kind: StockEntryKind;
    quantity: number;
    before: number;
    after: number;
    expected: number | null;
    counted: number | null;
    orderId: string | null;
    pairId: string | null;
    reversesId: string | null;
    actorUserId: string | null;
    note: string | null;
    /** Why Saroh wrote it; null for a person's or an order's. */
    system: string | null;
    createdAt: Date;
}

/** A shelf as it stands after a change. */
export interface ShelfView {
    stockLevelId: string;
    storeId: string;
    productId: string;
    variantId: string | null;
    onHand: number;
    promised: number;
    lowStockAlert: number;
    /** Promised units that are not on the shelf. */
    short: number;
}

export interface CountResult {
    entry: StockEntryView;
    shelf: ShelfView;
    /** The shelf had moved since the counter was shown `expected`. */
    mismatch: boolean;
}

interface Row {
    id: string;
    organizationId: string;
    storeId: string;
    productId: string;
    variantId: string | null;
    onHand: number;
    promised: number;
    lowStockAlert: number;
}

const ROW_SELECT = {
    id: true,
    organizationId: true,
    storeId: true,
    productId: true,
    variantId: true,
    onHand: true,
    promised: true,
    lowStockAlert: true,
} satisfies Prisma.StockLevelSelect;

function shelf(row: Row): ShelfView {
    return {
        stockLevelId: row.id,
        storeId: row.storeId,
        productId: row.productId,
        variantId: row.variantId,
        onHand: row.onHand,
        promised: row.promised,
        lowStockAlert: row.lowStockAlert,
        short: shortBy(row),
    };
}

// ---------------------------------------------------------------------------
// Finding and locking shelves
// ---------------------------------------------------------------------------

/**
 * Refuse a new shelf for a product that stopped counting stock. Called under
 * the product's lock, so Track stock going off for the product (which takes
 * it first) has committed or not started; the business's profile is read
 * FOR SHARE, so its switch going off (which locks the profile) is waited
 * for too.
 */
async function assertStillTracked(
    tx: Tx,
    organizationId: string,
    productId: string,
): Promise<void> {
    const product = await tx.product.findFirst({
        where: { id: productId, organizationId },
        select: { stockTracked: true },
    });
    if (!product) throw new NotFoundException("Product not found");
    const [profile] = await tx.$queryRaw<{ stockTracking: boolean }[]>`
        SELECT "stockTracking" FROM "BusinessProfile"
        WHERE "organizationId" = ${organizationId} FOR SHARE`;
    if (profile && !profile.stockTracking) {
        throw new ConflictException(BUSINESS_UNTRACKED);
    }
    if (!product.stockTracked) throw new ConflictException(UNTRACKED);
}

/**
 * The row a target names, in this business — made (at 0, with no entry: a
 * row at 0 with no entries adds up) when `create` and it is missing. Not
 * locked yet. Anything of another business is not found.
 *
 * Making a row takes the product's lock first, and is refused when it would
 * change how the product counts: a variant's row for a product counted as a
 * whole, or a whole row for one counted per variant (switching is
 * `setVariantsIn`, which moves open orders' promises and needs
 * `store:write`), and for a product whose Track stock went off. A product
 * with no shelf anywhere may start with either kind.
 */
async function resolveRowId(
    tx: Tx,
    actor: StockActor,
    target: StockTarget,
    create: boolean,
): Promise<string> {
    const { organizationId } = actor;
    if ("stockLevelId" in target) {
        const row = await tx.stockLevel.findFirst({
            where: { id: target.stockLevelId, organizationId },
            select: { id: true },
        });
        if (!row) throw new NotFoundException("Stock not found");
        return row.id;
    }
    const { storeId, productId } = target;
    const variantId = target.variantId ?? null;
    const [store, product, variant] = await Promise.all([
        tx.store.findFirst({
            where: { id: storeId, organizationId },
            select: { id: true },
        }),
        tx.product.findFirst({
            where: { id: productId, organizationId },
            select: { id: true },
        }),
        variantId
            ? tx.productVariant.findFirst({
                  where: { id: variantId, productId },
                  select: { id: true },
              })
            : Promise.resolve({ id: null }),
    ]);
    if (!store) throw new NotFoundException("Store not found");
    if (!product) throw new NotFoundException("Product not found");
    if (!variant) throw new NotFoundException("Variant not found");
    const findRow = () =>
        tx.stockLevel.findFirst({
            where: { storeId, productId, variantId },
            select: { id: true },
        });
    const found = await findRow();
    if (found) return found.id;
    if (!create) throw new NotFoundException("Stock not found");
    // A new row changes where the product counts: take the product's lock
    // (Order → Product → StockLevel), so it waits for Track stock going off
    // or a switch to per-variant stock, and look again under it.
    await lockProduct(tx, productId);
    const raced = await findRow();
    if (raced) return raced.id;
    const shelves = await tx.stockLevel.findMany({
        where: { productId },
        select: { variantId: true },
    });
    if (shelves.length > 0) {
        // Read under the lock: Track stock that went off meanwhile is seen.
        await assertStillTracked(tx, organizationId, productId);
        // A product counts as a whole or per variant, never both; switching
        // is the product's own Stock section (`store:write`).
        const perVariant = shelves.some((s) => s.variantId !== null);
        if (variantId !== null && !perVariant) {
            throw new ConflictException({
                message: COUNTS_AS_A_WHOLE,
                field: "variantId",
            });
        }
        if (variantId === null && perVariant) {
            throw new ConflictException({
                message: COUNTS_PER_VARIANT,
                field: "variantId",
            });
        }
    }
    // A product with no shelf anywhere starts counting with its first one
    // (Track stock on, #515), of either kind. Callers decide who may start
    // it: the Stock API never does, the product's own count needs
    // `store:write`.
    if (shelves.length === 0) {
        const started = await tx.product.updateMany({
            where: { id: productId, stockTracked: false },
            data: { stockTracked: true, stockTrackedAt: new Date() },
        });
        if (started.count > 0) {
            // Started by a count, not the switch: Activity says so.
            const soldOutCleared = await clearSoldOut(tx, { productId });
            const named = await tx.product.findUniqueOrThrow({
                where: { id: productId },
                select: { name: true },
            });
            await recordProductTracking(tx, actor, productId, {
                tracked: true,
                product: named.name,
                startedWithCount: true,
                soldOutCleared,
            });
        }
    }
    const made = await tx.stockLevel.create({
        data: { organizationId, storeId, productId, variantId },
        select: { id: true },
    });
    return made.id;
}

/**
 * Lock rows in id order, re-read them under the lock, and refuse any at a
 * closed storefront.
 */
async function lockRows(
    tx: Tx,
    ids: readonly string[],
    opts: { openOnly: boolean } = { openOnly: true },
): Promise<Map<string, Row>> {
    await lockStockLevels(tx, ids);
    const rows = await tx.stockLevel.findMany({
        where: { id: { in: Array.from(new Set(ids)) } },
        select: { ...ROW_SELECT, store: { select: { deletedAt: true } } },
    });
    if (opts.openOnly && rows.some((r) => r.store.deletedAt !== null)) {
        throw new ConflictException(CLOSED_STOREFRONT);
    }
    return new Map(
        rows.map(({ store: _store, ...row }) => [row.id, row] as const),
    );
}

/** Find (or make) and lock one shelf. */
async function lockTarget(
    tx: Tx,
    actor: StockActor,
    target: StockTarget,
    create: boolean,
): Promise<Row> {
    const id = await resolveRowId(tx, actor, target, create);
    const row = (await lockRows(tx, [id])).get(id);
    if (!row) throw new NotFoundException("Stock not found");
    return row;
}

async function storefrontName(tx: Tx, storeId: string): Promise<string> {
    const store = await tx.store.findUnique({
        where: { id: storeId },
        select: { name: true },
    });
    return store?.name ?? "this storefront";
}

// ---------------------------------------------------------------------------
// The one writer
// ---------------------------------------------------------------------------

export interface RecordEntryInput {
    /** The row, which the caller has locked. */
    stockLevelId: string;
    kind: StockEntryKind;
    /** The signed change to on hand. */
    quantity: number;
    actorUserId?: string | null;
    orderId?: string | null;
    pairId?: string | null;
    reversesId?: string | null;
    expected?: number | null;
    counted?: number | null;
    note?: string | null;
    /**
     * Saroh wrote it, not a person (Track stock off, the per-variant
     * switch, a removed variant): the stock log never undoes it.
     */
    system?: StockSystemReason | null;
    /** A promise moving with this change (a sale takes its hold). */
    promisedDelta?: number;
    /**
     * Let a change that takes units away leave on hand below 0. Only a sale
     * may: a count below promised is allowed, so fulfilling what was
     * promised can take a shelf below none, and the order was fulfilled all
     * the same. A change that adds units is never refused, even when the
     * shelf is still below 0 after it.
     */
    allowNegative?: boolean;
}

/**
 * Change a locked row's on hand by `quantity` and write the entry that says
 * so. Reads the row afresh (the caller's lock keeps it still), so `before`
 * is what the shelf held and before + quantity = after always.
 */
export async function recordEntry(
    tx: Tx,
    input: RecordEntryInput,
): Promise<StockEntryView> {
    if (!Number.isInteger(input.quantity)) {
        throw new BadRequestException("Stock moves in whole units.");
    }
    const row = await tx.stockLevel.findUniqueOrThrow({
        where: { id: input.stockLevelId },
        select: ROW_SELECT,
    });
    const before = row.onHand;
    const after = before + input.quantity;
    // Only a change that takes units away is refused below 0: a shelf sold
    // below none (a sale may) still takes a return, a delivery or a move in.
    if (after < 0 && input.quantity < 0 && !input.allowNegative) {
        throw new ConflictException(
            belowZeroRefusal(await storefrontName(tx, row.storeId)),
        );
    }
    await tx.stockLevel.update({
        where: { id: row.id },
        data: {
            onHand: after,
            ...(input.promisedDelta
                ? { promised: { increment: input.promisedDelta } }
                : {}),
        },
    });
    return tx.stockEntry.create({
        data: {
            organizationId: row.organizationId,
            stockLevelId: row.id,
            storeId: row.storeId,
            productId: row.productId,
            variantId: row.variantId,
            kind: input.kind,
            quantity: input.quantity,
            before,
            after,
            expected: input.expected ?? null,
            counted: input.counted ?? null,
            orderId: input.orderId ?? null,
            pairId: input.pairId ?? null,
            reversesId: input.reversesId ?? null,
            actorUserId: input.actorUserId ?? null,
            note: input.note ?? null,
            system: input.system ?? null,
        },
    });
}

// ---------------------------------------------------------------------------
// Counts
// ---------------------------------------------------------------------------

export interface CountInput {
    target: StockTarget;
    /** What was counted on the shelf. */
    counted: number;
    /** What the counter was shown; left out when they were shown nothing. */
    expected?: number | null;
    /** A new warning level, set with the count. */
    lowStockAlert?: number;
    note?: string | null;
}

/**
 * Count shelves: each becomes what was counted, one COUNTED entry each (a
 * count that changes nothing is still a count, and is logged). Rows are
 * locked together in id order. A shelf that doesn't count stock yet starts
 * counting here.
 */
export async function countAll(
    tx: Tx,
    actor: StockActor,
    counts: readonly CountInput[],
): Promise<CountResult[]> {
    for (const c of counts) {
        if (!Number.isInteger(c.counted) || c.counted < 0) {
            throw new BadRequestException({
                message: "A count is a whole number, 0 or more.",
                field: "counted",
            });
        }
    }
    const ids: string[] = [];
    for (const c of counts) {
        ids.push(await resolveRowId(tx, actor, c.target, true));
    }
    if (new Set(ids).size !== ids.length) {
        throw new BadRequestException("Count each shelf once.");
    }
    await lockRows(tx, ids);
    const out: CountResult[] = [];
    for (const [i, c] of counts.entries()) {
        const id = ids[i];
        if (c.lowStockAlert != null) {
            await tx.stockLevel.update({
                where: { id },
                data: { lowStockAlert: c.lowStockAlert },
            });
        }
        const current = await tx.stockLevel.findUniqueOrThrow({
            where: { id },
            select: { onHand: true },
        });
        const entry = await recordEntry(tx, {
            stockLevelId: id,
            kind: "COUNTED",
            quantity: c.counted - current.onHand,
            expected: c.expected ?? null,
            counted: c.counted,
            actorUserId: actor.userId,
            note: c.note ?? null,
        });
        const row = await tx.stockLevel.findUniqueOrThrow({
            where: { id },
            select: ROW_SELECT,
        });
        out.push({
            entry,
            shelf: shelf(row),
            mismatch: countMismatched(entry.expected, entry.before),
        });
    }
    return out;
}

/** Count one shelf. */
export async function count(
    tx: Tx,
    actor: StockActor,
    input: CountInput,
): Promise<CountResult> {
    const [result] = await countAll(tx, actor, [input]);
    return result;
}

// ---------------------------------------------------------------------------
// Received, baked, wasted
// ---------------------------------------------------------------------------

export interface AdjustInput {
    target: StockTarget;
    kind: AdjustKind;
    /** How many units, always positive: the kind says which way. */
    units: number;
    note?: string | null;
}

/** Record units received or baked (+) or wasted (−) at a shelf. */
export async function adjust(
    tx: Tx,
    actor: StockActor,
    input: AdjustInput,
): Promise<{ entry: StockEntryView; shelf: ShelfView }> {
    if (!Number.isInteger(input.units) || input.units <= 0) {
        throw new BadRequestException({
            message: "Enter how many, 1 or more.",
            field: "units",
        });
    }
    const row = await lockTarget(
        tx,
        actor,
        input.target,
        input.kind !== "WASTED",
    );
    const entry = await recordEntry(tx, {
        stockLevelId: row.id,
        kind: input.kind,
        quantity: adjustDelta(input.kind, input.units),
        actorUserId: actor.userId,
        note: input.note ?? null,
    });
    const after = await tx.stockLevel.findUniqueOrThrow({
        where: { id: row.id },
        select: ROW_SELECT,
    });
    return { entry, shelf: shelf(after) };
}

/**
 * What an order can still bring back to one shelf (#511, #514): what its
 * lines sold from it, less the Returned entries naming the order there — a
 * refund's put-back and a return recorded by hand alike — less what refunds
 * still being confirmed will put back. Read under the row's lock.
 */
export async function orderReturnableOnRow(
    tx: Pick<Tx, "orderItem" | "stockEntry" | "paymentRefundLine">,
    orderId: string,
    stockLevelId: string,
): Promise<number> {
    const [sold, returned, pending] = await Promise.all([
        tx.orderItem.aggregate({
            where: { orderId, stockLevelId },
            _sum: { soldQuantity: true },
        }),
        tx.stockEntry.aggregate({
            where: { orderId, stockLevelId, kind: "RETURNED" },
            _sum: { quantity: true },
        }),
        tx.paymentRefundLine.aggregate({
            where: {
                orderItem: { orderId, stockLevelId },
                paymentRefund: { status: { notIn: ["SUCCEEDED", "FAILED"] } },
            },
            _sum: { putBackQuantity: true },
        }),
    ]);
    return Math.max(
        0,
        (sold._sum.soldQuantity ?? 0) -
            (returned._sum.quantity ?? 0) -
            (pending._sum.putBackQuantity ?? 0),
    );
}

/**
 * Units a customer brought back, recorded by hand (the Stock screen's
 * entries sheet, #514): RETURNED +units, naming the order when there is
 * one — then no more than that order sold from this shelf less what came
 * back already (`orderReturnableOnRow`), so a refund's "Put back in stock"
 * and a hand-recorded return never put the same units back twice. Like a
 * refund's return, it comes back only through a count — the stock log never
 * undoes a return.
 */
export async function returnByHand(
    tx: Tx,
    actor: StockActor,
    input: {
        target: StockTarget;
        units: number;
        orderId?: string | null;
        note?: string | null;
    },
): Promise<{ entry: StockEntryView; shelf: ShelfView }> {
    if (!Number.isInteger(input.units) || input.units <= 0) {
        throw new BadRequestException({
            message: "Enter how many, 1 or more.",
            field: "units",
        });
    }
    if (input.orderId) {
        const order = await tx.order.findFirst({
            where: { id: input.orderId, organizationId: actor.organizationId },
            select: { id: true },
        });
        if (!order) throw new NotFoundException("Order not found");
    }
    const row = await lockTarget(tx, actor, input.target, true);
    if (input.orderId) {
        const can = await orderReturnableOnRow(tx, input.orderId, row.id);
        if (input.units > can) {
            throw new ConflictException({
                message: orderReturnRefusal(can),
                field: "units",
            });
        }
    }
    const entry = await recordEntry(tx, {
        stockLevelId: row.id,
        kind: "RETURNED",
        quantity: input.units,
        orderId: input.orderId ?? null,
        actorUserId: actor.userId,
        note: input.note ?? null,
    });
    const after = await tx.stockLevel.findUniqueOrThrow({
        where: { id: row.id },
        select: ROW_SELECT,
    });
    return { entry, shelf: shelf(after) };
}

// ---------------------------------------------------------------------------
// Moves
// ---------------------------------------------------------------------------

export interface MoveInput {
    /** The shelf the units leave. */
    from: StockTarget;
    /** The storefront they go to: the same product and variant there. */
    toStoreId: string;
    units: number;
    note?: string | null;
}

/**
 * Move units between two storefronts of the business: only what isn't
 * promised at the first, as −N there and +N at the second, one pair id.
 * Both rows are locked in id order.
 */
export async function move(
    tx: Tx,
    actor: StockActor,
    input: MoveInput,
): Promise<{ out: StockEntryView; in: StockEntryView; pairId: string }> {
    if (!Number.isInteger(input.units) || input.units <= 0) {
        throw new BadRequestException({
            message: "Enter how many to move, 1 or more.",
            field: "units",
        });
    }
    const fromId = await resolveRowId(tx, actor, input.from, false);
    const source = await tx.stockLevel.findUniqueOrThrow({
        where: { id: fromId },
        select: { storeId: true, productId: true, variantId: true },
    });
    if (source.storeId === input.toStoreId) {
        throw new BadRequestException({
            message: "Pick another storefront to move it to.",
            field: "toStoreId",
        });
    }
    const toId = await resolveRowId(
        tx,
        actor,
        {
            storeId: input.toStoreId,
            productId: source.productId,
            variantId: source.variantId,
        },
        true,
    );
    const rows = await lockRows(tx, [fromId, toId]);
    const from = rows.get(fromId);
    if (!from) throw new NotFoundException("Stock not found");
    const available = movable(from);
    if (input.units > available) {
        throw new ConflictException({
            message: moveRefusal(
                available,
                await storefrontName(tx, from.storeId),
            ),
            field: "units",
        });
    }
    const pairId = randomUUID();
    const common = {
        kind: "MOVED" as const,
        pairId,
        actorUserId: actor.userId,
        note: input.note ?? null,
    };
    const out = await recordEntry(tx, {
        ...common,
        stockLevelId: fromId,
        quantity: -input.units,
    });
    const inbound = await recordEntry(tx, {
        ...common,
        stockLevelId: toId,
        quantity: input.units,
    });
    return { out, in: inbound, pairId };
}

// ---------------------------------------------------------------------------
// Undo
// ---------------------------------------------------------------------------

/**
 * Undo hand-made entries, all or none: each gets a REVERSED entry taking
 * back its change (a moved pair both sides, under a new pair id). Refused
 * for a sale, a return or an undo, for anything already undone, and where
 * the shelf would be left below 0 — checked for the whole batch before
 * anything is written.
 */
export async function reverse(
    tx: Tx,
    actor: StockActor,
    input: { entryIds: readonly string[]; note?: string | null },
): Promise<StockEntryView[]> {
    const asked = Array.from(new Set(input.entryIds));
    if (asked.length === 0) {
        throw new BadRequestException("Pick what to undo.");
    }
    const named = await tx.stockEntry.findMany({
        where: { id: { in: asked }, organizationId: actor.organizationId },
        select: { id: true, kind: true, pairId: true, system: true },
    });
    if (named.length !== asked.length) {
        throw new NotFoundException("Stock change not found");
    }
    for (const e of named) {
        if (!isHandMade(e.kind)) {
            throw new ConflictException(cantReverse(e.kind));
        }
        if (!canUndoEntry(e)) throw new ConflictException(SYSTEM_CANT_UNDO);
    }
    // A move is undone whole.
    const pairIds = named.flatMap((e) =>
        e.kind === "MOVED" && e.pairId ? [e.pairId] : [],
    );
    const entries = await tx.stockEntry.findMany({
        where: {
            organizationId: actor.organizationId,
            OR: [
                { id: { in: asked } },
                ...(pairIds.length > 0
                    ? [{ kind: "MOVED" as const, pairId: { in: pairIds } }]
                    : []),
            ],
        },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    });

    const rows = await lockRows(
        tx,
        entries.map((e) => e.stockLevelId),
    );
    // Undone already? Read under the row locks, so two undos take turns.
    const undone = await tx.stockEntry.count({
        where: { reversesId: { in: entries.map((e) => e.id) } },
    });
    if (undone > 0) throw new ConflictException(ALREADY_UNDONE);

    const onHand = new Map(
        Array.from(rows.values()).map((r) => [r.id, r.onHand] as const),
    );
    for (const e of entries) {
        const next = (onHand.get(e.stockLevelId) ?? 0) - e.quantity;
        // Refused only where the undo takes units away (as recordEntry).
        if (next < 0 && -e.quantity < 0) {
            throw new ConflictException(
                belowZeroRefusal(await storefrontName(tx, e.storeId)),
            );
        }
        onHand.set(e.stockLevelId, next);
    }

    const newPair = new Map<string, string>();
    const written: StockEntryView[] = [];
    for (const e of entries) {
        let pairId: string | null = null;
        if (e.pairId) {
            pairId = newPair.get(e.pairId) ?? randomUUID();
            newPair.set(e.pairId, pairId);
        }
        written.push(
            await recordEntry(tx, {
                stockLevelId: e.stockLevelId,
                kind: "REVERSED",
                quantity: -e.quantity,
                reversesId: e.id,
                pairId,
                actorUserId: actor.userId,
                note: input.note ?? null,
            }),
        );
    }
    return written;
}

// ---------------------------------------------------------------------------
// The order flows' writers (U2)
// ---------------------------------------------------------------------------

/**
 * A sale leaves the shelf: SOLD −units on a row the caller has locked,
 * taking `releasePromised` of the line's hold with it.
 */
export function recordSold(
    tx: Tx,
    input: {
        stockLevelId: string;
        units: number;
        orderId: string;
        actorUserId?: string | null;
        releasePromised?: number;
    },
): Promise<StockEntryView> {
    return recordEntry(tx, {
        stockLevelId: input.stockLevelId,
        kind: "SOLD",
        quantity: -input.units,
        orderId: input.orderId,
        actorUserId: input.actorUserId ?? null,
        promisedDelta: input.releasePromised ? -input.releasePromised : 0,
        allowNegative: true,
    });
}

/** Units a customer brought back go back on the shelf (a confirmed refund). */
export function recordReturned(
    tx: Tx,
    input: {
        stockLevelId: string;
        units: number;
        orderId: string;
        actorUserId?: string | null;
        note?: string | null;
    },
): Promise<StockEntryView> {
    return recordEntry(tx, {
        stockLevelId: input.stockLevelId,
        kind: "RETURNED",
        quantity: input.units,
        orderId: input.orderId,
        actorUserId: input.actorUserId ?? null,
        note: input.note ?? null,
    });
}

/**
 * A sale taken back by its order (the kitchen undoing a fulfilment): a
 * REVERSED entry for the order's latest sale of `units` on this row that is
 * not undone yet, re-holding `rehold` units. A sale from before the log has
 * no entry to point at; its undo is written all the same, pointing at none.
 * The caller holds the row lock.
 */
export async function reverseSale(
    tx: Tx,
    input: {
        stockLevelId: string;
        units: number;
        orderId: string;
        actorUserId?: string | null;
        rehold?: number;
    },
): Promise<StockEntryView> {
    const sale = await tx.stockEntry.findFirst({
        where: {
            stockLevelId: input.stockLevelId,
            orderId: input.orderId,
            kind: "SOLD",
            quantity: -input.units,
            reversedBy: { is: null },
        },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        select: { id: true },
    });
    return recordEntry(tx, {
        stockLevelId: input.stockLevelId,
        kind: "REVERSED",
        quantity: input.units,
        orderId: input.orderId,
        reversesId: sale?.id ?? null,
        actorUserId: input.actorUserId ?? null,
        promisedDelta: input.rehold ?? 0,
    });
}

/**
 * The same functions for code that is handed its dependencies (the Stock
 * API, U5). Stateless: every method takes the caller's transaction.
 */
@Injectable()
export class StockService {
    readonly recordEntry = recordEntry;
    readonly count = count;
    readonly countAll = countAll;
    readonly adjust = adjust;
    readonly returnByHand = returnByHand;
    readonly move = move;
    readonly reverse = reverse;
    readonly recordSold = recordSold;
    readonly recordReturned = recordReturned;
    readonly reverseSale = reverseSale;
}
