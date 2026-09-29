/**
 * A shop that waits on "Sells from" (round-2 P4), against a real Postgres:
 * the site's settings say it, and so does the Website module's readiness,
 * only while the shop could serve (`SITE_SHOP` and Commerce, DEC-057) and
 * a storefront with products could be chosen. Runs in the integration
 * project (TEST_DATABASE_URL).
 */
import { prisma } from "@saroh/database";

import type { OrganizationContext } from "../../common/types/organization-context";
import type { EntitlementService } from "../billing/entitlement.service";
import { ModuleReadinessRegistry } from "../capabilities/readiness/module-readiness.registry";
import { siteAwaitingSellsFrom } from "./sells-from-awaiting";
import { SitesService } from "./sites.service";

const tag = `${process.pid}-${Date.now()}`;
let seq = 0;
const next = () => `${tag}-${++seq}`;

const FLAGS = ["SITE_SHOP", "MODULE_COMMERCE"] as const;
type Flag = (typeof FLAGS)[number];

beforeAll(async () => {
    for (const key of FLAGS) {
        await prisma.featureFlag.upsert({
            where: { key },
            create: { key, enabledByDefault: false },
            update: { enabledByDefault: false },
        });
    }
});

/**
 * A business with one published site and a storefront selling a product.
 * Every flag is on unless `off` names it; `chosen` answers Sells from.
 */
async function business(
    over: {
        off?: Flag[];
        commerceOff?: boolean;
        chosen?: boolean;
        noProducts?: boolean;
        published?: boolean;
    } = {},
) {
    const org = await prisma.organization.create({
        data: { name: "Northwind", slug: `p4-org-${next()}` },
    });
    for (const flagKey of FLAGS) {
        if (over.off?.includes(flagKey)) continue;
        await prisma.featureFlagOverride.create({
            data: { flagKey, organizationId: org.id, enabled: true },
        });
    }
    if (over.commerceOff) {
        await prisma.organizationModule.create({
            data: {
                organizationId: org.id,
                moduleKey: "COMMERCE",
                status: "DISABLED",
            },
        });
    }
    const store = await prisma.store.create({
        data: {
            name: "Online",
            slug: `p4-store-${next()}`,
            organizationId: org.id,
        },
    });
    if (!over.noProducts) {
        const product = await prisma.product.create({
            data: {
                organizationId: org.id,
                name: "Sourdough",
                slug: `sourdough-${next()}`,
                price: "250.00",
                currency: "INR",
                status: "PUBLISHED",
            },
        });
        await prisma.productListing.create({
            data: {
                organizationId: org.id,
                storeId: store.id,
                productId: product.id,
            },
        });
    }
    const site = await prisma.site.create({
        data: {
            organizationId: org.id,
            name: "Northwind",
            slug: `p4-site-${next()}`,
            storefrontId: over.chosen ? store.id : null,
        },
    });
    await prisma.page.create({
        data: {
            siteId: site.id,
            organizationId: org.id,
            path: "/",
            title: "Home",
            isHome: true,
        },
    });
    if (over.published !== false) {
        const publication = await prisma.publication.create({
            data: {
                siteId: site.id,
                organizationId: org.id,
                snapshot: { pages: [] },
                templateId: "blank",
                templateVersion: 1,
            },
        });
        await prisma.site.update({
            where: { id: site.id },
            data: { currentPublicationId: publication.id },
        });
    }
    const ctx: OrganizationContext = {
        organizationId: org.id,
        userId: "user_owner",
        role: "OWNER",
    };
    return { organizationId: org.id, siteId: site.id, ctx };
}

const readiness = new ModuleReadinessRegistry();
const sites = new SitesService({
    check: jest.fn().mockResolvedValue(true),
    can: jest.fn().mockResolvedValue(true),
    getEntitlements: jest.fn(),
} as unknown as EntitlementService);

describe("a shop waiting on Sells from (P4)", () => {
    it("names the live site, in the Website readiness and on its settings", async () => {
        const b = await business();
        expect(await siteAwaitingSellsFrom(prisma, b.organizationId)).toBe(
            b.siteId,
        );
        const result = await readiness.evaluate("WEBSITE", {
            organizationId: b.organizationId,
        });
        expect(result.blockers[0]).toMatchObject({
            code: "WEBSITE_SHOP_NOT_CHOSEN",
            actionHref: `/sites/${b.siteId}/settings#sells-from`,
        });
        expect((await sites.getSite(b.ctx, b.siteId)).shopAwaitsSellsFrom).toBe(
            true,
        );
    });

    it("says nothing once it is answered", async () => {
        const b = await business({ chosen: true });
        expect(
            await siteAwaitingSellsFrom(prisma, b.organizationId),
        ).toBeNull();
        expect(
            (
                await readiness.evaluate("WEBSITE", {
                    organizationId: b.organizationId,
                })
            ).readiness,
        ).toBe("ACTIVE");
        expect((await sites.getSite(b.ctx, b.siteId)).shopAwaitsSellsFrom).toBe(
            false,
        );
    });

    it("never names the shop while SITE_SHOP or Commerce is off (DEC-057)", async () => {
        for (const over of [
            { off: ["SITE_SHOP" as const] },
            { off: ["MODULE_COMMERCE" as const] },
            { commerceOff: true },
        ]) {
            const b = await business(over);
            expect(
                await siteAwaitingSellsFrom(prisma, b.organizationId),
            ).toBeNull();
            expect(
                (await sites.getSite(b.ctx, b.siteId)).shopAwaitsSellsFrom,
            ).toBe(false);
        }
    });

    it("asks nothing when no storefront sells anything yet", async () => {
        const b = await business({ noProducts: true });
        expect(
            await siteAwaitingSellsFrom(prisma, b.organizationId),
        ).toBeNull();
        expect((await sites.getSite(b.ctx, b.siteId)).shopAwaitsSellsFrom).toBe(
            false,
        );
    });

    it("leaves an unpublished site to 'Publish your site' first", async () => {
        const b = await business({ published: false });
        expect(
            await siteAwaitingSellsFrom(prisma, b.organizationId),
        ).toBeNull();
        // Its settings still say it: the shop won't be live once published.
        expect((await sites.getSite(b.ctx, b.siteId)).shopAwaitsSellsFrom).toBe(
            true,
        );
    });
});
