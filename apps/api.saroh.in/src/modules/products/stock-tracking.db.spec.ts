/**
 * Track stock on and off (#515), against a real Postgres: a product and the
 * whole business stop counting stock and start again from 0, turning off is
 * refused while anything is promised and counts every shelf to 0 so the log
 * still adds up, a hold never lands on a shelf that just stopped counting,
 * untracked products sell without limit and write nothing, and only someone
 * who can change products may flip the switch.
 *
 * After every test the invariant holds: each row's promised is the sum of
 * its lines' heldQuantity, and each row's log adds up to what is on hand.
 */
jest.mock("../../common/guards/better-auth.guard", () => ({
    BetterAuthGuard: class BetterAuthGuard {},
}));

import {
    ConflictException,
    ForbiddenException,
    NotFoundException,
} from "@nestjs/common";
import { prisma } from "@saroh/database";

import { IdempotencyService } from "../../common/idempotency/idempotency.service";
import type { OrganizationContext } from "../../common/types/organization-context";
import type { FeatureFlagService } from "../feature-flags/feature-flags.service";
import { OrdersService } from "../orders/orders.service";
import { resolveCapabilities } from "../organizations/organization-policy";
import { holdLines, uncommitLines } from "../stock/reserve";
import { StockChecksService } from "../stock/stock-checks.service";
import { StockReadsService } from "../stock/stock-reads.service";
import { StockTrackingService } from "../stock/stock-tracking.service";
import {
    BUSINESS_UNTRACKED,
    COUNTS_AS_A_WHOLE,
    COUNTS_PER_VARIANT,
    SYSTEM_CANT_UNDO,
    TRACKING_OFF_NOTE,
} from "../stock/stock-words";
import { StockWritesService, UNTRACKED } from "../stock/stock-writes.service";
import { count } from "../stock/stock.service";
import { setProductTracking } from "../stock/tracking";
import { StoresService } from "../stores/stores.service";
import { InventoryService } from "./inventory.service";
import { OrganizationProductsController } from "./organization-products.controller";
import { ProductAccess } from "./product-access";
import { ProductsService } from "./products.service";

const tag = `${process.pid}-${Date.now()}`;

const flags = {
    isEnabled: () => Promise.resolve(true),
} as unknown as FeatureFlagService;
const stores = new StoresService(flags);
const access = new ProductAccess(stores);
const products = new ProductsService(stores, undefined, access);
const inventory = new InventoryService(products);
const orders = new OrdersService(stores);
const idempotency = new IdempotencyService();
const reads = new StockReadsService();
const writes = new StockWritesService(idempotency);
const checks = new StockChecksService(idempotency);
const business = new StockTrackingService();

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

let orgId = "";
let ownerId = "";
let clerkId = "";
let hill = "";
let online = "";
const customer: Record<string, string> = {};
let productSeq = 0;

const owner = (): OrganizationContext => ({
    organizationId: orgId,
    userId: ownerId,
    role: "OWNER",
});

/** A stock clerk: may count and move stock, not change products. */
const clerk = (): OrganizationContext => ({
    organizationId: orgId,
    userId: clerkId,
    role: "MEMBER",
    roleKey: "clerk",
    actions: resolveCapabilities("clerk", ["store:read", "inventory:write"]),
});

beforeAll(async () => {
    ownerId = (
        await prisma.user.create({
            data: { email: `st-owner-${tag}@example.com` },
        })
    ).id;
    clerkId = (
        await prisma.user.create({
            data: { email: `st-clerk-${tag}@example.com` },
        })
    ).id;
    orgId = (
        await prisma.organization.create({
            data: { name: "Northwind", slug: `st-nw-${tag}` },
        })
    ).id;
    await prisma.membership.create({
        data: { organizationId: orgId, userId: ownerId, role: "OWNER" },
    });
    const storefront = async (name: string) =>
        (
            await prisma.store.create({
                data: {
                    name,
                    slug: `st-${name.toLowerCase().replace(/\s+/g, "-")}-${tag}`,
                    organizationId: orgId,
                },
            })
        ).id;
    hill = await storefront("Hill Road");
    online = await storefront("Online");
    for (const storeId of [hill, online]) {
        customer[storeId] = (
            await prisma.customer.create({
                data: {
                    storeId,
                    organizationId: orgId,
                    email: `st-buyer-${tag}@example.com`,
                    firstName: "Asha",
                },
            })
        ).id;
    }
});

afterEach(async () => {
    // Leave the business counting for the next test.
    await prisma.businessProfile.updateMany({
        where: { organizationId: orgId },
        data: { stockTracking: true },
    });
    const rows = await prisma.stockLevel.findMany({
        where: { organizationId: orgId },
        select: {
            id: true,
            onHand: true,
            promised: true,
            orderItems: { select: { heldQuantity: true } },
            entries: { select: { quantity: true, before: true, after: true } },
        },
    });
    for (const row of rows) {
        expect({ id: row.id, promised: row.promised }).toEqual({
            id: row.id,
            promised: row.orderItems.reduce((s, i) => s + i.heldQuantity, 0),
        });
        expect({ id: row.id, onHand: row.onHand }).toEqual({
            id: row.id,
            onHand: row.entries.reduce((s, e) => s + e.quantity, 0),
        });
        for (const e of row.entries)
            expect(e.before + e.quantity).toBe(e.after);
    }
});

