/**
 * Old page links that forward (KTD-3) against a real Postgres: a published
 * page's link change leaves a forward that waits for Publish, the snapshot
 * carries it with the page's own head (KTD-7), a restore brings back its
 * own forwards, and another business reaches none of it.
 *
 * Runs in the integration project (TEST_DATABASE_URL).
 */
import { BadRequestException, NotFoundException } from "@nestjs/common";
import { prisma, runInOrgContext } from "@saroh/database";

import { isRlsTestMode } from "../../../test/rls-mode";
import type { OrganizationContext } from "../../common/types/organization-context";
import type { EntitlementService } from "../billing/entitlement.service";
import {
    OWN_REDIRECTS_PER_SITE,
    REDIRECTS_FULL_MESSAGE,
    REDIRECTS_LISTED,
    SiteRedirectsService,
} from "./site-redirects.service";
import { SitesService } from "./sites.service";

const sites = new SitesService({
    check: jest.fn().mockResolvedValue(true),
    can: jest.fn().mockResolvedValue(true),
    getEntitlements: jest.fn(),
} as unknown as EntitlementService);
const redirects = new SiteRedirectsService();

let seq = 0;
const uniq = (label: string) => `${label}${process.pid}x${++seq}`;

const OLD = "/services/bridal-makeup-packages";

