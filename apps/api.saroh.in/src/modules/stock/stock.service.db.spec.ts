import {
    BadRequestException,
    ConflictException,
    ForbiddenException,
    NotFoundException,
} from "@nestjs/common";
import { prisma } from "@saroh/database";

import type { OrganizationContext } from "../../common/types/organization-context";
import type { FeatureFlagService } from "../feature-flags/feature-flags.service";
import { resolveCapabilities } from "../organizations/organization-policy";
import { InventoryService } from "../products/inventory.service";
import { ProductAccess } from "../products/product-access";
import { ProductsService } from "../products/products.service";
import { StoresService } from "../stores/stores.service";
import { COUNT_DIDNT_MATCH, shortWords } from "./stock-words";
import type { StockActor } from "./stock.service";
import {
    adjust,
    count,
    countAll,
    move,
    recordReturned,
    recordSold,
    reverse,
    reverseSale,
} from "./stock.service";

/**
 * The stock log and its rules (#513), against a real database: every shelf
 * change writes entries that read before + quantity = after and add up to
 * what the shelf holds.
 */
const tag = `${process.pid}-${Date.now()}`;

describe("Stock log and rules (DB)", () => {
    const flags = {
        isEnabled: () => Promise.resolve(true),
    } as unknown as FeatureFlagService;
    const stores = new StoresService(flags);
    const access = new ProductAccess(stores);
    const products = new ProductsService(stores, undefined, access);
    const inventory = new InventoryService(products);

    const users: Record<string, string> = {};
    let orgId = "";
    let hill = "";
    let online = "";
    let closed = "";
    let otherOrgId = "";
    let otherStore = "";
    let customerId = "";
    let actor: StockActor;

    const tx = <T>(fn: Parameters<typeof prisma.$transaction<T>>[0]) =>
        prisma.$transaction(fn);

    async function storefront(organizationId: string, name: string) {
        return (
            await prisma.store.create({
                data: {
                    name,
                    slug: `sk-${name.toLowerCase().replace(/\s+/g, "-")}-${tag}`,
                    organizationId,
                },
            })
        ).id;
    }

    /** A product sold at Hill Road with `onHand` there (its own shelf). */
    async function product(name: string, onHand: number, promised = 0) {
        const scope = await access.write(ctx("OWNER"), undefined, hill);
        const { id } = await products.createIn(scope, {
            name,
            price: "50.00",
        });
        const { shelf } = await tx((t) =>
            count(t, actor, {
                target: { storeId: hill, productId: id },
                counted: onHand,
            }),
        );
        if (promised > 0) {
            await prisma.stockLevel.update({
                where: { id: shelf.stockLevelId },
                data: { promised },
            });
        }
        return { productId: id, stockLevelId: shelf.stockLevelId };
    }

    async function order() {
        return (
            await prisma.order.create({
                data: {
                    storeId: hill,
                    organizationId: orgId,
                    orderId: `SK-${Math.random().toString(36).slice(2, 8)}`,
                    customerId,
                    subtotal: "0",
                    total: "0",
                },
            })
        ).id;
    }

    const onHand = async (stockLevelId: string) =>
        (
            await prisma.stockLevel.findUniqueOrThrow({
                where: { id: stockLevelId },
                select: { onHand: true },
            })
        ).onHand;

    const entriesOf = (stockLevelId: string) =>
        prisma.stockEntry.findMany({
            where: { stockLevelId },
            orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        });

    function ctx(
        role: OrganizationContext["role"],
        userId = users[role] ?? "",
    ): OrganizationContext {
        return { organizationId: orgId, userId, role };
    }

    /** A context for a role the business invented, resolved like the guard. */
    function custom(userId: string, actions: string[]): OrganizationContext {
        return {
            organizationId: orgId,
            userId,
            role: "MEMBER",
            roleKey: "custom",
            actions: resolveCapabilities("custom", actions),
        };
    }

    beforeAll(async () => {
        for (const who of ["OWNER", "MEMBER", "MANAGER", "CLERK", "STRANGER"]) {
            users[who] = (
                await prisma.user.create({
                    data: {
                        email: `sk-${who.toLowerCase()}-${tag}@example.com`,
                    },
                })
            ).id;
        }
        orgId = (
            await prisma.organization.create({
                data: { name: "Rye & Co.", slug: `sk-rye-${tag}` },
            })
        ).id;
        otherOrgId = (
            await prisma.organization.create({
                data: { name: "Elsewhere", slug: `sk-else-${tag}` },
            })
        ).id;
        // A manager role saved before "Count and move stock" existed, and a
        // clerk who may only count.
        await prisma.organizationRole.createMany({
            data: [
                {
                    organizationId: orgId,
                    key: "shop-manager",
                    label: "Shop manager",
                    actions: ["store:read", "store:write"],
                },
                {
                    organizationId: orgId,
                    key: "stock-clerk",
                    label: "Stock clerk",
                    actions: ["store:read", "inventory:write"],
                },
            ],
        });
        await prisma.membership.createMany({
            data: [
                { organizationId: orgId, userId: users.OWNER, role: "OWNER" },
                { organizationId: orgId, userId: users.MEMBER, role: "MEMBER" },
                {
                    organizationId: orgId,
                    userId: users.MANAGER,
                    role: "shop-manager",
                },
                {
                    organizationId: orgId,
                    userId: users.CLERK,
                    role: "stock-clerk",
                },
                {
                    organizationId: otherOrgId,
                    userId: users.STRANGER,
                    role: "OWNER",
                },
            ],
        });
        hill = await storefront(orgId, "Hill Road");
        online = await storefront(orgId, "Online");
        closed = await storefront(orgId, "Old Market");
        otherStore = await storefront(otherOrgId, "Elsewhere");
        customerId = (
            await prisma.customer.create({
                data: { storeId: hill, email: `sk-buyer-${tag}@example.com` },
            })
        ).id;
        actor = { organizationId: orgId, userId: users.OWNER };
    });

    afterAll(async () => {
        // The invariant, over everything this file wrote.
        const entries = await prisma.stockEntry.findMany({
            where: { organizationId: orgId },
        });
        expect(entries.length).toBeGreaterThan(0);
        for (const e of entries) {
            expect(e.before + e.quantity).toBe(e.after);
        }
        const rows = await prisma.stockLevel.findMany({
            where: { organizationId: orgId },
            select: { id: true, onHand: true },
        });
        for (const row of rows) {
            const sum = entries
                .filter((e) => e.stockLevelId === row.id)
                .reduce((n, e) => n + e.quantity, 0);
            expect({ row: row.id, sum }).toEqual({
                row: row.id,
                sum: row.onHand,
            });
        }
    });

    it("count 10 → 8 writes counted −2 (before 10, after 8)", async () => {
        const { stockLevelId } = await product("Sourdough", 10);
        const result = await tx((t) =>
            count(t, actor, {
                target: { stockLevelId },
                expected: 10,
                counted: 8,
            }),
        );
        expect(result.entry).toMatchObject({
            kind: "COUNTED",
            quantity: -2,
            before: 10,
            after: 8,
            expected: 10,
            counted: 8,
            storeId: hill,
            actorUserId: users.OWNER,
        });
        expect(result.mismatch).toBe(false);
        expect(await onHand(stockLevelId)).toBe(8);
    });

    it("a count that changes nothing is still logged", async () => {
        const { stockLevelId } = await product("Baguette", 6);
        const { entry } = await tx((t) =>
            count(t, actor, { target: { stockLevelId }, counted: 6 }),
        );
        expect(entry).toMatchObject({ quantity: 0, before: 6, after: 6 });
    });

    it("a count below promised saves; the shelf reads 2 short", async () => {
        const { stockLevelId } = await product("Croissant", 6, 5);
        const { shelf } = await tx((t) =>
            count(t, actor, { target: { stockLevelId }, counted: 3 }),
        );
        expect(shelf).toMatchObject({ onHand: 3, promised: 5, short: 2 });
        expect(shortWords(shelf)).toBe("2 short");
    });

    it("a count sent against 10 while the shelf is 9 saves and didn't match", async () => {
        const { stockLevelId } = await product("Focaccia", 9);
        const result = await tx((t) =>
            count(t, actor, {
                target: { stockLevelId },
                expected: 10,
                counted: 7,
            }),
        );
        expect(result.mismatch).toBe(true);
        expect(result.entry).toMatchObject({
            expected: 10,
            before: 9,
            counted: 7,
            after: 7,
            quantity: -2,
        });
        expect(COUNT_DIDNT_MATCH).toBe("Count didn't match");
        // Stock checks (U5) find it the same way.
        const flagged = await prisma.$queryRaw<{ id: string }[]>`
            SELECT "id" FROM "StockEntry"
            WHERE "stockLevelId" = ${stockLevelId}
              AND "kind" = 'COUNTED' AND "expected" IS NOT NULL
              AND "expected" <> "before"`;
        expect(flagged.map((f) => f.id)).toEqual([result.entry.id]);
    });

    it("received and baked add, wasted takes away, and never below none", async () => {
        const { stockLevelId } = await product("Rolls", 2);
        const target = { stockLevelId };
        await tx((t) => adjust(t, actor, { target, kind: "BAKED", units: 12 }));
        await tx((t) =>
            adjust(t, actor, { target, kind: "RECEIVED", units: 3 }),
        );
        const { entry } = await tx((t) =>
            adjust(t, actor, {
                target,
                kind: "WASTED",
                units: 4,
                note: "Dropped a tray",
            }),
        );
        expect(entry).toMatchObject({
            kind: "WASTED",
            quantity: -4,
            before: 17,
            after: 13,
            note: "Dropped a tray",
        });
        await expect(
            tx((t) => adjust(t, actor, { target, kind: "WASTED", units: 14 })),
        ).rejects.toThrow(ConflictException);
        await expect(
            tx((t) => adjust(t, actor, { target, kind: "BAKED", units: 0 })),
        ).rejects.toThrow(BadRequestException);
        expect(await onHand(stockLevelId)).toBe(13);
    });

    describe("a shelf sold below none", () => {
        /** A shelf at `start` that a sale of `sold` took below 0. */
        async function soldBelow(name: string, start: number, sold: number) {
            const made = await product(name, start);
            const orderId = await order();
            await tx(async (t) => {
                await t.$queryRaw`SELECT id FROM "StockLevel" WHERE id = ${made.stockLevelId} FOR UPDATE`;
                await recordSold(t, {
                    stockLevelId: made.stockLevelId,
                    units: sold,
                    orderId,
                });
            });
            return { ...made, orderId };
        }

        it("takes Received +2 at −3: −1", async () => {
            const { stockLevelId } = await soldBelow("Short loaf", 3, 6);
            expect(await onHand(stockLevelId)).toBe(-3);
            const { entry } = await tx((t) =>
                adjust(t, actor, {
                    target: { stockLevelId },
                    kind: "RECEIVED",
                    units: 2,
                }),
            );
            expect(entry).toMatchObject({ before: -3, after: -1 });
            // Taking units away is still refused there.
            await expect(
                tx((t) =>
                    adjust(t, actor, {
                        target: { stockLevelId },
                        kind: "WASTED",
                        units: 1,
                    }),
                ),
            ).rejects.toThrow("less than none");
            expect(await onHand(stockLevelId)).toBe(-1);
        });

        it("takes a return, and a move in", async () => {
            const { productId, stockLevelId, orderId } = await soldBelow(
                "Short roll",
                2,
                5,
            );
            await tx(async (t) => {
                await t.$queryRaw`SELECT id FROM "StockLevel" WHERE id = ${stockLevelId} FOR UPDATE`;
                await recordReturned(t, { stockLevelId, units: 1, orderId });
            });
            expect(await onHand(stockLevelId)).toBe(-2);
            // Online has 4 of it; moving 1 to Hill Road leaves Hill Road −1.
            const { shelf } = await tx((t) =>
                count(t, actor, {
                    target: { storeId: online, productId },
                    counted: 4,
                }),
            );
            await tx((t) =>
                move(t, actor, {
                    from: { stockLevelId: shelf.stockLevelId },
                    toStoreId: hill,
                    units: 1,
                }),
            );
            expect(await onHand(stockLevelId)).toBe(-1);
        });

        it("undoes a Wasted entry: the units come back", async () => {
            const made = await product("Short bun", 5);
            const { entry: wasted } = await tx((t) =>
                adjust(t, actor, {
                    target: { stockLevelId: made.stockLevelId },
                    kind: "WASTED",
                    units: 2,
                }),
            );
            const orderId = await order();
            await tx(async (t) => {
                await t.$queryRaw`SELECT id FROM "StockLevel" WHERE id = ${made.stockLevelId} FOR UPDATE`;
                await recordSold(t, {
                    stockLevelId: made.stockLevelId,
                    units: 6,
                    orderId,
                });
            });
            expect(await onHand(made.stockLevelId)).toBe(-3);
            const [undo] = await tx((t) =>
                reverse(t, actor, { entryIds: [wasted.id] }),
            );
            expect(undo).toMatchObject({ quantity: 2, before: -3, after: -1 });
        });
    });

    it("moves 3 from Hill Road to Online as −3 and +3 sharing a pair id", async () => {
        const { productId, stockLevelId } = await product("Rye loaf", 10);
        const moved = await tx((t) =>
            move(t, actor, {
                from: { stockLevelId },
                toStoreId: online,
                units: 3,
            }),
        );
        expect(moved.out).toMatchObject({
            kind: "MOVED",
            quantity: -3,
            before: 10,
            after: 7,
            storeId: hill,
            pairId: moved.pairId,
        });
        expect(moved.in).toMatchObject({
            kind: "MOVED",
            quantity: 3,
            before: 0,
            after: 3,
            storeId: online,
            productId,
            pairId: moved.pairId,
        });
        expect(await onHand(stockLevelId)).toBe(7);
        expect(await onHand(moved.in.stockLevelId)).toBe(3);
    });

    it("moves only what isn't promised", async () => {
        const { stockLevelId } = await product("Pain de mie", 5, 3);
        await expect(
            tx((t) =>
                move(t, actor, {
                    from: { stockLevelId },
                    toStoreId: online,
                    units: 3,
                }),
            ),
        ).rejects.toThrow(
            "Only 2 can be moved from Hill Road. The rest are promised to orders there.",
        );
        expect(await entriesOf(stockLevelId)).toHaveLength(1);
    });

    it("a storefront from another business in a move is not found", async () => {
        const { stockLevelId } = await product("Brioche", 5);
        await expect(
            tx((t) =>
                move(t, actor, {
                    from: { stockLevelId },
                    toStoreId: otherStore,
                    units: 1,
                }),
            ),
        ).rejects.toThrow(NotFoundException);
        // Nor can another business name this business's shelf.
        await expect(
            tx((t) =>
                count(
                    t,
                    { organizationId: otherOrgId, userId: users.STRANGER },
                    { target: { stockLevelId }, counted: 0 },
                ),
            ),
        ).rejects.toThrow(NotFoundException);
        expect(await onHand(stockLevelId)).toBe(5);
    });

    it("refuses stock changes at a closed storefront", async () => {
        const { productId, stockLevelId } = await product("Scone", 4);
        await prisma.store.update({
            where: { id: closed },
            data: { deletedAt: new Date() },
        });
        await expect(
            tx((t) =>
                move(t, actor, {
                    from: { stockLevelId },
                    toStoreId: closed,
                    units: 1,
                }),
            ),
        ).rejects.toThrow("This storefront is closed");
        await expect(
            tx((t) =>
                count(t, actor, {
                    target: { storeId: closed, productId },
                    counted: 2,
                }),
            ),
        ).rejects.toThrow(ConflictException);
        expect(await onHand(stockLevelId)).toBe(4);
    });

    it("undoing a count 10 → 8 after 3 sold adds the 2 back: 7", async () => {
        const { stockLevelId } = await product("Seeded rye", 10);
        const { entry: counted } = await tx((t) =>
            count(t, actor, { target: { stockLevelId }, counted: 8 }),
        );
        const orderId = await order();
        await tx(async (t) => {
            await t.$queryRaw`SELECT id FROM "StockLevel" WHERE id = ${stockLevelId} FOR UPDATE`;
            await recordSold(t, { stockLevelId, units: 3, orderId });
        });
        expect(await onHand(stockLevelId)).toBe(5);
        const [undo] = await tx((t) =>
            reverse(t, actor, { entryIds: [counted.id] }),
        );
        expect(undo).toMatchObject({
            kind: "REVERSED",
            quantity: 2,
            before: 5,
            after: 7,
            reversesId: counted.id,
        });
        // Undone once only; an undo is never undone.
        await expect(
            tx((t) => reverse(t, actor, { entryIds: [counted.id] })),
        ).rejects.toThrow("already been undone");
        await expect(
            tx((t) => reverse(t, actor, { entryIds: [undo.id] })),
        ).rejects.toThrow("An undo can't be undone.");
    });

    it("a sale or a return comes back only through its order", async () => {
        const { stockLevelId } = await product("Bagel", 6);
        const orderId = await order();
        const [sold, returned] = await tx(async (t) => {
            await t.$queryRaw`SELECT id FROM "StockLevel" WHERE id = ${stockLevelId} FOR UPDATE`;
            return [
                await recordSold(t, { stockLevelId, units: 2, orderId }),
                await recordReturned(t, { stockLevelId, units: 1, orderId }),
            ];
        });
        await expect(
            tx((t) => reverse(t, actor, { entryIds: [sold.id] })),
        ).rejects.toThrow(ConflictException);
        await expect(
            tx((t) => reverse(t, actor, { entryIds: [returned.id] })),
        ).rejects.toThrow(ConflictException);
        // The order's own undo (the kitchen taking a fulfilment back).
        const undo = await tx(async (t) => {
            await t.$queryRaw`SELECT id FROM "StockLevel" WHERE id = ${stockLevelId} FOR UPDATE`;
            return reverseSale(t, { stockLevelId, units: 2, orderId });
        });
        expect(undo).toMatchObject({
            kind: "REVERSED",
            quantity: 2,
            reversesId: sold.id,
            orderId,
        });
        expect(await onHand(stockLevelId)).toBe(7);
    });

    it("undoing one side of a move undoes both", async () => {
        const { stockLevelId } = await product("Tea cake", 8);
        const moved = await tx((t) =>
            move(t, actor, {
                from: { stockLevelId },
                toStoreId: online,
                units: 2,
            }),
        );
        const onlineBefore = await onHand(moved.in.stockLevelId);
        const undone = await tx((t) =>
            reverse(t, actor, { entryIds: [moved.in.id] }),
        );
        expect(undone).toHaveLength(2);
        expect(undone.map((e) => e.reversesId).sort()).toEqual(
            [moved.out.id, moved.in.id].sort(),
        );
        expect(new Set(undone.map((e) => e.pairId)).size).toBe(1);
        expect(undone[0].pairId).not.toBe(moved.pairId);
        expect(await onHand(stockLevelId)).toBe(8);
        expect(await onHand(moved.in.stockLevelId)).toBe(onlineBefore - 2);
    });

    it("a batch undo where one would go below 0 applies none", async () => {
        const a = await product("Batch A", 5);
        const b = await product("Batch B", 5);
        const c = await product("Batch C", 1);
        const counts = await tx((t) =>
            countAll(t, actor, [
                { target: { stockLevelId: a.stockLevelId }, counted: 7 },
                { target: { stockLevelId: b.stockLevelId }, counted: 9 },
                { target: { stockLevelId: c.stockLevelId }, counted: 4 },
            ]),
        );
        // C sells 2 (4 → 2): undoing its +3 would leave −1.
        const orderId = await order();
        await tx(async (t) => {
            await t.$queryRaw`SELECT id FROM "StockLevel" WHERE id = ${c.stockLevelId} FOR UPDATE`;
            await recordSold(t, {
                stockLevelId: c.stockLevelId,
                units: 2,
                orderId,
            });
        });
        await expect(
            tx((t) =>
                reverse(t, actor, {
                    entryIds: counts.map((r) => r.entry.id),
                }),
            ),
        ).rejects.toThrow(ConflictException);
        expect(await onHand(a.stockLevelId)).toBe(7);
        expect(await onHand(b.stockLevelId)).toBe(9);
        expect(await onHand(c.stockLevelId)).toBe(2);
        expect(
            await prisma.stockEntry.count({
                where: {
                    reversesId: { in: counts.map((r) => r.entry.id) },
                },
            }),
        ).toBe(0);
    });

    it("fulfilling an order logs the sale; taking it back logs the undo", async () => {
        const { productId, stockLevelId } = await product("Order loaf", 10);
        const orderId = await order();
        const item = await prisma.orderItem.create({
            data: {
                orderId,
                productId,
                price: "50.00",
                quantity: 3,
            },
        });
        const { applyInventoryTransition } =
            await import("../orders/order-inventory");
        const line = { id: item.id, productId, quantity: 3 };
        await tx((t) =>
            applyInventoryTransition(t, [line], "RELEASED", "RESERVED"),
        );
        // A promise is not a shelf change: nothing logged.
        expect(await entriesOf(stockLevelId)).toHaveLength(1);
        await tx((t) =>
            applyInventoryTransition(t, [line], "RESERVED", "COMMITTED"),
        );
        await tx((t) =>
            applyInventoryTransition(t, [line], "COMMITTED", "RESERVED"),
        );
        const log = await entriesOf(stockLevelId);
        expect(log.map((e) => [e.kind, e.quantity])).toEqual([
            ["COUNTED", 10],
            ["SOLD", -3],
            ["REVERSED", 3],
        ]);
        expect(log[2].reversesId).toBe(log[1].id);
        expect(
            await prisma.stockLevel.findUniqueOrThrow({
                where: { id: stockLevelId },
                select: { onHand: true, promised: true },
            }),
        ).toEqual({ onHand: 10, promised: 3 });
    });

    describe("who may count", () => {
        it("a stored role with store:write but no inventory:write counts", async () => {
            const { productId } = await product("Manager count", 4);
            const manager = custom(users.MANAGER, [
                "store:read",
                "store:write",
            ]);
            const result = await inventory.upsertIn(
                await access.stock(manager, productId, hill),
                productId,
                { quantity: 6 },
            );
            expect(result.quantity).toBe(6);
            // The same role through the storefront alias, resolved from its
            // stored row.
            await inventory.upsert(hill, productId, users.MANAGER, {
                quantity: 5,
            });
        });

        it("a Member holding neither gets 403", async () => {
            const { productId } = await product("Member count", 4);
            await expect(
                access.stock(ctx("MEMBER"), productId, hill),
            ).rejects.toThrow(ForbiddenException);
            // On the alias, as ever, not found.
            await expect(
                inventory.upsert(hill, productId, users.MEMBER, {
                    quantity: 1,
                }),
            ).rejects.toThrow(NotFoundException);
        });

        it("an inventory:write-only role counts, but can't change a price", async () => {
            const { productId, stockLevelId } = await product("Clerk count", 4);
            const clerk = custom(users.CLERK, [
                "store:read",
                "inventory:write",
            ]);
            await inventory.upsertIn(
                await access.stock(clerk, productId, hill),
                productId,
                { quantity: 2 },
            );
            await inventory.upsert(hill, productId, users.CLERK, {
                quantity: 3,
            });
            expect(await onHand(stockLevelId)).toBe(3);
            const [, viaOrg, viaAlias] = await entriesOf(stockLevelId);
            expect(viaOrg.actorUserId).toBe(users.CLERK);
            expect(viaAlias.actorUserId).toBe(users.CLERK);

            await expect(access.write(clerk, productId, hill)).rejects.toThrow(
                ForbiddenException,
            );
            await expect(
                products.patch(hill, productId, users.CLERK, {
                    price: "1.00",
                }),
            ).rejects.toThrow(NotFoundException);
        });

        it("switching to per-variant stock needs store:write", async () => {
            const { productId } = await product("Sized loaf", 4);
            const owner = await access.write(ctx("OWNER"), productId, hill);
            const { VariantsService } =
                await import("../products/variants.service");
            const variants = new VariantsService(products);
            const small = await variants.createIn(owner, productId, {
                title: "Small",
                sku: `SK-S-${tag}`,
                price: "40.00",
            });
            const clerk = custom(users.CLERK, [
                "store:read",
                "inventory:write",
            ]);
            await expect(
                inventory.setVariantsIn(
                    await access.stock(clerk, productId, hill),
                    productId,
                    {
                        variants: [
                            {
                                variantId: small.id,
                                quantity: 4,
                                lowStockAlert: 1,
                            },
                        ],
                    },
                ),
            ).rejects.toThrow(ForbiddenException);
            // The owner switches it; from then on the clerk counts each.
            await inventory.setVariantsIn(
                await access.stock(ctx("OWNER"), productId, hill),
                productId,
                {
                    variants: [
                        { variantId: small.id, quantity: 4, lowStockAlert: 1 },
                    ],
                },
            );
            const view = await inventory.setVariantsIn(
                await access.stock(clerk, productId, hill),
                productId,
                {
                    variants: [
                        { variantId: small.id, quantity: 2, lowStockAlert: 1 },
                    ],
                },
            );
            expect(view.variants).toEqual([
                expect.objectContaining({ variantId: small.id, quantity: 2 }),
            ]);
        });
    });
});
