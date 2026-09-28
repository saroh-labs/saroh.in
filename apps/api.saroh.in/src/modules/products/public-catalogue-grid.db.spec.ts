/**
 * The Product grid's read and its editor checks (round-2 G12) against a real
 * Postgres: the newest, a collection's (hand-picked and automatic) and
 * hand-picked products at the site's storefront, drafts and archived ones
 * dropping out, the gates in front (the `SITE_SHOP` flag, Commerce rolled
 * out), another business's collection at view and at save, and the flag
 * when every picked product has been archived.
 *
 * Runs in the integration project (TEST_DATABASE_URL).
 */
import { NotFoundException } from "@nestjs/common";
import { prisma } from "@saroh/database";

import type { OrganizationContext } from "../../common/types/organization-context";
import type { EntitlementService } from "../billing/entitlement.service";
import { FixedWindowRateLimiter } from "../bookings/rate-limiter";
import { SitesService } from "../sites/sites.service";
import type { GridQuery } from "./product-grid";
import { PublicCatalogueService } from "./public-catalogue.service";

const tag = `${process.pid}-${Date.now()}`;
let seq = 0;
const uniq = (label: string) => `${label}-${tag}-${++seq}`;

const catalogue = new PublicCatalogueService(new FixedWindowRateLimiter(1_000));
const sites = new SitesService({
    check: jest.fn().mockResolvedValue(true),
    can: jest.fn().mockResolvedValue(true),
    getEntitlements: jest.fn(),
} as unknown as EntitlementService);

const owner = (organizationId: string): OrganizationContext => ({
    organizationId,
    userId: "u_owner",
    role: "OWNER",
});

const grid = (over: Partial<GridQuery>): GridQuery => ({
    source: "newest",
    collectionId: null,
    productIds: [],
    count: 4,
    ...over,
});

async function flag(key: string, organizationId: string, enabled: boolean) {
    await prisma.featureFlagOverride.upsert({
        where: { flagKey_organizationId: { flagKey: key, organizationId } },
        create: { flagKey: key, organizationId, enabled },
        update: { enabled },
    });
}

async function business(name: string) {
    const org = await prisma.organization.create({
        data: { name, slug: uniq("g12-org") },
    });
    await flag("SITE_SHOP", org.id, true);
    await flag("MODULE_COMMERCE", org.id, true);
    return org.id;
}

async function storefront(organizationId: string, name: string) {
    return (
        await prisma.store.create({
            data: { name, slug: uniq("g12-store"), organizationId },
        })
    ).id;
}

/** A product listed at `storeId`, made `minutesAgo` ago. */
async function product(
    organizationId: string,
    storeId: string | null,
    name: string,
    over: {
        status?: string;
        minutesAgo?: number;
        categoryId?: string;
        onHand?: number;
        promised?: number;
    } = {},
) {
    const p = await prisma.product.create({
        data: {
            organizationId,
            name,
            slug: uniq(name.toLowerCase().replace(/\s+/g, "-")),
            price: "120.00",
            currency: "INR",
            status: over.status ?? "PUBLISHED",
            stockTracked: true,
            categoryId: over.categoryId ?? null,
            createdAt: new Date(Date.now() - (over.minutesAgo ?? 0) * 60_000),
        },
    });
    if (storeId) {
        await prisma.productListing.create({
            data: { organizationId, storeId, productId: p.id },
        });
        await prisma.stockLevel.create({
            data: {
                organizationId,
                storeId,
                productId: p.id,
                variantId: null,
                onHand: over.onHand ?? 10,
                promised: over.promised ?? 0,
                lowStockAlert: 3,
            },
        });
    }
    return { id: p.id, slug: p.slug, name };
}

async function handPicked(
    organizationId: string,
    name: string,
    productIds: string[],
) {
    const c = await prisma.collection.create({
        data: { organizationId, name, slug: uniq("g12-col") },
    });
    for (const [position, productId] of productIds.entries()) {
        await prisma.collectionProduct.create({
            data: {
                collectionId: c.id,
                organizationId,
                productId,
                position,
            },
        });
    }
    return c.id;
}

const names = (cards: { name: string }[]) => cards.map((c) => c.name);

