import { ConflictException } from "@nestjs/common";
import { prisma } from "@saroh/database";

import { FeatureFlagService } from "../feature-flags/feature-flags.service";
import { PRODUCT_HAS_STOCK_HISTORY } from "../stock/stock-words";
import { adjust } from "../stock/stock.service";
import { StoresService } from "../stores/stores.service";
import { ProductsService } from "./products.service";
import { lockStockLevels } from "./stock-levels";

/**
 * Deleting a product against a real Postgres: it follows the lock order
 * (Product NO KEY UPDATE → its StockLevel rows), so a count or a receive
 * already holding one of its shelves finishes first and the delete is then
 * refused with the reason, never a deadlock (PR #533 review).
 */
const tag = `${process.pid}-${Date.now()}`;

describe("Deleting a product (DB)", () => {
    const products = new ProductsService(
        new StoresService(new FeatureFlagService()),
    );
    let ownerId = "";
    let orgId = "";
    let storeId = "";
    let seq = 0;

    beforeAll(async () => {
        ownerId = (
            await prisma.user.create({
                data: { email: `pr-owner-${tag}@example.com` },
            })
        ).id;
        orgId = (
            await prisma.organization.create({
                data: { name: "Rye & Co.", slug: `pr-rye-${tag}` },
            })
        ).id;
        await prisma.membership.create({
            data: { organizationId: orgId, userId: ownerId, role: "OWNER" },
        });
        storeId = (
            await prisma.store.create({
                data: {
                    name: "Hill Road",
                    slug: `pr-hill-${tag}`,
                    organizationId: orgId,
                },
            })
        ).id;
        await prisma.storeOwner.create({ data: { storeId, userId: ownerId } });
    });

    /** A tracked product listed here, with an empty shelf and no entries. */
    async function onEmptyShelf(name: string) {
        seq += 1;
        const product = await prisma.product.create({
            data: {
                storeId,
                organizationId: orgId,
                name,
                slug: `pr-${seq}-${tag}`,
                price: "10.00",
                stockTracked: true,
                stockTrackedAt: new Date(),
            },
        });
        await prisma.productListing.create({
            data: { organizationId: orgId, storeId, productId: product.id },
        });
        const shelf = await prisma.stockLevel.create({
            data: { organizationId: orgId, storeId, productId: product.id },
        });
        return { productId: product.id, shelfId: shelf.id };
    }

    it("deletes a product with an empty shelf, a listing and a collection", async () => {
        const { productId } = await onEmptyShelf("Seeded bun");
        const collection = await prisma.collection.create({
            data: {
                organizationId: orgId,
                name: `Buns ${tag}`,
                slug: `pr-buns-${tag}`,
            },
        });
        await prisma.collectionProduct.create({
            data: {
                organizationId: orgId,
                collectionId: collection.id,
                productId,
                position: 0,
            },
        });

        await products.remove(storeId, productId, ownerId);

        expect(await prisma.product.count({ where: { id: productId } })).toBe(
            0,
        );
        for (const count of [
            prisma.stockLevel.count({ where: { productId } }),
            prisma.productListing.count({ where: { productId } }),
            prisma.collectionProduct.count({ where: { productId } }),
        ]) {
            expect(await count).toBe(0);
        }
    });

    it("a receive already holding the product's empty shelf finishes; the delete is then refused, not deadlocked", async () => {
        const { productId, shelfId } = await onEmptyShelf("Rye roll");
        const actor = { organizationId: orgId, userId: ownerId };
        let locked!: () => void;
        const shelfLocked = new Promise<void>((r) => (locked = r));
        // The receive takes the shelf's lock, then — once the delete has
        // started — writes its entry, whose key check reads the product.
        const receive = prisma.$transaction(
            async (tx) => {
                await lockStockLevels(tx, [shelfId]);
                locked();
                await new Promise((r) => setTimeout(r, 400));
                return adjust(tx, actor, {
                    target: { stockLevelId: shelfId },
                    kind: "RECEIVED",
                    units: 3,
                });
            },
            { timeout: 15_000 },
        );
        await shelfLocked;
        const [received, removed] = await Promise.allSettled([
            receive,
            products.remove(storeId, productId, ownerId),
        ]);

        expect(received).toMatchObject({ status: "fulfilled" });
        expect(removed).toMatchObject({ status: "rejected" });
        const error = (removed as PromiseRejectedResult).reason as unknown;
        expect(error).toBeInstanceOf(ConflictException);
        expect((error as ConflictException).message).toBe(
            PRODUCT_HAS_STOCK_HISTORY,
        );
        expect(
            await prisma.stockLevel.findUniqueOrThrow({
                where: { id: shelfId },
                select: { onHand: true },
            }),
        ).toEqual({ onHand: 3 });
    });
});
