/**
 * Reading a test release in the workspace, and version history naming the
 * release each live version came from (DEC-071, T12), against a real
 * Postgres.
 *
 * - `get` hands back the release's frozen snapshot, not the draft, to
 *   anyone who may read the site (a reviewer included), with no link token.
 * - `listPublications` and `getPublication` say which release a go-live
 *   came from, and who went live past "Publishing needs approval", beside
 *   the bypass record rather than instead of it.
 *
 * Runs in the integration project (TEST_DATABASE_URL).
 */
import { NotFoundException } from "@nestjs/common";
import { prisma } from "@saroh/database";

import type { OrganizationContext } from "../../common/types/organization-context";
import type { EntitlementService } from "../billing/entitlement.service";
import { FeatureFlagService } from "../feature-flags/feature-flags.service";
import { SitesService } from "./sites.service";
import { TestReleasesService } from "./test-releases.service";

const sites = new SitesService({
    check: jest.fn().mockResolvedValue(true),
    can: jest.fn().mockResolvedValue(true),
    getEntitlements: jest.fn(),
} as unknown as EntitlementService);
const releases = new TestReleasesService(sites, new FeatureFlagService());

const FLAG = "SITE_TEST_RELEASES";

let seq = 0;
const uniq = (label: string) => `${label}${process.pid}x${++seq}`;

beforeAll(async () => {
    await prisma.featureFlag.upsert({
        where: { key: FLAG },
        create: { key: FLAG, enabledByDefault: false },
        update: { enabledByDefault: false },
    });
});

/**
 * A business with test releases on and one site, published once: its owner
 * Asha, and a reviewer Meera who was invited to the site.
 */
async function business(opts: { flag?: boolean } = {}) {
    const org = await prisma.organization.create({
        data: { name: "Northwind T12", slug: uniq("t12-org-") },
    });
    if (opts.flag !== false) {
        await prisma.featureFlagOverride.create({
            data: { flagKey: FLAG, organizationId: org.id, enabled: true },
        });
    }
    const [owner, reviewer, member] = await Promise.all(
        (
            [
                ["OWNER", "Asha"],
                ["REVIEWER", "Meera"],
                ["MEMBER", "Kiran"],
            ] as const
        ).map(async ([role, name]) => {
            const user = await prisma.user.create({
                data: {
                    email: `${uniq(`t12-${role.toLowerCase()}-`)}@example.test`,
                    name,
                },
            });
            await prisma.membership.create({
                data: { organizationId: org.id, userId: user.id, role },
            });
            return user;
        }),
    );
    const site = await prisma.site.create({
        data: {
            organizationId: org.id,
            name: "Northwind",
            slug: uniq("t12-site-"),
            subdomain: uniq("t12sub"),
        },
    });
    await prisma.siteReviewer.create({
        data: { organizationId: org.id, siteId: site.id, userId: reviewer.id },
    });
    const page = await prisma.page.create({
        data: {
            siteId: site.id,
            organizationId: org.id,
            path: "/",
            title: "Home",
            isHome: true,
        },
    });
    const version = await prisma.pageVersion.create({
        data: {
            pageId: page.id,
            organizationId: org.id,
            status: "DRAFT",
            createdByUserId: owner.id,
        },
    });
    const section = await prisma.section.create({
        data: {
            pageVersionId: version.id,
            organizationId: org.id,
            type: "richText",
            contractVersion: 1,
            order: 0,
            key: "intro",
            content: { value: "<p>Fresh bread daily</p>" },
        },
    });
    const ctxOf = (
        userId: string,
        role: OrganizationContext["role"],
    ): OrganizationContext => ({ organizationId: org.id, userId, role });
    const ownerCtx = ctxOf(owner.id, "OWNER");
    const first = await sites.publishSite(ownerCtx, site.id);
    return {
        org,
        site,
        section,
        first,
        ownerCtx,
        reviewerCtx: ctxOf(reviewer.id, "REVIEWER"),
        memberCtx: ctxOf(member.id, "MEMBER"),
    };
}

type Business = Awaited<ReturnType<typeof business>>;

async function editDraft(b: Business, value: string) {
    await prisma.section.update({
        where: { id: b.section.id },
        data: { content: { value } },
    });
}

/** The text of the first section of the home page, in a snapshot. */
function homeText(snapshot: unknown): unknown {
    const pages = (
        snapshot as { pages: { sections: { content: unknown }[] }[] }
    ).pages;
    return (pages[0].sections[0].content as { value: unknown }).value;
}