/** A product listed at both storefronts, counted where a number is given. */
async function product(
    name: string,
    stock: { hill?: number; online?: number },
): Promise<string> {
    productSeq += 1;
    const p = await prisma.product.create({
        data: {
            storeId: hill,
            organizationId: orgId,
            name,
            slug: `st-${productSeq}-${tag}`,
            price: "100.00",
        },
    });
    for (const [storeId, n] of [
        [hill, stock.hill],
        [online, stock.online],
    ] as const) {
        await prisma.productListing.create({
            data: { storeId, organizationId: orgId, productId: p.id },
        });
        if (n !== undefined) {
            await prisma.$transaction((tx) =>
                count(
                    tx,
                    { organizationId: orgId, userId: ownerId },
                    { target: { storeId, productId: p.id }, counted: n },
                ),
            );
        }
    }
    return p.id;
}

const shelf = (storeId: string, productId: string) =>
    prisma.stockLevel.findFirstOrThrow({
        where: { storeId, productId, variantId: null },
        select: { id: true, onHand: true, promised: true },
    });

async function place(
    storeId: string,
    productId: string,
    quantity: number,
): Promise<string> {
    return (
        await orders.create(storeId, ownerId, {
            customerId: customer[storeId],
            items: [{ productId, quantity }],
        })
    ).id;
}

const lineOf = (orderId: string) =>
    prisma.orderItem.findFirstOrThrow({
        where: { orderId },
        select: {
            id: true,
            stockRow: true,
            stockLevelId: true,
            heldQuantity: true,
            soldQuantity: true,
        },
    });

async function setTracking(
    ctx: OrganizationContext,
    productId: string,
    tracked: boolean,
) {
    return inventory.setTrackingIn(
        await access.write(ctx, productId),
        productId,
        tracked,
    );
}

async function fulfil(storeId: string, orderId: string) {
    await orders.updateStatus(storeId, orderId, ownerId, {
        status: "PROCESSING",
    });
    await orders.updateStatus(storeId, orderId, ownerId, {
        status: "DELIVERED",
    });
}

const entriesOf = (productId: string) =>
    prisma.stockEntry.findMany({
        where: { productId },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        select: {
            kind: true,
            quantity: true,
            storeId: true,
            note: true,
            orderId: true,
        },
    });

