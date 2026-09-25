import { NotFoundException } from "@nestjs/common";
import { prisma } from "@saroh/database";

import type { AuditService } from "../audit/audit.service";
import { backfillOrganizationModules } from "../capabilities/module-backfill";
import { FieldsService } from "../catalogue/fields.service";
import { SkuService } from "../catalogue/sku.service";
import { CategoriesService } from "../categories/categories.service";
import { CustomersService } from "../customers/customers.service";
import { DiscountsService } from "../discounts/discounts.service";
import { FixedWindowRateLimiter } from "../enquiry/rate-limiter";
import type { FeatureFlagService } from "../feature-flags/feature-flags.service";
import { ImportsService } from "../imports/imports.service";
import { ensureOrderInvoice } from "../invoices/order-invoicing";
import { OrdersService } from "../orders/orders.service";
import { ProductReviewsService } from "../product-reviews/product-reviews.service";
import { StoresService } from "../stores/stores.service";
import { InventoryService } from "./inventory.service";
import { ListingsService } from "./listings.service";
import { ProductsService } from "./products.service";

/**
 * The readers of products, on the catalogue model (#531). The business owns
 * one "Sourdough", made at Hill Road and also sold Online, and — as after a
 * storefront is closed and removed — tied to no storefront of its own
 * (`Product.storeId` null). Everything that reads products must find it
 * through its business or its listings, never through `Product.storeId`.
 */
const tag = `${process.pid}-${Date.now()}`;