describe("reading a test release in the workspace (DEC-071, T12)", () => {
    it("gives the release's frozen snapshot, not the draft it came from", async () => {
        const b = await business();
        await editDraft(b, "<p>Diwali menu</p>");
        const made = await releases.create(b.ownerCtx, b.site.id, {
            name: "Diwali menu",
        });
        await editDraft(b, "<p>Later work</p>");

        const read = await releases.get(b.ownerCtx, b.site.id, made.release.id);

        expect(read.release).toMatchObject({
            id: made.release.id,
            name: "Diwali menu",
            number: 1,
            status: "ready",
            draftChangedSince: true,
        });
        expect(homeText(read.snapshot)).toContain("Diwali menu");
        expect(read.renderability.renderable).toBe(true);
        // No token anywhere in what the view is given.
        expect(JSON.stringify(read)).not.toMatch(/release=/);
    });

    it("is open to a reviewer invited to the site, and a member", async () => {
        const b = await business();
        const made = await releases.create(b.ownerCtx, b.site.id, {});

        for (const ctx of [b.reviewerCtx, b.memberCtx]) {
            const read = await releases.get(ctx, b.site.id, made.release.id);
            expect(read.release.id).toBe(made.release.id);
        }
    });

    it("keeps a reviewer to the sites they were invited to (404)", async () => {
        const b = await business();
        const other = await prisma.site.create({
            data: {
                organizationId: b.org.id,
                name: "Other",
                slug: uniq("t12-other-"),
                subdomain: uniq("t12other"),
            },
        });
        await prisma.page.create({
            data: {
                siteId: other.id,
                organizationId: b.org.id,
                path: "/",
                title: "Home",
                isHome: true,
            },
        });
        const made = await releases.create(b.ownerCtx, other.id, {});

        await expect(
            releases.get(b.reviewerCtx, other.id, made.release.id),
        ).rejects.toThrow(NotFoundException);
    });

    it("answers 404 for another site's release, and while the flag is off", async () => {
        const b = await business();
        const c = await business();
        const made = await releases.create(c.ownerCtx, c.site.id, {});
        await expect(
            releases.get(b.ownerCtx, b.site.id, made.release.id),
        ).rejects.toThrow(NotFoundException);

        const off = await business({ flag: false });
        await expect(
            releases.get(off.ownerCtx, off.site.id, "missing"),
        ).rejects.toThrow(NotFoundException);
    });

    it("still reads a release that has gone live, as history", async () => {
        const b = await business();
        const made = await releases.create(b.ownerCtx, b.site.id, {});
        await releases.goLive(b.ownerCtx, b.site.id, made.release.id);

        const read = await releases.get(b.ownerCtx, b.site.id, made.release.id);
        expect(read.release.status).toBe("live");
    });
});

describe("version history names the test release (DEC-071, T12)", () => {
    it("says which release a go-live came from; a direct publish names none", async () => {
        const b = await business();
        const made = await releases.create(b.ownerCtx, b.site.id, {
            name: "Diwali menu",
        });
        const live = await releases.goLive(
            b.ownerCtx,
            b.site.id,
            made.release.id,
        );

        const history = await sites.listPublications(b.ownerCtx, b.site.id);
        const wentLive = history.find((p) => p.id === live.publicationId);
        const direct = history.find((p) => p.id === b.first.publicationId);
        expect(wentLive?.testRelease).toEqual({
            id: made.release.id,
            number: 1,
            name: "Diwali menu",
        });
        expect(wentLive?.isCurrent).toBe(true);
        expect(direct?.testRelease).toBeNull();
        // The TEST row itself never shows as a version (KTD-1).
        expect(history.map((p) => p.id)).not.toContain(
            (
                await prisma.siteTestRelease.findUniqueOrThrow({
                    where: { id: made.release.id },
                    select: { publicationId: true },
                })
            ).publicationId,
        );

        const one = await sites.getPublication(
            b.ownerCtx,
            b.site.id,
            live.publicationId,
        );
        expect(one.testRelease?.name).toBe("Diwali menu");
    });

    it("says who went live past the setting, beside a bypass", async () => {
        const b = await business();
        await sites.updateSettings(b.ownerCtx, b.site.id, {
            publishNeedsApproval: true,
        });
        const made = await releases.create(b.ownerCtx, b.site.id, {});
        await sites.createApproval(b.reviewerCtx, b.site.id, {
            outcome: "CHANGES_REQUESTED",
            testReleaseId: made.release.id,
        });
        const live = await releases.goLive(
            b.ownerCtx,
            b.site.id,
            made.release.id,
            { override: true },
        );

        const history = await sites.listPublications(b.ownerCtx, b.site.id);
        const row = history.find((p) => p.id === live.publicationId);
        expect(row).toMatchObject({
            reviewRoute: "OVERRIDDEN",
            override: { by: "Asha" },
            bypass: null,
        });

        // A plain bypass still reads as one, with no override.
        await sites.updateSettings(b.ownerCtx, b.site.id, {
            publishNeedsApproval: false,
        });
        await sites.createApproval(b.reviewerCtx, b.site.id, {
            outcome: "CHANGES_REQUESTED",
        });
        const published = await sites.publishSite(b.ownerCtx, b.site.id);
        const again = await sites.listPublications(b.ownerCtx, b.site.id);
        expect(
            again.find((p) => p.id === published.publicationId),
        ).toMatchObject({
            reviewRoute: "BYPASSED",
            bypass: { by: "Asha" },
            override: null,
            testRelease: null,
        });
    });
});
