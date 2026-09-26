import {
    ConflictException,
    Injectable,
    NotFoundException,
} from "@nestjs/common";
import type { Prisma } from "@saroh/database";
import { prisma } from "@saroh/database";

import { IdempotencyService } from "../../common/idempotency/idempotency.service";
import type { OrganizationContext } from "../../common/types/organization-context";
import type {
    AdjustStockDto,
    CountStockDto,
    MoveStockDto,
    ReverseStockDto,
    SetWarningsDto,
    StockEntryDto,
} from "./dto";
import { stockWriter } from "./stock-access";
import { BUSINESS_UNTRACKED, movable, UNTRACKED } from "./stock-words";
import type { ShelfView, StockActor, StockEntryView } from "./stock.service";
import {
    adjust,
    countAll,
    move,
    returnByHand,
    reverse,
    setWarnings,
} from "./stock.service";
import { businessTracksStock } from "./tracking";

/**
 * The Stock API's writes (#514): count, record an entry, add (+N), move,
 * undo. Each runs the stock module's rules in one transaction, for a caller
 * who may count and move stock, and applies once per idempotency key — a
 * retried tap replays the first answer.
 *
 * A product that doesn't track stock (its own switch, or the business's) is
 * refused: starting to count it is "Track stock", which changes how it
 * sells (`store:write`, #515 — `tracking.ts`), not a count.
 */

export { UNTRACKED } from "./stock-words";

type Tx = Prisma.TransactionClient;

export interface ShelfAfter extends ShelfView {
    /** What the shop can sell there now. */
    canSell: number;
}

export interface CountSaved {
    /** Shelves counted. */
    counted: number;
    /** Of those, how many the count changed. */
    changed: number;
    /** Counts made against a number the shelf no longer had. */
    mismatched: number;
    /** What Undo sends back. */
    entryIds: string[];
    results: {
        entry: StockEntryView;
        shelf: ShelfAfter;
        mismatch: boolean;
    }[];
}

function after(shelf: ShelfView): ShelfAfter {
    return { ...shelf, canSell: movable(shelf) };
}

/** The product is this business's and counts stock (#515). */
async function assertTracked(
    tx: Tx,
    organizationId: string,
    productId: string,
): Promise<void> {
    const product = await tx.product.findFirst({
        where: { id: productId, organizationId },
        select: { stockTracked: true },
    });
    if (!product) throw new NotFoundException("Product not found");
    if (!(await businessTracksStock(tx, organizationId))) {
        throw new ConflictException(BUSINESS_UNTRACKED);
    }
    if (!product.stockTracked) throw new ConflictException(UNTRACKED);
}

/**
 * Run a stock change on products that count stock: checked before (so a
 * product with no shelf is never started by a count) and again after the
 * change has taken its row locks — Track stock going off takes the same
 * locks, so if it won the race the change is refused and rolled back.
 */
async function whileTracked<T>(
    tx: Tx,
    organizationId: string,
    productIds: Iterable<string>,
    change: () => Promise<T>,
): Promise<T> {
    const ids = Array.from(new Set(productIds));
    for (const id of ids) await assertTracked(tx, organizationId, id);
    const result = await change();
    for (const id of ids) await assertTracked(tx, organizationId, id);
    return result;
}

@Injectable()
export class StockWritesService {
    constructor(private readonly idempotency: IdempotencyService) {}

    /** Run `operation` once per key, in one transaction, as `actor`. */
    private once<T>(
        name: string,
        actor: StockActor,
        dto: { idempotencyKey?: string },
        operation: (tx: Tx) => Promise<T>,
    ): Promise<T> {
        const { idempotencyKey, ...request } = dto;
        return this.idempotency.run(
            {
                scope: `stock.${name}.${actor.organizationId}`,
                key: idempotencyKey,
                actorUserId: actor.userId ?? "",
                organizationId: actor.organizationId,
            },
            request,
            () => prisma.$transaction(operation),
        );
    }

    /** Count shelves: "Count saved: N counted, N changed." */
    async counts(
        ctx: OrganizationContext,
        dto: CountStockDto,
    ): Promise<CountSaved> {
        const actor = stockWriter(ctx);
        return this.once("counts", actor, dto, async (tx) => {
            const results = await whileTracked(
                tx,
                actor.organizationId,
                dto.counts.map((c) => c.productId),
                () =>
                    countAll(
                        tx,
                        actor,
                        dto.counts.map((c) => ({
                            target: {
                                storeId: c.storeId,
                                productId: c.productId,
                                variantId: c.variantId ?? null,
                            },
                            counted: c.counted,
                            expected: c.expected ?? null,
                            note: dto.note ?? null,
                        })),
                    ),
            );
            return {
                counted: results.length,
                changed: results.filter((r) => r.entry.quantity !== 0).length,
                mismatched: results.filter((r) => r.mismatch).length,
                entryIds: results.map((r) => r.entry.id),
                results: results.map((r) => ({
                    entry: r.entry,
                    shelf: after(r.shelf),
                    mismatch: r.mismatch,
                })),
            };
        });
    }