describe("a product's Track stock switch", () => {
    it("off: counts each shelf with stock to 0, then sells without limit and writes nothing", async () => {
        const jam = await product("Plum jam", { hill: 3, online: 0 });
        const result = await setTracking(owner(), jam, false);
        expect(result).toEqual({
            productId: jam,
            tracked: false,
            businessTracks: true,
            counted: 1,
        });
        expect(await shelf(hill, jam)).toMatchObject({
            onHand: 0,
            promised: 0,
        });
        const offEntries = await entriesOf(jam);
        expect(offEntries.at(-1)).toMatchObject({
            kind: "COUNTED",
            quantity: -3,
            storeId: hill,
            note: TRACKING_OFF_NOTE,
        });

        // Far more than was ever on the shelf: it always sells.
        const order = await place(hill, jam, 50);
        expect(await lineOf(order)).toMatchObject({
            stockRow: "NONE",
            stockLevelId: null,
            heldQuantity: 0,
        });
        await fulfil(hill, order);
        expect(await shelf(hill, jam)).toMatchObject({
            onHand: 0,
            promised: 0,
        });
        // Nothing written after the counted-to-0.
        expect(await entriesOf(jam)).toEqual(offEntries);
        expect(
            await prisma.product.findUniqueOrThrow({ where: { id: jam } }),
        ).toMatchObject({ stockTracked: false });
    });

    it("on again: every shelf starts at 0 — Sold out until counted — and the log adds up", async () => {
        const honey = await product("Honey", { hill: 4 });
        await setTracking(owner(), honey, false);
        const before = await entriesOf(honey);
        const on = await setTracking(owner(), honey, true);
        expect(on).toMatchObject({ tracked: true, counted: 0 });
        // Turning on writes nothing; the shelf that never counted is made.
        expect(await entriesOf(honey)).toEqual(before);
        expect(await shelf(hill, honey)).toMatchObject({ onHand: 0 });
        expect(await shelf(online, honey)).toMatchObject({ onHand: 0 });

        await expect(place(hill, honey, 1)).rejects.toThrow("Sold out");
        await prisma.$transaction((tx) =>
            count(
                tx,
                { organizationId: orgId, userId: ownerId },
                { target: { storeId: hill, productId: honey }, counted: 5 },
            ),
        );
        const order = await place(hill, honey, 2);
        expect(await lineOf(order)).toMatchObject({
            stockRow: "PRODUCT",
            heldQuantity: 2,
        });
        expect(await shelf(hill, honey)).toMatchObject({
            onHand: 5,
            promised: 2,
        });
        await orders.updateStatus(hill, order, ownerId, {
            status: "CANCELLED",
        });
    });

    it("off is refused while open orders hold its units", async () => {
        const bread = await product("Sourdough", { hill: 10 });
        const order = await place(hill, bread, 3);
        await expect(setTracking(owner(), bread, false)).rejects.toThrow(
            new ConflictException(
                "3 are promised to open orders — fulfil or cancel them first.",
            ),
        );
        expect(
            await prisma.product.findUniqueOrThrow({ where: { id: bread } }),
        ).toMatchObject({ stockTracked: true });
        expect(await shelf(hill, bread)).toMatchObject({
            onHand: 10,
            promised: 3,
        });
        // Fulfilled, nothing is promised: off goes through.
        await fulfil(hill, order);
        await expect(setTracking(owner(), bread, false)).resolves.toMatchObject(
            { tracked: false, counted: 1 },
        );
    });

    it("says 1 is promised in the singular", async () => {
        const bun = await product("Bun", { hill: 2 });
        const order = await place(hill, bun, 1);
        await expect(setTracking(owner(), bun, false)).rejects.toThrow(
            "1 is promised to open orders — fulfil or cancel them first.",
        );
        await orders.updateStatus(hill, order, ownerId, {
            status: "CANCELLED",
        });
    });

    it("a stock-only role can't turn it on or off", async () => {
        const tea = await product("Tea", { hill: 2 });
        await expect(setTracking(clerk(), tea, false)).rejects.toThrow(
            ForbiddenException,
        );
        // Even through a scope that may count stock.
        await expect(
            inventory.setTrackingIn(
                await access.stock(clerk(), tea),
                tea,
                false,
            ),
        ).rejects.toThrow(ForbiddenException);
        await expect(business.set(clerk(), false)).rejects.toThrow(
            ForbiddenException,
        );
        expect(
            await prisma.product.findUniqueOrThrow({ where: { id: tea } }),
        ).toMatchObject({ stockTracked: true });
    });

    it("another business's product is not found", async () => {
        const other = await prisma.organization.create({
            data: { name: "Elsewhere", slug: `st-else-${tag}` },
        });
        const theirs = await prisma.product.create({
            data: {
                organizationId: other.id,
                name: "Theirs",
                slug: `st-theirs-${tag}`,
                price: "1.00",
            },
        });
        await expect(
            prisma.$transaction((tx) =>
                setProductTracking(
                    tx,
                    { organizationId: orgId, userId: ownerId },
                    theirs.id,
                    false,
                ),
            ),
        ).rejects.toThrow(NotFoundException);
    });
});