/** A business whose site is live with a home page and a bridal page. */
async function business() {
    const org = await prisma.organization.create({
        data: { name: "Gulmohar Studio", slug: uniq("rd-org-") },
    });
    const owner = await prisma.user.create({
        data: { email: `${uniq("rd-owner-")}@example.com`, name: "Asha" },
    });
    await prisma.membership.create({
        data: { organizationId: org.id, userId: owner.id, role: "OWNER" },
    });
    const site = await prisma.site.create({
        data: {
            organizationId: org.id,
            name: "Gulmohar",
            slug: uniq("rd-site-"),
            subdomain: uniq("rdsub"),
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
    const bridal = await prisma.page.create({
        data: {
            siteId: site.id,
            organizationId: org.id,
            path: OLD,
            title: "Bridal",
        },
    });
    const ctx: OrganizationContext = {
        organizationId: org.id,
        userId: owner.id,
        role: "OWNER",
        roleKey: "OWNER",
    };
    const first = await sites.publishSite(ctx, site.id);
    return { org, owner, site, bridal, ctx, first };
}

async function liveSnapshot(siteId: string) {
    const site = await prisma.site.findUniqueOrThrow({
        where: { id: siteId },
        select: { currentPublication: { select: { snapshot: true } } },
    });
    return site.currentPublication?.snapshot as {
        redirects?: { from: string; to: string }[];
        pages: Record<string, unknown>[];
    };
}

describe("old page links that forward (KTD-3)", () => {
    it("forwards a published page's old link once published, with the page's own head", async () => {
        const b = await business();
        await sites.updatePage(b.ctx, b.site.id, b.bridal.id, {
            path: "/bridal",
            seoTitle: "Bridal make-up",
            noindex: true,
        });

        // Waits for Publish: listed, not live, and counted as waiting.
        const listed = await redirects.list(b.ctx, b.site.id);
        expect(listed).toEqual([
            expect.objectContaining({
                fromPath: OLD,
                toPath: "/bridal",
                toTitle: "Bridal",
                source: "AUTO",
                live: false,
            }),
        ]);
        expect((await liveSnapshot(b.site.id)).redirects).toBeUndefined();
        const stamped = await prisma.page.findUniqueOrThrow({
            where: { id: b.bridal.id },
            select: { settingsEditedByUserId: true, settingsEditedAt: true },
        });
        expect(stamped.settingsEditedByUserId).toBe(b.owner.id);
        expect(stamped.settingsEditedAt).toBeInstanceOf(Date);

        await sites.publishSite(b.ctx, b.site.id);
        const live = await liveSnapshot(b.site.id);
        expect(live.redirects).toEqual([{ from: OLD, to: "/bridal" }]);
        expect(live.pages).toContainEqual(
            expect.objectContaining({
                path: "/bridal",
                seoTitle: "Bridal make-up",
                noindex: true,
            }),
        );
        expect((await redirects.list(b.ctx, b.site.id))[0]?.live).toBe(true);

        // A restore puts that version's own forwards back: none, here.
        await sites.restorePublication(b.ctx, b.site.id, b.first.publicationId);
        expect((await liveSnapshot(b.site.id)).redirects).toBeUndefined();
    });

    it("collapses a chain and leaves nothing when the page goes back", async () => {
        const b = await business();
        await sites.updatePage(b.ctx, b.site.id, b.bridal.id, { path: "/b" });
        await sites.updatePage(b.ctx, b.site.id, b.bridal.id, { path: "/c" });
        expect(
            (await redirects.list(b.ctx, b.site.id)).map((r) => [
                r.fromPath,
                r.toPath,
            ]),
        ).toEqual([[OLD, "/c"]]);

        await sites.updatePage(b.ctx, b.site.id, b.bridal.id, { path: OLD });
        expect(await redirects.list(b.ctx, b.site.id)).toEqual([]);
    });

    it("lets a new page take an old link, and keeps the merchant's own forwards apart", async () => {
        const b = await business();
        await redirects.create(b.ctx, b.site.id, {
            fromPath: "/old-prices",
            toPath: "/",
        });
        await sites.createPage(b.ctx, b.site.id, {
            title: "Prices",
            path: "/old-prices",
        });
        expect(await redirects.list(b.ctx, b.site.id)).toEqual([]);
    });

    it("shows another business none of it", async () => {
        const a = await business();
        const other = await business();
        await sites.updatePage(a.ctx, a.site.id, a.bridal.id, {
            path: "/bridal",
        });
        await expect(
            redirects.list(other.ctx, a.site.id),
        ).rejects.toBeInstanceOf(NotFoundException);
    });
});

describe("a site's own old links are bounded (W4, 21 Nov 2026)", () => {
    it("refuses one past the cap in words, and pages the list", async () => {
        const b = await business();
        await prisma.siteRedirect.createMany({
            data: Array.from({ length: OWN_REDIRECTS_PER_SITE }, (_, i) => ({
                organizationId: b.org.id,
                siteId: b.site.id,
                fromPath: `/old-${String(i).padStart(4, "0")}`,
                toPath: "/",
                source: "OWN" as const,
                createdByUserId: b.owner.id,
            })),
        });
        const err = await redirects
            .create(b.ctx, b.site.id, { fromPath: "/one-more", toPath: "/" })
            .catch((e: unknown) => e);
        expect(err).toBeInstanceOf(BadRequestException);
        expect((err as BadRequestException).getResponse()).toMatchObject({
            message: REDIRECTS_FULL_MESSAGE,
            details: { reason: "full" },
        });
        // A page's own forward (AUTO) isn't the merchant's to count.
        await prisma.siteRedirect.createMany({
            data: Array.from({ length: REDIRECTS_LISTED }, (_, i) => ({
                organizationId: b.org.id,
                siteId: b.site.id,
                fromPath: `/zz-${String(i).padStart(4, "0")}`,
                toPath: "/",
                source: "AUTO" as const,
                createdByUserId: b.owner.id,
            })),
        });
        const first = await redirects.list(b.ctx, b.site.id);
        expect(first).toHaveLength(REDIRECTS_LISTED);
        const next = await redirects.list(
            b.ctx,
            b.site.id,
            first[first.length - 1].fromPath,
        );
        expect(next).toHaveLength(OWN_REDIRECTS_PER_SITE);
        expect(next[0].fromPath > first[first.length - 1].fromPath).toBe(true);
    });
});

const describeRls = isRlsTestMode() ? describe : describe.skip;

describeRls("old page links under row-level security (#53)", () => {
    it("are seen only inside their own business", async () => {
        const a = await business();
        await sites.updatePage(a.ctx, a.site.id, a.bridal.id, {
            path: "/bridal",
        });
        const count = () =>
            prisma.siteRedirect.count({ where: { siteId: a.site.id } });
        expect(await runInOrgContext(a.org.id, count)).toBe(1);
        expect(await runInOrgContext("org_does_not_exist", count)).toBe(0);
    });
});
