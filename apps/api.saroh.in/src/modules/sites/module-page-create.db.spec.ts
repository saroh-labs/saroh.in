/**
 * `addModulePageIfMissing` (DEC-069, L13) against a real Postgres: the
 * transaction-taking way a module turn-on adds a module page. It never
 * refuses — a page it can't add is not added — and never makes a second.
 *
 * Runs in the integration project (TEST_DATABASE_URL).
 */
import { prisma } from "@saroh/database";

import type { OrganizationContext } from "../../common/types/organization-context";
import { addModulePageIfMissing } from "./module-page-create";

const tag = `${process.pid}-${Date.now()}`;
let seq = 0;
const uniq = (label: string) => `${label}-${tag}-${++seq}`;

beforeAll(async () => {
    for (const key of ["SITE_SHOP", "MODULE_COMMERCE"]) {
        await prisma.featureFlag.upsert({
            where: { key },
            create: { key, enabledByDefault: false },
            update: { enabledByDefault: false },
        });
    }
});

/** A business with a site; the shop open for it unless `shopOpen` is false. */
async function business(shopOpen = true) {
    const org = await prisma.organization.create({
        data: { name: "Rye", slug: uniq("l13-org") },
    });
    for (const flagKey of ["SITE_SHOP", "MODULE_COMMERCE"]) {
        if (!shopOpen && flagKey === "SITE_SHOP") continue;
        await prisma.featureFlagOverride.create({
            data: { flagKey, organizationId: org.id, enabled: true },
        });
    }
    const user = await prisma.user.create({
        data: { email: `${uniq("l13-user")}@example.test` },
    });
    const site = await prisma.site.create({
        data: { organizationId: org.id, name: "Rye", slug: uniq("l13-site") },
        select: { id: true, name: true },
    });
    const ctx: OrganizationContext = {
        organizationId: org.id,
        userId: user.id,
        role: "OWNER",
    };
    return { ctx, site };
}

const add = (ctx: OrganizationContext, site: { id: string; name: string }) =>
    prisma.$transaction((tx) => addModulePageIfMissing(tx, ctx, site, "SHOP"));

describe("addModulePageIfMissing", () => {
    it("adds the Shop page at /shop as a draft with its product grid, in the menu", async () => {
        const { ctx, site } = await business();
        const page = await add(ctx, site);
        expect(page).toMatchObject({
            path: "/shop",
            title: "Shop",
            kind: "SHOP",
            inMenu: true,
            isHome: false,
        });
        const versions = await prisma.pageVersion.findMany({
            where: { pageId: page?.id },
            include: { sections: true },
        });
        expect(versions).toHaveLength(1);
        expect(versions[0]).toMatchObject({
            status: "DRAFT",
            createdByUserId: ctx.userId,
        });
        expect(versions[0]?.sections.map((s) => s.type)).toEqual([
            "productGrid",
        ]);
    });

    it("never makes a second one", async () => {
        const { ctx, site } = await business();
        await add(ctx, site);
        await expect(add(ctx, site)).resolves.toBeNull();
        expect(
            await prisma.page.count({
                where: { siteId: site.id, kind: "SHOP" },
            }),
        ).toBe(1);
    });

    it("leaves a page of the merchant's own at /shop alone", async () => {
        const { ctx, site } = await business();
        await prisma.page.create({
            data: {
                siteId: site.id,
                organizationId: ctx.organizationId,
                path: "/shop",
                title: "Our shop",
            },
        });
        await expect(add(ctx, site)).resolves.toBeNull();
        expect(
            await prisma.page.findMany({
                where: { siteId: site.id },
                select: { title: true, kind: true },
            }),
        ).toEqual([{ title: "Our shop", kind: "FREE" }]);
    });

    it("adds nothing when the shop isn't open for the business, or Commerce is off", async () => {
        const closed = await business(false);
        await expect(add(closed.ctx, closed.site)).resolves.toBeNull();

        const off = await business();
        await prisma.organizationModule.create({
            data: {
                organizationId: off.ctx.organizationId,
                moduleKey: "COMMERCE",
                status: "DISABLED",
            },
        });
        await expect(add(off.ctx, off.site)).resolves.toBeNull();
        expect(
            await prisma.page.count({
                where: {
                    siteId: { in: [closed.site.id, off.site.id] },
                },
            }),
        ).toBe(0);
    });
});