    /**
     * When shelves warn, and nothing else: what is on them is left as it
     * is, and the log gets no entry — a warning level isn't stock.
     */
    async warnings(
        ctx: OrganizationContext,
        dto: SetWarningsDto,
    ): Promise<{ shelves: ShelfAfter[] }> {
        const actor = stockWriter(ctx);
        return this.once("warnings", actor, dto, async (tx) => {
            const shelves = await whileTracked(
                tx,
                actor.organizationId,
                dto.warnings.map((w) => w.productId),
                () =>
                    setWarnings(
                        tx,
                        actor,
                        dto.warnings.map((w) => ({
                            target: {
                                storeId: w.storeId,
                                productId: w.productId,
                                variantId: w.variantId ?? null,
                            },
                            lowStockAlert: w.lowStockAlert,
                        })),
                    ),
            );
            return { shelves: shelves.map(after) };
        });
    }

    /** Received, baked, wasted, or returned by a customer. */
    async entries(
        ctx: OrganizationContext,
        dto: StockEntryDto,
    ): Promise<{ entry: StockEntryView; shelf: ShelfAfter }> {
        const actor = stockWriter(ctx);
        return this.once("entries", actor, dto, async (tx) => {
            const target = {
                storeId: dto.storeId,
                productId: dto.productId,
                variantId: dto.variantId ?? null,
            };
            const result = await whileTracked(
                tx,
                actor.organizationId,
                [dto.productId],
                () =>
                    dto.kind === "RETURNED"
                        ? returnByHand(tx, actor, {
                              target,
                              units: dto.units,
                              orderId: dto.orderId ?? null,
                              note: dto.note ?? null,
                          })
                        : adjust(tx, actor, {
                              target,
                              kind: dto.kind,
                              units: dto.units,
                              note: dto.note ?? null,
                          }),
            );
            return { entry: result.entry, shelf: after(result.shelf) };
        });
    }

    /** "+N · Add": units received at a shelf. */
    async adjust(
        ctx: OrganizationContext,
        dto: AdjustStockDto,
    ): Promise<{ entry: StockEntryView; shelf: ShelfAfter }> {
        const actor = stockWriter(ctx);
        return this.once("adjust", actor, dto, async (tx) => {
            const result = await whileTracked(
                tx,
                actor.organizationId,
                [dto.productId],
                () =>
                    adjust(tx, actor, {
                        target: {
                            storeId: dto.storeId,
                            productId: dto.productId,
                            variantId: dto.variantId ?? null,
                        },
                        kind: "RECEIVED",
                        units: dto.units,
                        note: dto.note ?? null,
                    }),
            );
            return { entry: result.entry, shelf: after(result.shelf) };
        });
    }

    /** Move units not promised from one storefront to another. */
    async move(
        ctx: OrganizationContext,
        dto: MoveStockDto,
    ): Promise<{
        pairId: string;
        out: StockEntryView;
        in: StockEntryView;
        entryIds: string[];
    }> {
        const actor = stockWriter(ctx);
        return this.once("moves", actor, dto, async (tx) => {
            // The storefront it goes to must be this business's too.
            const to = await tx.store.count({
                where: {
                    id: dto.toStoreId,
                    organizationId: actor.organizationId,
                },
            });
            if (to === 0) throw new NotFoundException("Store not found");
            const moved = await whileTracked(
                tx,
                actor.organizationId,
                [dto.productId],
                () =>
                    move(tx, actor, {
                        from: {
                            storeId: dto.fromStoreId,
                            productId: dto.productId,
                            variantId: dto.variantId ?? null,
                        },
                        toStoreId: dto.toStoreId,
                        units: dto.units,
                        note: dto.note ?? null,
                    }),
            );
            return { ...moved, entryIds: [moved.out.id, moved.in.id] };
        });
    }

    /** Undo hand-made changes, all or none. */
    async reverse(
        ctx: OrganizationContext,
        dto: ReverseStockDto,
    ): Promise<{ entries: StockEntryView[]; entryIds: string[] }> {
        const actor = stockWriter(ctx);
        return this.once("reverse", actor, dto, async (tx) => {
            // Undoing puts units back on a shelf: only one that counts.
            const undoing = await tx.stockEntry.findMany({
                where: {
                    id: { in: dto.entryIds },
                    organizationId: actor.organizationId,
                },
                select: { productId: true },
            });
            const entries = await whileTracked(
                tx,
                actor.organizationId,
                undoing.map((e) => e.productId),
                () =>
                    reverse(tx, actor, {
                        entryIds: dto.entryIds,
                        note: dto.note ?? null,
                    }),
            );
            return { entries, entryIds: entries.map((e) => e.id) };
        });
    }
}
