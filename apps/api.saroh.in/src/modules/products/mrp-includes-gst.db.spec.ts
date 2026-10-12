/**
 * GST is part of MRP (the owner, 12 Oct 2026), against a real Postgres: an
 * MRP includes all taxes, so the amount a customer pays for one, GST and
 * all, is never more than it.
 *
 * - A product's and a variant's writes are refused when they would take
 *   the amount to pay above the MRP, and allowed at exactly the MRP.
 * - Switching the whole business to "GST is added" is refused while any
 *   product would go over, with the count and the names; the read the
 *   sheet shows first lists the same; setting that product to "Includes
 *   GST" is a way out.
 * - A product already over its MRP (a business that switched before the
 *   rule existed) still reads, still sells at its amount to pay, shows no
 *   saving, and is listed so it can be put right.
 *
 * The sums, at 18%: ₹1,000 added is ₹1,180 to pay.
 *
 * Runs in the integration project (TEST_DATABASE_URL).
 */
import { BadRequestException } from "@nestjs/common";
import { prisma } from "@saroh/database";

import type { OrganizationContext } from "../../common/types/organization-context";
import type { AuditService } from "../audit/audit.service";
import { FixedWindowRateLimiter } from "../bookings/rate-limiter";
import type { FeatureFlagService } from "../feature-flags/feature-flags.service";
import { GstRatesService } from "../invoices/gst-rates.service";
import type { MediaService } from "../media/media.service";
import type { CreateOrderDto } from "../orders/dto";
import { OrdersService } from "../orders/orders.service";
import { OrganizationSettingsService } from "../organizations/organization-settings.service";
import { StoresService } from "../stores/stores.service";
import { ProductsService } from "./products.service";
import { PublicCatalogueService } from "./public-catalogue.service";
import { VariantsService } from "./variants.service";

const tag = `${process.pid}-${Date.now()}`;

const flags = {
    isEnabled: () => Promise.resolve(true),
} as unknown as FeatureFlagService;
const stores = new StoresService(flags);
const products = new ProductsService(stores);
const variants = new VariantsService(products);
const orders = new OrdersService(stores);
const rates = new GstRatesService();
const settings = new OrganizationSettingsService(
    { record: () => Promise.resolve() } as unknown as AuditService,
    {} as MediaService,
);
const catalogue = new PublicCatalogueService(new FixedWindowRateLimiter(1_000));

const OVER_1100 =
    "With 18% GST added this is ₹1,180 to pay, more than its MRP of ₹1,100. Lower the price, raise the MRP, or set this product's price to include GST.";
const BELOW = "MRP can't be lower than the price it sells for.";

/** Glow Studio: GST-registered in Karnataka, prices include GST to begin. */
let owner: OrganizationContext;
let ownerId = "";
let storeId = "";
let siteId = "";
/** ₹1,000 at 18% with an MRP of ₹1,100: fine while prices include GST. */
let cream = "";

