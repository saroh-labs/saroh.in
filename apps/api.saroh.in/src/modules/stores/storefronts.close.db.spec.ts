import { ConflictException } from "@nestjs/common";
import { prisma } from "@saroh/database";

import type { StockActor } from "../stock/stock.service";
import { count, move } from "../stock/stock.service";
import { StorefrontsService } from "./storefronts.service";

/**
 * Closing a storefront (#512), against a real database: refused while stock
 * is on hand or promised there; once it is counted out the storefront closes,
 * the business keeps every catalogue product, and nothing can be counted or
 * moved into the closed storefront.
 */
const tag = `${process.pid}-${Date.now()}`;

describe("Closing a storefront that holds stock (DB)", () => {
    const service = new StorefrontsService();
    let orgId = "";
    let hill = "";
    let online = "";
    let actor: StockActor;

    const tx = <T>(fn: Parameters<typeof prisma.$transaction<T>>[0]) =>
        prisma.$transaction(fn);

    async function storefront(name: string) {
        return (
            await prisma.store.create({
                data: {
                    name,
                    slug: `sc-${name.toLowerCase().replace(/\s+/g, "-")}-${tag}`,
                    organizationId: orgId,
                },
            })
        ).id;
    }

    /** A catalogue product listed at `storeId`, with `onHand` counted there. */
    async function product(name: string, storeId: string, onHand: number) {
        const { id } = await prisma.product.create({
            data: {
                organizationId: orgId,
                storeId,
                name,
                slug: `${name.toLowerCase().replace(/\s+/g, "-")}-${tag}`,
                price: "40.00",
                listings: { create: { storeId } },
            },
        });
        const { shelf } = await tx((t) =>
            count(t, actor, {
                target: { storeId, productId: id },
                counted: onHand,
            }),
        );
        return { productId: id, stockLevelId: shelf.stockLevelId };
    }

    const isClosed = async (storeId: string) =>
        (
            await prisma.store.findUniqueOrThrow({
                where: { id: storeId },
                select: { deletedAt: true },
            })
        ).deletedAt !== null;

    beforeAll(async () => {
        orgId = (
            await prisma.organization.create({
                data: { name: "Northwind", slug: `sc-nw-${tag}` },
            })
        ).id;
        actor = { organizationId: orgId, userId: null };
        hill = await storefront("Hill Road");
        online = await storefront("Online");
    });

    // The integration setup truncates every table after the file.
    afterAll(() => prisma.$disconnect());

    it("says what stock a storefront holds", async () => {
        const store = await storefront("Stall");
        await product("Candle", store, 3);
        const s = await service.get(orgId, store);
        expect(s.stock).toEqual({ onHand: 3, promised: 0 });
    });

    it("refuses to close with 3 on hand: move or count out its stock first", async () => {
        const store = await storefront("Kiosk");
        await product("Soap", store, 3);
        const refusal = service.close(orgId, store);
        await expect(refusal).rejects.toThrow(ConflictException);
        await expect(service.close(orgId, store)).rejects.toThrow(
            "Move or count out its stock first",
        );
        expect(await isClosed(store)).toBe(false);
    });

    it("refuses to close while stock is promised there, even with none on hand", async () => {
        const store = await storefront("Pop-up");
        const { stockLevelId } = await product("Mug", store, 0);
        await prisma.stockLevel.update({
            where: { id: stockLevelId },
            data: { promised: 2 },
        });
        await expect(service.close(orgId, store)).rejects.toThrow(
            "Move or count out its stock first",
        );
        expect(await isClosed(store)).toBe(false);
    });

    it("closes once its stock is moved and counted out, and keeps the catalogue", async () => {
        const store = await storefront("Market");
        const moved = await product("Scarf", store, 4);
        const counted = await product("Throw", store, 2);
        await tx((t) =>
            move(t, actor, {
                from: { stockLevelId: moved.stockLevelId },
                toStoreId: hill,
                units: 4,
            }),
        );
        await tx((t) =>
            count(t, actor, {
                target: { stockLevelId: counted.stockLevelId },
                counted: 0,
            }),
        );
        const before = await prisma.product.count({
            where: { organizationId: orgId },
        });

        await service.close(orgId, store);

        expect(await isClosed(store)).toBe(true);
        // Closing never removes a catalogue product: both are still the
        // business's, and the Scarf's four now sit at Hill Road.
        expect(
            await prisma.product.count({ where: { organizationId: orgId } }),
        ).toBe(before);
        await expect(
            prisma.product.findUniqueOrThrow({
                where: { id: counted.productId },
            }),
        ).resolves.toMatchObject({ organizationId: orgId });
        const atHill = await prisma.stockLevel.findFirstOrThrow({
            where: { storeId: hill, productId: moved.productId },
        });
        expect(atHill.onHand).toBe(4);
    });

    it("refuses a count or a move into a closed storefront", async () => {
        const store = await storefront("Old Market");
        const { productId } = await product("Tote", online, 5);
        await service.close(orgId, store);
        const shelf = await prisma.stockLevel.findFirstOrThrow({
            where: { storeId: online, productId },
        });

        await expect(
            tx((t) =>
                count(t, actor, {
                    target: { storeId: store, productId },
                    counted: 2,
                }),
            ),
        ).rejects.toThrow("This storefront is closed");
        await expect(
            tx((t) =>
                move(t, actor, {
                    from: { stockLevelId: shelf.id },
                    toStoreId: store,
                    units: 1,
                }),
            ),
        ).rejects.toThrow("This storefront is closed");
        const after = await prisma.stockLevel.findUniqueOrThrow({
            where: { id: shelf.id },
        });
        expect(after.onHand).toBe(5);
        expect(
            await prisma.stockLevel.count({ where: { storeId: store } }),
        ).toBe(0);
    });
});
