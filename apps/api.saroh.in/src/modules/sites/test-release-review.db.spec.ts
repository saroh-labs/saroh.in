/**
 * Review on a test release against a real Postgres (DEC-071, T8): a review
 * request, a verdict and a note can name a release, they are bound to its
 * frozen bytes, and the draft's own review and a release's never mix.
 *
 * Runs in the integration project (TEST_DATABASE_URL).
 */
import { ConflictException, NotFoundException } from "@nestjs/common";
import { prisma } from "@saroh/database";
import { DateTime } from "luxon";

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
 * A business with test releases on, a site whose home page holds one rich
 * text section, its owner Asha, and Meera, a reviewer invited to the site.
 */
async function business() {
    const org = await prisma.organization.create({
        data: { name: "Northwind T8", slug: uniq("t8-org-") },
    });
    await prisma.featureFlagOverride.create({
        data: { flagKey: FLAG, organizationId: org.id, enabled: true },
    });
    await prisma.businessProfile.create({
        data: { organizationId: org.id, timezone: "Asia/Kolkata" },
    });
    const owner = await prisma.user.create({
        data: { email: `${uniq("t8-owner-")}@example.test`, name: "Asha" },
    });
    await prisma.membership.create({
        data: { organizationId: org.id, userId: owner.id, role: "OWNER" },
    });
    const site = await prisma.site.create({
        data: {
            organizationId: org.id,
            name: "Northwind",
            slug: uniq("t8-site-"),
            subdomain: uniq("t8sub"),
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
    const reviewer = await prisma.user.create({
        data: { email: `${uniq("t8-reviewer-")}@example.test`, name: "Meera" },
    });
    await prisma.membership.create({
        data: { organizationId: org.id, userId: reviewer.id, role: "REVIEWER" },
    });
    await prisma.siteReviewer.create({
        data: { organizationId: org.id, siteId: site.id, userId: reviewer.id },
    });
    const ctx: OrganizationContext = {
        organizationId: org.id,
        userId: owner.id,
        role: "OWNER",
    };
    const reviewerCtx: OrganizationContext = {
        organizationId: org.id,
        userId: reviewer.id,
        role: "REVIEWER",
    };
    return { org, owner, site, page, section, ctx, reviewerCtx };
}

type Business = Awaited<ReturnType<typeof business>>;

/** Change the draft's one section, as the editor's autosave would. */
async function editDraft(b: Business, value: string) {
    await prisma.section.update({
        where: { id: b.section.id },
        data: { content: { value } },
    });
}

async function standingOf(b: Business, releaseId: string) {
    const list = await releases.list(b.ctx, b.site.id);
    const row = list.releases.find((r) => r.id === releaseId);
    if (!row) throw new Error("no such release");
    return row.standing;
}

describe("review on a test release (DEC-071, T8)", () => {
    it("binds a verdict to the release, so an approval survives the draft moving on", async () => {
        const b = await business();
        const made = await releases.create(b.ctx, b.site.id, {});
        await sites.requestReview(b.ctx, b.site.id, made.release.id);
        await sites.createApproval(b.reviewerCtx, b.site.id, {
            outcome: "APPROVED",
            testReleaseId: made.release.id,
        });
        await editDraft(b, "<p>Something newer</p>");

        const rows = await prisma.siteApproval.findMany({
            where: { siteId: b.site.id },
            orderBy: { createdAt: "asc" },
            select: {
                outcome: true,
                draftFingerprint: true,
                testReleaseId: true,
            },
        });
        const release = await prisma.siteTestRelease.findUniqueOrThrow({
            where: { id: made.release.id },
            select: { fingerprint: true },
        });
        expect(rows).toEqual([
            {
                outcome: "REQUESTED",
                draftFingerprint: release.fingerprint,
                testReleaseId: made.release.id,
            },
            {
                outcome: "APPROVED",
                draftFingerprint: release.fingerprint,
                testReleaseId: made.release.id,
            },
        ]);

        const state = await sites.getReviewState(
            b.ctx,
            b.site.id,
            made.release.id,
        );
        expect(state.testRelease?.id).toBe(made.release.id);
        expect(state.outstanding).toBe(false);
        expect(state.latestApproval).toMatchObject({
            outcome: "APPROVED",
            by: "Meera",
        });
        expect(await standingOf(b, made.release.id)).toMatchObject({
            approved: true,
            route: "APPROVED",
        });

        const live = await releases.goLive(b.ctx, b.site.id, made.release.id);
        expect(live.route).toBe("APPROVED");
    });

    it("keeps the draft's review apart from a release's", async () => {
        const b = await business();
        const made = await releases.create(b.ctx, b.site.id, {});
        // A release is put up for review; the draft's review isn't asked.
        await sites.requestReview(b.ctx, b.site.id, made.release.id);

        const draft = await sites.getReviewState(b.ctx, b.site.id);
        expect(draft.testRelease).toBeNull();
        expect(draft.outstanding).toBe(false);
        expect(draft.latestApproval).toBeNull();
        // Publishing the draft bypasses nothing: the review is of the release.
        const published = await sites.publishSite(b.ctx, b.site.id);
        const row = await prisma.publication.findUniqueOrThrow({
            where: { id: published.publicationId },
            select: { reviewRoute: true },
        });
        expect(row.reviewRoute).toBe("NONE");

        // And the other way: a review asked of the draft doesn't hold the
        // release up once a reviewer approved it.
        const second = await releases.create(b.ctx, b.site.id, {});
        await sites.requestReview(b.ctx, b.site.id);
        await sites.createApproval(b.reviewerCtx, b.site.id, {
            outcome: "APPROVED",
            testReleaseId: second.release.id,
        });
        expect((await sites.getReviewState(b.ctx, b.site.id)).pending).toBe(
            true,
        );
        const live = await releases.goLive(b.ctx, b.site.id, second.release.id);
        expect(live.route).toBe("APPROVED");
    });

    it("doesn't carry an approval of release 2 to release 3 with other bytes", async () => {
        const b = await business();
        const two = await releases.create(b.ctx, b.site.id, {});
        await editDraft(b, "<p>Diwali menu</p>");
        const three = await releases.create(b.ctx, b.site.id, {});
        await sites.createApproval(b.reviewerCtx, b.site.id, {
            outcome: "APPROVED",
            testReleaseId: two.release.id,
        });

        expect((await standingOf(b, two.release.id)).approved).toBe(true);
        expect((await standingOf(b, three.release.id)).approved).toBe(false);
        const state = await sites.getReviewState(
            b.ctx,
            b.site.id,
            three.release.id,
        );
        expect(state.latestApproval).toBeNull();
    });

    it("settles both when release 2 and 3 froze the same bytes", async () => {
        const b = await business();
        const two = await releases.create(b.ctx, b.site.id, {});
        const three = await releases.create(b.ctx, b.site.id, {});
        await sites.createApproval(b.reviewerCtx, b.site.id, {
            outcome: "APPROVED",
            testReleaseId: two.release.id,
        });

        expect((await standingOf(b, three.release.id)).approved).toBe(true);
        const live = await releases.goLive(b.ctx, b.site.id, three.release.id);
        expect(live.route).toBe("APPROVED");
    });

    it("unsettles on a later change request, and names the release on the bypass", async () => {
        const b = await business();
        const made = await releases.create(b.ctx, b.site.id, {});
        await sites.createApproval(b.reviewerCtx, b.site.id, {
            outcome: "APPROVED",
            testReleaseId: made.release.id,
        });
        await sites.createApproval(b.reviewerCtx, b.site.id, {
            outcome: "CHANGES_REQUESTED",
            testReleaseId: made.release.id,
        });
        expect(await standingOf(b, made.release.id)).toMatchObject({
            approved: false,
            outstanding: true,
        });

        const live = await releases.goLive(b.ctx, b.site.id, made.release.id);

        expect(live.route).toBe("BYPASSED");
        const bypass = await prisma.siteApproval.findFirstOrThrow({
            where: { siteId: b.site.id, outcome: "BYPASSED" },
            select: { publicationId: true, testReleaseId: true },
        });
        expect(bypass).toEqual({
            publicationId: live.publicationId,
            testReleaseId: made.release.id,
        });
        // The release's review shows its go-live; the draft's never does.
        expect(
            (await sites.getReviewState(b.ctx, b.site.id, made.release.id))
                .latestApproval?.outcome,
        ).toBe("BYPASSED");
        expect(
            (await sites.getReviewState(b.ctx, b.site.id)).latestApproval,
        ).toBeNull();
    });

    it("doesn't count an approval by the person going live", async () => {
        const b = await business();
        const made = await releases.create(b.ctx, b.site.id, {});
        await sites.createApproval(b.ctx, b.site.id, {
            outcome: "APPROVED",
            testReleaseId: made.release.id,
        });
        expect((await standingOf(b, made.release.id)).approved).toBe(false);
    });

    it("lets a schedule through with the setting on only for an approved release", async () => {
        const b = await business();
        await prisma.site.update({
            where: { id: b.site.id },
            data: { publishNeedsApproval: true },
        });
        const made = await releases.create(b.ctx, b.site.id, {});
        const date = DateTime.now().setZone("Asia/Kolkata").plus({ days: 1 });
        const when = { date: date.toISODate() ?? "", time: "18:00" };

        // The draft approved, even with the same bytes, is not the release
        // approved.
        await sites.createApproval(b.reviewerCtx, b.site.id, {
            outcome: "APPROVED",
        });
        await expect(
            releases.schedule(b.ctx, b.site.id, made.release.id, when),
        ).rejects.toThrow(ConflictException);

        await sites.createApproval(b.reviewerCtx, b.site.id, {
            outcome: "APPROVED",
            testReleaseId: made.release.id,
        });
        const view = await releases.schedule(
            b.ctx,
            b.site.id,
            made.release.id,
            when,
        );
        expect(view.status).toBe("scheduled");
    });

    it("refuses a verdict, a request or a note on a discarded or live release (409)", async () => {
        const b = await business();
        const gone = await releases.create(b.ctx, b.site.id, {});
        await releases.discard(b.ctx, b.site.id, gone.release.id);
        const live = await releases.create(b.ctx, b.site.id, {});
        await releases.goLive(b.ctx, b.site.id, live.release.id);

        for (const id of [gone.release.id, live.release.id]) {
            await expect(
                sites.createApproval(b.reviewerCtx, b.site.id, {
                    outcome: "APPROVED",
                    testReleaseId: id,
                }),
            ).rejects.toThrow(ConflictException);
            await expect(
                sites.requestReview(b.ctx, b.site.id, id),
            ).rejects.toThrow(ConflictException);
            await expect(
                sites.createComment(b.reviewerCtx, b.site.id, {
                    body: "Too late",
                    pageId: b.page.id,
                    sectionKey: "0",
                    testReleaseId: id,
                }),
            ).rejects.toThrow(ConflictException);
        }
        // Its review still reads, as history.
        const state = await sites.getReviewState(
            b.ctx,
            b.site.id,
            gone.release.id,
        );
        expect(state.testRelease?.id).toBe(gone.release.id);
        expect(
            await prisma.siteApproval.count({
                where: { siteId: b.site.id, outcome: { not: "BYPASSED" } },
            }),
        ).toBe(0);
    });

    it("answers 404 for another business's release, and with test releases off", async () => {
        const b = await business();
        const other = await business();
        const theirs = await releases.create(other.ctx, other.site.id, {});
        await expect(
            sites.createApproval(b.ctx, b.site.id, {
                outcome: "APPROVED",
                testReleaseId: theirs.release.id,
            }),
        ).rejects.toThrow(NotFoundException);

        const made = await releases.create(b.ctx, b.site.id, {});
        await prisma.featureFlagOverride.deleteMany({
            where: { organizationId: b.org.id, flagKey: FLAG },
        });
        await expect(
            sites.getReviewState(b.ctx, b.site.id, made.release.id),
        ).rejects.toThrow(NotFoundException);
        await expect(
            sites.requestReview(b.ctx, b.site.id, made.release.id),
        ).rejects.toThrow(NotFoundException);
    });

    it("keeps a note on a release against its frozen page, whatever the draft does", async () => {
        const b = await business();
        const made = await releases.create(b.ctx, b.site.id, {});
        // The draft moves on and its section is replaced.
        await prisma.section.update({
            where: { id: b.section.id },
            data: { key: "rewritten" },
        });

        await expect(
            sites.createComment(b.reviewerCtx, b.site.id, {
                body: "Not a section of the release",
                pageId: b.page.id,
                sectionKey: "rewritten",
                testReleaseId: made.release.id,
            }),
        ).rejects.toThrow("That section isn't on this page");
        await sites.createComment(b.reviewerCtx, b.site.id, {
            body: "Say when the bread is out",
            pageId: b.page.id,
            sectionKey: "0",
            testReleaseId: made.release.id,
        });
        await sites.createComment(b.reviewerCtx, b.site.id, {
            body: "A note on the draft",
            pageId: b.page.id,
            sectionKey: "rewritten",
        });

        const onRelease = await sites.listComments(
            b.ctx,
            b.site.id,
            made.release.id,
        );
        expect(onRelease.map((n) => [n.body, n.orphaned])).toEqual([
            ["Say when the bread is out", false],
        ]);
        const onDraft = await sites.listComments(b.ctx, b.site.id);
        expect(onDraft.map((n) => n.body)).toEqual(["A note on the draft"]);
        expect(
            (await sites.getReviewState(b.ctx, b.site.id, made.release.id))
                .openNotes,
        ).toBe(1);
        expect((await sites.getReviewState(b.ctx, b.site.id)).openNotes).toBe(
            1,
        );
    });
});
