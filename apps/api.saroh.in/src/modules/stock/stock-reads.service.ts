import { Injectable, NotFoundException } from "@nestjs/common";
import type { Prisma, StockEntryKind } from "@saroh/database";
import { prisma } from "@saroh/database";

import type { OrganizationContext } from "../../common/types/organization-context";
import { businessTimezone } from "../bookings/staff-availability";
import type { StockLevelsQueryDto, StockLogQueryDto } from "./dto";
import type { StockLevelsView } from "./levels-read";
import { readLevels } from "./levels-read";
import { stockReader } from "./stock-access";
import {
    canUndoEntry,
    countMismatched,
    STOCK_ENTRY_WORDS,
} from "./stock-words";

export { openStorefronts } from "./levels-read";
export type {
    LastChange,
    StockCell,
    StockLevelRow,
    StockLevelsView,
} from "./levels-read";

/**
 * What the Stock screen, the quick look and the product page read (#514):
 * the levels — a row per product (or per variant) with a cell per
 * storefront — and the log. Every number comes from StockLevel and
 * StockEntry; the screens only turn them into words (`lib/stock/levels.ts`).
 */

export interface StockLogEntry {
    id: string;
    kind: StockEntryKind;
    word: string;
    quantity: number;
    before: number;
    after: number;
    expected: number | null;
    counted: number | null;
    /** A count against a number the shelf no longer had. */
    mismatch: boolean;
    storeId: string;
    storeName: string;
    productId: string;
    productName: string;
    variantId: string | null;
    variantTitle: string | null;
    pairId: string | null;
    reversesId: string | null;
    /** An Undo has taken it back. */
    undone: boolean;
    /** This caller can Undo it now. */
    canUndo: boolean;
    note: string | null;
    createdAt: Date;
    /** Who made it — only for a role that reads the audit trail. */
    by: { id: string; name: string } | null;
    /** The order behind it — only for a role that reads orders. */
    order: { id: string; number: string } | null;
}

export interface StockLogView {
    entries: StockLogEntry[];
    /** Pass as `cursor` for the next page; null on the last. */
    nextCursor: string | null;
    seesPeople: boolean;
    seesOrders: boolean;
    /** The business's zone, for the log's days and times. */
    timezone: string;
}

const DEFAULT_LOG_PAGE = 50;

@Injectable()
export class StockReadsService {
    /**
     * Stock levels: every product that counts stock, a row per variant when
     * it counts per variant, a cell per open storefront — a page at a time
     * when `limit` is given (`levels-read.ts`).
     */
    levels(
        ctx: OrganizationContext,
        query: StockLevelsQueryDto,
    ): Promise<StockLevelsView> {
        return readLevels(stockReader(ctx), query);
    }

    /**
     * The stock log, newest first: by kind, storefront, product or variant,
     * a page at a time. Names only for a role that reads the audit trail;
     * order links only for one that reads orders.
     */
    async log(
        ctx: OrganizationContext,
        query: StockLogQueryDto,
    ): Promise<StockLogView> {
        const reader = stockReader(ctx);
        const { organizationId } = reader;
        await this.assertFilters(organizationId, query);
        const where: Prisma.StockEntryWhereInput = {
            organizationId,
            ...(query.kind?.length ? { kind: { in: query.kind } } : {}),
            ...(query.storefront ? { storeId: query.storefront } : {}),
            ...(query.product ? { productId: query.product } : {}),
            ...(query.variant ? { variantId: query.variant } : {}),
        };
        const take = query.limit ?? DEFAULT_LOG_PAGE;
        const page = await prisma.stockEntry.findMany({
            where,
            orderBy: [{ createdAt: "desc" }, { id: "desc" }],
            take: take + 1,
            ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
            include: {
                store: { select: { name: true } },
                product: { select: { name: true } },
                variant: { select: { title: true } },
                order: { select: { id: true, orderId: true } },
                reversedBy: { select: { id: true } },
            },
        });
        const more = page.length > take;
        const entries = more ? page.slice(0, take) : page;

        const people = new Map<string, string>();
        if (reader.seesPeople) {
            const ids = Array.from(
                new Set(entries.flatMap((e) => e.actorUserId ?? [])),
            );
            const users = ids.length
                ? await prisma.user.findMany({
                      where: { id: { in: ids } },
                      select: { id: true, name: true, email: true },
                  })
                : [];
            for (const u of users)
                people.set(u.id, u.name?.trim() ? u.name : u.email);
        }

        return {
            entries: entries.map((e): StockLogEntry => {
                const undone = e.reversedBy !== null;
                const name = e.actorUserId ? people.get(e.actorUserId) : null;
                return {
                    id: e.id,
                    kind: e.kind,
                    word: STOCK_ENTRY_WORDS[e.kind],
                    quantity: e.quantity,
                    before: e.before,
                    after: e.after,
                    expected: e.expected,
                    counted: e.counted,
                    mismatch:
                        e.kind === "COUNTED" &&
                        countMismatched(e.expected, e.before),
                    storeId: e.storeId,
                    storeName: e.store.name,
                    productId: e.productId,
                    productName: e.product.name,
                    variantId: e.variantId,
                    variantTitle: e.variant?.title ?? null,
                    pairId: e.pairId,
                    reversesId: e.reversesId,
                    undone,
                    canUndo: reader.canWrite && canUndoEntry(e) && !undone,
                    note: e.note,
                    createdAt: e.createdAt,
                    by:
                        e.actorUserId && name
                            ? { id: e.actorUserId, name }
                            : null,
                    order:
                        reader.seesOrders && e.order
                            ? { id: e.order.id, number: e.order.orderId }
                            : null,
                };
            }),
            nextCursor: more ? entries[entries.length - 1].id : null,
            seesPeople: reader.seesPeople,
            seesOrders: reader.seesOrders,
            timezone: await businessTimezone(prisma, organizationId),
        };
    }

    /** Every id a filter names must be this business's. */
    private async assertFilters(
        organizationId: string,
        query: StockLogQueryDto,
    ): Promise<void> {
        const [store, product, variant, cursor] = await Promise.all([
            query.storefront
                ? prisma.store.count({
                      where: { id: query.storefront, organizationId },
                  })
                : 1,
            query.product
                ? prisma.product.count({
                      where: { id: query.product, organizationId },
                  })
                : 1,
            query.variant
                ? prisma.productVariant.count({
                      where: { id: query.variant, product: { organizationId } },
                  })
                : 1,
            query.cursor
                ? prisma.stockEntry.count({
                      where: { id: query.cursor, organizationId },
                  })
                : 1,
        ]);
        if (store === 0) throw new NotFoundException("Store not found");
        if (product === 0) throw new NotFoundException("Product not found");
        if (variant === 0) throw new NotFoundException("Variant not found");
        if (cursor === 0) throw new NotFoundException("Stock change not found");
    }
}
