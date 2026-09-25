import { Injectable, NotFoundException } from "@nestjs/common";
import type { StockCheckKind } from "@saroh/database";
import { prisma } from "@saroh/database";

import { IdempotencyService } from "../../common/idempotency/idempotency.service";
import type { OrganizationContext } from "../../common/types/organization-context";
import { RESERVING_STATUSES } from "../orders/order-inventory";
import type { ResolveCheckDto } from "./dto";
import type { StockReader } from "./stock-access";
import { stockReader, stockWriter } from "./stock-access";
import { COUNT_DIDNT_MATCH, shortBy } from "./stock-words";
import { COUNTING_ROWS } from "./tracking";

/**
 * Stock checks (#514): what the Stock screen asks someone to look at.
 * Computed when read, from the shelves, the log and the order lines:
 *
 * - SHORT — a shelf holds fewer than it has promised ("2 short").
 * - COUNT_MISMATCH — a count made against a number the shelf no longer had
 *   ("Count didn't match"), until it is undone.
 * - SALE_NOT_TAKEN — an order line fulfilled at a storefront that counts
 *   the product, after it started counting there, that took nothing from
 *   the shelf (it was placed while the product counted no stock).
 * - PROMISED_MISMATCH — a shelf's promised is not the sum of what its open
 *   order lines hold.
 *
 * Resolving one records what it read (its fingerprint) in
 * StockCheckResolution; it stays hidden while that still holds, and opens
 * again when its numbers move on.
 */

/** Fulfilled orders: their lines have left the shelf, or should have. */
const FULFILLED_STATUSES = ["SHIPPED", "DELIVERED"] as const;

/** How many fulfilled untracked lines one read looks through. */
const SALE_LINES_LIMIT = 500;

export interface StockCheck {
    /** Names the check: "short:<stockLevelId>", "count:<entryId>", … */
    key: string;
    kind: StockCheckKind;
    title: string;
    detail: string;
    storeId: string;
    storeName: string;
    productId: string;
    productName: string;
    variantId: string | null;
    variantTitle: string | null;
    stockLevelId: string | null;
    /** The count entry a COUNT_MISMATCH is about. */
    entryId: string | null;
    /** The numbers behind it, for the screen's own layout. */
    numbers: Record<string, number>;
    /** The order behind it — only for a role that reads orders. */
    order: { id: string; number: string } | null;
    at: Date | null;
}

export interface StockChecksView {
    checks: StockCheck[];
    counts: Record<StockCheckKind, number>;
    /** May resolve them (count and move stock). */
    canResolve: boolean;
}

interface Found extends StockCheck {
    fingerprint: string;
}

const plural = (n: number, one: string, many = `${one}s`) =>
    `${n} ${n === 1 ? one : many}`;

@Injectable()
export class StockChecksService {
    constructor(private readonly idempotency: IdempotencyService) {}

    async list(ctx: OrganizationContext): Promise<StockChecksView> {
        const reader = stockReader(ctx);
        const open = await this.open(reader);
        const counts: Record<StockCheckKind, number> = {
            SHORT: 0,
            COUNT_MISMATCH: 0,
            SALE_NOT_TAKEN: 0,
            PROMISED_MISMATCH: 0,
        };
        for (const c of open) counts[c.kind] += 1;
        return {
            checks: open.map(({ fingerprint: _f, ...check }) => check),
            counts,
            canResolve: reader.canWrite,
        };
    }

    /**
     * Mark a check looked at. A check of another business, or none open
     * under that key, is not found; resolving one already resolved answers
     * the same.
     */
    async resolve(
        ctx: OrganizationContext,
        key: string,
        dto: ResolveCheckDto,
    ): Promise<{ key: string; kind: StockCheckKind; resolvedAt: Date }> {
        const actor = stockWriter(ctx);
        const { idempotencyKey, ...request } = dto;
        return this.idempotency.run(
            {
                scope: `stock.checks.resolve.${actor.organizationId}`,
                key: idempotencyKey,
                actorUserId: actor.userId ?? "",
                organizationId: actor.organizationId,
            },
            { key, ...request },
            async () => {
                const reader = stockReader(ctx);
                const all = await this.found(reader);
                const check = all.find((c) => c.key === key);
                if (!check)
                    throw new NotFoundException("Stock check not found");
                const data = {
                    kind: check.kind,
                    fingerprint: check.fingerprint,
                    stockLevelId: check.stockLevelId,
                    resolvedByUserId: actor.userId,
                    note: dto.note ?? null,
                    resolvedAt: new Date(),
                };
                const saved = await prisma.stockCheckResolution.upsert({
                    where: {
                        organizationId_key: {
                            organizationId: actor.organizationId,
                            key,
                        },
                    },
                    create: {
                        organizationId: actor.organizationId,
                        key,
                        ...data,
                    },
                    update: data,
                    select: { key: true, kind: true, resolvedAt: true },
                });
                return saved;
            },
        );
    }

