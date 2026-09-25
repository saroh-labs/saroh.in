/**
 * What open orders hold against each shelf row's promised (#510, #511),
 * against a real Postgres (packages/database/src/backfill/held-stock.ts):
 *
 * - the seeds' hold (`holdOpenLines`): seeded open orders hold as the API's
 *   reserve would, closed ones hold nothing, what a row can sell stays the
 *   seeded number, and a cancel or a fulfilment afterwards moves exactly
 *   what was promised;
 * - the repair (`reconcileHeldStock`): a row whose lines hold more than it
 *   promised is capped oldest order first, the rest stop holding; a row
 *   promising more is only reported; a dry run writes nothing; a second run
 *   finds nothing;
 * - the #510 backfill runs the repair after linking lines, and reports it.
 */
import {
    backfillListingsStockLevels,
    heldStockMismatches,
    holdOpenLines,
    prisma,
    reconcileHeldStock,
} from "@saroh/database";

import { FeatureFlagService } from "../feature-flags/feature-flags.service";
import { OrdersService } from "../orders/orders.service";
import { StoresService } from "../stores/stores.service";

const tag = `${process.pid}-${Date.now()}`;
const at = (days: number) => new Date(Date.UTC(2026, 0, 1 + days));

const stores = new StoresService(new FeatureFlagService());
const orders = new OrdersService(stores);

let ownerId = "";
let orgId = "";
let hill = "";
let customerId = "";
let seq = 0;

beforeAll(async () => {
    ownerId = (
        await prisma.user.create({
            data: { email: `hs-owner-${tag}@example.com` },
        })
    ).id;
    orgId = (
        await prisma.organization.create({
            data: { name: "Northwind", slug: `hs-${tag}` },
        })
    ).id;
    hill = (
        await stores.createForUser(ownerId, orgId, {
            name: "Peenya",
            slug: `hs-peenya-${tag}`,
        })
    ).id;
    customerId = (
        await prisma.customer.create({
            data: {
                storeId: hill,
                organizationId: orgId,
                email: `hs-buyer-${tag}@example.com`,
            },
        })
    ).id;
});

async function product(name: string): Promise<string> {
    seq += 1;
    const p = await prisma.product.create({
        data: {
            organizationId: orgId,
            storeId: hill,
            name,
            slug: `hs-${seq}-${tag}`,
            price: "100.00",
            status: "PUBLISHED",
        },
    });
    await prisma.productListing.create({
        data: { organizationId: orgId, storeId: hill, productId: p.id },
    });
    return p.id;
}

/**
 * A shelf row as a seed writes it: numbers set directly, and its product
 * tracks stock, as the seeds' `setStockLevel` marks it (#515).
 */
async function row(
    productId: string,
    n: { onHand: number; promised?: number; variantId?: string },
): Promise<string> {
    await prisma.product.update({
        where: { id: productId },
        data: { stockTracked: true, stockTrackedAt: new Date() },
    });
    return (
        await prisma.stockLevel.create({
            data: {
                organizationId: orgId,
                storeId: hill,
                productId,
                variantId: n.variantId ?? null,
                onHand: n.onHand,
                promised: n.promised ?? 0,
            },
        })
    ).id;
}

/** An order written straight to the tables, as a seed or old code did. */
async function order(
    id: string,
    status: string,
    createdAt: Date,
    items: {
        productId: string;
        variantId?: string;
        quantity: number;
        stockRow?: "PRODUCT" | "VARIANT" | "NONE" | null;
        stockLevelId?: string | null;
        heldQuantity?: number;
    }[],
): Promise<string[]> {
    seq += 1;
    await prisma.order.create({
        data: {
            id,
            storeId: hill,
            organizationId: orgId,
            customerId,
            orderId: `HS-${seq}`,
            subtotal: "100.00",
            total: "100.00",
            status,
            createdAt,
        },
    });
    const ids: string[] = [];
    for (const [k, i] of items.entries()) {
        ids.push(
            (
                await prisma.orderItem.create({
                    data: {
                        id: `${id}-line-${k}`,
                        orderId: id,
                        productId: i.productId,
                        variantId: i.variantId ?? null,
                        quantity: i.quantity,
                        price: "100.00",
                        stockRow: i.stockRow ?? null,
                        stockLevelId: i.stockLevelId ?? null,
                        heldQuantity: i.heldQuantity ?? 0,
                    },
                })
            ).id,
        );
    }
    return ids;
}

const shelf = (id: string) =>
    prisma.stockLevel.findUniqueOrThrow({
        where: { id },
        select: { onHand: true, promised: true },
    });
const lineOf = (id: string) =>
    prisma.orderItem.findUniqueOrThrow({
        where: { id },
        select: { stockRow: true, stockLevelId: true, heldQuantity: true },
    });

