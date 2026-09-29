/**
 * The public catalogue and the site's sells-from storefront (round-2 G11)
 * against a real Postgres: what `/shop` lists and a product page shows, the
 * gates in front of both (the `SITE_SHOP` flag, Commerce, a storefront
 * chosen), the automatic choice and the migration's backfill, closing the
 * storefront, the per-visitor limit, and row-level security on its own
 * under a role that cannot bypass it.
 *
 * Runs in the integration project (TEST_DATABASE_URL).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { HttpException, NotFoundException } from "@nestjs/common";
import { prisma, runInOrgContext } from "@saroh/database";

import { isRlsTestMode } from "../../../test/rls-mode";
import type { OrganizationContext } from "../../common/types/organization-context";
import type { EntitlementService } from "../billing/entitlement.service";
import { FixedWindowRateLimiter } from "../bookings/rate-limiter";
import { automaticStorefront, sellsFromView } from "../sites/sells-from";
import { SitesService } from "../sites/sites.service";
import { StorefrontsService } from "../stores/storefronts.service";
import { PublicCatalogueService } from "./public-catalogue.service";

const tag = `${process.pid}-${Date.now()}`;
let seq = 0;
const uniq = (label: string) => `${label}-${tag}-${++seq}`;

// Generous: these tests read many times from one "visitor".
const catalogue = new PublicCatalogueService(new FixedWindowRateLimiter(1_000));
const sites = new SitesService({
    check: jest.fn().mockResolvedValue(true),
    can: jest.fn().mockResolvedValue(true),
    getEntitlements: jest.fn(),
} as unknown as EntitlementService);

async function expectNotFound(p: Promise<unknown>) {
    await expect(p).rejects.toBeInstanceOf(NotFoundException);
}

const owner = (organizationId: string): OrganizationContext => ({
    organizationId,
    userId: "u_owner",
    role: "OWNER",
});

async function business(name: string, shopOpen = true) {
    const org = await prisma.organization.create({
        data: { name, slug: uniq("g11-org") },
    });
    if (shopOpen) {
        await prisma.featureFlagOverride.create({
            data: {
                flagKey: "SITE_SHOP",
                organizationId: org.id,
                enabled: true,
            },
        });
    }
    // Commerce rolled out for the business (DEC-057).
    await prisma.featureFlagOverride.create({
        data: {
            flagKey: "MODULE_COMMERCE",
            organizationId: org.id,
            enabled: true,
        },
    });
    return org.id;
}

async function site(organizationId: string, storefrontId: string | null) {
    return (
        await prisma.site.create({
            data: {
                organizationId,
                name: "Site",
                slug: uniq("g11-site"),
                storefrontId,
            },
        })
    ).id;
}

async function storefront(organizationId: string, name: string) {
    return (
        await prisma.store.create({
            data: { name, slug: uniq("g11-store"), organizationId },
        })
    ).id;
}

async function product(
    organizationId: string,
    name: string,
    over: {
        status?: string;
        stockTracked?: boolean;
        variants?: { title: string; price?: string }[];
        description?: string;
        /** What the options are ("Size"). */
        optionName?: string;
    } = {},
) {
    const option = over.optionName
        ? await prisma.productOption.create({
              data: { organizationId, name: over.optionName },
          })
        : null;
    const p = await prisma.product.create({
        data: {
            organizationId,
            name,
            slug: name.toLowerCase().replace(/\s+/g, "-"),
            price: "300.00",
            currency: "INR",
            status: over.status ?? "PUBLISHED",
            stockTracked: over.stockTracked ?? true,
            description: over.description ?? null,
            supplierCode: "SECRET-SUP-1",
            optionId: option?.id ?? null,
        },
    });
    const variants = [];
    for (const [i, v] of (over.variants ?? []).entries()) {
        variants.push(
            await prisma.productVariant.create({
                data: {
                    productId: p.id,
                    sku: `${p.slug}-${i}`,
                    title: v.title,
                    price: v.price ?? null,
                    position: i,
                },
            }),
        );
    }
    return { id: p.id, slug: p.slug, variants: variants.map((v) => v.id) };
}