describe("toggling while an order is being made", () => {
    it("tracking goes off first: the order waits, then holds nothing on the untracked shelf", async () => {
        const cake = await product("Tea cake", { hill: 5 });
        const row = await shelf(hill, cake);
        let locked!: () => void;
        const gotLocks = new Promise<void>((r) => (locked = r));
        // Track stock going off, holding its locks for a moment.
        const toggle = prisma.$transaction(
            async (tx) => {
                await tx.$queryRaw`SELECT id FROM "Product" WHERE id = ${cake} FOR UPDATE`;
                await tx.$queryRaw`SELECT id FROM "StockLevel" WHERE id = ${row.id} FOR UPDATE`;
                locked();
                await sleep(400);
                return setProductTracking(
                    tx,
                    { organizationId: orgId, userId: ownerId },
                    cake,
                    false,
                );
            },
            { timeout: 10_000 },
        );
        await gotLocks;
        const order = place(hill, cake, 2);
        const [off, orderId] = await Promise.all([toggle, order]);
        expect(off).toMatchObject({ tracked: false, counted: 1 });
        expect(await lineOf(orderId)).toMatchObject({
            stockRow: "NONE",
            stockLevelId: null,
            heldQuantity: 0,
        });
        expect(await shelf(hill, cake)).toMatchObject({
            onHand: 0,
            promised: 0,
        });
    });

    it("the order holds first: tracking waits, then is refused", async () => {
        const pie = await product("Pie", { online: 4 });
        // An online order, paid: it holds when its transaction commits.
        const created = await prisma.order.create({
            data: {
                storeId: online,
                organizationId: orgId,
                customerId: customer[online],
                orderId: `WEB-${Math.random().toString(36).slice(2, 8)}`,
                currency: "INR",
                subtotal: "100.00",
                total: "100.00",
                items: {
                    create: [{ productId: pie, quantity: 1, price: "100.00" }],
                },
            },
            select: { id: true, items: { select: { id: true } } },
        });
        let held!: () => void;
        const gotHold = new Promise<void>((r) => (held = r));
        const hold = prisma.$transaction(
            async (tx) => {
                await tx.$queryRaw`SELECT id FROM "Order" WHERE id = ${created.id} FOR UPDATE`;
                await holdLines(tx, [created.items[0].id]);
                held();
                await sleep(400);
            },
            { timeout: 10_000 },
        );
        await gotHold;
        const toggle = setTracking(owner(), pie, false);
        const [holdResult, toggleResult] = await Promise.allSettled([
            hold,
            toggle,
        ]);
        expect(holdResult.status).toBe("fulfilled");
        expect(toggleResult).toMatchObject({
            status: "rejected",
            reason: expect.objectContaining({
                message:
                    "1 is promised to open orders — fulfil or cancel them first.",
            }),
        });
        expect(await shelf(online, pie)).toMatchObject({
            onHand: 4,
            promised: 1,
        });
        await orders.updateStatus(online, created.id, ownerId, {
            status: "CANCELLED",
        });
    });

    it("tracking goes off while the Stock API counts a storefront with no shelf: the count waits, then is refused", async () => {
        const honey = await product("Honey", { hill: 3 });
        // Listed at Online, with no shelf there yet.
        expect(
            await prisma.stockLevel.count({
                where: { productId: honey, storeId: online },
            }),
        ).toBe(0);
        let locked!: () => void;
        const gotLocks = new Promise<void>((r) => (locked = r));
        // Track stock going off has found and emptied the shelves it saw,
        // and holds its locks a moment before it commits.
        const toggle = prisma.$transaction(
            async (tx) => {
                const off = await setProductTracking(
                    tx,
                    { organizationId: orgId, userId: ownerId },
                    honey,
                    false,
                );
                locked();
                await sleep(400);
                return off;
            },
            { timeout: 10_000 },
        );
        await gotLocks;
        // Checked before the change: still tracked (the off isn't
        // committed), so it goes ahead — and waits for the product's lock.
        const received = writes.adjust(owner(), {
            storeId: online,
            productId: honey,
            units: 5,
        });
        const [off, add] = await Promise.allSettled([toggle, received]);
        expect(off).toMatchObject({
            status: "fulfilled",
            value: { tracked: false },
        });
        expect(add).toMatchObject({
            status: "rejected",
            reason: expect.objectContaining({ message: UNTRACKED }),
        });
        // No shelf with stock on it for a product that doesn't count.
        expect(
            await prisma.stockLevel.findMany({
                where: { productId: honey },
                select: { storeId: true, onHand: true },
            }),
        ).toEqual([{ storeId: hill, onHand: 0 }]);
    });

    it("racing freely, either the order holds or tracking goes off — never a hold on an untracked shelf", async () => {
        for (let i = 0; i < 4; i += 1) {
            const roll = await product(`Roll ${i}`, { hill: 3 });
            const [order, toggle] = await Promise.allSettled([
                place(hill, roll, 1),
                setTracking(owner(), roll, false),
            ]);
            expect(order.status).toBe("fulfilled");
            const orderId = order.status === "fulfilled" ? order.value : "";
            const line = await lineOf(orderId);
            const tracked = (
                await prisma.product.findUniqueOrThrow({
                    where: { id: roll },
                })
            ).stockTracked;
            if (toggle.status === "fulfilled") {
                expect(tracked).toBe(false);
                expect(line).toMatchObject({ stockRow: "NONE" });
                expect(await shelf(hill, roll)).toMatchObject({
                    onHand: 0,
                    promised: 0,
                });
            } else {
                expect(tracked).toBe(true);
                expect(line).toMatchObject({
                    stockRow: "PRODUCT",
                    heldQuantity: 1,
                });
                await orders.updateStatus(hill, orderId, ownerId, {
                    status: "CANCELLED",
                });
            }
        }
    });
});

describe("orders on a product that stopped or started counting", () => {
    it("a kitchen undo on a product now untracked moves no stock", async () => {
        const loaf = await product("Rye loaf", { hill: 6 });
        const order = await place(hill, loaf, 2);
        await fulfil(hill, order);
        expect(await shelf(hill, loaf)).toMatchObject({ onHand: 4 });
        await setTracking(owner(), loaf, false);
        const before = await entriesOf(loaf);
        const line = await lineOf(order);
        await prisma.$transaction((tx) =>
            uncommitLines(tx, [line.id], ownerId),
        );
        expect(await entriesOf(loaf)).toEqual(before);
        expect(await shelf(hill, loaf)).toMatchObject({
            onHand: 0,
            promised: 0,
        });
        expect(await lineOf(order)).toMatchObject({
            heldQuantity: 0,
            soldQuantity: 0,
        });
    });

    it("a line placed while untracked stays untracked after tracking is turned on", async () => {
        const muffin = await product("Muffin", { hill: 2 });
        await setTracking(owner(), muffin, false);
        const order = await place(hill, muffin, 3);
        await setTracking(owner(), muffin, true);
        await prisma.$transaction((tx) =>
            count(
                tx,
                { organizationId: orgId, userId: ownerId },
                { target: { storeId: hill, productId: muffin }, counted: 10 },
            ),
        );
        await fulfil(hill, order);
        expect(await lineOf(order)).toMatchObject({
            stockRow: "NONE",
            stockLevelId: null,
            soldQuantity: 0,
        });
        expect(await shelf(hill, muffin)).toMatchObject({
            onHand: 10,
            promised: 0,
        });
        expect(
            (await entriesOf(muffin)).filter((e) => e.kind === "SOLD"),
        ).toEqual([]);
    });

    it("a sale made while it was off isn't flagged as a sale the shelf missed", async () => {
        const scone = await product("Scone", { hill: 3 });
        await setTracking(owner(), scone, false);
        const order = await place(hill, scone, 1);
        await fulfil(hill, order);
        await setTracking(owner(), scone, true);
        const found = await checks.list(owner());
        expect(
            found.checks.filter(
                (c) => c.kind === "SALE_NOT_TAKEN" && c.productId === scone,
            ),
        ).toEqual([]);
    });
});

