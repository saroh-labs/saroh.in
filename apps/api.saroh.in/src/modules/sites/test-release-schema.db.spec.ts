/**
 * The test releases schema against a real Postgres (DEC-071, T1): a TEST
 * publication is never read as published, restored as a version or served on
 * a real host; one live schedule per site; the closed sets the migration
 * CHECKs; and, under `TEST_RLS=on`, row-level security on both new tables.
 *
 * Runs in the integration project (TEST_DATABASE_URL).
 */
import { NotFoundException } from "@nestjs/common";
import { prisma, runInOrgContext } from "@saroh/database";

import { isRlsTestMode } from "../../../test/rls-mode";
import type { OrganizationContext } from "../../common/types/organization-context";
import type { EntitlementService } from "../billing/entitlement.service";
import { ModuleReadinessRegistry } from "../capabilities/readiness/module-readiness.registry";
import { SitesService } from "./sites.service";

const sites = new SitesService({
    check: jest.fn().mockResolvedValue(true),
    can: jest.fn().mockResolvedValue(true),
    getEntitlements: jest.fn(),
} as unknown as EntitlementService);

let seq = 0;
const uniq = (label: string) => `${label}${process.pid}x${++seq}`;
const later = () => new Date(Date.now() + 86_400_000);

/** A business with a site that has never been published, and its owner. */
async function business() {
    const org = await prisma.organization.create({
        data: { name: "Northwind T1", slug: uniq("t1-org-") },
    });
    const user = await prisma.user.create({
        data: { email: `${uniq("t1-user-")}@example.test` },
    });
    const site = await prisma.site.create({
        data: {
            organizationId: org.id,
            name: "Northwind",
            slug: uniq("t1-site-"),
            subdomain: uniq("t1sub"),
        },
    });
    const ctx: OrganizationContext = {
        organizationId: org.id,
        userId: user.id,
        role: "OWNER",
    };
    return { org, user, site, ctx };
}

type Business = Awaited<ReturnType<typeof business>>;

/** A test release: its TEST publication and its row. */
async function testRelease(b: Business, number = 1) {
    const publication = await prisma.publication.create({
        data: {
            siteId: b.site.id,
            organizationId: b.org.id,
            kind: "TEST",
            snapshot: { pages: [{ path: "/", title: "Home", sections: [] }] },
            templateId: "starter",
            templateVersion: 1,
            publishedByUserId: b.user.id,
        },
    });
    const release = await prisma.siteTestRelease.create({
        data: {
            siteId: b.site.id,
            organizationId: b.org.id,
            publicationId: publication.id,
            number,
            name: `Test release ${number}`,
            fingerprint: `fp-${number}`,
            createdByUserId: b.user.id,
        },
    });
    return { publication, release };
}

describe("a TEST publication is not published (DEC-071, T1)", () => {
    it("with no live publication: readiness reads not published, history omits it, the address 404s", async () => {
        const b = await business();
        const { publication } = await testRelease(b);

        const readiness = await new ModuleReadinessRegistry().evaluate(
            "WEBSITE",
            { organizationId: b.org.id },
        );
        expect(readiness.blockers[0]?.code).toBe("WEBSITE_NO_PUBLICATION");

        const history = await sites.listPublications(b.ctx, b.site.id);
        expect(history.map((p) => p.id)).not.toContain(publication.id);
        expect(history).toHaveLength(0);

        await expect(
            sites.getPublication(b.ctx, b.site.id, publication.id),
        ).rejects.toBeInstanceOf(NotFoundException);

        await expect(
            sites.getPublicationBySubdomain(b.site.subdomain!),
        ).rejects.toBeInstanceOf(NotFoundException);
    });

    it("a real host is never served a TEST row, even if the live pointer named one", async () => {
        const b = await business();
        const { publication } = await testRelease(b);
        // Nothing writes this (KTD-2); the reader refuses it all the same.
        await prisma.site.update({
            where: { id: b.site.id },
            data: { currentPublicationId: publication.id },
        });

        await expect(
            sites.getPublicationBySubdomain(b.site.subdomain!),
        ).rejects.toBeInstanceOf(NotFoundException);
        await expect(
            sites.getPublicationBySiteId(b.site.id),
        ).rejects.toBeInstanceOf(NotFoundException);
    });

    it("restoring a TEST row is a 404 and changes nothing", async () => {
        const b = await business();
        const { publication } = await testRelease(b);

        await expect(
            sites.restorePublication(b.ctx, b.site.id, publication.id),
        ).rejects.toBeInstanceOf(NotFoundException);

        const site = await prisma.site.findUniqueOrThrow({
            where: { id: b.site.id },
            select: { currentPublicationId: true },
        });
        expect(site.currentPublicationId).toBeNull();
        expect(
            await prisma.publication.count({ where: { siteId: b.site.id } }),
        ).toBe(1);
    });

    it("existing and new publications default to LIVE, and a new site to no approval rule", async () => {
        const b = await business();
        const live = await prisma.publication.create({
            data: {
                siteId: b.site.id,
                organizationId: b.org.id,
                snapshot: {},
                templateId: "starter",
                templateVersion: 1,
            },
            select: { kind: true, sourcePublicationId: true },
        });
        expect(live).toEqual({ kind: "LIVE", sourcePublicationId: null });

        const site = await prisma.site.findUniqueOrThrow({
            where: { id: b.site.id },
            select: { publishNeedsApproval: true },
        });
        expect(site.publishNeedsApproval).toBe(false);
    });
});

