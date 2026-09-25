import { backfillListingsStockLevels, prisma } from "@saroh/database";

import { FeatureFlagService } from "../feature-flags/feature-flags.service";
import { OrdersService } from "../orders/orders.service";
import { StoresService } from "../stores/stores.service";
import { InventoryService } from "./inventory.service";
import { ProductsService } from "./products.service";

/**
 * The #510 backfill (packages/database/src/backfill/listings-stock-levels.ts)
 * against old-shape rows: products counted in Inventory / VariantInventory,
 * with no listing and no StockLevel, order lines that recorded only
 * `stockRow`, a product with no business yet, and two products of one
 * business sharing an address. The required business and the per-business
 * address index would refuse those rows, so both are relaxed for this file
 * and put back after — the backfill is what makes them hold.
 */
const tag = `${process.pid}-${Date.now()}`;
const at = (days: number) => new Date(Date.UTC(2026, 0, 1 + days));

describe("Listings and stock backfill (#510, DB)", () => {
    const stores = new StoresService(new FeatureFlagService());
    const products = new ProductsService(stores);
    const inventory = new InventoryService(products);
    const orders = new OrdersService(stores);

    let ownerId = "";
    let orgId = "";
    let hill = "";
    let closed = "";
    let customerId = "";
    const p: Record<string, string> = {};
    const v: Record<string, string> = {};
    const line: Record<string, string> = {};
    let openOrderId = "";

    async function product(
        name: string,
        storeId: string,
        extra: { slug?: string; createdAt?: Date } = {},
    ) {
        return (
            await prisma.product.create({
                data: {
                    organizationId: orgId,
                    storeId,
                    name,
                    slug: extra.slug ?? name.toLowerCase(),
                    price: "100.00",
                    status: "PUBLISHED",
                    createdAt: extra.createdAt,
                },
            })
        ).id;
    }

    async function order(
        status: string,
        items: {
            key: string;
            productId: string;
            variantId?: string;
            quantity: number;
            stockRow: "PRODUCT" | "VARIANT" | "NONE" | null;
        }[],
    ) {
        const n = await prisma.order.count({ where: { storeId: hill } });
        const created = await prisma.order.create({
            data: {
                storeId: hill,
                organizationId: orgId,
                customerId,
                orderId: `BF-${n + 1}`,
                subtotal: "100.00",
                total: "100.00",
                status,
                items: {
                    create: items.map((i) => ({
                        productId: i.productId,
                        variantId: i.variantId ?? null,
                        quantity: i.quantity,
                        price: "100.00",
                        stockRow: i.stockRow,
                    })),
                },
            },
            include: { items: { orderBy: { id: "asc" } } },
        });
        for (const item of items) {
            const made = created.items.find(
                (i) =>
                    i.productId === item.productId &&
                    i.variantId === (item.variantId ?? null) &&
                    i.quantity === item.quantity,
            );
            line[item.key] = made?.id ?? "";
        }
        return created.id;
    }

    /** Everything the backfill could touch, for "changed nothing". */
    async function snapshot() {
        const where = { organizationId: orgId };
        return {
            products: await prisma.product.findMany({
                where,
                orderBy: { id: "asc" },
                select: { id: true, slug: true, organizationId: true },
            }),
            listings: await prisma.productListing.findMany({
                where,
                orderBy: { id: "asc" },
                include: { variants: { orderBy: { id: "asc" } } },
            }),
            stock: await prisma.stockLevel.findMany({
                where,
                orderBy: { id: "asc" },
            }),
            lines: await prisma.orderItem.findMany({
                where: { order: { storeId: hill } },
                orderBy: { id: "asc" },
                select: {
                    id: true,
                    stockRow: true,
                    stockLevelId: true,
                    heldQuantity: true,
                },
            }),
        };
    }

    beforeAll(async () => {
        await prisma.$executeRawUnsafe(
            `ALTER TABLE "Product" ALTER COLUMN "organizationId" DROP NOT NULL`,
        );
        await prisma.$executeRawUnsafe(
            `DROP INDEX IF EXISTS "Product_organizationId_slug_key"`,
        );

        ownerId = (
            await prisma.user.create({
                data: { email: `bf510-owner-${tag}@example.com` },
            })
        ).id;
        orgId = (
            await prisma.organization.create({
                data: { name: "Old Rye", slug: `bf510-${tag}` },
            })
        ).id;
        hill = (
            await stores.createForUser(ownerId, orgId, {
                name: "Old Rye Hill Road",
                slug: `bf510-hill-${tag}`,
            })
        ).id;
        // A storefront closed long ago, which still has its products.
        closed = (
            await prisma.store.create({
                data: {
                    name: "Old Rye Market",
                    slug: `bf510-market-${tag}`,
                    organizationId: orgId,
                    deletedAt: at(10),
                },
            })
        ).id;
        customerId = (
            await prisma.customer.create({
                data: {
                    storeId: hill,
                    organizationId: orgId,
                    email: `bf510-buyer-${tag}@example.com`,
                },
            })
        ).id;

        // Counted as a whole, and from before products carried a business.
        p.bread = await product("Sourdough", hill);
        await prisma.$executeRaw`UPDATE "Product" SET "organizationId" = NULL WHERE id = ${p.bread}`;
        await prisma.inventory.create({
            data: {
                storeId: hill,
                organizationId: orgId,
                productId: p.bread,
                quantity: 8,
                reserved: 2,
                lowStockAlert: 3,
            },
        });

        // Counted per variant, its own row keeping a variant-less promise.
        p.tee = await product("Tee", hill);
        for (const size of ["S", "M"]) {
            v[size] = (
                await prisma.productVariant.create({
                    data: {
                        productId: p.tee,
                        sku: `BF-TEE-${size}-${tag}`,
                        title: size,
                        position: size === "S" ? 0 : 1,
                    },
                })
            ).id;
        }
        await prisma.variantInventory.create({
            data: {
                variantId: v.S,
                productId: p.tee,
                organizationId: orgId,
                quantity: 5,
                reserved: 1,
                lowStockAlert: 2,
            },
        });
        await prisma.variantInventory.create({
            data: {
                variantId: v.M,
                productId: p.tee,
                organizationId: orgId,
                quantity: 3,
                lowStockAlert: 4,
            },
        });
        await prisma.inventory.create({
            data: {
                storeId: hill,
                organizationId: orgId,
                productId: p.tee,
                quantity: 1,
                reserved: 1,
            },
        });

        // Counts nothing.
        p.jam = await product("Jam", hill);

        // Two "Focaccia"s: Hill Road's, and the closed market's (newer).
        p.focaccia = await product("Focaccia", hill, { createdAt: at(1) });
        p.oldFocaccia = await product("Focaccia", closed, {
            createdAt: at(2),
        });

        openOrderId = await order("PENDING", [
            {
                key: "breadOpen",
                productId: p.bread,
                quantity: 2,
                stockRow: "PRODUCT",
            },
            {
                key: "teeS",
                productId: p.tee,
                variantId: v.S,
                quantity: 1,
                stockRow: "VARIANT",
            },
            {
                key: "teeWhole",
                productId: p.tee,
                quantity: 1,
                stockRow: "PRODUCT",
            },
            { key: "jam", productId: p.jam, quantity: 1, stockRow: "NONE" },
        ]);
        // Fulfilled before rows were recorded at all.
        await order("DELIVERED", [
            {
                key: "breadSold",
                productId: p.bread,
                quantity: 1,
                stockRow: null,
            },
        ]);
        await order("CANCELLED", [
            {
                key: "breadCancelled",
                productId: p.bread,
                quantity: 4,
                stockRow: "PRODUCT",
            },
        ]);
    });

    afterAll(async () => {
        await prisma.$executeRawUnsafe(
            `CREATE UNIQUE INDEX IF NOT EXISTS "Product_organizationId_slug_key" ON "Product"("organizationId", "slug")`,
        );
        await prisma.$executeRawUnsafe(
            `ALTER TABLE "Product" ALTER COLUMN "organizationId" SET NOT NULL`,
        );
    });

    it("stops, loudly and before changing anything, on a product with no business", async () => {
        const orphan = await product("Orphan", hill);
        await prisma.$executeRaw`UPDATE "Product" SET "organizationId" = NULL, "storeId" = NULL WHERE id = ${orphan}`;

        await expect(backfillListingsStockLevels(prisma)).rejects.toThrow(
            /no business and no storefront.*Orphan/,
        );
        expect(
            await prisma.productListing.count({
                where: { organizationId: orgId },
            }),
        ).toBe(0);
        const [bread] = await prisma.$queryRaw<
            { organizationId: string | null }[]
        >`SELECT "organizationId" FROM "Product" WHERE id = ${p.bread}`;
        expect(bread.organizationId).toBeNull();

        await prisma.$executeRaw`DELETE FROM "Product" WHERE id = ${orphan}`;
    });

    it("lists every product where it was made, copies each stock row and links order lines", async () => {
        const report = await backfillListingsStockLevels(prisma);
        expect(report).toMatchObject({
            organizationsFilled: 1,
            tablesPresent: true,
            listings: 5,
            listingVariants: 2,
            // Sourdough; Tee's own row and its two variants.
            stockLevels: 4,
            // The open bread, S and variant-less Tee lines, and the sold bread.
            orderLines: 4,
            // Each row promised what its open lines hold: nothing to cap.
            heldStock: {
                capped: [],
                promisedMore: [],
                strayLinesCleared: [],
            },
        });
        expect(report.slugsSuffixed).toEqual([
            {
                organizationId: orgId,
                productId: p.oldFocaccia,
                was: "focaccia",
                now: "focaccia-2",
            },
        ]);

        const bread = await prisma.product.findUniqueOrThrow({
            where: { id: p.bread },
            select: { organizationId: true },
        });
        expect(bread.organizationId).toBe(orgId);

        const listings = await prisma.productListing.findMany({
            where: { organizationId: orgId },
            include: { variants: true },
        });
        expect(
            Object.fromEntries(listings.map((l) => [l.productId, l.storeId])),
        ).toEqual({
            [p.bread]: hill,
            [p.tee]: hill,
            [p.jam]: hill,
            [p.focaccia]: hill,
            [p.oldFocaccia]: closed,
        });
        expect(
            listings
                .find((l) => l.productId === p.tee)
                ?.variants.map((x) => x.variantId)
                .sort(),
        ).toEqual([v.S, v.M].sort());

        const rows = await prisma.stockLevel.findMany({
            where: { organizationId: orgId },
            select: {
                storeId: true,
                productId: true,
                variantId: true,
                onHand: true,
                promised: true,
                lowStockAlert: true,
            },
        });
        expect(rows).toHaveLength(4);
        expect(rows).toEqual(
            expect.arrayContaining([
                {
                    storeId: hill,
                    productId: p.bread,
                    variantId: null,
                    onHand: 8,
                    promised: 2,
                    lowStockAlert: 3,
                },
                {
                    storeId: hill,
                    productId: p.tee,
                    variantId: null,
                    onHand: 1,
                    promised: 1,
                    lowStockAlert: 10,
                },
                {
                    storeId: hill,
                    productId: p.tee,
                    variantId: v.S,
                    onHand: 5,
                    promised: 1,
                    lowStockAlert: 2,
                },
                {
                    storeId: hill,
                    productId: p.tee,
                    variantId: v.M,
                    onHand: 3,
                    promised: 0,
                    lowStockAlert: 4,
                },
            ]),
        );

        const rowOf = (productId: string, variantId: string | null) =>
            prisma.stockLevel.findFirstOrThrow({
                where: { storeId: hill, productId, variantId },
                select: { id: true },
            });
        const lineOf = (key: string) =>
            prisma.orderItem.findUniqueOrThrow({
                where: { id: line[key] },
                select: {
                    stockRow: true,
                    stockLevelId: true,
                    heldQuantity: true,
                },
            });
        const breadRow = (await rowOf(p.bread, null)).id;
        expect(await lineOf("breadOpen")).toEqual({
            stockRow: "PRODUCT",
            stockLevelId: breadRow,
            heldQuantity: 2,
        });
        expect(await lineOf("teeS")).toEqual({
            stockRow: "VARIANT",
            stockLevelId: (await rowOf(p.tee, v.S)).id,
            heldQuantity: 1,
        });
        expect(await lineOf("teeWhole")).toEqual({
            stockRow: "PRODUCT",
            stockLevelId: (await rowOf(p.tee, null)).id,
            heldQuantity: 1,
        });
        // Fulfilled before the backfill: it knows its shelf now, so a later
        // "Put back in stock" lands on it, and holds nothing.
        expect(await lineOf("breadSold")).toEqual({
            stockRow: "PRODUCT",
            stockLevelId: breadRow,
            heldQuantity: 0,
        });
        expect(await lineOf("breadCancelled")).toEqual({
            stockRow: "PRODUCT",
            stockLevelId: null,
            heldQuantity: 0,
        });
        expect(await lineOf("jam")).toEqual({
            stockRow: "NONE",
            stockLevelId: null,
            heldQuantity: 0,
        });
    });

    it("run again, changes nothing", async () => {
        const before = await snapshot();
        const report = await backfillListingsStockLevels(prisma);
        expect(report).toEqual({
            organizationsFilled: 0,
            slugsSuffixed: [],
            tablesPresent: true,
            listings: 0,
            listingVariants: 0,
            stockLevels: 0,
            orderLines: 0,
            heldStock: {
                capped: [],
                promisedMore: [],
                strayLinesCleared: [],
                dryRun: false,
            },
        });
        expect(await snapshot()).toEqual(before);
    });

    it("leaves the storefront seeing the same list, detail and stock", async () => {
        const list = await products.list(hill, ownerId);
        const row = (id: string) => list.find((x) => x.id === id);
        expect(row(p.bread)).toMatchObject({
            storeId: hill,
            inventory: { quantity: 8, lowStockAlert: 3 },
        });
        // Per variant: the variants' sum plus what the product's row holds.
        expect(row(p.tee)).toMatchObject({
            variantCount: 2,
            sku: `BF-TEE-S-${tag}`,
            inventory: { quantity: 9, lowStockAlert: 2 },
        });
        expect(row(p.jam)?.inventory).toBeNull();
        expect(row(p.oldFocaccia)).toBeUndefined(); // the closed market's

        const tee = await products.get(hill, p.tee, ownerId);
        expect(tee.stockMode).toBe("variant");
        expect(tee.inventory).toEqual({
            quantity: 1,
            reserved: 1,
            lowStockAlert: 10,
        });
        expect(tee.variants.map((x) => [x.title, x.inventory])).toEqual([
            ["S", { quantity: 5, reserved: 1, lowStockAlert: 2 }],
            ["M", { quantity: 3, reserved: 0, lowStockAlert: 4 }],
        ]);
        expect(await inventory.get(hill, p.bread, ownerId)).toEqual({
            productId: p.bread,
            mode: "product",
            quantity: 8,
            reserved: 2,
            lowStockAlert: 3,
            variants: [],
        });

        // And the open order settles on the rows it held on.
        await orders.updateStatus(hill, openOrderId, ownerId, {
            status: "PROCESSING",
        });
        await orders.updateStatus(hill, openOrderId, ownerId, {
            status: "SHIPPED",
        });
        expect(await inventory.get(hill, p.bread, ownerId)).toMatchObject({
            quantity: 6,
            reserved: 0,
        });
        const after = await inventory.get(hill, p.tee, ownerId);
        expect(after).toMatchObject({ quantity: 0, reserved: 0 });
        expect(after.variants.find((x) => x.variantId === v.S)).toMatchObject({
            quantity: 4,
            reserved: 0,
        });
    });
});