describe("the Stock API and the readers", () => {
    it("an untracked product can't be counted, added to, or its counts undone", async () => {
        const oil = await product("Olive oil", { hill: 3 });
        await setTracking(owner(), oil, false);
        const [offEntry] = await prisma.stockEntry.findMany({
            where: { productId: oil, note: TRACKING_OFF_NOTE },
            select: { id: true },
        });
        await expect(
            writes.counts(owner(), {
                counts: [{ storeId: hill, productId: oil, counted: 4 }],
            }),
        ).rejects.toThrow(new ConflictException(UNTRACKED));
        await expect(
            writes.adjust(owner(), { storeId: hill, productId: oil, units: 2 }),
        ).rejects.toThrow(UNTRACKED);
        await expect(
            writes.reverse(owner(), { entryIds: [offEntry.id] }),
        ).rejects.toThrow(UNTRACKED);
        expect(await shelf(hill, oil)).toMatchObject({ onHand: 0 });
    });

    it("never undoes a count Saroh wrote: Track stock off, or the switch to variants", async () => {
        const salt = await product("Sea salt", { hill: 4 });
        await setTracking(owner(), salt, false);
        await setTracking(owner(), salt, true);
        const off = await prisma.stockEntry.findFirstOrThrow({
            where: { productId: salt, note: TRACKING_OFF_NOTE },
            select: { id: true, system: true },
        });
        expect(off.system).toBe("TRACKING_OFF");
        await expect(
            writes.reverse(owner(), { entryIds: [off.id] }),
        ).rejects.toThrow(new ConflictException(SYSTEM_CANT_UNDO));
        const log = await reads.log(owner(), { product: salt });
        expect(log.entries.find((e) => e.id === off.id)).toMatchObject({
            canUndo: false,
        });

        // The switch to per-variant stock: the product's own shelf is
        // counted down to what lines without a variant hold.
        const pepper = await product("Pepper", { hill: 6 });
        const coarse = await prisma.productVariant.create({
            data: { productId: pepper, title: "Coarse", sku: `PC-${tag}` },
            select: { id: true },
        });
        await inventory.setVariantsIn(
            await access.write(owner(), pepper, hill),
            pepper,
            {
                variants: [
                    { variantId: coarse.id, quantity: 6, lowStockAlert: 1 },
                ],
            },
        );
        const switched = await prisma.stockEntry.findMany({
            where: { productId: pepper, system: "PER_VARIANT" },
            select: { id: true, variantId: true },
        });
        expect(switched.map((e) => e.variantId).sort()).toEqual(
            [coarse.id, null].sort(),
        );
        const own = switched.find((e) => e.variantId === null);
        await expect(
            writes.reverse(owner(), { entryIds: [own?.id ?? ""] }),
        ).rejects.toThrow(SYSTEM_CANT_UNDO);
        // A count by hand is still undone.
        const byHand = await writes.counts(owner(), {
            counts: [
                {
                    storeId: hill,
                    productId: pepper,
                    variantId: coarse.id,
                    counted: 5,
                },
            ],
        });
        await writes.reverse(owner(), { entryIds: byHand.entryIds });
    });

    describe("never changes how a product counts", () => {
        /** A tracked product with two variants, listed at both storefronts. */
        async function sized(name: string) {
            const productId = await product(name, {});
            await prisma.product.update({
                where: { id: productId },
                data: { stockTracked: true },
            });
            const [small, large] = await Promise.all(
                ["S", "L"].map((title) =>
                    prisma.productVariant.create({
                        data: {
                            productId,
                            title,
                            sku: `${name}-${title}-${tag}`,
                        },
                        select: { id: true },
                    }),
                ),
            );
            return { productId, small: small.id, large: large.id };
        }

        it("refuses a variant's count on a product counted as a whole", async () => {
            const { productId, small } = await sized("Shirt");
            await writes.counts(owner(), {
                counts: [{ storeId: hill, productId, counted: 6 }],
            });
            await expect(
                writes.counts(owner(), {
                    counts: [
                        {
                            storeId: online,
                            productId,
                            variantId: small,
                            counted: 2,
                        },
                    ],
                }),
            ).rejects.toThrow(new ConflictException(COUNTS_AS_A_WHOLE));
            await expect(
                writes.adjust(owner(), {
                    storeId: hill,
                    productId,
                    variantId: small,
                    units: 1,
                }),
            ).rejects.toThrow(COUNTS_AS_A_WHOLE);
            expect(
                await prisma.stockLevel.count({
                    where: { productId, variantId: { not: null } },
                }),
            ).toBe(0);
        });

        it("refuses a whole count on a product counted per variant", async () => {
            const { productId, small, large } = await sized("Scarf");
            // Its first shelf may be a variant's: nothing counted it before.
            const first = await writes.counts(owner(), {
                counts: [
                    {
                        storeId: hill,
                        productId,
                        variantId: small,
                        counted: 3,
                    },
                ],
            });
            expect(first.results[0].shelf).toMatchObject({
                variantId: small,
                onHand: 3,
            });
            // Another variant, another storefront: the same way it counts.
            await writes.counts(owner(), {
                counts: [
                    {
                        storeId: online,
                        productId,
                        variantId: large,
                        counted: 1,
                    },
                ],
            });
            await expect(
                writes.counts(owner(), {
                    counts: [{ storeId: online, productId, counted: 4 }],
                }),
            ).rejects.toThrow(new ConflictException(COUNTS_PER_VARIANT));
            expect(
                await prisma.stockLevel.count({
                    where: { productId, variantId: null },
                }),
            ).toBe(0);
        });

        it("lets a product's first shelf be a whole one too", async () => {
            const { productId } = await sized("Hat");
            const saved = await writes.counts(owner(), {
                counts: [{ storeId: online, productId, counted: 2 }],
            });
            expect(saved.results[0].shelf).toMatchObject({
                variantId: null,
                onHand: 2,
            });
        });
    });

    it("the Stock screen lists untracked products in its footer, and the product reads no stock", async () => {
        const soap = await product("Soap", { hill: 7 });
        await setTracking(owner(), soap, false);
        const levels = await reads.levels(owner(), {});
        expect(levels.tracking).toBe(true);
        expect(levels.untracked).toContainEqual(
            expect.objectContaining({ productId: soap, name: "Soap" }),
        );
        expect(levels.rows.some((r) => r.productId === soap)).toBe(false);

        const scope = await access.read(owner(), soap, hill);
        const detail = await products.getIn(scope, soap);
        expect(detail).toMatchObject({ stockTracked: false, inventory: null });
        expect(await inventory.getIn(scope, soap)).toMatchObject({
            tracked: false,
            quantity: 0,
        });
        const list = await products.catalogue(orgId);
        expect(list.find((p) => p.id === soap)).toMatchObject({
            inventory: null,
        });
    });

    it("the product's stock routes let a stock-only role count, not change how it counts", async () => {
        // Only the routes' own services are used here.
        const unused = null as never;
        const controller = new OrganizationProductsController(
            access,
            products,
            unused,
            unused,
            unused,
            inventory,
            unused,
        );
        const flour = await product("Flour", { hill: 5 });
        const counted = await controller.setInventory(
            clerk(),
            flour,
            { quantity: 3 },
            hill,
        );
        expect(counted).toMatchObject({ quantity: 3 });
        expect(await shelf(hill, flour)).toMatchObject({ onHand: 3 });

        // Switching it to count each variant changes how it counts.
        const fine = await prisma.productVariant.create({
            data: { productId: flour, title: "Fine", sku: `FL-F-${tag}` },
            select: { id: true },
        });
        await expect(
            controller.setVariantStock(
                clerk(),
                flour,
                {
                    variants: [
                        { variantId: fine.id, quantity: 3, lowStockAlert: 1 },
                    ],
                },
                hill,
            ),
        ).rejects.toThrow(ForbiddenException);
        // As does starting to track one that doesn't.
        const yeast = await product("Yeast", {});
        await expect(
            controller.setInventory(clerk(), yeast, { quantity: 2 }, hill),
        ).rejects.toThrow(ForbiddenException);
        // A role with neither is refused outright.
        const reader: OrganizationContext = {
            organizationId: orgId,
            userId: clerkId,
            role: "MEMBER",
            roleKey: "reader",
            actions: resolveCapabilities("reader", ["store:read"]),
        };
        await expect(
            controller.setInventory(reader, flour, { quantity: 1 }, hill),
        ).rejects.toThrow("Your role can't count or move stock.");
    });

    it("the product's own count starts tracking for an owner, never for a stock-only role", async () => {
        const vase = await product("Vase", {});
        expect(
            await prisma.product.findUniqueOrThrow({ where: { id: vase } }),
        ).toMatchObject({ stockTracked: false });
        await expect(
            inventory.upsertIn(await access.stock(clerk(), vase, hill), vase, {
                quantity: 3,
                lowStockAlert: 1,
            }),
        ).rejects.toThrow(ForbiddenException);
        await inventory.upsertIn(
            await access.write(owner(), vase, hill),
            vase,
            {
                quantity: 3,
                lowStockAlert: 1,
            },
        );
        expect(
            await prisma.product.findUniqueOrThrow({ where: { id: vase } }),
        ).toMatchObject({ stockTracked: true });
        expect(await shelf(hill, vase)).toMatchObject({ onHand: 3 });
        // Listed at Online too: its shelf there starts at 0.
        expect(await shelf(online, vase)).toMatchObject({ onHand: 0 });
    });
});

