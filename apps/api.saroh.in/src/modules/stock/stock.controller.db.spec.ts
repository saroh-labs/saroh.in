// The real guard loads better-auth, an ESM build Jest does not transform;
// the handlers are called directly, so the guards never run here.
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
import { resolveCapabilities } from "../organizations/organization-policy";
import { ListingsService } from "../products/listings.service";
import { ProductAccess } from "../products/product-access";
import { ProductsService } from "../products/products.service";
import { StoresService } from "../stores/stores.service";
import { StockChecksService } from "./stock-checks.service";
import { StockReadsService } from "./stock-reads.service";
import { StockWritesService, UNTRACKED } from "./stock-writes.service";
import { StockController } from "./stock.controller";
import { count } from "./stock.service";

/**
 * The Stock API (#514) through its controller, against a real database:
 * what the Stock screen reads (levels, log) and writes (counts, entries,
 * adjust, moves, undo), who may, and that nothing of another business is
 * ever found.
 */
const tag = `${process.pid}-${Date.now()}`;

describe("Stock API (DB)", () => {
    const flags = {
        isEnabled: () => Promise.resolve(true),
    } as unknown as FeatureFlagService;
    const stores = new StoresService(flags);
    const access = new ProductAccess(stores);
    const products = new ProductsService(stores, undefined, access);
    const listings = new ListingsService();
    const idempotency = new IdempotencyService();
    const api = new StockController(
        new StockReadsService(),
        new StockWritesService(idempotency),
        new StockChecksService(idempotency),
    );

    const users: Record<string, string> = {};
    let orgId = "";
    let hill = "";
    let online = "";
    let otherOrgId = "";
    let otherStore = "";
    let otherProduct = "";
    let customerId = "";

    function ctx(role: OrganizationContext["role"]): OrganizationContext {
        return { organizationId: orgId, userId: users[role] ?? "", role };
    }

    /** A role the business made, resolved like the guard resolves it. */
    function custom(who: string, actions: string[]): OrganizationContext {
        return {
            organizationId: orgId,
            userId: users[who] ?? "",
            role: "MEMBER",
            roleKey: "custom",
            actions: resolveCapabilities("custom", actions),
        };
    }

    const owner = () => ctx("OWNER");

    async function storefront(organizationId: string, name: string) {
        return (
            await prisma.store.create({
                data: {
                    name,
                    slug: `sa-${name.toLowerCase().replace(/\s+/g, "-")}-${tag}`,
                    organizationId,
                },
            })
        ).id;
    }

    /**
     * A product sold at Hill Road, counting `onHand` there (a shelf the
     * stock module opens, as Track stock will) — or counting nothing.
     */
    async function product(name: string, onHand: number | null) {
        const scope = await access.write(owner(), undefined, hill);
        const { id } = await products.createIn(scope, {
            name,
            price: "50.00",
        });
        if (onHand !== null) {
            await prisma.$transaction((t) =>
                count(
                    t,
                    { organizationId: orgId, userId: users.OWNER },
                    {
                        target: { storeId: hill, productId: id },
                        counted: onHand,
                    },
                ),
            );
        }
        return id;
    }

    const shelf = (storeId: string, productId: string) =>
        prisma.stockLevel.findFirstOrThrow({
            where: { storeId, productId, variantId: null },
        });

    const key = () => `key-${Math.random().toString(36).slice(2, 12)}`;

    beforeAll(async () => {
        for (const who of ["OWNER", "MEMBER", "CLERK", "READER", "STRANGER"]) {
            users[who] = (
                await prisma.user.create({
                    data: {
                        email: `sa-${who.toLowerCase()}-${tag}@example.com`,
                        name: who === "OWNER" ? "Asha Rao" : null,
                    },
                })
            ).id;
        }
        orgId = (
            await prisma.organization.create({
                data: { name: "Rye & Co.", slug: `sa-rye-${tag}` },
            })
        ).id;
        otherOrgId = (
            await prisma.organization.create({
                data: { name: "Elsewhere", slug: `sa-else-${tag}` },
            })
        ).id;
        await prisma.membership.createMany({
            data: [
                { organizationId: orgId, userId: users.OWNER, role: "OWNER" },
                { organizationId: orgId, userId: users.MEMBER, role: "MEMBER" },
                {
                    organizationId: otherOrgId,
                    userId: users.STRANGER,
                    role: "OWNER",
                },
            ],
        });
        hill = await storefront(orgId, "Hill Road");
        online = await storefront(orgId, "Online");
        otherStore = await storefront(otherOrgId, "Elsewhere");
        customerId = (
            await prisma.customer.create({
                data: { storeId: hill, email: `sa-buyer-${tag}@example.com` },
            })
        ).id;
        const elsewhere = await access.write(
            {
                organizationId: otherOrgId,
                userId: users.STRANGER,
                role: "OWNER",
            },
            undefined,
            otherStore,
        );
        otherProduct = (
            await products.createIn(elsewhere, { name: "Theirs", price: "9" })
        ).id;
        await prisma.$transaction((t) =>
            count(
                t,
                { organizationId: otherOrgId, userId: users.STRANGER },
                {
                    target: { storeId: otherStore, productId: otherProduct },
                    counted: 4,
                },
            ),
        );
    });

    describe("levels", () => {
        it("two storefronts: one cell each with on hand, promised, can sell, warns at, last change", async () => {
            const id = await product("Sourdough", 10);
            await listings.list(orgId, id, online);
            await api.counts(owner(), {
                counts: [
                    { storeId: online, productId: id, counted: 4, expected: 0 },
                ],
            });
            await prisma.stockLevel.update({
                where: { id: (await shelf(hill, id)).id },
                data: { promised: 3, lowStockAlert: 8 },
            });

            const view = await api.levels(owner(), { product: id });
            expect(view.storefronts.map((s) => s.name)).toEqual([
                "Hill Road",
                "Online",
            ]);
            expect(view.rows).toHaveLength(1);
            const [row] = view.rows;
            expect(row).toMatchObject({
                productId: id,
                productName: "Sourdough",
                variantId: null,
            });
            expect(row.cells).toHaveLength(2);
            expect(row.cells[0]).toMatchObject({
                storeId: hill,
                soldHere: true,
                onHand: 10,
                promised: 3,
                canSell: 7,
                warnAt: 8,
                short: 0,
                word: "LOW",
                lastChange: { kind: "COUNTED", quantity: 10 },
            });
            expect(row.cells[1]).toMatchObject({
                storeId: online,
                soldHere: true,
                onHand: 4,
                promised: 0,
                canSell: 4,
                // A new shelf warns at 10.
                warnAt: 10,
                word: "LOW",
                lastChange: { kind: "COUNTED", quantity: 4 },
            });
            expect(row.lastChange?.at).toEqual(row.cells[1].lastChange?.at);
            expect(view.canWrite).toBe(true);
        });

        it("a storefront that doesn't sell it reads Not sold here, with its stock shown", async () => {
            const id = await product("Rye loaf", 6);
            await listings.list(orgId, id, online);
            await api.adjust(owner(), {
                storeId: online,
                productId: id,
                units: 3,
            });
            await listings.unlist(orgId, id, online);

            const [row] = (await api.levels(owner(), { product: id })).rows;
            const at = row.cells.find((c) => c.storeId === online);
            expect(at).toMatchObject({
                soldHere: false,
                word: "NOT_SOLD_HERE",
                onHand: 3,
            });
            // Never listed there and no shelf: not sold, nothing on hand.
            const plain = await product("Bap", 2);
            const [bap] = (await api.levels(owner(), { product: plain })).rows;
            expect(bap.cells[1]).toMatchObject({
                storeId: online,
                stockLevelId: null,
                soldHere: false,
                onHand: 0,
                word: "NOT_SOLD_HERE",
            });
        });

        it("products that count no stock are listed apart, as untracked", async () => {
            const id = await product("Gift card", null);
            const view = await api.levels(owner(), {});
            expect(view.untracked).toEqual(
                expect.arrayContaining([
                    expect.objectContaining({
                        productId: id,
                        name: "Gift card",
                    }),
                ]),
            );
            expect(view.rows.some((r) => r.productId === id)).toBe(false);
            // Counting it would start tracking it: that is Track stock.
            await expect(
                api.counts(owner(), {
                    counts: [{ storeId: hill, productId: id, counted: 5 }],
                }),
            ).rejects.toThrow(UNTRACKED);
        });

        it("narrows to one storefront, and never reads another business", async () => {
            const view = await api.levels(owner(), { storefront: online });
            expect(view.storefronts.map((s) => s.id)).toEqual([online]);
            expect(view.rows.every((r) => r.cells.length === 1)).toBe(true);
            expect(view.rows.some((r) => r.productId === otherProduct)).toBe(
                false,
            );
            await expect(
                api.levels(owner(), { storefront: otherStore }),
            ).rejects.toThrow(NotFoundException);
            await expect(
                api.levels(owner(), { product: otherProduct }),
            ).rejects.toThrow(NotFoundException);
        });

        it("a Member reads levels but can't write", async () => {
            const view = await api.levels(ctx("MEMBER"), {});
            expect(view.canWrite).toBe(false);
        });
    });

    describe("writes", () => {
        it("adjust +5 writes a received entry and the levels read reflects it", async () => {
            const id = await product("Baguette", 2);
            const result = await api.adjust(owner(), {
                storeId: hill,
                productId: id,
                units: 5,
            });
            expect(result.entry).toMatchObject({
                kind: "RECEIVED",
                quantity: 5,
                before: 2,
                after: 7,
            });
            expect(result.shelf).toMatchObject({ onHand: 7, canSell: 7 });
            const [row] = (await api.levels(owner(), { product: id })).rows;
            expect(row.cells[0]).toMatchObject({
                onHand: 7,
                lastChange: { kind: "RECEIVED", quantity: 5 },
            });
        });

        it("a repeated idempotency key applies once", async () => {
            const id = await product("Focaccia", 1);
            const k = key();
            const first = await api.adjust(owner(), {
                storeId: hill,
                productId: id,
                units: 4,
                idempotencyKey: k,
            });
            const again = await api.adjust(owner(), {
                storeId: hill,
                productId: id,
                units: 4,
                idempotencyKey: k,
            });
            expect(again.entry.id).toBe(first.entry.id);
            expect((await shelf(hill, id)).onHand).toBe(5);
            expect(
                await prisma.stockEntry.count({
                    where: { productId: id, kind: "RECEIVED" },
                }),
            ).toBe(1);
            // The same key for something else is a conflict, not a replay.
            await expect(
                api.adjust(owner(), {
                    storeId: hill,
                    productId: id,
                    units: 9,
                    idempotencyKey: k,
                }),
            ).rejects.toThrow(ConflictException);
        });

        it("counts keep what was shown and what was counted; a moved shelf didn't match", async () => {
            const a = await product("Croissant", 10);
            const b = await product("Danish", 9);
            const saved = await api.counts(owner(), {
                counts: [
                    { storeId: hill, productId: a, expected: 10, counted: 8 },
                    // Shown 10, but the shelf is 9 now.
                    { storeId: hill, productId: b, expected: 10, counted: 9 },
                ],
            });
            expect(saved).toMatchObject({
                counted: 2,
                changed: 1,
                mismatched: 1,
            });
            expect(saved.entryIds).toHaveLength(2);
            expect(saved.results[0].entry).toMatchObject({
                kind: "COUNTED",
                expected: 10,
                counted: 8,
                before: 10,
                after: 8,
            });
            expect(saved.results[1].mismatch).toBe(true);

            // Undo the whole count, as the bar's Undo does.
            const undone = await api.reverse(owner(), {
                entryIds: saved.entryIds,
            });
            expect(undone.entries).toHaveLength(2);
            expect((await shelf(hill, a)).onHand).toBe(10);
        });

        it("entries record received, baked, wasted and returned", async () => {
            const id = await product("Pain au chocolat", 5);
            const baked = await api.entries(owner(), {
                storeId: hill,
                productId: id,
                kind: "BAKED",
                units: 12,
            });
            expect(baked.entry).toMatchObject({ kind: "BAKED", quantity: 12 });
            const wasted = await api.entries(owner(), {
                storeId: hill,
                productId: id,
                kind: "WASTED",
                units: 2,
                note: "Dropped",
            });
            expect(wasted.entry).toMatchObject({
                kind: "WASTED",
                quantity: -2,
                note: "Dropped",
            });
            const order = await prisma.order.create({
                data: {
                    storeId: hill,
                    organizationId: orgId,
                    orderId: `SA-${Math.random().toString(36).slice(2, 8)}`,
                    customerId,
                    subtotal: "0",
                    total: "0",
                },
            });
            const returned = await api.entries(owner(), {
                storeId: hill,
                productId: id,
                kind: "RETURNED",
                units: 1,
                orderId: order.id,
            });
            expect(returned.entry).toMatchObject({
                kind: "RETURNED",
                quantity: 1,
                orderId: order.id,
            });
            expect(returned.shelf.onHand).toBe(16);
            // A return comes back only through a count.
            await expect(
                api.reverse(owner(), { entryIds: [returned.entry.id] }),
            ).rejects.toThrow(ConflictException);
        });

        it("moves only what isn't promised, as a pair, and undoes both sides", async () => {
            const id = await product("Cinnamon bun", 10);
            await listings.list(orgId, id, online);
            await prisma.stockLevel.update({
                where: { id: (await shelf(hill, id)).id },
                data: { promised: 8 },
            });
            await expect(
                api.move(owner(), {
                    fromStoreId: hill,
                    toStoreId: online,
                    productId: id,
                    units: 3,
                }),
            ).rejects.toThrow(
                "Only 2 can be moved from Hill Road. The rest are promised to orders there.",
            );
            const moved = await api.move(owner(), {
                fromStoreId: hill,
                toStoreId: online,
                productId: id,
                units: 2,
            });
            expect(moved.out).toMatchObject({ kind: "MOVED", quantity: -2 });
            expect(moved.in).toMatchObject({ kind: "MOVED", quantity: 2 });
            expect(moved.out.pairId).toBe(moved.in.pairId);
            await api.reverse(owner(), { entryIds: [moved.out.id] });
            expect((await shelf(hill, id)).onHand).toBe(10);
            expect((await shelf(online, id)).onHand).toBe(0);
        });
    });

    describe("who may", () => {
        it("writes without Count and move stock → 403", async () => {
            const id = await product("Scone", 3);
            const noStock = custom("READER", ["store:read"]);
            for (const write of [
                () =>
                    api.adjust(ctx("MEMBER"), {
                        storeId: hill,
                        productId: id,
                        units: 1,
                    }),
                () =>
                    api.counts(noStock, {
                        counts: [{ storeId: hill, productId: id, counted: 1 }],
                    }),
                () =>
                    api.entries(noStock, {
                        storeId: hill,
                        productId: id,
                        kind: "WASTED",
                        units: 1,
                    }),
                () =>
                    api.move(noStock, {
                        fromStoreId: hill,
                        toStoreId: online,
                        productId: id,
                        units: 1,
                    }),
                () => api.reverse(noStock, { entryIds: ["x"] }),
                () => api.resolveCheck(noStock, "short:x", {}),
            ]) {
                await expect(write()).rejects.toThrow(ForbiddenException);
            }
            // A stock clerk (inventory:write only) may.
            const clerk = custom("CLERK", ["store:read", "inventory:write"]);
            await expect(
                api.adjust(clerk, { storeId: hill, productId: id, units: 1 }),
            ).resolves.toMatchObject({ entry: { kind: "RECEIVED" } });
        });

        it("every id from another business is not found", async () => {
            const id = await product("Tea cake", 3);
            const cases: [string, () => Promise<unknown>][] = [
                [
                    "count at their storefront",
                    () =>
                        api.counts(owner(), {
                            counts: [
                                {
                                    storeId: otherStore,
                                    productId: id,
                                    counted: 1,
                                },
                            ],
                        }),
                ],
                [
                    "count their product",
                    () =>
                        api.counts(owner(), {
                            counts: [
                                {
                                    storeId: hill,
                                    productId: otherProduct,
                                    counted: 1,
                                },
                            ],
                        }),
                ],
                [
                    "adjust their product",
                    () =>
                        api.adjust(owner(), {
                            storeId: otherStore,
                            productId: otherProduct,
                            units: 1,
                        }),
                ],
                [
                    "entry with their order",
                    async () => {
                        const theirs = await prisma.order.create({
                            data: {
                                storeId: otherStore,
                                organizationId: otherOrgId,
                                orderId: `SA-X-${Math.random().toString(36).slice(2, 8)}`,
                                customerId: (
                                    await prisma.customer.create({
                                        data: {
                                            storeId: otherStore,
                                            email: `sa-x-${Math.random()}@example.com`,
                                        },
                                    })
                                ).id,
                                subtotal: "0",
                                total: "0",
                            },
                        });
                        return api.entries(owner(), {
                            storeId: hill,
                            productId: id,
                            kind: "RETURNED",
                            units: 1,
                            orderId: theirs.id,
                        });
                    },
                ],
                [
                    "move to their storefront",
                    () =>
                        api.move(owner(), {
                            fromStoreId: hill,
                            toStoreId: otherStore,
                            productId: id,
                            units: 1,
                        }),
                ],
                [
                    "undo their entry",
                    async () => {
                        const theirs = await prisma.stockEntry.findFirstOrThrow(
                            {
                                where: { organizationId: otherOrgId },
                            },
                        );
                        return api.reverse(owner(), { entryIds: [theirs.id] });
                    },
                ],
                [
                    "log by their storefront",
                    () => api.log(owner(), { storefront: otherStore }),
                ],
                [
                    "log by their product",
                    () => api.log(owner(), { product: otherProduct }),
                ],
                [
                    "log after their entry",
                    async () => {
                        const theirs = await prisma.stockEntry.findFirstOrThrow(
                            {
                                where: { organizationId: otherOrgId },
                            },
                        );
                        return api.log(owner(), { cursor: theirs.id });
                    },
                ],
                [
                    "resolve their check",
                    async () => {
                        const row = await shelf(otherStore, otherProduct);
                        return api.resolveCheck(owner(), `short:${row.id}`, {});
                    },
                ],
            ];
            for (const [name, call] of cases) {
                await expect(
                    call().then(
                        () => `${name}: found`,
                        (e: unknown) =>
                            e instanceof NotFoundException
                                ? "not found"
                                : `${name}: ${String(e)}`,
                    ),
                ).resolves.toBe("not found");
            }
            // Nothing of theirs changed.
            expect((await shelf(otherStore, otherProduct)).onHand).toBe(4);
        });
    });

    describe("the log", () => {
        it("filtered by Wasted and a storefront returns only those", async () => {
            const id = await product("Bloomer", 20);
            await listings.list(orgId, id, online);
            await api.adjust(owner(), {
                storeId: online,
                productId: id,
                units: 5,
            });
            await api.entries(owner(), {
                storeId: hill,
                productId: id,
                kind: "WASTED",
                units: 2,
            });
            await api.entries(owner(), {
                storeId: online,
                productId: id,
                kind: "WASTED",
                units: 1,
            });
            const log = await api.log(owner(), {
                kind: ["WASTED"],
                storefront: online,
            });
            expect(log.entries.length).toBeGreaterThan(0);
            expect(
                log.entries.every(
                    (e) => e.kind === "WASTED" && e.storeId === online,
                ),
            ).toBe(true);
            expect(log.entries[0]).toMatchObject({
                word: "Wasted",
                quantity: -1,
                storeName: "Online",
                productName: "Bloomer",
                canUndo: true,
                undone: false,
            });
        });

        it("pages newest first with a cursor", async () => {
            const id = await product("Muffin", 1);
            for (const units of [1, 2, 3]) {
                await api.adjust(owner(), {
                    storeId: hill,
                    productId: id,
                    units,
                });
            }
            const first = await api.log(owner(), { product: id, limit: 2 });
            expect(first.entries.map((e) => e.quantity)).toEqual([3, 2]);
            expect(first.nextCursor).not.toBeNull();
            const next = await api.log(owner(), {
                product: id,
                limit: 2,
                cursor: first.nextCursor ?? undefined,
            });
            expect(next.entries.map((e) => e.quantity)).toEqual([1, 1]);
            expect(next.nextCursor).toBeNull();
        });

        it("names people only for audit:read, and orders only for order:read", async () => {
            const id = await product("Eccles cake", 4);
            const order = await prisma.order.create({
                data: {
                    storeId: hill,
                    organizationId: orgId,
                    orderId: `SA-${Math.random().toString(36).slice(2, 8)}`,
                    customerId,
                    subtotal: "0",
                    total: "0",
                },
            });
            await api.entries(owner(), {
                storeId: hill,
                productId: id,
                kind: "RETURNED",
                units: 1,
                orderId: order.id,
            });

            const asOwner = await api.log(owner(), { product: id });
            expect(asOwner.seesPeople).toBe(true);
            expect(asOwner.entries[0]).toMatchObject({
                by: { id: users.OWNER, name: "Asha Rao" },
                order: { id: order.id, number: order.orderId },
            });

            const reader = custom("READER", ["store:read"]);
            const asReader = await api.log(reader, { product: id });
            expect(asReader.seesPeople).toBe(false);
            expect(asReader.seesOrders).toBe(false);
            expect(asReader.entries.every((e) => e.by === null)).toBe(true);
            expect(asReader.entries.every((e) => e.order === null)).toBe(true);
            expect(asReader.entries.every((e) => !e.canUndo)).toBe(true);
        });
    });
});
