/**
 * Go live with a test release against a real Postgres (DEC-071, T7): exactly
 * the frozen version goes live whatever the draft did since, through the one
 * repointing path, with the review standing recorded (#279), once only.
 *
 * Runs in the integration project (TEST_DATABASE_URL).
 */
import {
    ConflictException,
    ForbiddenException,
    NotFoundException,
} from "@nestjs/common";
import { prisma, runInOrgContext } from "@saroh/database";

import { backendPid, gate, waitUntilBlockedBy } from "../../../test/lock-wait";
import type { OrganizationContext } from "../../common/types/organization-context";
import type { EntitlementService } from "../billing/entitlement.service";
import { FeatureFlagService } from "../feature-flags/feature-flags.service";
import { putLive } from "./live-pointer";
import { draftFingerprint } from "./review-route";
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
 * A business with the flag on, a published site whose home page holds one
 * rich text section, and its owner Asha.
 */
async function business(over: { flag?: boolean } = {}) {
    const org = await prisma.organization.create({
        data: { name: "Northwind T7", slug: uniq("t7-org-") },
    });
    if (over.flag !== false) {
        await prisma.featureFlagOverride.create({
            data: { flagKey: FLAG, organizationId: org.id, enabled: true },
        });
    }
    const owner = await prisma.user.create({
        data: { email: `${uniq("t7-owner-")}@example.test`, name: "Asha" },
    });
    const site = await prisma.site.create({
        data: {
            organizationId: org.id,
            name: "Northwind",
            slug: uniq("t7-site-"),
            subdomain: uniq("t7sub"),
        },
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
    const ctx: OrganizationContext = {
        organizationId: org.id,
        userId: owner.id,
        role: "OWNER",
    };
    return { org, owner, site, section, ctx };
}

type Business = Awaited<ReturnType<typeof business>>;

async function person(
    b: Business,
    role: OrganizationContext["role"],
    name = "Ravi",
): Promise<OrganizationContext> {
    const user = await prisma.user.create({
        data: {
            email: `${uniq(`t7-${role.toLowerCase()}-`)}@example.test`,
            name,
        },
    });
    return { organizationId: b.org.id, userId: user.id, role };
}

/** Change the draft's one section, as the editor's autosave would. */
async function editDraft(b: Business, value: string) {
    await prisma.section.update({
        where: { id: b.section.id },
        data: { content: { value } },
    });
}

async function liveOf(siteId: string) {
    const site = await prisma.site.findUniqueOrThrow({
        where: { id: siteId },
        select: {
            currentPublication: {
                select: {
                    id: true,
                    kind: true,
                    snapshot: true,
                    reviewRoute: true,
                    sourcePublicationId: true,
                    publishedByUserId: true,
                    publishedAt: true,
                },
            },
        },
    });
    if (!site.currentPublication) throw new Error("nothing live");
    return site.currentPublication;
}

async function releaseRow(id: string) {
    return prisma.siteTestRelease.findUniqueOrThrow({
        where: { id },
        select: {
            fingerprint: true,
            publicationId: true,
            wentLiveAt: true,
            livePublicationId: true,
        },
    });
}

describe("going live with a test release (DEC-071, T7)", () => {
    it("puts the release live, not the draft, and leaves the draft alone", async () => {
        const b = await business();
        const published = await sites.publishSite(b.ctx, b.site.id);
        await editDraft(b, "<p>Diwali menu</p>");
        const made = await releases.create(b.ctx, b.site.id, {
            name: "Diwali menu",
        });
        // The merchant keeps working after freezing it.
        await editDraft(b, "<p>Half-written winter menu</p>");
        const draftBefore = await sites.currentDraftFingerprint(
            b.ctx,
            b.site.id,
        );

        const result = await releases.goLive(b.ctx, b.site.id, made.release.id);

        const release = await releaseRow(made.release.id);
        const live = await liveOf(b.site.id);
        expect(live.id).toBe(result.publicationId);
        // A LIVE copy of the TEST row, never the TEST row itself (KTD-2).
        expect(live.kind).toBe("LIVE");
        expect(live.id).not.toBe(release.publicationId);
        expect(live.sourcePublicationId).toBe(release.publicationId);
        // Byte for byte the release: only publishedAt differs.
        expect(draftFingerprint(live.snapshot)).toBe(release.fingerprint);
        expect(draftFingerprint(live.snapshot)).not.toBe(draftBefore);
        const test = await prisma.publication.findUniqueOrThrow({
            where: { id: release.publicationId },
            select: { snapshot: true },
        });
        const { publishedAt: liveStamp, ...liveRest } = live.snapshot as {
            publishedAt: string;
        };
        const { publishedAt: testStamp, ...testRest } = test.snapshot as {
            publishedAt: string;
        };
        expect(liveRest).toEqual(testRest);
        expect(liveStamp).toBe(live.publishedAt.toISOString());
        expect(liveStamp).not.toBe(testStamp);

        // The draft is exactly what it was.
        expect(await sites.currentDraftFingerprint(b.ctx, b.site.id)).toBe(
            draftBefore,
        );
        const section = await prisma.section.findUniqueOrThrow({
            where: { id: b.section.id },
            select: { content: true },
        });
        expect(section.content).toEqual({
            value: "<p>Half-written winter menu</p>",
        });

        // The release says it went live, and with which row.
        expect(release.wentLiveAt).not.toBeNull();
        expect(release.livePublicationId).toBe(live.id);
        expect(result.release.status).toBe("live");
        expect(result.route).toBe("NONE");
        expect(result.bypassed).toBe(false);
        // What it replaced, so the answer can say so.
        expect(result.replaced).toEqual({
            publicationId: published.publicationId,
            publishedAt: published.publishedAt,
            publishedBy: { name: "Asha" },
        });
        // It is a version like any other in history.
        const history = await sites.listPublications(b.ctx, b.site.id);
        expect(history.map((p) => p.id)).toContain(live.id);
        expect(history.map((p) => p.id)).not.toContain(release.publicationId);
    });

    it("goes live on a site that was never published, replacing nothing", async () => {
        const b = await business();
        const made = await releases.create(b.ctx, b.site.id, {});

        const result = await releases.goLive(b.ctx, b.site.id, made.release.id);

        expect(result.replaced).toBeNull();
        expect((await liveOf(b.site.id)).id).toBe(result.publicationId);
    });

    it("records a bypass linked to the new live row when changes were asked for (#279)", async () => {
        const b = await business();
        const made = await releases.create(b.ctx, b.site.id, {});
        const reviewer = await person(b, "REVIEWER");
        await prisma.siteApproval.create({
            data: {
                siteId: b.site.id,
                organizationId: b.org.id,
                byUserId: reviewer.userId,
                outcome: "CHANGES_REQUESTED",
                draftFingerprint: (await releaseRow(made.release.id))
                    .fingerprint,
                testReleaseId: made.release.id,
            },
        });

        const result = await releases.goLive(b.ctx, b.site.id, made.release.id);

        expect(result.route).toBe("BYPASSED");
        expect(result.bypassed).toBe(true);
        expect((await liveOf(b.site.id)).reviewRoute).toBe("BYPASSED");
        const bypass = await prisma.siteApproval.findMany({
            where: { siteId: b.site.id, outcome: "BYPASSED" },
            select: { byUserId: true, publicationId: true },
        });
        expect(bypass).toEqual([
            { byUserId: b.owner.id, publicationId: result.publicationId },
        ]);
    });

    it("counts an approval of the release by someone else as APPROVED", async () => {
        const b = await business();
        const made = await releases.create(b.ctx, b.site.id, {});
        const { fingerprint } = await releaseRow(made.release.id);
        const reviewer = await person(b, "REVIEWER");
        await prisma.siteApproval.create({
            data: {
                siteId: b.site.id,
                organizationId: b.org.id,
                byUserId: reviewer.userId,
                outcome: "APPROVED",
                draftFingerprint: fingerprint,
                testReleaseId: made.release.id,
            },
        });
        // The draft moving on doesn't unsettle an approval of the release.
        await editDraft(b, "<p>Something newer</p>");

        const result = await releases.goLive(b.ctx, b.site.id, made.release.id);

        expect(result.route).toBe("APPROVED");
        expect(result.bypassed).toBe(false);
        expect(
            await prisma.siteApproval.count({
                where: { siteId: b.site.id, outcome: "BYPASSED" },
            }),
        ).toBe(0);
    });

    it("doesn't count an approval by the person going live (#278)", async () => {
        const b = await business();
        const made = await releases.create(b.ctx, b.site.id, {});
        const { fingerprint } = await releaseRow(made.release.id);
        // A review was asked for, and the owner then signed it off themself.
        await prisma.siteApproval.create({
            data: {
                siteId: b.site.id,
                organizationId: b.org.id,
                byUserId: b.owner.id,
                outcome: "REQUESTED",
                draftFingerprint: fingerprint,
                testReleaseId: made.release.id,
                createdAt: new Date(Date.now() - 60_000),
            },
        });
        await prisma.siteApproval.create({
            data: {
                siteId: b.site.id,
                organizationId: b.org.id,
                byUserId: b.owner.id,
                outcome: "APPROVED",
                draftFingerprint: fingerprint,
                testReleaseId: made.release.id,
            },
        });

        const result = await releases.goLive(b.ctx, b.site.id, made.release.id);

        expect(result.route).toBe("BYPASSED");
        expect(result.bypassed).toBe(true);
    });

    it("refuses a second go-live and writes no second live row", async () => {
        const b = await business();
        const made = await releases.create(b.ctx, b.site.id, {});
        const first = await releases.goLive(b.ctx, b.site.id, made.release.id);

        await expect(
            releases.goLive(b.ctx, b.site.id, made.release.id),
        ).rejects.toThrow(ConflictException);

        expect(
            await prisma.publication.count({
                where: { siteId: b.site.id, kind: "LIVE" },
            }),
        ).toBe(1);
        expect((await liveOf(b.site.id)).id).toBe(first.publicationId);
    });

    it("refuses two go-lives at once: one wins, the other is a 409", async () => {
        const b = await business();
        const made = await releases.create(b.ctx, b.site.id, {});

        const results = await Promise.allSettled([
            releases.goLive(b.ctx, b.site.id, made.release.id),
            releases.goLive(b.ctx, b.site.id, made.release.id),
        ]);

        expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
        const refused = results.find((r) => r.status === "rejected");
        expect(refused?.reason).toBeInstanceOf(ConflictException);
        expect(
            await prisma.publication.count({
                where: { siteId: b.site.id, kind: "LIVE" },
            }),
        ).toBe(1);
    });

    it("names the version it replaced as the one live when it took the site's lock", async () => {
        const b = await business();
        const first = await sites.publishSite(b.ctx, b.site.id);
        const made = await releases.create(b.ctx, b.site.id, {});
        const published = await prisma.publication.findUniqueOrThrow({
            where: { id: first.publicationId },
            select: { snapshot: true, templateId: true, templateVersion: true },
        });

        // A publish has put its version live and not yet committed when
        // the merchant presses Go live.
        const wrote = gate<{ pid: number; publicationId: string }>();
        const commit = gate();
        const publish = runInOrgContext(b.org.id, () =>
            prisma.$transaction(
                async (tx) => {
                    const pid = await backendPid(tx);
                    const live = await putLive(tx, {
                        site: { id: b.site.id, organizationId: b.org.id },
                        snapshot: published.snapshot,
                        source: "publish",
                        actor: { userId: b.owner.id, owner: true },
                        fingerprint: draftFingerprint(published.snapshot),
                        template: {
                            id: published.templateId,
                            version: published.templateVersion,
                        },
                    });
                    wrote.release({ pid, publicationId: live.publicationId });
                    await commit.wait;
                },
                { timeout: 20_000 },
            ),
        );
        const fix = await wrote.wait;

        const goLive = releases.goLive(b.ctx, b.site.id, made.release.id);
        await waitUntilBlockedBy(fix.pid, "Site");
        commit.release();
        await publish;
        const result = await goLive;

        // What it replaced is the publish that went live first, not the
        // version live before it.
        expect(result.replaced?.publicationId).toBe(fix.publicationId);
        expect((await liveOf(b.site.id)).id).toBe(result.publicationId);
    });

    it("refuses a discarded release", async () => {
        const b = await business();
        const made = await releases.create(b.ctx, b.site.id, {});
        await releases.discard(b.ctx, b.site.id, made.release.id);

        await expect(
            releases.goLive(b.ctx, b.site.id, made.release.id),
        ).rejects.toThrow("This test release was discarded.");
        expect(
            await prisma.site.findUniqueOrThrow({
                where: { id: b.site.id },
                select: { currentPublicationId: true },
            }),
        ).toEqual({ currentPublicationId: null });
    });

    it("refuses a scheduled release until its schedule is cancelled", async () => {
        const b = await business();
        const made = await releases.create(b.ctx, b.site.id, {});
        const job = await prisma.job.create({
            data: {
                type: "site.go_live",
                organizationId: b.org.id,
                payload: { testReleaseId: made.release.id },
                runAt: new Date(Date.now() + 60 * 60 * 1000),
            },
        });
        await prisma.siteTestRelease.update({
            where: { id: made.release.id },
            data: {
                goLiveAt: job.runAt,
                scheduledByUserId: b.owner.id,
                goLiveJobId: job.id,
            },
        });

        await expect(
            releases.goLive(b.ctx, b.site.id, made.release.id),
        ).rejects.toThrow("Cancel the scheduled go-live first");

        // A job already running is the go-live itself.
        await prisma.job.update({
            where: { id: job.id },
            data: { status: "PROCESSING" },
        });
        await expect(
            releases.goLive(b.ctx, b.site.id, made.release.id),
        ).rejects.toThrow("going live now");
        expect(
            await prisma.publication.count({
                where: { siteId: b.site.id, kind: "LIVE" },
            }),
        ).toBe(0);
    });

    it("refuses a release holding a section this build can no longer draw, by name", async () => {
        const b = await business();
        const made = await releases.create(b.ctx, b.site.id, {});
        const { publicationId } = await releaseRow(made.release.id);
        // As if a deploy since the freeze had retired the block.
        const test = await prisma.publication.findUniqueOrThrow({
            where: { id: publicationId },
            select: { snapshot: true },
        });
        const snapshot = test.snapshot as {
            pages: { sections: { type: string }[] }[];
        };
        snapshot.pages[0].sections[0].type = "retiredBlock";
        await prisma.publication.update({
            where: { id: publicationId },
            data: { snapshot },
        });

        const attempt = releases.goLive(b.ctx, b.site.id, made.release.id);
        await expect(attempt).rejects.toThrow(ConflictException);
        await expect(attempt).rejects.toThrow(/"\/".*"retiredBlock"/);
        expect(
            await prisma.publication.count({
                where: { siteId: b.site.id, kind: "LIVE" },
            }),
        ).toBe(0);
    });

    it("is site:publish: an owner or admin may, a member may not", async () => {
        const b = await business();
        const made = await releases.create(b.ctx, b.site.id, {});
        const member = await person(b, "MEMBER");

        await expect(
            releases.goLive(member, b.site.id, made.release.id),
        ).rejects.toThrow(ForbiddenException);

        const admin = await person(b, "ADMIN");
        await expect(
            releases.goLive(admin, b.site.id, made.release.id),
        ).resolves.toMatchObject({ route: "NONE" });
    });

    it("answers 404 with the flag off, and for another site's release", async () => {
        const off = await business({ flag: false });
        await expect(
            releases.goLive(off.ctx, off.site.id, "release_x"),
        ).rejects.toThrow(NotFoundException);

        const a = await business();
        const other = await business();
        const theirs = await releases.create(other.ctx, other.site.id, {});
        await expect(
            releases.goLive(a.ctx, a.site.id, theirs.release.id),
        ).rejects.toThrow(NotFoundException);
        expect(
            await prisma.publication.count({
                where: { siteId: other.site.id, kind: "LIVE" },
            }),
        ).toBe(0);
    });

    it("leaves publish and restore working through the same path", async () => {
        const b = await business();
        const first = await sites.publishSite(b.ctx, b.site.id);
        const made = await releases.create(b.ctx, b.site.id, {});
        await releases.goLive(b.ctx, b.site.id, made.release.id);

        const restored = await sites.restorePublication(
            b.ctx,
            b.site.id,
            first.publicationId,
        );

        const live = await liveOf(b.site.id);
        expect(live.id).toBe(restored.publicationId);
        expect(live.kind).toBe("LIVE");
        expect(live.sourcePublicationId).toBeNull();
    });
});