describe("the seeds' hold (holdOpenLines)", () => {
    const prefix = `hs-seed-${tag}-`;
    const r: Record<string, string> = {};
    const l: Record<string, string[]> = {};
    let handOrderId = "";

    beforeAll(async () => {
        const mailer = await product("Kraft Mailer");
        const tape = await product("Packing Tape");
        const labels = await product("Labels (not counted)");
        const carton = await product("Carton");
        const cartonS = (
            await prisma.productVariant.create({
                data: { productId: carton, sku: `HS-CS-${tag}`, title: "S" },
            })
        ).id;
        r.mailer = await row(mailer, { onHand: 10 });
        r.tape = await row(tape, { onHand: 0 });
        r.cartonS = await row(carton, { onHand: 5, variantId: cartonS });
        // Track stock off (#515): its shelf, kept at 0 for the log, holds
        // nothing, as reserve would leave it.
        const stamps = await product("Stamps (tracking off)");
        r.stamps = (
            await prisma.stockLevel.create({
                data: {
                    organizationId: orgId,
                    storeId: hill,
                    productId: stamps,
                },
            })
        ).id;

        // Made in the workspace: the API holds 1 on the mailer.
        handOrderId = (
            await orders.create(hill, ownerId, {
                customerId,
                items: [{ productId: mailer, quantity: 1 }],
            })
        ).id;

        l.open = await order(`${prefix}open`, "PENDING", at(1), [
            { productId: mailer, quantity: 4 },
            { productId: tape, quantity: 3 },
            { productId: labels, quantity: 1 },
            { productId: stamps, quantity: 2 },
        ]);
        l.processing = await order(`${prefix}processing`, "PROCESSING", at(2), [
            { productId: mailer, quantity: 2 },
            { productId: carton, variantId: cartonS, quantity: 1 },
        ]);
        // Closed, with stale holds a backfill left.
        l.delivered = await order(`${prefix}delivered`, "DELIVERED", at(0), [
            {
                productId: mailer,
                quantity: 5,
                stockRow: "PRODUCT",
                stockLevelId: r.mailer,
                heldQuantity: 5,
            },
        ]);
        l.cancelled = await order(`${prefix}cancelled`, "CANCELLED", at(0), [
            {
                productId: tape,
                quantity: 2,
                stockRow: "PRODUCT",
                stockLevelId: r.tape,
                heldQuantity: 2,
            },
        ]);
    });

    it("holds each open line, clears closed ones and keeps what each row can sell", async () => {
        await holdOpenLines(prisma, {
            organizationId: orgId,
            orderIdPrefix: prefix,
        });

        // 1 by hand + 4 + 2; it could sell 9, it still can.
        expect(await shelf(r.mailer)).toEqual({ onHand: 16, promised: 7 });
        // Seeded sold out: still sold out, not short.
        expect(await shelf(r.tape)).toEqual({ onHand: 3, promised: 3 });
        expect(await shelf(r.cartonS)).toEqual({ onHand: 6, promised: 1 });

        expect(await lineOf(l.open[0])).toEqual({
            stockRow: "PRODUCT",
            stockLevelId: r.mailer,
            heldQuantity: 4,
        });
        expect(await lineOf(l.open[2])).toEqual({
            stockRow: "NONE",
            stockLevelId: null,
            heldQuantity: 0,
        });
        expect(await lineOf(l.open[3])).toEqual({
            stockRow: "NONE",
            stockLevelId: null,
            heldQuantity: 0,
        });
        expect(await shelf(r.stamps)).toEqual({ onHand: 0, promised: 0 });
        expect(await lineOf(l.processing[1])).toEqual({
            stockRow: "VARIANT",
            stockLevelId: r.cartonS,
            heldQuantity: 1,
        });
        expect((await lineOf(l.delivered[0])).heldQuantity).toBe(0);
        expect((await lineOf(l.cancelled[0])).heldQuantity).toBe(0);

        expect(await heldStockMismatches(prisma, [orgId])).toEqual({
            rows: [],
            lines: [],
        });
    });

    it("run again, changes nothing", async () => {
        const snapshot = async () => ({
            rows: await prisma.stockLevel.findMany({
                where: { organizationId: orgId },
                orderBy: { id: "asc" },
                select: { id: true, onHand: true, promised: true },
            }),
            lines: await prisma.orderItem.findMany({
                where: { order: { organizationId: orgId } },
                orderBy: { id: "asc" },
                select: {
                    id: true,
                    stockRow: true,
                    stockLevelId: true,
                    heldQuantity: true,
                },
            }),
        });
        const before = await snapshot();
        await holdOpenLines(prisma, {
            organizationId: orgId,
            orderIdPrefix: prefix,
        });
        expect(await snapshot()).toEqual(before);
    });

    it("a cancel gives back, and a fulfilment sells, exactly what was held", async () => {
        await orders.updateStatus(hill, `${prefix}open`, ownerId, {
            status: "CANCELLED",
        });
        expect(await shelf(r.mailer)).toEqual({ onHand: 16, promised: 3 });
        expect(await shelf(r.tape)).toEqual({ onHand: 3, promised: 0 });

        await orders.updateStatus(hill, `${prefix}processing`, ownerId, {
            status: "SHIPPED",
        });
        expect(await shelf(r.mailer)).toEqual({ onHand: 14, promised: 1 });
        expect(await shelf(r.cartonS)).toEqual({ onHand: 5, promised: 0 });

        await orders.updateStatus(hill, handOrderId, ownerId, {
            status: "CANCELLED",
        });
        expect(await shelf(r.mailer)).toEqual({ onHand: 14, promised: 0 });
        expect(await heldStockMismatches(prisma, [orgId])).toEqual({
            rows: [],
            lines: [],
        });
    });
});