async function list(
    organizationId: string,
    storeId: string,
    p: { id: string },
    variantIds: string[] = [],
) {
    const listing = await prisma.productListing.create({
        data: { organizationId, storeId, productId: p.id },
    });
    for (const variantId of variantIds) {
        await prisma.productListingVariant.create({
            data: {
                organizationId,
                listingId: listing.id,
                productId: p.id,
                variantId,
            },
        });
    }
    return listing.id;
}

async function shelf(
    organizationId: string,
    storeId: string,
    productId: string,
    variantId: string | null,
    onHand: number,
    promised = 0,
    lowStockAlert = 3,
) {
    await prisma.stockLevel.create({
        data: {
            organizationId,
            storeId,
            productId,
            variantId,
            onHand,
            promised,
            lowStockAlert,
        },
    });
}

describe("public catalogue (G11)", () => {
    let rye = "";
    let online = "";
    let hillRoad = "";
    let ryeSite = "";
    let sourdough: { id: string; slug: string; variants: string[] };
    let focaccia: { id: string; slug: string; variants: string[] };
    let pulse = "";
    let pulseStore = "";
    let pulseSite = "";
    let protein: { id: string; slug: string; variants: string[] };

    beforeAll(async () => {
        await prisma.featureFlag.upsert({
            where: { key: "SITE_SHOP" },
            create: { key: "SITE_SHOP", enabledByDefault: false },
            update: { enabledByDefault: false },
        });
        await prisma.featureFlag.upsert({
            where: { key: "MODULE_COMMERCE" },
            create: { key: "MODULE_COMMERCE", enabledByDefault: false },
            update: {},
        });

        rye = await business("Rye & Co.");
        online = await storefront(rye, "Online");
        hillRoad = await storefront(rye, "Hill Road");
        ryeSite = await site(rye, online);

        sourdough = await product(rye, "Sourdough", {
            optionName: "Size",
            variants: [
                { title: "Small", price: "250.00" },
                { title: "Large", price: "450.00" },
                { title: "Family" },
            ],
            description: "<p>Slow rye. Baked at dawn.</p><p>Keeps a week.</p>",
        });
        // Family is left out of Online: not offered there.
        await list(rye, online, sourdough, sourdough.variants.slice(0, 2));
        await shelf(rye, online, sourdough.id, sourdough.variants[0]!, 5, 5);
        await shelf(rye, online, sourdough.id, sourdough.variants[1]!, 4, 2);

        focaccia = await product(rye, "Focaccia");
        await list(rye, online, focaccia);
        await shelf(rye, online, focaccia.id, null, 30);

        // Sold only at Hill Road: never on the Online site.
        const bun = await product(rye, "Hot cross bun");
        await list(rye, hillRoad, bun);
        // A draft listed at Online is not shown.
        const draft = await product(rye, "Draft loaf", { status: "DRAFT" });
        await list(rye, online, draft);

        pulse = await business("Pulse Fitness");
        pulseStore = await storefront(pulse, "Pulse shop");
        pulseSite = await site(pulse, pulseStore);
        protein = await product(pulse, "Protein bar", { stockTracked: false });
        await list(pulse, pulseStore, protein);
    });

    it("lists what the site's storefront sells, and nothing else", async () => {
        const shop = await catalogue.list(ryeSite, "visitor");
        expect(shop.storefront).toEqual({ name: "Online" });
        expect(shop.products.map((p) => p.slug)).toEqual([
            "focaccia",
            "sourdough",
        ]);
        const card = shop.products.find((p) => p.slug === "sourdough");
        expect(card).toEqual({
            slug: "sourdough",
            name: "Sourdough",
            currency: "INR",
            price: "250.00",
            mrp: null,
            priceFrom: true,
            image: null,
            variantTitles: ["Small", "Large"],
            // The card's "2 sizes" (DEC-073 #12).
            optionName: "Size",
            blurb: "Slow rye. Baked at dawn.",
            soldOut: false,
            listingId: expect.any(String),
            bagVariantId: expect.any(String),
        });
        // The card's Add to bag takes the first option that can be sold
        // now: Small is sold out here, so Large.
        const page = await catalogue.product(ryeSite, "sourdough", "visitor");
        expect(card?.listingId).toBe(page.listingId);
        expect(card?.bagVariantId).toBe(
            page.variants.find((v) => v.title === "Large")?.id,
        );
        // A product without options adds itself.
        expect(
            shop.products.find((p) => p.slug === "focaccia")?.bagVariantId,
        ).toBeNull();
    });

    it("serves a product page with only the variants sold here, and their stock words", async () => {
        const page = await catalogue.product(ryeSite, "sourdough", "visitor");
        expect(page.variants).toEqual([
            expect.objectContaining({
                title: "Small",
                price: "250.00",
                // On hand equal to promised: nothing to sell.
                stock: "SOLD_OUT",
                left: null,
            }),
            expect.objectContaining({
                title: "Large",
                stock: "LOW",
                left: 2,
            }),
        ]);
        expect(page.stock).toBeNull();
        // The allow-list: no cost, supplier code or shelf counts.
        const text = JSON.stringify(page);
        expect(text).not.toContain("SECRET-SUP-1");
        expect(text).not.toContain("onHand");
        expect(text).not.toContain("promised");
        expect(text).not.toContain("organizationId");
    });

    it("says nothing about stock for an untracked product, and Sold out once marked by hand", async () => {
        const page = await catalogue.product(pulseSite, "protein-bar", "v");
        expect(page.stock).toEqual({ word: "UNTRACKED", left: null });
        await prisma.productListing.updateMany({
            where: { productId: protein.id },
            data: { soldOutAt: new Date() },
        });
        try {
            const again = await catalogue.product(
                pulseSite,
                "protein-bar",
                "v",
            );
            expect(again.stock).toEqual({ word: "SOLD_OUT", left: null });
            const shop = await catalogue.list(pulseSite, "v");
            expect(shop.products[0]?.soldOut).toBe(true);
        } finally {
            await prisma.productListing.updateMany({
                where: { productId: protein.id },
                data: { soldOutAt: null },
            });
        }
    });

    it("404s a product not listed at this storefront, a draft, and another business's slug", async () => {
        await expectNotFound(
            catalogue.product(ryeSite, "hot-cross-bun", "visitor"),
        );
        await expectNotFound(
            catalogue.product(ryeSite, "draft-loaf", "visitor"),
        );
        await expectNotFound(
            catalogue.product(ryeSite, "protein-bar", "visitor"),
        );
        await expectNotFound(catalogue.list("no-such-site", "visitor"));
    });

    it("404s while the shop is not open for the business (the SITE_SHOP flag)", async () => {
        await prisma.featureFlagOverride.update({
            where: {
                flagKey_organizationId: {
                    flagKey: "SITE_SHOP",
                    organizationId: rye,
                },
            },
            data: { enabled: false },
        });
        try {
            await expectNotFound(catalogue.list(ryeSite, "visitor"));
            await expectNotFound(
                catalogue.product(ryeSite, "focaccia", "visitor"),
            );
        } finally {
            await prisma.featureFlagOverride.update({
                where: {
                    flagKey_organizationId: {
                        flagKey: "SITE_SHOP",
                        organizationId: rye,
                    },
                },
                data: { enabled: true },
            });
        }
    });

    it("404s the shop and its product pages while Commerce isn't rolled out for the business (DEC-057)", async () => {
        const where = {
            flagKey_organizationId: {
                flagKey: "MODULE_COMMERCE",
                organizationId: rye,
            },
        };
        await prisma.featureFlagOverride.update({
            where,
            data: { enabled: false },
        });
        try {
            await expectNotFound(catalogue.list(ryeSite, "visitor"));
            await expectNotFound(
                catalogue.product(ryeSite, "focaccia", "visitor"),
            );
        } finally {
            await prisma.featureFlagOverride.update({
                where,
                data: { enabled: true },
            });
        }
    });

    it("404s the shop and its product pages while Commerce is switched off", async () => {
        const row = await prisma.organizationModule.create({
            data: {
                organizationId: rye,
                moduleKey: "COMMERCE",
                status: "DISABLED",
            },
        });
        try {
            await expectNotFound(catalogue.list(ryeSite, "visitor"));
            await expectNotFound(
                catalogue.product(ryeSite, "focaccia", "visitor"),
            );
        } finally {
            await prisma.organizationModule.delete({ where: { id: row.id } });
        }
    });

    it("answers 429 to one visitor past the limit, and still serves another", async () => {
        const tight = new PublicCatalogueService(new FixedWindowRateLimiter(2));
        await tight.list(ryeSite, "busy");
        await tight.list(ryeSite, "busy");
        const refused = tight.list(ryeSite, "busy");
        await expect(refused).rejects.toBeInstanceOf(HttpException);
        await expect(refused).rejects.toMatchObject({ status: 429 });
        await expect(
            tight.list(ryeSite, "someone-else"),
        ).resolves.toBeDefined();
    });

    describe("which storefront the site sells from", () => {
        it("sets it on its own only when there is exactly one candidate", async () => {
            const one = await business("One shop");
            const only = await storefront(one, "Online");
            const listed = await product(one, "Loaf");
            await list(one, only, listed);
            // An open storefront with nothing listed is no candidate.
            await storefront(one, "Empty counter");
            await expect(automaticStorefront(prisma, one)).resolves.toBe(only);

            const two = await business("Two shops");
            const a = await storefront(two, "Online");
            const b = await storefront(two, "Hill Road");
            const p = await product(two, "Loaf");
            await list(two, a, p);
            await list(two, b, p);
            await expect(automaticStorefront(prisma, two)).resolves.toBeNull();
        });

        it("a new site with one candidate reads 'sells from Online' in its settings", async () => {
            const org = await business("New site");
            const only = await storefront(org, "Online");
            await list(org, only, await product(org, "Loaf"));
            const created = await sites.createFromTemplate(owner(org), {
                name: "New site",
            });
            const detail = await sites.getSite(owner(org), created.siteId);
            expect(detail.sellsFrom?.storefront).toEqual({
                id: only,
                name: "Online",
            });
        });

        it("with two candidates it asks, 404s /shop and flags it; after picking Online it serves Online", async () => {
            const org = await business("Two storefronts");
            const a = await storefront(org, "Online");
            const b = await storefront(org, "Hill Road");
            const loaf = await product(org, "Loaf");
            const bun = await product(org, "Bun");
            await list(org, a, loaf);
            await list(org, b, bun);
            const created = await sites.createFromTemplate(owner(org), {
                name: "Two storefronts",
            });
            const siteId = created.siteId;

            const before = await sites.getSite(owner(org), siteId);
            expect(before.sellsFrom?.storefront).toBeNull();
            expect(before.sellsFrom?.choices.map((c) => c.name)).toEqual([
                "Hill Road",
                "Online",
            ]);
            await expectNotFound(catalogue.list(siteId, "visitor"));
            const flags = await sites.getSiteFlags(owner(org), siteId);
            expect(flags.flags.map((f) => f.type)).toContain(
                "storefrontUnchosen",
            );

            await sites.updateSettings(owner(org), siteId, {
                storefrontId: a,
            });
            const shop = await catalogue.list(siteId, "visitor");
            expect(shop.products.map((p) => p.slug)).toEqual(["loaf"]);
            const after = await sites.getSiteFlags(owner(org), siteId);
            expect(after.flags.map((f) => f.type)).not.toContain(
                "storefrontUnchosen",
            );
        });

        it("refuses another business's storefront at save", async () => {
            await expect(
                sites.updateSettings(owner(rye), ryeSite, {
                    storefrontId: pulseStore,
                }),
            ).rejects.toMatchObject({ status: 400 });
            const still = await prisma.site.findUnique({
                where: { id: ryeSite },
                select: { storefrontId: true },
            });
            expect(still?.storefrontId).toBe(online);
        });

        it("shows no Sells from row, and asks nothing, while the shop is not open", async () => {
            const org = await business("Not yet", false);
            const only = await storefront(org, "Online");
            await list(org, only, await product(org, "Loaf"));
            await storefront(org, "Second");
            const siteId = await site(org, null);
            const detail = await sites.getSite(owner(org), siteId);
            expect(detail.sellsFrom).toBeNull();
            const flags = await sites.getSiteFlags(owner(org), siteId);
            expect(flags.flags.map((f) => f.type)).not.toContain(
                "storefrontUnchosen",
            );
        });

        it("flags a page of the merchant's own at /shop", async () => {
            const org = await business("Own shop page");
            const only = await storefront(org, "Online");
            await list(org, only, await product(org, "Loaf"));
            const siteId = await site(org, only);
            const page = await prisma.page.create({
                data: {
                    siteId,
                    organizationId: org,
                    path: "/shop",
                    title: "Our shop",
                },
            });
            const flags = await sites.getSiteFlags(owner(org), siteId);
            expect(flags.flags).toContainEqual(
                expect.objectContaining({
                    type: "reservedAddress",
                    pageId: page.id,
                }),
            );
        });

        it("closing the storefront clears the choice, and the question returns", async () => {
            const org = await business("Closing");
            const a = await storefront(org, "Online");
            const b = await storefront(org, "Hill Road");
            await list(org, a, await product(org, "Loaf"));
            await list(org, b, await product(org, "Bun"));
            const siteId = await site(org, a);
            await new StorefrontsService().close(org, a);
            const row = await prisma.site.findUnique({
                where: { id: siteId },
                select: { storefrontId: true },
            });
            expect(row?.storefrontId).toBeNull();
            await expectNotFound(catalogue.list(siteId, "visitor"));
            const view = await sellsFromView(prisma, {
                organizationId: org,
                storefrontId: null,
            });
            expect(view.choices.map((c) => c.name)).toEqual(["Hill Road"]);
        });

        it("the migration's backfill sets only the single-candidate businesses", async () => {
            const one = await business("Backfill one");
            const only = await storefront(one, "Online");
            await list(one, only, await product(one, "Loaf"));
            const oneSite = await site(one, null);

            const two = await business("Backfill two");
            const a = await storefront(two, "Online");
            const b = await storefront(two, "Hill Road");
            await list(two, a, await product(two, "Loaf"));
            await list(two, b, await product(two, "Bun"));
            const twoSite = await site(two, null);

            const sql = readFileSync(
                join(
                    __dirname,
                    "../../../../../packages/database/prisma/migrations/20261012120000_site_storefront/migration.sql",
                ),
                "utf8",
            );
            const update = sql.slice(sql.indexOf('UPDATE "Site"'));
            await prisma.$executeRawUnsafe(update);

            const rows = await prisma.site.findMany({
                where: { id: { in: [oneSite, twoSite] } },
                select: { id: true, storefrontId: true },
            });
            const by = new Map(rows.map((r) => [r.id, r.storefrontId]));
            expect(by.get(oneSite)).toBe(only);
            expect(by.get(twoSite)).toBeNull();
        });
    });

    /**
     * Row-level security as its own guarantee: the ProductListing policy as
     * the migrations write it, read as a role WITHOUT BYPASSRLS.
     */
    (isRlsTestMode() ? describe.skip : describe)(
        "with RLS enforcement on, as a role that cannot bypass it",
        () => {
            const ROLE = "saroh_g11_rls_probe";
            const TABLES = ["ProductListing", "Product"];

            beforeAll(async () => {
                await prisma.$executeRawUnsafe(`DO $$ BEGIN
                CREATE ROLE ${ROLE} NOLOGIN NOBYPASSRLS;
            EXCEPTION WHEN duplicate_object THEN NULL; END $$`);
                await prisma.$executeRawUnsafe(
                    `GRANT USAGE ON SCHEMA public TO ${ROLE}`,
                );
                await prisma.$executeRawUnsafe(
                    `GRANT SELECT ON ALL TABLES IN SCHEMA public TO ${ROLE}`,
                );
                for (const table of TABLES) {
                    await prisma.$executeRawUnsafe(
                        `ALTER TABLE "${table}" ENABLE ROW LEVEL SECURITY`,
                    );
                    await prisma.$executeRawUnsafe(
                        `DROP POLICY IF EXISTS "org_isolation" ON "${table}"`,
                    );
                    await prisma.$executeRawUnsafe(`CREATE POLICY "org_isolation" ON "${table}"
                USING (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
                       OR "organizationId" = current_setting('app.current_organization_id', true))`);
                }
            });

            afterAll(async () => {
                for (const table of TABLES) {
                    await prisma.$executeRawUnsafe(
                        `DROP POLICY IF EXISTS "org_isolation" ON "${table}"`,
                    );
                    await prisma.$executeRawUnsafe(
                        `ALTER TABLE "${table}" DISABLE ROW LEVEL SECURITY`,
                    );
                }
                await prisma.$executeRawUnsafe(
                    `REVOKE ALL ON ALL TABLES IN SCHEMA public FROM ${ROLE}`,
                );
                await prisma.$executeRawUnsafe(
                    `REVOKE USAGE ON SCHEMA public FROM ${ROLE}`,
                );
                await prisma.$executeRawUnsafe(`DROP ROLE IF EXISTS ${ROLE}`);
            });

            /** Run `fn` in one transaction as the probe role, in `orgId`'s context. */
            async function asProbe<T>(
                orgId: string,
                fn: () => Promise<T>,
            ): Promise<T> {
                const before = process.env.RLS_ENFORCEMENT;
                // eslint-disable-next-line no-restricted-properties -- the proxy reads this live
                process.env.RLS_ENFORCEMENT = "on";
                try {
                    return await runInOrgContext(orgId, () =>
                        prisma.$transaction(async (tx) => {
                            await tx.$executeRawUnsafe(
                                `SET LOCAL ROLE ${ROLE}`,
                            );
                            return fn();
                        }),
                    );
                } finally {
                    // eslint-disable-next-line no-restricted-properties -- restore what the test changed
                    if (before === undefined)
                        delete process.env.RLS_ENFORCEMENT;
                    // eslint-disable-next-line no-restricted-properties -- restore what the test changed
                    else process.env.RLS_ENFORCEMENT = before;
                }
            }

            it("site A's context sees none of site B's listings with no app filter at all", async () => {
                const seen = await asProbe(rye, () =>
                    prisma.productListing.findMany({
                        select: { productId: true, storeId: true },
                    }),
                );
                const products = seen.map((l) => l.productId);
                expect(products).toContain(focaccia.id);
                expect(products).not.toContain(protein.id);
                expect(seen.map((l) => l.storeId)).not.toContain(pulseStore);
            });

            it("serves site A's own catalogue under the probe role", async () => {
                const shop = await asProbe(rye, () =>
                    catalogue.list(ryeSite, "visitor"),
                );
                expect(shop.products.map((p) => p.slug)).toContain("focaccia");
            });
        },
    );
});
