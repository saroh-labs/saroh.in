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
    StockEntryDto,
} from "./dto";
import { stockWriter } from "./stock-access";
import { movable } from "./stock-words";
import type { ShelfView, StockActor, StockEntryView } from "./stock.service";
import { adjust, countAll, move, returnByHand, reverse } from "./stock.service";

/**
 * The Stock API's writes (#514): count, record an entry, add (+N), move,
 * undo. Each runs the stock module's rules in one transaction, for a caller
 * who may count and move stock, and applies once per idempotency key — a
 * retried tap replays the first answer.
 *
 * A product that counts no stock anywhere is refused: starting to count it
 * is "Track stock", which changes how it sells (`store:write`, U6), not a
 * count.
 */

export const UNTRACKED =
    "This product doesn't track stock. Turn on Track stock to count it.";

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

/** The product is this business's and counts stock somewhere. */
async function assertTracked(
    tx: Tx,
    organizationId: string,
    productId: string,
): Promise<void> {
    const product = await tx.product.findFirst({
        where: { id: productId, organizationId },
        select: { _count: { select: { stockLevels: true } } },
    });
    if (!product) throw new NotFoundException("Product not found");
    if (product._count.stockLevels === 0) {
        throw new ConflictException(UNTRACKED);
    }
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
    counts(ctx: OrganizationContext, dto: CountStockDto): Promise<CountSaved> {
        const actor = stockWriter(ctx);
        return this.once("counts", actor, dto, async (tx) => {
            for (const productId of new Set(
                dto.counts.map((c) => c.productId),
            )) {
                await assertTracked(tx, actor.organizationId, productId);
            }
            const results = await countAll(
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

    /** Received, baked, wasted, or returned by a customer. */
    entries(
        ctx: OrganizationContext,
        dto: StockEntryDto,
    ): Promise<{ entry: StockEntryView; shelf: ShelfAfter }> {
        const actor = stockWriter(ctx);
        return this.once("entries", actor, dto, async (tx) => {
            await assertTracked(tx, actor.organizationId, dto.productId);
            const target = {
                storeId: dto.storeId,
                productId: dto.productId,
                variantId: dto.variantId ?? null,
            };
            const result =
                dto.kind === "RETURNED"
                    ? await returnByHand(tx, actor, {
                          target,
                          units: dto.units,
                          orderId: dto.orderId ?? null,
                          note: dto.note ?? null,
                      })
                    : await adjust(tx, actor, {
                          target,
                          kind: dto.kind,
                          units: dto.units,
                          note: dto.note ?? null,
                      });
            return { entry: result.entry, shelf: after(result.shelf) };
        });
    }

    /** "+N · Add": units received at a shelf. */
    adjust(
        ctx: OrganizationContext,
        dto: AdjustStockDto,
    ): Promise<{ entry: StockEntryView; shelf: ShelfAfter }> {
        const actor = stockWriter(ctx);
        return this.once("adjust", actor, dto, async (tx) => {
            await assertTracked(tx, actor.organizationId, dto.productId);
            const result = await adjust(tx, actor, {
                target: {
                    storeId: dto.storeId,
                    productId: dto.productId,
                    variantId: dto.variantId ?? null,
                },
                kind: "RECEIVED",
                units: dto.units,
                note: dto.note ?? null,
            });
            return { entry: result.entry, shelf: after(result.shelf) };
        });
    }

    /** Move units not promised from one storefront to another. */
    move(
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
            await assertTracked(tx, actor.organizationId, dto.productId);
            // The storefront it goes to must be this business's too.
            const to = await tx.store.count({
                where: {
                    id: dto.toStoreId,
                    organizationId: actor.organizationId,
                },
            });
            if (to === 0) throw new NotFoundException("Store not found");
            const moved = await move(tx, actor, {
                from: {
                    storeId: dto.fromStoreId,
                    productId: dto.productId,
                    variantId: dto.variantId ?? null,
                },
                toStoreId: dto.toStoreId,
                units: dto.units,
                note: dto.note ?? null,
            });
            return { ...moved, entryIds: [moved.out.id, moved.in.id] };
        });
    }

    /** Undo hand-made changes, all or none. */
    reverse(
        ctx: OrganizationContext,
        dto: ReverseStockDto,
    ): Promise<{ entries: StockEntryView[]; entryIds: string[] }> {
        const actor = stockWriter(ctx);
        return this.once("reverse", actor, dto, async (tx) => {
            const entries = await reverse(tx, actor, {
                entryIds: dto.entryIds,
                note: dto.note ?? null,
            });
            return { entries, entryIds: entries.map((e) => e.id) };
        });
    }
}