describe("the business's Track stock switch", () => {
    it("off is refused while anything is promised anywhere", async () => {
        const jar = await product("Jar", { online: 2 });
        const order = await place(online, jar, 1);
        await expect(business.set(owner(), false)).rejects.toThrow(
            "1 is promised to open orders — fulfil or cancel them first.",
        );
        expect(await business.get(owner())).toEqual({
            tracked: true,
            canChange: true,
        });
        await orders.updateStatus(online, order, ownerId, {
            status: "CANCELLED",
        });
    });

    it("off counts every shelf to 0 and every product sells; on counts again from 0, keeping each product's own switch", async () => {
        const a = await product("Candle", { hill: 4, online: 1 });
        const b = await product("Wick", { hill: 2 });
        await setTracking(owner(), b, false);

        const off = await business.set(owner(), false);
        expect(off.tracked).toBe(false);
        expect(off.counted).toBeGreaterThanOrEqual(2);
        expect(await shelf(hill, a)).toMatchObject({ onHand: 0 });
        expect(await shelf(online, a)).toMatchObject({ onHand: 0 });
        expect(await business.get(owner())).toMatchObject({ tracked: false });

        // Every product always sells, nothing is written.
        const before = await entriesOf(a);
        const order = await place(hill, a, 20);
        expect(await lineOf(order)).toMatchObject({ stockRow: "NONE" });
        await fulfil(hill, order);
        expect(await entriesOf(a)).toEqual(before);

        const levels = await reads.levels(owner(), {});
        expect(levels.tracking).toBe(false);
        expect(levels.rows).toEqual([]);
        expect(levels.untracked.map((u) => u.productId)).toEqual(
            expect.arrayContaining([a, b]),
        );
        // Nothing can be counted while the business is off.
        await expect(
            writes.counts(owner(), {
                counts: [{ storeId: hill, productId: a, counted: 1 }],
            }),
        ).rejects.toThrow(BUSINESS_UNTRACKED);

        await business.set(owner(), true);
        // The candle counts again, from 0: Sold out until counted.
        await expect(place(hill, a, 1)).rejects.toThrow("Sold out");
        // The wick was off on its own and stays off.
        const wick = await place(hill, b, 5);
        expect(await lineOf(wick)).toMatchObject({ stockRow: "NONE" });
        expect(
            await prisma.product.findUniqueOrThrow({ where: { id: b } }),
        ).toMatchObject({ stockTracked: false });
    });

    it("turning it to what it already is changes nothing", async () => {
        await expect(business.set(owner(), true)).resolves.toEqual({
            tracked: true,
            counted: 0,
        });
    });
});