describe("the schema's own rules (DEC-071, T1)", () => {
    it("allows one live schedule per site", async () => {
        const b = await business();
        const one = await testRelease(b, 1);
        const two = await testRelease(b, 2);
        const at = later();

        await prisma.siteTestRelease.update({
            where: { id: one.release.id },
            data: { goLiveAt: at },
        });
        await expect(
            prisma.siteTestRelease.update({
                where: { id: two.release.id },
                data: { goLiveAt: at },
            }),
        ).rejects.toThrow(/Unique constraint|SiteTestRelease_one_schedule/);

        // Once the first is discarded, its schedule no longer counts.
        await prisma.siteTestRelease.update({
            where: { id: one.release.id },
            data: { discardedAt: new Date() },
        });
        await prisma.siteTestRelease.update({
            where: { id: two.release.id },
            data: { goLiveAt: at },
        });
    });

    it("numbers releases once per site", async () => {
        const b = await business();
        await testRelease(b, 1);
        await expect(testRelease(b, 1)).rejects.toThrow(/Unique constraint/);
    });

    it("refuses a link whose release belongs to another business", async () => {
        const a = await business();
        const other = await business();
        const { release } = await testRelease(a);
        await expect(
            prisma.siteTestReleaseLink.create({
                data: {
                    testReleaseId: release.id,
                    siteId: other.site.id,
                    organizationId: other.org.id,
                    tokenHash: uniq("hash-"),
                    purpose: "SHARE",
                    createdByUserId: other.user.id,
                    expiresAt: later(),
                },
            }),
        ).rejects.toThrow(/Foreign key constraint|violates foreign key/);
    });
});

const describeRls = isRlsTestMode() ? describe : describe.skip;

// RLS mode builds the schema from the migrations, so only there do the
// migration's CHECKs exist (a normal run uses `db push`).
describeRls("the migration's CHECKs (T1)", () => {
    it("refuses a publication kind or a link purpose outside the closed sets", async () => {
        const b = await business();
        await expect(
            prisma.publication.create({
                data: {
                    siteId: b.site.id,
                    organizationId: b.org.id,
                    kind: "DRAFT",
                    snapshot: {},
                    templateId: "starter",
                    templateVersion: 1,
                },
            }),
        ).rejects.toThrow(/Publication_kind_check|check constraint/);

        const { release } = await testRelease(b);
        await expect(
            prisma.siteTestReleaseLink.create({
                data: {
                    testReleaseId: release.id,
                    siteId: b.site.id,
                    organizationId: b.org.id,
                    tokenHash: uniq("hash-"),
                    purpose: "FOREVER",
                    createdByUserId: b.user.id,
                    expiresAt: later(),
                },
            }),
        ).rejects.toThrow(/SiteTestReleaseLink_purpose_check|check constraint/);
    });
});

describeRls("row-level security on the test release tables (T1)", () => {
    it("another business reads neither table", async () => {
        const a = await business();
        const b = await business();
        for (const owner of [a, b]) {
            const { release } = await testRelease(owner);
            await prisma.siteTestReleaseLink.create({
                data: {
                    testReleaseId: release.id,
                    siteId: owner.site.id,
                    organizationId: owner.org.id,
                    tokenHash: uniq("hash-"),
                    purpose: "SHARE",
                    createdByUserId: owner.user.id,
                    expiresAt: later(),
                },
            });
        }
        const both = { organizationId: { in: [a.org.id, b.org.id] } };

        for (const count of [
            () => prisma.siteTestRelease.count({ where: both }),
            () => prisma.siteTestReleaseLink.count({ where: both }),
        ]) {
            expect(await runInOrgContext(a.org.id, count)).toBe(1);
            expect(await runInOrgContext(b.org.id, count)).toBe(1);
            expect(await runInOrgContext("org_does_not_exist", count)).toBe(0);
            expect(await count()).toBe(2);
        }
    });
});