    /** The checks nobody has resolved as they stand now. */
    private async open(reader: StockReader): Promise<Found[]> {
        const [all, resolutions] = await Promise.all([
            this.found(reader),
            prisma.stockCheckResolution.findMany({
                where: { organizationId: reader.organizationId },
                select: { key: true, fingerprint: true },
            }),
        ]);
        const resolved = new Map(
            resolutions.map((r) => [r.key, r.fingerprint]),
        );
        return all.filter((c) => resolved.get(c.key) !== c.fingerprint);
    }

    /** Every check, resolved or not. */
    private async found(reader: StockReader): Promise<Found[]> {
        const [shelves, counts, sales] = await Promise.all([
            this.shelfChecks(reader),
            this.countChecks(reader),
            this.saleChecks(reader),
        ]);
        return [...shelves, ...counts, ...sales];
    }

    /** SHORT and PROMISED_MISMATCH: each shelf against its open lines. */
    private async shelfChecks(reader: StockReader): Promise<Found[]> {
        const { organizationId } = reader;
        const [rows, held] = await Promise.all([
            prisma.stockLevel.findMany({
                where: { organizationId, store: { deletedAt: null } },
                select: {
                    id: true,
                    storeId: true,
                    productId: true,
                    variantId: true,
                    onHand: true,
                    promised: true,
                    updatedAt: true,
                    store: { select: { name: true } },
                    product: { select: { name: true } },
                    variant: { select: { title: true } },
                },
                orderBy: { id: "asc" },
            }),
            prisma.orderItem.groupBy({
                by: ["stockLevelId"],
                where: {
                    stockLevelId: { not: null },
                    order: {
                        organizationId,
                        status: { in: [...RESERVING_STATUSES] },
                    },
                },
                _sum: { heldQuantity: true },
                orderBy: { stockLevelId: "asc" },
            }),
        ]);
        const heldBy = new Map(
            held.map((h) => [h.stockLevelId, h._sum.heldQuantity ?? 0]),
        );
        const out: Found[] = [];
        for (const row of rows) {
            const where = {
                storeId: row.storeId,
                storeName: row.store.name,
                productId: row.productId,
                productName: row.product.name,
                variantId: row.variantId,
                variantTitle: row.variant?.title ?? null,
                stockLevelId: row.id,
                entryId: null,
                order: null,
                at: row.updatedAt,
            };
            const short = shortBy(row);
            if (short > 0) {
                out.push({
                    ...where,
                    key: `short:${row.id}`,
                    kind: "SHORT",
                    title: `${short} short`,
                    detail: `${plural(row.promised, "unit")} promised to orders, ${row.onHand} on hand at ${row.store.name}.`,
                    numbers: {
                        onHand: row.onHand,
                        promised: row.promised,
                        short,
                    },
                    fingerprint: `${row.onHand}:${row.promised}`,
                });
            }
            const holds = heldBy.get(row.id) ?? 0;
            if (holds !== row.promised) {
                out.push({
                    ...where,
                    key: `promised:${row.id}`,
                    kind: "PROMISED_MISMATCH",
                    title: "Promised doesn't add up",
                    detail: `Shows ${row.promised} promised at ${row.store.name}; open orders hold ${holds}.`,
                    numbers: { promised: row.promised, held: holds },
                    fingerprint: `${row.promised}:${holds}`,
                });
            }
        }
        return out;
    }