describe("the Product grid's read (G12)", () => {
    let rye = "";
    let online = "";
    let ryeSite = "";
    let breads = "";
    let loaves: { id: string; slug: string; name: string }[] = [];
    let draft: { id: string };
    let hillRoadOnly: { id: string };
    let pulse = "";
    let pulseCollection = "";

    beforeAll(async () => {
        for (const key of ["SITE_SHOP", "MODULE_COMMERCE"]) {
            await prisma.featureFlag.upsert({
                where: { key },
                create: { key, enabledByDefault: false },
                update: {},
            });
        }
        rye = await business("Rye & Co.");
        online = await storefront(rye, "Online");
        const hillRoad = await storefront(rye, "Hill Road");
        // Through the service, so the editor's checks below have its pages.
        ryeSite = (await sites.createFromTemplate(owner(rye), { name: "Rye" }))
            .siteId;
        await prisma.site.update({
            where: { id: ryeSite },
            data: { storefrontId: online },
        });

        // Five breads, the newest last made; the collection's order is its own.
        loaves = [];
        for (const [i, name] of [
            "Sourdough",
            "Rye loaf",
            "Focaccia",
            "Baguette",
            "Brioche",
        ].entries()) {
            loaves.push(
                await product(rye, online, name, { minutesAgo: 50 - i * 10 }),
            );
        }
        breads = await handPicked(rye, "Breads", [
            loaves[2]!.id,
            loaves[0]!.id,
            loaves[4]!.id,
            loaves[1]!.id,
            loaves[3]!.id,
        ]);
        // A draft listed at Online, made just now: never shown, even newest.
        draft = await product(rye, online, "Draft cake", {
            status: "DRAFT",
            minutesAgo: 0,
        });
        hillRoadOnly = await product(rye, hillRoad, "Hot cross bun", {
            minutesAgo: 1,
        });

        pulse = await business("Pulse Fitness");
        const pulseStore = await storefront(pulse, "Pulse shop");
        const bar = await product(pulse, pulseStore, "Protein bar");
        pulseCollection = await handPicked(pulse, "Snacks", [bar.id]);
    });

    it("a Breads collection of five, count four: four cards, in its order, each with its page", async () => {
        const read = await catalogue.list(
            ryeSite,
            "visitor",
            grid({ source: "collection", collectionId: breads, count: 4 }),
        );
        expect(names(read.products)).toEqual([
            "Focaccia",
            "Sourdough",
            "Brioche",
            "Rye loaf",
        ]);
        expect(read.products[0]).toEqual(
            expect.objectContaining({
                slug: loaves[2]!.slug,
                price: "120.00",
                soldOut: false,
            }),
        );
    });

    it("an automatic collection shows its category and the ones inside, by name", async () => {
        const cakes = await prisma.category.create({
            data: { organizationId: rye, name: "Cakes", slug: uniq("cakes") },
        });
        const tarts = await prisma.category.create({
            data: {
                organizationId: rye,
                name: "Tarts",
                slug: uniq("tarts"),
                parentId: cakes.id,
            },
        });
        await product(rye, online, "Walnut cake", { categoryId: cakes.id });
        await product(rye, online, "Apple tart", { categoryId: tarts.id });
        await product(rye, online, "Plum cake", {
            categoryId: cakes.id,
            status: "ARCHIVED",
        });
        const auto = await prisma.collection.create({
            data: {
                organizationId: rye,
                name: "All cakes",
                slug: uniq("g12-auto"),
                categoryId: cakes.id,
            },
        });
        const read = await catalogue.list(
            ryeSite,
            "visitor",
            grid({ source: "collection", collectionId: auto.id }),
        );
        expect(names(read.products)).toEqual(["Apple tart", "Walnut cake"]);
    });

    it("the newest: newest first, never a draft or one not sold here", async () => {
        const read = await catalogue.list(
            ryeSite,
            "visitor",
            grid({ source: "newest", count: 3 }),
        );
        expect(read.products).toHaveLength(3);
        expect(names(read.products)).not.toContain("Draft cake");
        expect(names(read.products)).not.toContain("Hot cross bun");
        // Apple tart and Walnut cake were made after the breads.
        expect(names(read.products)).toContain("Brioche");
        expect(read.storefront).toEqual({ name: "Online" });
    });

    it("picked: in the merchant's order; a draft, an archived and an unlisted one drop out", async () => {
        const archived = await product(rye, online, "Old loaf", {
            status: "ARCHIVED",
        });
        const read = await catalogue.list(
            ryeSite,
            "visitor",
            grid({
                source: "picked",
                productIds: [
                    loaves[3]!.id,
                    draft.id,
                    archived.id,
                    hillRoadOnly.id,
                    loaves[0]!.id,
                ],
            }),
        );
        expect(names(read.products)).toEqual(["Baguette", "Sourdough"]);
    });

    it("every picked product archived: an empty grid, not a 404", async () => {
        const gone = await product(rye, online, "Gone loaf", {
            status: "ARCHIVED",
        });
        await expect(
            catalogue.list(
                ryeSite,
                "visitor",
                grid({ source: "picked", productIds: [gone.id] }),
            ),
        ).resolves.toEqual({ storefront: { name: "Online" }, products: [] });
    });

    it("stock follows the checkout: on hand equal to promised is Sold out", async () => {
        const sold = await product(rye, online, "Last cake", {
            onHand: 2,
            promised: 2,
        });
        const read = await catalogue.list(
            ryeSite,
            "visitor",
            grid({ source: "picked", productIds: [sold.id] }),
        );
        expect(read.products[0]?.soldOut).toBe(true);
    });

    it("another business's collection shows nothing here", async () => {
        const read = await catalogue.list(
            ryeSite,
            "visitor",
            grid({ source: "collection", collectionId: pulseCollection }),
        );
        expect(read.products).toEqual([]);
    });

    it("404s while Commerce isn't rolled out for the business (DEC-057), or the shop isn't open", async () => {
        await flag("MODULE_COMMERCE", rye, false);
        try {
            await expect(
                catalogue.list(ryeSite, "visitor", grid({})),
            ).rejects.toBeInstanceOf(NotFoundException);
        } finally {
            await flag("MODULE_COMMERCE", rye, true);
        }
        await flag("SITE_SHOP", rye, false);
        try {
            await expect(
                catalogue.list(ryeSite, "visitor", grid({})),
            ).rejects.toBeInstanceOf(NotFoundException);
        } finally {
            await flag("SITE_SHOP", rye, true);
        }
    });

    describe("in the editor", () => {
        let siteId = "";
        let pageId = "";

        beforeAll(async () => {
            siteId = ryeSite;
            const detail = await sites.getSite(owner(rye), siteId);
            pageId = detail.pages[0]!.id;
        });

        const save = (content: Record<string, unknown>) =>
            sites.replaceDraftSections(owner(rye), siteId, pageId, {
                sections: [
                    {
                        type: "productGrid",
                        contractVersion: 1,
                        content,
                        key: "grid",
                    },
                ],
            });

        it("saves a grid of the business's own collection", async () => {
            const saved = await save({
                source: "collection",
                collectionId: breads,
            });
            expect(saved.sections[0]?.content).toEqual({
                source: "collection",
                collectionId: breads,
            });
        });

        it("refuses a collection from another business at save, and writes nothing", async () => {
            await expect(
                save({ source: "collection", collectionId: pulseCollection }),
            ).rejects.toMatchObject({ status: 400 });
            const draftNow = await sites.getPageDraft(
                owner(rye),
                siteId,
                pageId,
            );
            expect(draftNow.sections[0]?.content).toEqual({
                source: "collection",
                collectionId: breads,
            });
        });

        it("flags a grid whose every picked product has been archived", async () => {
            const soon = await product(rye, online, "Seasonal loaf");
            await save({ source: "picked", productIds: [soon.id] });
            const before = await sites.getSiteFlags(owner(rye), siteId);
            expect(before.flags.map((f) => f.type)).not.toContain(
                "productsNotOnSale",
            );

            await prisma.product.update({
                where: { id: soon.id },
                data: { status: "ARCHIVED" },
            });
            const after = await sites.getSiteFlags(owner(rye), siteId);
            expect(after.flags).toContainEqual(
                expect.objectContaining({
                    type: "productsNotOnSale",
                    pageId,
                    sectionIndex: 0,
                    field: "productIds",
                }),
            );
            // Still saves: the archived product was already there.
            await expect(
                save({ source: "picked", productIds: [soon.id], count: 8 }),
            ).resolves.toBeDefined();
        });
    });
});
