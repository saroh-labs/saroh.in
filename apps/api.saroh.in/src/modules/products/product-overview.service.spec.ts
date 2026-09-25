import { prisma } from "@saroh/database";

import { CustomersService } from "../customers/customers.service";
import { FeatureFlagService } from "../feature-flags/feature-flags.service";
import { OrdersService } from "../orders/orders.service";
import { StoresService } from "../stores/stores.service";
import { ProductOverviewService } from "./product-overview.service";
import { ProductsService } from "./products.service";
import { VariantsService } from "./variants.service";

/**
 * The product page's one read (#461) against a real Postgres: the price range
 * across variants, the orders panel's counts, the discounts that reach the
 * product in the order the tab reads them, and a panel that fails or is not
 * the caller's to see. Integration project.
 */
const tag = `${process.pid}-${Date.now()}`;
const DAY = 24 * 60 * 60 * 1000;

describe("Product overview (DB)", () => {
    const stores = new StoresService(new FeatureFlagService());
    const products = new ProductsService(stores);
    const variants = new VariantsService(products);
    const customers = new CustomersService(stores);
    const orders = new OrdersService(stores);
    const overview = new ProductOverviewService(products, stores);

    let ownerId = "";
    let orgId = "";
    let storeId = "";
    let kajalId = "";
    let otherId = "";
    let customerId = "";
    const v: Record<string, string> = {};

    beforeAll(async () => {
        ownerId = (
            await prisma.user.create({
                data: { email: `ov-owner-${tag}@example.com` },
            })
        ).id;
        orgId = (
            await prisma.organization.create({
                data: { name: "Overview Org", slug: `ov-org-${tag}` },
            })
        ).id;
        storeId = (
            await stores.createForUser(ownerId, orgId, {
                name: "Overview Store",
                slug: `ov-${tag}`,
            })
        ).id;
        await prisma.membership.create({
            data: { organizationId: orgId, userId: ownerId, role: "OWNER" },
        });
        kajalId = (
            await products.create(storeId, ownerId, {
                name: "Kohl Kajal",
                price: "300",
                mrp: "450",
                currency: "INR",
            })
        ).id;
        otherId = (
            await products.create(storeId, ownerId, {
                name: "Lip Balm",
                price: "150",
                currency: "INR",
            })
        ).id;
        // One cheaper, one dearer, one at the product's own price.
        for (const [title, price] of [
            ["Mini", "250"],
            ["Duo", "420"],
            ["Classic", null],
        ] as const) {
            v[title] = (
                await variants.create(storeId, kajalId, ownerId, {
                    sku: `KK-${title}`,
                    title,
                    price,
                })
            ).id;
        }
        customerId = (
            await customers.create(storeId, ownerId, {
                email: `ov-buyer-${tag}@example.com`,
                firstName: "Meera",
            })
        ).id;
    });

    afterAll(async () => {
        await prisma.orderItem.deleteMany({ where: { order: { storeId } } });
        await prisma.order.deleteMany({ where: { storeId } });
        await prisma.customer.deleteMany({ where: { storeId } });
        await prisma.discount.deleteMany({ where: { organizationId: orgId } });
        await prisma.product.deleteMany({ where: { storeId } });
        await prisma.store.deleteMany({ where: { id: storeId } });
        await prisma.membership.deleteMany({
            where: { organizationId: orgId },
        });
        await prisma.organization.deleteMany({ where: { id: orgId } });
        await prisma.user.deleteMany({ where: { id: ownerId } });
    });

    it("prices from the cheapest variant to the dearest, a blank one at the product's", async () => {
        const view = await overview.get(storeId, kajalId, ownerId);
        expect(view.price).toEqual({
            min: "250.00",
            max: "420.00",
            mrp: "450.00",
            savingPercent: 33,
        });
    });

    it("counts open orders, orders this month and units sold per variant", async () => {
        await orders.create(storeId, ownerId, {
            customerId,
            items: [
                { productId: kajalId, variantId: v.Mini, quantity: 2 },
                { productId: otherId, quantity: 1 },
            ],
        });
        await orders.create(storeId, ownerId, {
            customerId,
            items: [{ productId: kajalId, variantId: v.Mini, quantity: 1 }],
        });
        const cancelled = await orders.create(storeId, ownerId, {
            customerId,
            items: [{ productId: kajalId, variantId: v.Duo, quantity: 5 }],
        });
        await orders.updateStatus(storeId, cancelled.id, ownerId, {
            status: "CANCELLED",
        });
        // Another product's order is not this one's.
        await orders.create(storeId, ownerId, {
            customerId,
            items: [{ productId: otherId, quantity: 4 }],
        });

        const view = await overview.get(storeId, kajalId, ownerId);
        if (view.orders.status !== "ok") throw new Error("orders panel");
        const panel = view.orders.data;
        expect(panel.openCount).toBe(2);
        expect(panel.thisMonthCount).toBe(3);
        // A cancelled order sold nothing.
        expect(panel.soldThisMonth).toEqual({ [v.Mini]: 3 });
        expect(panel.recent).toHaveLength(3);
        // Only this product's lines, named by their variant.
        expect(panel.recent.flatMap((o) => o.lines)).toEqual(
            expect.arrayContaining([
                { variantId: v.Mini, title: "Mini", quantity: 2 },
                { variantId: v.Duo, title: "Duo", quantity: 5 },
            ]),
        );
        expect(
            panel.recent.every((o) =>
                o.lines.every((l) => l.variantId !== null),
            ),
        ).toBe(true);
        expect(panel.recent.find((o) => o.id === cancelled.id)?.open).toBe(
            false,
        );
        expect(panel.recent[0]?.customer).toBe("Meera");
    });

    it("lists the codes that reach it — live, then scheduled, then ended", async () => {
        const now = new Date();
        const code = (name: string) =>
            `${name}${tag.replace(/\D/g, "").slice(-6)}`;
        await prisma.discount.create({
            data: {
                organizationId: orgId,
                code: code("KAJAL"),
                kind: "PERCENTAGE",
                percentBps: 1000,
                appliesTo: "PRODUCT",
                products: { create: { productId: kajalId } },
            },
        });
        await prisma.discount.create({
            data: {
                organizationId: orgId,
                code: code("SOON"),
                kind: "PERCENTAGE",
                percentBps: 500,
                appliesTo: "BUSINESS",
                startsAt: new Date(now.getTime() + DAY),
            },
        });
        await prisma.discount.create({
            data: {
                organizationId: orgId,
                code: code("GONE"),
                kind: "PERCENTAGE",
                percentBps: 1500,
                appliesTo: "STOREFRONT",
                endsAt: new Date(now.getTime() - DAY),
                stores: { create: { storeId } },
            },
        });
        // Set on another product: it never reaches this one.
        await prisma.discount.create({
            data: {
                organizationId: orgId,
                code: code("BALM"),
                kind: "PERCENTAGE",
                percentBps: 2000,
                appliesTo: "PRODUCT",
                products: { create: { productId: otherId } },
            },
        });

        const view = await overview.get(storeId, kajalId, ownerId, now);
        if (view.discounts.status !== "ok") throw new Error("discounts panel");
        expect(view.discounts.data.map((d) => [d.code, d.state])).toEqual([
            [code("KAJAL"), "ACTIVE"],
            [code("SOON"), "SCHEDULED"],
            [code("GONE"), "EXPIRED"],
        ]);
    });

    it("blanks one panel that fails, and one the caller may not see", async () => {
        const failing = jest
            .spyOn(
                overview as unknown as { reviews: () => Promise<unknown> },
                "reviews",
            )
            .mockRejectedValueOnce(new Error("connection dropped"));
        const allows = jest
            .spyOn(stores, "memberAllows")
            .mockImplementation((_storeId, _userId, action) =>
                Promise.resolve(action !== "discount:read"),
            );
        try {
            const view = await overview.get(storeId, kajalId, ownerId);
            expect(view.orders.status).toBe("ok");
            expect(view.reviews).toEqual({ status: "failed" });
            expect(view.discounts).toEqual({ status: "forbidden" });
            expect(view.product.id).toBe(kajalId);
        } finally {
            failing.mockRestore();
            allows.mockRestore();
        }
    });
});