describe("Track stock in Settings → Activity", () => {
    /** The Track stock rows about one product or the business, oldest first. */
    const trackingRows = (targetId: string) =>
        prisma.auditEvent.findMany({
            where: {
                organizationId: orgId,
                action: { contains: "stock-tracking" },
                targetId,
            },
            orderBy: [{ createdAt: "asc" }, { id: "asc" }],
            select: {
                action: true,
                actorUserId: true,
                targetType: true,
                targetId: true,
                outcome: true,
                metadata: true,
            },
        });

    /** A Saroh operator acting on the business from the admin console. */
    const operator = (): OrganizationContext => ({
        organizationId: orgId,
        userId: ownerId,
        role: "OWNER",
        roleKey: "platform-operator",
    });

    const markSoldOut = (productId: string, storeId: string) =>
        prisma.productListing.update({
            where: { storeId_productId: { storeId, productId } },
            data: { soldOutAt: new Date(), soldOutByUserId: ownerId },
        });

    it("off and on each write one row, naming the product and what changed", async () => {
        const film = await product("Stretch Film Hand Dispenser", {
            hill: 30,
            online: 8,
        });
        const started = await trackingRows(film);
        await setTracking(owner(), film, false);
        await setTracking(owner(), film, true);
        const rows = (await trackingRows(film)).slice(started.length);
        expect(rows).toEqual([
            {
                action: "product.stock-tracking.off",
                actorUserId: ownerId,
                targetType: "product",
                targetId: film,
                outcome: "SUCCESS",
                metadata: {
                    product: "Stretch Film Hand Dispenser",
                    unitsZeroed: 38,
                    storefronts: 2,
                },
            },
            {
                action: "product.stock-tracking.on",
                actorUserId: ownerId,
                targetType: "product",
                targetId: film,
                outcome: "SUCCESS",
                metadata: {
                    product: "Stretch Film Hand Dispenser",
                    soldOutCleared: 0,
                },
            },
        ]);
    });

    it("turning it to what it already is records nothing", async () => {
        const pen = await product("Pen", { hill: 1 });
        const before = await trackingRows(pen);
        await setTracking(owner(), pen, true);
        await setTracking(owner(), pen, false);
        await setTracking(owner(), pen, false);
        expect((await trackingRows(pen)).map((r) => r.action)).toEqual([
            ...before.map((r) => r.action),
            "product.stock-tracking.off",
        ]);
    });

    it("a refused off records nothing", async () => {
        const mug = await product("Mug", { hill: 2 });
        const before = await trackingRows(mug);
        const order = await place(hill, mug, 1);
        await expect(setTracking(owner(), mug, false)).rejects.toThrow(
            ConflictException,
        );
        expect(await trackingRows(mug)).toEqual(before);
        await orders.updateStatus(hill, order, ownerId, {
            status: "CANCELLED",
        });
    });

    it("on says the Sold out marks it cleared, in its one row", async () => {
        const ink = await product("Ink", { hill: 2 });
        await setTracking(owner(), ink, false);
        await markSoldOut(ink, hill);
        await markSoldOut(ink, online);
        await setTracking(owner(), ink, true);
        expect((await trackingRows(ink)).at(-1)).toMatchObject({
            action: "product.stock-tracking.on",
            metadata: { product: "Ink", soldOutCleared: 2 },
        });
        // Not as separate "available again" rows.
        expect(
            await prisma.auditEvent.count({
                where: {
                    organizationId: orgId,
                    targetId: ink,
                    action: "product.sold-out.clear",
                },
            }),
        ).toBe(0);
    });

    it("a first count that starts a product counting says it started with a count", async () => {
        // The Stock flow's own start: a product with no shelf, counted.
        const lamp = await product("Lamp", { hill: 4 });
        expect(await trackingRows(lamp)).toEqual([
            {
                action: "product.stock-tracking.on",
                actorUserId: ownerId,
                targetType: "product",
                targetId: lamp,
                outcome: "SUCCESS",
                metadata: {
                    product: "Lamp",
                    startedWithCount: true,
                    soldOutCleared: 0,
                },
            },
        ]);

        // The product's own stock editor: marked Sold out while untracked,
        // then counted — one row, the mark cleared in it.
        const rug = await product("Rug", {});
        await markSoldOut(rug, online);
        await inventory.upsertIn(await access.write(owner(), rug, hill), rug, {
            quantity: 3,
            lowStockAlert: 1,
        });
        expect(await trackingRows(rug)).toEqual([
            expect.objectContaining({
                action: "product.stock-tracking.on",
                actorUserId: ownerId,
                metadata: {
                    product: "Rug",
                    startedWithCount: true,
                    soldOutCleared: 1,
                },
            }),
        ]);
    });

    it("the business's switch writes a row each way, with the products it touched", async () => {
        await product("Shelf", { hill: 5, online: 2 });
        const counting = await prisma.product.count({
            where: { organizationId: orgId, stockTracked: true },
        });
        const stocked = await prisma.stockLevel.findMany({
            where: { organizationId: orgId, onHand: { gt: 0 } },
            select: { onHand: true, storeId: true },
        });
        const before = await trackingRows(orgId);

        await business.set(owner(), false);
        await business.set(owner(), false);
        await business.set(owner(), true);
        await business.set(owner(), true);

        expect((await trackingRows(orgId)).slice(before.length)).toEqual([
            {
                action: "business.stock-tracking.off",
                actorUserId: ownerId,
                targetType: "organization",
                targetId: orgId,
                outcome: "SUCCESS",
                metadata: {
                    products: counting,
                    unitsZeroed: stocked.reduce((n, r) => n + r.onHand, 0),
                    storefronts: new Set(stocked.map((r) => r.storeId)).size,
                },
            },
            {
                action: "business.stock-tracking.on",
                actorUserId: ownerId,
                targetType: "organization",
                targetId: orgId,
                outcome: "SUCCESS",
                metadata: { products: counting, soldOutCleared: 0 },
            },
        ]);
    });

    it("an operator's change is marked, so it reads as Saroh support", async () => {
        const kite = await product("Kite", { hill: 1 });
        await setTracking(operator(), kite, false);
        expect((await trackingRows(kite)).at(-1)).toMatchObject({
            action: "product.stock-tracking.off",
            metadata: { product: "Kite", byOperator: true },
        });
        const before = await trackingRows(orgId);
        await business.set(operator(), false);
        await business.set(operator(), true);
        const rows = (await trackingRows(orgId)).slice(before.length);
        expect(rows.map((r) => r.action)).toEqual([
            "business.stock-tracking.off",
            "business.stock-tracking.on",
        ]);
        for (const row of rows) {
            expect(row.metadata).toMatchObject({ byOperator: true });
        }
        // A merchant's own change carries no mark.
        await setTracking(owner(), kite, true);
        expect((await trackingRows(kite)).at(-1)?.metadata).not.toHaveProperty(
            "byOperator",
        );
    });
});