describe("Readers of the catalogue (DB)", () => {
    const flags = {
        isEnabled: () => Promise.resolve(true),
    } as unknown as FeatureFlagService;
    const stores = new StoresService(flags);
    const products = new ProductsService(stores);
    const inventory = new InventoryService(products);
    const listings = new ListingsService();
    const customers = new CustomersService(stores);
    const orders = new OrdersService(stores);
    const imports = new ImportsService(stores);
    const discounts = new DiscountsService();
    const categories = new CategoriesService();
    const fields = new FieldsService();
    const sku = new SkuService();
    const reviews = new ProductReviewsService(
        { record: jest.fn() } as unknown as AuditService,
        new FixedWindowRateLimiter(100, 60_000),
    );

    let ownerId = "";
    let orgId = "";
    let otherOrgId = "";
    let hill = "";
    let online = "";
    let otherProduct = "";
    let breads = "";
    let sourdough = "";
    let buyerOnline = "";
    let buyerHill = "";

    async function storefront(organizationId: string, name: string) {
        return (
            await prisma.store.create({
                data: {
                    name,
                    slug: `cr-${name.toLowerCase().replace(/\s+/g, "-")}-${tag}`,
                    organizationId,
                },
            })
        ).id;
    }

    beforeAll(async () => {
        ownerId = (
            await prisma.user.create({
                data: { email: `cr-owner-${tag}@example.com` },
            })
        ).id;
        orgId = (
            await prisma.organization.create({
                data: { name: "Rye & Co.", slug: `cr-rye-${tag}` },
            })
        ).id;
        otherOrgId = (
            await prisma.organization.create({
                data: { name: "Elsewhere", slug: `cr-else-${tag}` },
            })
        ).id;
        await prisma.membership.createMany({
            data: [
                { organizationId: orgId, userId: ownerId, role: "OWNER" },
                { organizationId: otherOrgId, userId: ownerId, role: "OWNER" },
            ],
        });
        // GST-registered, so an invoice carries each line's rate and HSN.
        await prisma.businessProfile.create({
            data: {
                organizationId: orgId,
                gstRegistered: true,
                taxId: "29ABCDE1234F1Z5",
                gstState: "29",
            },
        });
        hill = await storefront(orgId, "Hill Road");
        online = await storefront(orgId, "Online");
        const otherStore = await storefront(otherOrgId, "Elsewhere");
        otherProduct = (
            await products.create(otherStore, ownerId, {
                name: "Their loaf",
                price: "90.00",
            })
        ).id;

        breads = (
            await categories.create(orgId, { name: "Breads", slug: "breads" })
        ).id;
        sourdough = (
            await products.create(hill, ownerId, {
                name: "Sourdough",
                price: "120.00",
                currency: "INR",
                status: "PUBLISHED",
                categoryId: breads,
                gstRate: "5",
                hsnCode: "1905",
            })
        ).id;
        await inventory.upsert(hill, sourdough, ownerId, { quantity: 10 });
        await listings.list(orgId, sourdough, online);
        await inventory.upsert(online, sourdough, ownerId, { quantity: 6 });
        // The catalogue's product, tied to no storefront of its own.
        await prisma.product.update({
            where: { id: sourdough },
            data: { storeId: null },
        });

        buyerOnline = (
            await customers.create(online, ownerId, {
                email: `cr-online-${tag}@example.com`,
            })
        ).id;
        buyerHill = (
            await customers.create(hill, ownerId, {
                email: `cr-hill-${tag}@example.com`,
            })
        ).id;
    });

    it("imports: a row for a catalogue product updates it and sells it at the storefront imported to", async () => {
        const hillOnly = (
            await products.create(hill, ownerId, {
                name: "Rye loaf",
                price: "80.00",
            })
        ).id;
        const csv =
            "name,slug,price\nSourdough,sourdough,130\nRye loaf,rye-loaf,85\n";
        const mapping = { name: "name", slug: "slug", price: "price" };

        const preview = await imports.preview(online, ownerId, "products", {
            csv,
            mapping,
            policy: "UPDATE",
        });
        expect(preview.plan.counts).toMatchObject({ UPDATE: 2, CREATE: 0 });

        const result = await imports.apply(online, ownerId, "products", {
            csv,
            mapping,
            policy: "UPDATE",
        });
        expect(result).toMatchObject({ created: 0, updated: 2 });
        const updated = await prisma.product.findUniqueOrThrow({
            where: { id: sourdough },
            select: { price: true },
        });
        expect(updated.price.toString()).toBe("130");
        const sold = await prisma.productListing.findMany({
            where: { productId: hillOnly },
            select: { storeId: true },
            orderBy: { storeId: "asc" },
        });
        expect(sold.map((s) => s.storeId).sort()).toEqual(
            [hill, online].sort(),
        );
        // One catalogue product each — nothing duplicated per storefront.
        expect(
            await prisma.product.count({
                where: { organizationId: orgId, slug: "sourdough" },
            }),
        ).toBe(1);
        // Put the price back for the readers below.
        await products.patch(hill, sourdough, ownerId, { price: "120.00" });
    });

    it("discounts: a code can name the catalogue product and takes money off it at either storefront", async () => {
        const view = await discounts.create(orgId, {
            code: `LOAF${tag.replace(/\D/g, "").slice(-6)}`,
            kind: "PERCENTAGE",
            percent: "10",
            appliesTo: "PRODUCT",
            targetIds: [sourdough],
        });
        for (const storeId of [hill, online]) {
            const applied = await discounts.redeemForOrder(orgId, view.code, {
                storeId,
                currency: "INR",
                lines: [
                    {
                        productId: sourdough,
                        categoryId: breads,
                        unitCents: 12000,
                        quantity: 1,
                    },
                ],
            });
            expect(applied.amountCents).toBe(1200);
        }
        // Another business's product is not something this code can name.
        await expect(
            discounts.create(orgId, {
                code: `THEIRS${tag.replace(/\D/g, "").slice(-6)}`,
                kind: "PERCENTAGE",
                percent: "10",
                appliesTo: "PRODUCT",
                targetIds: [otherProduct],
            }),
        ).rejects.toThrow(NotFoundException);
    });

    it("orders and invoices: a line at the second storefront carries the product's GST and HSN", async () => {
        const order = await orders.create(online, ownerId, {
            customerId: buyerOnline,
            items: [{ productId: sourdough, quantity: 2 }],
            currency: "INR",
        });
        const invoice = await prisma.$transaction((tx) =>
            ensureOrderInvoice(tx, order.id),
        );
        expect(invoice).not.toBeNull();
        const lines = await prisma.invoiceLine.findMany({
            where: { invoiceId: invoice?.id ?? "" },
            orderBy: { position: "asc" },
            select: { description: true, hsnSac: true, gstRate: true },
        });
        expect(lines[0]).toMatchObject({
            description: expect.stringContaining("Sourdough"),
            hsnSac: "1905",
        });
        expect(lines[0]?.gstRate?.toString()).toBe("5");
    });

    it("product reviews: reviews from both storefronts sum into the one product's rating", async () => {
        const placed = [];
        for (const [storeId, customerId] of [
            [hill, buyerHill],
            [online, buyerOnline],
        ] as const) {
            const o = await orders.create(storeId, ownerId, {
                customerId,
                items: [{ productId: sourdough, quantity: 1 }],
                currency: "INR",
            });
            placed.push({ storeId, customerId, orderId: o.id });
        }
        let n = 0;
        for (const p of placed) {
            n += 1;
            const item = await prisma.orderItem.findFirstOrThrow({
                where: { orderId: p.orderId },
                select: { id: true },
            });
            const invitation = await prisma.reviewInvitation.create({
                data: {
                    organizationId: orgId,
                    orderId: p.orderId,
                    tokenHash: `cr-${tag}-${n}`,
                    toAddress: `cr-${n}@example.com`,
                    expiresAt: new Date(Date.now() + 86_400_000),
                },
            });
            await prisma.productReview.create({
                data: {
                    organizationId: orgId,
                    storeId: p.storeId,
                    invitationId: invitation.id,
                    orderItemId: item.id,
                    productId: sourdough,
                    productName: "Sourdough",
                    customerId: p.customerId,
                    invitedTo: invitation.toAddress,
                    rating: n === 1 ? 5 : 4,
                    displayName: `Buyer ${n}`,
                },
            });
        }
        const summary = await reviews.summary(orgId);
        expect(summary.filter((s) => s.productId === sourdough)).toEqual([
            { productId: sourdough, average: 4.5, count: 2 },
        ]);
        const listed = await reviews.list(orgId, { productId: sourdough });
        expect(listed.map((r) => r.storeId).sort()).toEqual(
            [hill, online].sort(),
        );
    });

    it("catalogue settings: field counts, SKU numbering and category moves find it by its business", async () => {
        const field = await fields.create(orgId, {
            name: "Flour",
            type: "TEXT",
        });
        await fields.update(orgId, field.id, { categoryIds: [breads] });
        const counted = (await fields.views(orgId)).find(
            (f) => f.id === field.id,
        );
        expect(counted?.productCount).toBeGreaterThanOrEqual(1);

        const all = await prisma.product.count({
            where: { organizationId: orgId },
        });
        expect((await sku.get(orgId)).n).toBe(all + 1);
        const preview = await sku.preview(orgId, "{CAT}-{N}");
        expect(preview.rows.some((r) => r.productId === sourdough)).toBe(true);

        // A category brought back takes its products with it, by business.
        const restored = await categories.restore(orgId, {
            name: "Loaves",
            slug: "loaves",
            movedTo: breads,
            productIds: [sourdough],
        });
        expect(restored.moved).toBe(1);
        expect(
            await prisma.product.findUniqueOrThrow({
                where: { id: sourdough },
                select: { categoryId: true },
            }),
        ).toEqual({ categoryId: restored.id });
    });

    it("module backfill: a business whose only commerce is catalogue products is on COMMERCE", async () => {
        const quiet = (
            await prisma.organization.create({
                data: { name: "Catalogue only", slug: `cr-quiet-${tag}` },
            })
        ).id;
        await prisma.product.create({
            data: {
                organizationId: quiet,
                storeId: null,
                name: "Loose loaf",
                slug: "loose-loaf",
                price: "10.00",
            },
        });
        const summary = await backfillOrganizationModules(prisma);
        const result = summary.results.find((r) => r.organizationId === quiet);
        expect(result?.evidence).toContain("COMMERCE");
        expect(result?.enabled).toContain("COMMERCE");
    });
});