describe("the repair (reconcileHeldStock)", () => {
    const r: Record<string, string> = {};
    const l: Record<string, string[]> = {};
    const p = `hs-fix-${tag}-`;

    beforeAll(async () => {
        const rope = await product("Rope");
        const gloves = await product("Gloves");
        // Promised 3, but the backfill gave three open lines 5 between them.
        r.rope = await row(rope, { onHand: 10, promised: 3 });
        // Promised 5, its one open line holds 2.
        r.gloves = await row(gloves, { onHand: 10, promised: 5 });
        const held = (productId: string, stockLevelId: string, q: number) => ({
            productId,
            quantity: q,
            stockRow: "PRODUCT" as const,
            stockLevelId,
            heldQuantity: q,
        });
        // Placed out of id order, so "oldest" is by when, not by id.
        l.third = await order(`${p}a`, "PENDING", at(30), [
            held(rope, r.rope, 1),
        ]);
        l.first = await order(`${p}c`, "PROCESSING", at(10), [
            held(rope, r.rope, 2),
        ]);
        l.second = await order(`${p}b`, "PENDING", at(20), [
            held(rope, r.rope, 2),
        ]);
        l.gloves = await order(`${p}d`, "PENDING", at(20), [
            held(gloves, r.gloves, 2),
        ]);
        l.delivered = await order(`${p}e`, "DELIVERED", at(5), [
            held(rope, r.rope, 1),
        ]);
    });

    it("a dry run reports what it would do and writes nothing", async () => {
        const before = await heldStockMismatches(prisma, [orgId]);
        const report = await reconcileHeldStock(prisma, {
            organizationIds: [orgId],
            dryRun: true,
        });
        expect(report.dryRun).toBe(true);
        expect(report.capped.map((c) => c.stockLevelId)).toEqual([r.rope]);
        expect(await heldStockMismatches(prisma, [orgId])).toEqual(before);
    });

    it("caps a row to what it promised, oldest order first; the rest stop holding", async () => {
        const report = await reconcileHeldStock(prisma, {
            organizationIds: [orgId],
        });
        expect(report.capped).toHaveLength(1);
        expect(report.capped[0]).toMatchObject({
            stockLevelId: r.rope,
            promised: 3,
            held: 5,
            lines: [
                { orderItemId: l.second[0], was: 2, now: 1, unheld: false },
                { orderItemId: l.third[0], was: 1, now: 0, unheld: true },
            ],
        });
        expect(report.promisedMore).toEqual([
            expect.objectContaining({
                stockLevelId: r.gloves,
                promised: 5,
                held: 2,
            }),
        ]);
        expect(report.strayLinesCleared).toEqual([
            expect.objectContaining({
                orderItemId: l.delivered[0],
                why: "closed",
                heldQuantity: 1,
            }),
        ]);

        expect(await lineOf(l.first[0])).toEqual({
            stockRow: "PRODUCT",
            stockLevelId: r.rope,
            heldQuantity: 2,
        });
        expect(await lineOf(l.second[0])).toMatchObject({ heldQuantity: 1 });
        expect(await lineOf(l.third[0])).toEqual({
            stockRow: "NONE",
            stockLevelId: null,
            heldQuantity: 0,
        });
        // Rows are never changed: only the gloves' promise is left over.
        expect(await shelf(r.rope)).toEqual({ onHand: 10, promised: 3 });
        expect(await shelf(r.gloves)).toEqual({ onHand: 10, promised: 5 });
        expect(
            (await heldStockMismatches(prisma, [orgId])).rows.map(
                (x) => x.stockLevelId,
            ),
        ).toEqual([r.gloves]);
    });

    it("run again, finds nothing more to change", async () => {
        const report = await reconcileHeldStock(prisma, {
            organizationIds: [orgId],
        });
        expect(report.capped).toEqual([]);
        expect(report.strayLinesCleared).toEqual([]);
        expect(report.promisedMore.map((x) => x.stockLevelId)).toEqual([
            r.gloves,
        ]);
    });

    it("afterwards a cancel or a fulfilment moves only what was promised", async () => {
        // Holds nothing now: cancelling gives nothing back.
        await orders.updateStatus(hill, `${p}a`, ownerId, {
            status: "CANCELLED",
        });
        expect(await shelf(r.rope)).toEqual({ onHand: 10, promised: 3 });
        await orders.updateStatus(hill, `${p}b`, ownerId, {
            status: "CANCELLED",
        });
        expect(await shelf(r.rope)).toEqual({ onHand: 10, promised: 2 });
        await orders.updateStatus(hill, `${p}c`, ownerId, {
            status: "SHIPPED",
        });
        expect(await shelf(r.rope)).toEqual({ onHand: 8, promised: 0 });
    });
});

