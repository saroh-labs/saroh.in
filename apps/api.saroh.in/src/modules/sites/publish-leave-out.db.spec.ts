/**
 * Publish with Leave out (website area U8, KTD-5) against a real Postgres:
 * left-out changes go out as they are live, stay in the draft and are still
 * waiting afterwards; the publish's audit event names them.
 *
 * Runs in the integration project (TEST_DATABASE_URL).
 */
import { BadRequestException } from "@nestjs/common";
import { prisma } from "@saroh/database";

import type { OrganizationContext } from "../../common/types/organization-context";
import { env } from "../../env";
import type { EntitlementService } from "../billing/entitlement.service";
import { SitesService } from "./sites.service";

// Leave out and per-change approval belong to the Website area (DEC-240).
const areaBefore = env.WEBSITE_AREA;
beforeAll(() => {
    env.WEBSITE_AREA = "on";
});
afterAll(() => {
    env.WEBSITE_AREA = areaBefore;
});

const sites = new SitesService({
    check: jest.fn().mockResolvedValue(true),
    can: jest.fn().mockResolvedValue(true),
    getEntitlements: jest.fn(),
} as unknown as EntitlementService);

let seq = 0;
const uniq = (label: string) => `${label}${process.pid}x${++seq}`;

const hero = (key: string, heading: string) => ({
    key,
    type: "hero",
    contractVersion: 1,
    content: { heading },
});

/** A live site: a home page and a Bridal page of three sections. */
async function business() {
    const org = await prisma.organization.create({
        data: { name: "Gulmohar Studio", slug: uniq("lo-org-") },
    });
    const user = await prisma.user.create({
        data: { email: `${uniq("lo-")}@example.com`, name: "Mohit" },
    });
    await prisma.membership.create({
        data: { organizationId: org.id, userId: user.id, role: "OWNER" },
    });
    const ctx: OrganizationContext = {
        organizationId: org.id,
        userId: user.id,
        role: "OWNER",
        roleKey: "OWNER",
    };
    const site = await prisma.site.create({
        data: {
            organizationId: org.id,
            name: "Gulmohar",
            slug: uniq("lo-site-"),
            subdomain: uniq("losub"),
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
            path: "/bridal",
            title: "Bridal packages",
        },
    });
    await sites.replaceDraftSections(ctx, site.id, bridal.id, {
        sections: [
            hero("k1", "Intro"),
            hero("k2", "Packages"),
            hero("k3", "From our brides"),
        ],
    });
    await sites.publishSite(ctx, site.id);
    return { org, site, bridal, ctx };
}

async function livePages(siteId: string) {
    const row = await prisma.site.findUniqueOrThrow({
        where: { id: siteId },
        select: { currentPublication: { select: { snapshot: true } } },
    });
    return row.currentPublication?.snapshot as {
        pages: { path: string; sections: { content: { heading: string } }[] }[];
        redirects?: unknown[];
    };
}

const headings = (page: { sections: { content: { heading: string } }[] }) =>
    page.sections.map((s) => s.content.heading);

describe("publish with leave out (U8)", () => {
    it("publishes the rest; a left-out edit stays live as it was, in the draft and waiting", async () => {
        const b = await business();
        await sites.replaceDraftSections(b.ctx, b.site.id, b.bridal.id, {
            sections: [
                hero("k1", "Intro, rewritten"),
                hero("k2", "Packages, new prices"),
                hero("k9", "Two photos"),
            ],
        });
        const k1 = `section:${b.bridal.id}:k1`;
        const k9 = `section:${b.bridal.id}:k9`;
        const k3 = `section:${b.bridal.id}:k3`;

        const result = await sites.publishSite(b.ctx, b.site.id, {
            leaveOut: [k1, k9, k3],
        });
        expect(result.alsoLeftOut).toEqual([]);

        const live = await livePages(b.site.id);
        const page = live.pages.find((p) => p.path === "/bridal")!;
        // k1 as live, k2 published, k9 absent, k3 kept at its place.
        expect(headings(page)).toEqual([
            "Intro",
            "Packages, new prices",
            "From our brides",
        ]);

        const changes = await sites.getChanges(b.ctx, b.site.id);
        expect(changes.units.map((u) => u.key).sort()).toEqual(
            [k1, k3, k9].sort(),
        );

        const audit = await prisma.auditEvent.findFirstOrThrow({
            where: {
                organizationId: b.org.id,
                action: "site.publish.left_out",
                targetId: result.publicationId,
            },
            select: { metadata: true },
        });
        expect(audit.metadata).toMatchObject({ leftOut: [k1, k9, k3] });
    });

    it("keeps a renamed page at its old link and publishes no forward", async () => {
        const b = await business();
        await sites.updatePage(b.ctx, b.site.id, b.bridal.id, {
            path: "/bridal-makeup",
        });
        await sites.updateFooter(b.ctx, b.site.id, {
            format: "markdown",
            value: "Open Monday 11 am to 8 pm",
        });
        await sites.publishSite(b.ctx, b.site.id, {
            leaveOut: [`page:${b.bridal.id}`],
        });
        const live = await livePages(b.site.id);
        expect(live.pages.map((p) => p.path)).toEqual(["/", "/bridal"]);
        expect(live.redirects).toBeUndefined();
        const changes = await sites.getChanges(b.ctx, b.site.id);
        expect(changes.units.map((u) => u.key)).toEqual([
            `page:${b.bridal.id}`,
        ]);
    });

    it("refuses to leave out everything, and a change that isn't waiting", async () => {
        const b = await business();
        await sites.replaceDraftSections(b.ctx, b.site.id, b.bridal.id, {
            sections: [
                hero("k1", "Intro, rewritten"),
                hero("k2", "Packages"),
                hero("k3", "From our brides"),
            ],
        });
        const before = await prisma.site.findUniqueOrThrow({
            where: { id: b.site.id },
            select: { currentPublicationId: true },
        });
        await expect(
            sites.publishSite(b.ctx, b.site.id, {
                leaveOut: [`section:${b.bridal.id}:k1`],
            }),
        ).rejects.toMatchObject({
            response: { message: "Nothing to publish" },
        });
        await expect(
            sites.publishSite(b.ctx, b.site.id, {
                leaveOut: [`section:${b.bridal.id}:k7`],
            }),
        ).rejects.toBeInstanceOf(BadRequestException);
        const after = await prisma.site.findUniqueOrThrow({
            where: { id: b.site.id },
            select: { currentPublicationId: true },
        });
        expect(after.currentPublicationId).toBe(before.currentPublicationId);
    });
});
