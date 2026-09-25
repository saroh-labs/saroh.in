import { randomUUID } from "node:crypto";

import {
    BadRequestException,
    ConflictException,
    Injectable,
    NotFoundException,
} from "@nestjs/common";
import type { Prisma, StockEntryKind } from "@saroh/database";

import { lockStockLevels } from "../products/stock-levels";
import type { AdjustKind } from "./stock-words";
import {
    adjustDelta,
    ALREADY_UNDONE,
    belowZeroRefusal,
    cantReverse,
    CLOSED_STOREFRONT,
    countMismatched,
    isHandMade,
    movable,
    moveRefusal,
    shortBy,
} from "./stock-words";

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
 *   never "back to 10"), is refused where it would leave less than none, is
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
 * The row a target names, in this business — made (at 0, with no entry: a
 * row at 0 with no entries adds up) when `create` and it is missing. Not
 * locked yet. Anything of another business is not found.
 */
async function resolveRowId(
    tx: Tx,
    organizationId: string,
    target: StockTarget,
    create: boolean,
): Promise<string> {
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
    const found = await tx.stockLevel.findFirst({
        where: { storeId, productId, variantId },
        select: { id: true },
    });
    if (found) return found.id;
    if (!create) throw new NotFoundException("Stock not found");
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
    organizationId: string,
    target: StockTarget,
    create: boolean,
): Promise<Row> {
    const id = await resolveRowId(tx, organizationId, target, create);
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
    /** A promise moving with this change (a sale takes its hold). */
    promisedDelta?: number;
    /**
     * Let on hand go below 0. Only a sale may: a count below promised is
     * allowed, so fulfilling what was promised can take a shelf below none,
     * and the order was fulfilled all the same.
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
    if (after < 0 && !input.allowNegative) {
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
        ids.push(await resolveRowId(tx, actor.organizationId, c.target, true));
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
        actor.organizationId,
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
    const fromId = await resolveRowId(
        tx,
        actor.organizationId,
        input.from,
        false,
    );
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
        actor.organizationId,
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
        select: { id: true, kind: true, pairId: true },
    });
    if (named.length !== asked.length) {
        throw new NotFoundException("Stock change not found");
    }
    for (const e of named) {
        if (!isHandMade(e.kind)) {
            throw new ConflictException(cantReverse(e.kind));
        }
    }
    // A move is undone whole.
    const pairIds = named
        .filter((e) => e.kind === "MOVED" && e.pairId)
        .map((e) => e.pairId as string);
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
        if (next < 0) {
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
    readonly move = move;
    readonly reverse = reverse;
    readonly recordSold = recordSold;
    readonly recordReturned = recordReturned;
    readonly reverseSale = reverseSale;
}