    /** COUNT_MISMATCH: counts against a moved shelf, not undone. */
    private async countChecks(reader: StockReader): Promise<Found[]> {
        const { organizationId } = reader;
        const ids = await prisma.$queryRaw<{ id: string }[]>`
            SELECT e."id" FROM "StockEntry" e
            WHERE e."organizationId" = ${organizationId}
              AND e."kind" = 'COUNTED'
              AND e."expected" IS NOT NULL
              AND e."expected" <> e."before"
              AND NOT EXISTS (
                SELECT 1 FROM "StockEntry" r WHERE r."reversesId" = e."id"
              )`;
        if (ids.length === 0) return [];
        const entries = await prisma.stockEntry.findMany({
            where: {
                id: { in: ids.map((r) => r.id) },
                organizationId,
                store: { deletedAt: null },
            },
            orderBy: [{ createdAt: "desc" }, { id: "desc" }],
            include: {
                store: { select: { name: true } },
                product: { select: { name: true } },
                variant: { select: { title: true } },
            },
        });
        return entries.map((e) => {
            const shown = e.expected ?? 0;
            return {
                key: `count:${e.id}`,
                kind: "COUNT_MISMATCH" as const,
                title: COUNT_DIDNT_MATCH,
                detail: `Counted ${e.counted ?? e.after} at ${e.store.name} against ${shown} shown; the log said ${e.before}.`,
                storeId: e.storeId,
                storeName: e.store.name,
                productId: e.productId,
                productName: e.product.name,
                variantId: e.variantId,
                variantTitle: e.variant?.title ?? null,
                stockLevelId: e.stockLevelId,
                entryId: e.id,
                numbers: {
                    expected: shown,
                    before: e.before,
                    counted: e.counted ?? e.after,
                },
                order: null,
                at: e.createdAt,
                fingerprint: "count",
            };
        });
    }

    /**
     * SALE_NOT_TAKEN: fulfilled lines that hold no shelf, at a storefront
     * that counts the product — Track stock on for it and the business —
     * fulfilled after it started counting there (its first entry, or Track
     * stock last going on), so the sale should have come off the shelf.
     */
    private async saleChecks(reader: StockReader): Promise<Found[]> {
        const { organizationId } = reader;
        const lines = await prisma.orderItem.findMany({
            where: {
                stockLevelId: null,
                OR: [{ stockRow: "NONE" }, { stockRow: null }],
                order: {
                    organizationId,
                    status: { in: [...FULFILLED_STATUSES] },
                    store: { deletedAt: null },
                },
            },
            orderBy: [{ order: { updatedAt: "desc" } }, { id: "asc" }],
            take: SALE_LINES_LIMIT,
            select: {
                id: true,
                productId: true,
                variantId: true,
                quantity: true,
                product: { select: { name: true } },
                variant: { select: { title: true } },
                order: {
                    select: {
                        id: true,
                        orderId: true,
                        storeId: true,
                        updatedAt: true,
                        store: { select: { name: true } },
                    },
                },
            },
        });
        if (lines.length === 0) return [];
        const shelves = await prisma.stockLevel.findMany({
            where: {
                organizationId,
                productId: {
                    in: Array.from(new Set(lines.map((l) => l.productId))),
                },
                // Only products that count stock now (#515).
                ...COUNTING_ROWS,
            },
            select: {
                id: true,
                storeId: true,
                productId: true,
                variantId: true,
                product: { select: { stockTrackedAt: true } },
                entries: {
                    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
                    take: 1,
                    select: { createdAt: true },
                },
            },
        });
        const out: Found[] = [];
        for (const line of lines) {
            const here = shelves.filter(
                (s) =>
                    s.productId === line.productId &&
                    s.storeId === line.order.storeId,
            );
            const perVariant = here.some((s) => s.variantId !== null);
            const shelf = here.find((s) =>
                perVariant && line.variantId
                    ? s.variantId === line.variantId
                    : s.variantId === null,
            );
            const firstEntry = shelf?.entries[0]?.createdAt;
            // Counting since the later of its first entry and Track stock
            // last going on: a sale while it was off isn't a missed one.
            const trackedAt = shelf?.product.stockTrackedAt;
            const since =
                firstEntry && trackedAt && trackedAt > firstEntry
                    ? trackedAt
                    : firstEntry;
            if (!shelf || !since || line.order.updatedAt < since) continue;
            const orderWords = reader.seesOrders
                ? `Order ${line.order.orderId}`
                : "An order";
            out.push({
                key: `sale:${line.id}`,
                kind: "SALE_NOT_TAKEN",
                title: "Sale not taken from stock",
                detail: `${orderWords} sold ${line.quantity} at ${line.order.store.name} without taking ${line.quantity === 1 ? "it" : "them"} off the shelf.`,
                storeId: line.order.storeId,
                storeName: line.order.store.name,
                productId: line.productId,
                productName: line.product.name,
                variantId: line.variantId,
                variantTitle: line.variant?.title ?? null,
                stockLevelId: shelf.id,
                entryId: null,
                numbers: { quantity: line.quantity },
                order: reader.seesOrders
                    ? { id: line.order.id, number: line.order.orderId }
                    : null,
                at: line.order.updatedAt,
                fingerprint: "sale",
            });
        }
        return out;
    }
}