/** What a refused write said, and where it said it. */
async function refusal(write: Promise<unknown>) {
    const error: unknown = await write.then(
        () => null,
        (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(BadRequestException);
    const said = (error as BadRequestException).getResponse() as {
        message: string;
        field?: string;
        details?: Record<string, unknown>;
    };
    return said;
}

const storedMode = async () =>
    (
        await prisma.businessProfile.findUniqueOrThrow({
            where: { organizationId: owner.organizationId },
            select: { gstPriceMode: true },
        })
    ).gstPriceMode;

const sums = (id: string) =>
    prisma.product.findUniqueOrThrow({
        where: { id },
        select: {
            name: true,
            price: true,
            mrp: true,
            gstRate: true,
            gstPriceMode: true,
        },
    });

beforeAll(async () => {
    ownerId = (
        await prisma.user.create({
            data: { email: `mrp-gst-${tag}@example.com` },
        })
    ).id;
    const org = await prisma.organization.create({
        data: { name: "Glow Studio", slug: `mrp-gst-${tag}` },
    });
    await prisma.membership.create({
        data: { organizationId: org.id, userId: ownerId, role: "OWNER" },
    });
    owner = { organizationId: org.id, userId: ownerId, role: "OWNER" };
    await prisma.businessProfile.create({
        data: {
            organizationId: org.id,
            taxId: "29AAGCR4375J1ZU",
            gstRegistered: true,
            gstState: "29",
            invoicePrefix: "GS",
            timezone: "UTC",
            addressLine1: "14 Hill Road",
            city: "Bengaluru",
            postalCode: "560038",
        },
    });
    storeId = (
        await stores.createForUser(ownerId, org.id, {
            name: "Hill Road",
            slug: `mrp-gst-store-${tag}`,
        })
    ).id;
    await prisma.storeSettings.upsert({
        where: { storeId },
        create: {
            storeId,
            currency: "INR",
            fulfilmentTypes: ["PICKUP"],
            collectionEnabled: true,
        },
        update: { currency: "INR", fulfilmentTypes: ["PICKUP"] },
    });
    // The shop on its site, for what a customer is shown.
    for (const key of ["SITE_SHOP", "MODULE_COMMERCE"]) {
        await prisma.featureFlag.upsert({
            where: { key },
            create: { key, enabledByDefault: false },
            update: {},
        });
        await prisma.featureFlagOverride.create({
            data: { flagKey: key, organizationId: org.id, enabled: true },
        });
    }
    siteId = (
        await prisma.site.create({
            data: {
                organizationId: org.id,
                name: "Glow Studio",
                slug: `mrp-gst-site-${tag}`,
                storefrontId: storeId,
            },
        })
    ).id;
    cream = (
        await products.create(storeId, ownerId, {
            name: "Face cream",
            price: "1000",
            mrp: "1100",
            gstRate: "18",
        })
    ).id;
});

describe("while prices include GST: unchanged (real database)", () => {
    it("saved a ₹1,000 price under a ₹1,100 MRP, and still refuses a typed price above it", async () => {
        expect(await storedMode()).toBe("INCLUDED");
        const row = await sums(cream);
        expect(row.price.toString()).toBe("1000");
        expect(row.mrp?.toString()).toBe("1100");

        const said = await refusal(
            products.patch(storeId, cream, ownerId, { price: "1100.01" }),
        );
        expect(said).toEqual({ message: BELOW, field: "price" });
        // At exactly its MRP: saved, and put back.
        await products.patch(storeId, cream, ownerId, { price: "1100" });
        await products.patch(storeId, cream, ownerId, { price: "1000" });
        expect((await sums(cream)).price.toString()).toBe("1000");
    });

    it("nothing is over its MRP as the business stands", async () => {
        await expect(rates.overMrp(owner)).resolves.toMatchObject({
            registered: true,
            mode: "INCLUDED",
            products: 0,
            items: [],
        });
    });
});

describe("switching the business to GST is added (real database)", () => {
    it("the read says what would go over its MRP before anything is saved", async () => {
        // 1,000 + 180 = 1,180 > 1,100
        await expect(rates.overMrp(owner, "ADDED")).resolves.toEqual({
            registered: true,
            mode: "ADDED",
            products: 1,
            options: 0,
            items: [
                {
                    productId: cream,
                    name: "Face cream",
                    option: null,
                    currency: "INR",
                    listCents: 100_000,
                    payCents: 118_000,
                    mrpCents: 110_000,
                    rate: "18",
                },
            ],
            more: false,
        });
    });

    it("is refused with the count and the name, and nothing is stored", async () => {
        const said = await refusal(
            settings.update(owner, { tax: { priceMode: "ADDED" } }),
        );
        expect(said.message).toBe(
            'With GST added, 1 product would cost more than its MRP: Face cream. Lower the price or raise the MRP on it, or set it to "Includes GST", then save this again.',
        );
        expect(said.details).toMatchObject({
            field: "priceMode",
            reason: "OVER_MRP",
            products: 1,
            options: 0,
            more: false,
        });
        expect(
            (said.details?.items as { productId: string }[]).map(
                (i) => i.productId,
            ),
        ).toEqual([cream]);
        expect(await storedMode()).toBe("INCLUDED");
    });

    it("is saved once that product is set to Includes GST on its own", async () => {
        await products.patch(storeId, cream, ownerId, {
            gstPriceMode: "INCLUDED",
        });
        await expect(rates.overMrp(owner, "ADDED")).resolves.toMatchObject({
            products: 0,
        });
        await settings.update(owner, { tax: { priceMode: "ADDED" } });
        expect(await storedMode()).toBe("ADDED");
    });
});

describe("a product's writes under GST is added (real database)", () => {
    /** ₹1,000 at 18% with an MRP of exactly ₹1,180. */
    let oil = "";

    it("a new product over its MRP is refused on the MRP, and nothing is made", async () => {
        const said = await refusal(
            products.create(storeId, ownerId, {
                name: "Hair oil",
                price: "1000",
                mrp: "1100",
                gstRate: "18",
            }),
        );
        expect(said).toEqual({ message: OVER_1100, field: "mrp" });
        expect(
            await prisma.product.count({
                where: {
                    organizationId: owner.organizationId,
                    slug: "hair-oil",
                },
            }),
        ).toBe(0);
    });

    it("is made at exactly its MRP: ₹1,000 + ₹180 against ₹1,180", async () => {
        oil = (
            await products.create(storeId, ownerId, {
                name: "Hair oil",
                price: "1000",
                mrp: "1180",
                gstRate: "18",
            })
        ).id;
        expect((await sums(oil)).mrp?.toString()).toBe("1180");
    });

    it("a section save is refused a paisa over, on the field it changed", async () => {
        expect(
            await refusal(
                products.patch(storeId, oil, ownerId, { mrp: "1179.99" }),
            ),
        ).toEqual({
            message:
                "With 18% GST added this is ₹1,180 to pay, more than its MRP of ₹1,179.99. Lower the price, raise the MRP, or set this product's price to include GST.",
            field: "mrp",
        });
        // 1,000.01 + 180.00 = 1,180.01 > 1,180
        expect(
            await refusal(
                products.patch(storeId, oil, ownerId, { price: "1000.01" }),
            ),
        ).toEqual({
            message:
                "With 18% GST added this is ₹1,180.01 to pay, more than its MRP of ₹1,180. Lower the price, raise the MRP, or set this product's price to include GST.",
            field: "price",
        });
        // 28% on ₹1,000 is ₹1,280.
        expect(
            (
                await refusal(
                    products.patch(storeId, oil, ownerId, { gstRate: "28" }),
                )
            ).field,
        ).toBe("gstRate");
        const row = await sums(oil);
        expect(row.price.toString()).toBe("1000");
        expect(row.mrp?.toString()).toBe("1180");
        expect(row.gstRate?.toString()).toBe("18");
    });

    it("a variant's own price follows the same rule", async () => {
        // 1,100 + 198 = 1,298 > 1,180
        const said = await refusal(
            variants.create(storeId, oil, ownerId, {
                sku: `OIL-L-${tag}`,
                title: "Large",
                price: "1100",
            }),
        );
        expect(said.field).toBe("price");
        expect(said.message).toBe(
            "With 18% GST added this is ₹1,298 to pay, more than its MRP of ₹1,180. Lower the price, raise the MRP, or set this product's price to include GST.",
        );
        // 900 + 162 = 1,062
        await variants.create(storeId, oil, ownerId, {
            sku: `OIL-S-${tag}`,
            title: "Small",
            price: "900",
        });
        expect(
            await prisma.productVariant.count({ where: { productId: oil } }),
        ).toBe(1);
    });

    it("choosing a rate is refused where it takes a product over its MRP", async () => {
        // No rate yet: ₹1,000 is paid, under its ₹1,100 MRP.
        const soap = (
            await products.create(storeId, ownerId, {
                name: "Rose soap",
                price: "1000",
                mrp: "1100",
            })
        ).id;
        const attempt = rates.set(owner, {
            items: [{ kind: "PRODUCT", id: soap, rate: "18" }],
        });
        expect((await refusal(attempt)).message).toBe(
            "Rose soap: with 18% GST added this is ₹1,180 to pay, more than its MRP of ₹1,100. Lower the price, raise the MRP, or set this product's price to include GST.",
        );
        expect((await sums(soap)).gstRate).toBeNull();
        // 5%: 1,000 + 50 = 1,050, under it.
        await rates.set(owner, {
            items: [{ kind: "PRODUCT", id: soap, rate: "5" }],
        });
        expect((await sums(soap)).gstRate?.toString()).toBe("5");
    });

    it("the product set to Includes GST can't go back to the business's way while it would be over", async () => {
        expect(
            await refusal(
                products.patch(storeId, cream, ownerId, { gstPriceMode: null }),
            ),
        ).toEqual({ message: OVER_1100, field: "gstPriceMode" });
        expect((await sums(cream)).gstPriceMode).toBe("INCLUDED");
    });
});

describe("a product already over its MRP (real database)", () => {
    beforeAll(async () => {
        // As a business that switched before the rule existed would have
        // it: priced the business's way, ₹1,180 to pay against ₹1,100.
        await prisma.product.update({
            where: { id: cream },
            data: { gstPriceMode: null, status: "PUBLISHED" },
        });
    });

    it("is listed so it can be put right", async () => {
        const read = await rates.overMrp(owner);
        expect(read).toMatchObject({ mode: "ADDED", products: 1, options: 0 });
        expect(read.items).toEqual([
            expect.objectContaining({
                productId: cream,
                name: "Face cream",
                payCents: 118_000,
                mrpCents: 110_000,
            }),
        ]);
    });

    it("still sells, at its amount to pay", async () => {
        const order = await orders.create(storeId, ownerId, {
            items: [{ productId: cream, quantity: 1 }],
            fulfilment: "PICKUP",
            walkIn: { name: "Asha" },
            payment: { kind: "CASH", received: "1180" },
        } as CreateOrderDto);
        const stored = await prisma.order.findUniqueOrThrow({
            where: { id: order.id },
            select: {
                total: true,
                items: {
                    select: {
                        price: true,
                        listPrice: true,
                        gstPriceMode: true,
                    },
                },
            },
        });
        expect(stored.total.toString()).toBe("1180");
        expect(stored.items[0]!.price.toString()).toBe("1180");
        expect(stored.items[0]!.listPrice?.toString()).toBe("1000");
        expect(stored.items[0]!.gstPriceMode).toBe("ADDED");
    });

    it("is shown to a customer with what is paid and no saving", async () => {
        const page = await catalogue.product(siteId, "face-cream", "visitor");
        expect(page.price).toBe("1000.00");
        expect(page.mrp).toBe("1100.00");
        expect(page.gst).toMatchObject({ mode: "ADDED", payCents: 118_000 });
        expect(page.saving).toBeNull();
        const shop = await catalogue.list(siteId, "visitor");
        const card = shop.products.find((p) => p.slug === "face-cream");
        expect(card).toMatchObject({ gstAdded: true, saving: null });
    });

    it("can have the rest of it saved, and is put right by raising its MRP", async () => {
        const renamed = await products.patch(storeId, cream, ownerId, {
            name: "Face cream, 50 ml",
        });
        expect(renamed.name).toBe("Face cream, 50 ml");
        // Touching the price without mending it is refused.
        expect(
            (
                await refusal(
                    products.patch(storeId, cream, ownerId, { price: "990" }),
                )
            ).field,
        ).toBe("price");

        // 1,475 - 1,180 = 295 off; 295 / 1,475 is exactly 20%.
        await products.patch(storeId, cream, ownerId, { mrp: "1475" });
        const page = await catalogue.product(siteId, "face-cream", "visitor");
        expect(page.saving).toEqual({ mrp: "1475.00", percent: 20 });
        await expect(rates.overMrp(owner)).resolves.toMatchObject({
            products: 0,
        });

        // At exactly the amount to pay there is no saving to show.
        await products.patch(storeId, cream, ownerId, { mrp: "1180" });
        const equal = await catalogue.product(siteId, "face-cream", "visitor");
        expect(equal.mrp).toBe("1180.00");
        expect(equal.saving).toBeNull();
    });
});