describe("the repair and an order being changed", () => {
    it("waits for the order's lock, so a cancel never acts on a line it rewrote", async () => {
        const p = `hs-lock-${tag}-`;
        const cord = await product("Cord");
        // Promised 2; the older order holds 2, the newer one 3.
        const rowId = await row(cord, { onHand: 10, promised: 2 });
        const held = (q: number) => ({
            productId: cord,
            quantity: q,
            stockRow: "PRODUCT" as const,
            stockLevelId: rowId,
            heldQuantity: q,
        });
        const [older] = await order(`${p}a`, "PENDING", at(50), [held(2)]);
        const [newer] = await order(`${p}b`, "PENDING", at(60), [held(3)]);

        let locked!: () => void;
        const gotLock = new Promise<void>((r) => (locked = r));
        // A change to the newer order has its lock and has read its line.
        const change = prisma.$transaction(
            async (tx) => {
                await tx.$queryRaw`SELECT id FROM "Order" WHERE id = ${`${p}b`} FOR UPDATE`;
                locked();
                await new Promise((r) => setTimeout(r, 400));
                // Still what it read: the repair hasn't rewritten it.
                return (
                    await tx.orderItem.findUniqueOrThrow({
                        where: { id: newer },
                        select: { heldQuantity: true },
                    })
                ).heldQuantity;
            },
            { timeout: 10_000 },
        );
        await gotLock;
        const repair = reconcileHeldStock(prisma, {
            organizationIds: [orgId],
        });
        const [seen, report] = await Promise.all([change, repair]);
        expect(seen).toBe(3);
        expect(
            report.capped.find((c) => c.stockLevelId === rowId),
        ).toMatchObject({
            lines: [{ orderItemId: newer, was: 3, now: 0, unheld: true }],
        });
        expect(await lineOf(older)).toMatchObject({ heldQuantity: 2 });
        // A cancel now gives back only what the order still holds: none.
        await orders.updateStatus(hill, `${p}b`, ownerId, {
            status: "CANCELLED",
        });
        expect(await shelf(rowId)).toEqual({ onHand: 10, promised: 2 });
        await orders.updateStatus(hill, `${p}a`, ownerId, {
            status: "CANCELLED",
        });
        expect(await shelf(rowId)).toEqual({ onHand: 10, promised: 0 });
    });
});

describe("the #510 backfill reports and repairs held stock", () => {
    it("caps an open line the old counter never promised", async () => {
        const twine = await product("Twine");
        await prisma.inventory.create({
            data: {
                storeId: hill,
                organizationId: orgId,
                productId: twine,
                quantity: 6,
                reserved: 0,
            },
        });
        // Old shape: the line recorded its row kind, not the row.
        const [lineId] = await order(`hs-old-${tag}`, "PENDING", at(40), [
            { productId: twine, quantity: 4, stockRow: "PRODUCT" },
        ]);

        const report = await backfillListingsStockLevels(prisma);
        const twineRow = await prisma.stockLevel.findFirstOrThrow({
            where: { storeId: hill, productId: twine, variantId: null },
            select: { id: true, onHand: true, promised: true },
        });
        expect(twineRow).toMatchObject({ onHand: 6, promised: 0 });
        expect(
            report.heldStock?.capped.find(
                (c) => c.stockLevelId === twineRow.id,
            ),
        ).toMatchObject({
            promised: 0,
            held: 4,
            lines: [{ orderItemId: lineId, was: 4, now: 0, unheld: true }],
        });
        expect(await lineOf(lineId)).toEqual({
            stockRow: "NONE",
            stockLevelId: null,
            heldQuantity: 0,
        });

        const again = await backfillListingsStockLevels(prisma);
        expect(again.orderLines).toBe(0);
        expect(again.heldStock?.capped).toEqual([]);
    });
});
