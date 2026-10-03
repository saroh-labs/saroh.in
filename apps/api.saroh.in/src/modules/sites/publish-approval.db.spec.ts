/**
 * "Publishing needs approval" against a real Postgres (DEC-071, R10, T9):
 * with the setting on, only a test release someone else approved goes
 * live; an owner can still go live without one, and the override is
 * written down three ways (the publication's route, an OVERRIDDEN approval
 * and an audit event). Off, DEC-047 stands.
 *
 * Runs in the integration project (TEST_DATABASE_URL).
 */
import {
    ConflictException,
    ForbiddenException,
    HttpException,
} from "@nestjs/common";
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
 * A business with test releases on, a site already published once, its
 * owner Asha, an admin Ravi and a reviewer Meera.
 */
async function business(over: { needsApproval?: boolean } = {}) {
    const org = await prisma.organization.create({
        data: { name: "Northwind T9", slug: uniq("t9-org-") },
    });
    await prisma.featureFlagOverride.create({
        data: { flagKey: FLAG, organizationId: org.id, enabled: true },
    });
    const [owner, admin, reviewer] = await Promise.all(
        (
            [
                ["OWNER", "Asha"],
                ["ADMIN", "Ravi"],
                ["REVIEWER", "Meera"],
            ] as const
        ).map(async ([role, name]) => {
            const user = await prisma.user.create({
                data: {
                    email: `${uniq(`t9-${role.toLowerCase()}-`)}@example.test`,
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
            slug: uniq("t9-site-"),
            subdomain: uniq("t9sub"),
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
    const b = {
        org,
        site,
        section,
        ownerCtx: ctxOf(owner.id, "OWNER"),
        adminCtx: ctxOf(admin.id, "ADMIN"),
        reviewerCtx: ctxOf(reviewer.id, "REVIEWER"),
    };
    // Published once, before the setting, so there is something to restore.
    const first = await sites.publishSite(b.ownerCtx, site.id);
    if (over.needsApproval !== false) {
        await sites.updateSettings(b.ownerCtx, site.id, {
            publishNeedsApproval: true,
        });
    }
    return { ...b, first };
}

type Business = Awaited<ReturnType<typeof business>>;

/** Change the draft's one section, as the editor's autosave would. */
async function editDraft(b: Business, value: string) {
    await prisma.section.update({
        where: { id: b.section.id },
        data: { content: { value } },
    });
}

async function liveCount(siteId: string) {
    return prisma.publication.count({ where: { siteId, kind: "LIVE" } });
}

async function liveOf(siteId: string) {
    const site = await prisma.site.findUniqueOrThrow({
        where: { id: siteId },
        select: {
            currentPublication: {
                select: {
                    id: true,
                    reviewRoute: true,
                    publishedByUserId: true,
                },
            },
        },
    });
    if (!site.currentPublication) throw new Error("nothing live");
    return site.currentPublication;
}

/** Every approval row going live wrote (verdicts aside), oldest first. */
async function records(siteId: string) {
    return prisma.siteApproval.findMany({
        where: { siteId, outcome: { in: ["BYPASSED", "OVERRIDDEN"] } },
        orderBy: { createdAt: "asc" },
        select: {
            outcome: true,
            byUserId: true,
            publicationId: true,
            testReleaseId: true,
        },
    });
}

async function audits(organizationId: string, action: string) {
    return prisma.auditEvent.findMany({
        where: { organizationId, action },
        orderBy: { createdAt: "asc" },
        select: {
            actorUserId: true,
            targetType: true,
            targetId: true,
            outcome: true,
            metadata: true,
        },
    });
}

/** The error's status and `details.code`, whatever threw it. */
async function refusal(promise: Promise<unknown>) {
    try {
        await promise;
    } catch (err) {
        if (!(err instanceof HttpException)) throw err;
        const body = err.getResponse() as { details?: { code?: string } };
        return { status: err.getStatus(), code: body.details?.code ?? null };
    }
    throw new Error("expected a refusal");
}

describe("Publishing needs approval: Publish (DEC-071, T9)", () => {
    it("refuses a publish by an admin, and by an owner without an override (409), and writes nothing", async () => {
        const b = await business();
        await editDraft(b, "<p>Diwali menu</p>");

        for (const ctx of [b.adminCtx, b.ownerCtx]) {
            expect(await refusal(sites.publishSite(ctx, b.site.id))).toEqual({
                status: 409,
                code: "APPROVAL_REQUIRED",
            });
        }
        expect(await liveCount(b.site.id)).toBe(1);
        expect((await liveOf(b.site.id)).id).toBe(b.first.publicationId);
        expect(await records(b.site.id)).toEqual([]);
    });

    it("lets the owner publish with an override, and records it three ways", async () => {
        const b = await business();
        await editDraft(b, "<p>Diwali menu</p>");

        const result = await sites.publishSite(b.ownerCtx, b.site.id, {
            override: true,
        });

        expect(result).toMatchObject({
            route: "OVERRIDDEN",
            overridden: true,
            bypassed: false,
        });
        const live = await liveOf(b.site.id);
        expect(live).toMatchObject({
            id: result.publicationId,
            reviewRoute: "OVERRIDDEN",
            publishedByUserId: b.ownerCtx.userId,
        });
        // One record, of what happened: an override, not a bypass as well.
        expect(await records(b.site.id)).toEqual([
            {
                outcome: "OVERRIDDEN",
                byUserId: b.ownerCtx.userId,
                publicationId: result.publicationId,
                testReleaseId: null,
            },
        ]);
        expect(
            await audits(b.org.id, "site.publish_approval.override"),
        ).toEqual([
            {
                actorUserId: b.ownerCtx.userId,
                targetType: "publication",
                targetId: result.publicationId,
                outcome: "SUCCESS",
                metadata: { siteId: b.site.id, source: "publish" },
            },
        ]);
    });

    it("refuses an override from an admin with a 403, setting on or off", async () => {
        for (const needsApproval of [true, false]) {
            const b = await business({ needsApproval });
            await expect(
                sites.publishSite(b.adminCtx, b.site.id, { override: true }),
            ).rejects.toThrow(ForbiddenException);
            expect(await liveCount(b.site.id)).toBe(1);
        }
    });

    it("leaves DEC-047 alone while it is off: an override changes nothing and records nothing", async () => {
        const b = await business({ needsApproval: false });
        await editDraft(b, "<p>Diwali menu</p>");

        const byAdmin = await sites.publishSite(b.adminCtx, b.site.id);
        expect(byAdmin.route).toBe("NONE");
        const byOwner = await sites.publishSite(b.ownerCtx, b.site.id, {
            override: true,
        });
        expect(byOwner).toMatchObject({ route: "NONE", overridden: false });
        expect(await records(b.site.id)).toEqual([]);
        expect(
            await audits(b.org.id, "site.publish_approval.override"),
        ).toEqual([]);
    });
});

describe("Publishing needs approval: restore (DEC-071, T9, Q3)", () => {
    it("refuses a restore without an override (409), and lets the owner restore with one", async () => {
        const b = await business();
        await editDraft(b, "<p>Diwali menu</p>");
        const second = await sites.publishSite(b.ownerCtx, b.site.id, {
            override: true,
        });

        for (const ctx of [b.adminCtx, b.ownerCtx]) {
            expect(
                await refusal(
                    sites.restorePublication(
                        ctx,
                        b.site.id,
                        b.first.publicationId,
                    ),
                ),
            ).toEqual({ status: 409, code: "APPROVAL_REQUIRED" });
        }
        expect((await liveOf(b.site.id)).id).toBe(second.publicationId);

        const restored = await sites.restorePublication(
            b.ownerCtx,
            b.site.id,
            b.first.publicationId,
            { override: true },
        );
        expect(restored).toMatchObject({
            route: "OVERRIDDEN",
            overridden: true,
        });
        expect((await liveOf(b.site.id)).reviewRoute).toBe("OVERRIDDEN");
        const rows = await records(b.site.id);
        expect(rows.map((r) => r.publicationId)).toEqual([
            second.publicationId,
            restored.publicationId,
        ]);
        const events = await audits(b.org.id, "site.publish_approval.override");
        expect(events.map((e) => e.metadata)).toEqual([
            { siteId: b.site.id, source: "publish" },
            { siteId: b.site.id, source: "restore" },
        ]);
    });
});

describe("Publishing needs approval: Go live (DEC-071, T9)", () => {
    it("lets an admin go live with a release someone else approved, as APPROVED", async () => {
        const b = await business();
        await editDraft(b, "<p>Diwali menu</p>");
        const made = await releases.create(b.adminCtx, b.site.id, {
            name: "Diwali menu",
        });
        await sites.requestReview(b.adminCtx, b.site.id, made.release.id);
        await sites.createApproval(b.reviewerCtx, b.site.id, {
            outcome: "APPROVED",
            testReleaseId: made.release.id,
        });

        const result = await releases.goLive(
            b.adminCtx,
            b.site.id,
            made.release.id,
        );

        expect(result).toMatchObject({
            route: "APPROVED",
            overridden: false,
            bypassed: false,
        });
        expect((await liveOf(b.site.id)).reviewRoute).toBe("APPROVED");
        expect(await records(b.site.id)).toEqual([]);
    });

    it("refuses a release that isn't approved (409): unanswered, approved by the one going live, or approval unsettled since", async () => {
        const b = await business();
        const unanswered = await releases.create(b.adminCtx, b.site.id, {});
        await sites.requestReview(b.adminCtx, b.site.id, unanswered.release.id);
        expect(
            await refusal(
                releases.goLive(b.adminCtx, b.site.id, unanswered.release.id),
            ),
        ).toMatchObject({ status: 409, code: "APPROVAL_REQUIRED" });

        // Approving your own release is not a second pair of eyes (KTD-10).
        await sites.createApproval(b.adminCtx, b.site.id, {
            outcome: "APPROVED",
            testReleaseId: unanswered.release.id,
        });
        expect(
            await refusal(
                releases.goLive(b.adminCtx, b.site.id, unanswered.release.id),
            ),
        ).toMatchObject({ status: 409, code: "APPROVAL_REQUIRED" });

        // Approved by someone else, then put up for review again: a new
        // request after an approval unsettles it, as `reviewStanding` has it.
        await sites.createApproval(b.reviewerCtx, b.site.id, {
            outcome: "APPROVED",
            testReleaseId: unanswered.release.id,
        });
        await sites.requestReview(b.adminCtx, b.site.id, unanswered.release.id);
        expect(
            await refusal(
                releases.goLive(b.adminCtx, b.site.id, unanswered.release.id),
            ),
        ).toMatchObject({ status: 409, code: "APPROVAL_REQUIRED" });

        expect(await liveCount(b.site.id)).toBe(1);
        const row = await prisma.siteTestRelease.findUniqueOrThrow({
            where: { id: unanswered.release.id },
            select: { wentLiveAt: true },
        });
        expect(row.wentLiveAt).toBeNull();
    });

    it("lets the owner go live without approval, recorded against the release", async () => {
        const b = await business();
        const made = await releases.create(b.ownerCtx, b.site.id, {});
        await sites.createApproval(b.reviewerCtx, b.site.id, {
            outcome: "CHANGES_REQUESTED",
            testReleaseId: made.release.id,
        });
        await expect(
            releases.goLive(b.adminCtx, b.site.id, made.release.id, {
                override: true,
            }),
        ).rejects.toThrow(ForbiddenException);
        await expect(
            releases.goLive(b.ownerCtx, b.site.id, made.release.id),
        ).rejects.toThrow(ConflictException);

        const result = await releases.goLive(
            b.ownerCtx,
            b.site.id,
            made.release.id,
            { override: true },
        );

        expect(result).toMatchObject({
            route: "OVERRIDDEN",
            overridden: true,
            bypassed: false,
        });
        expect(await records(b.site.id)).toEqual([
            {
                outcome: "OVERRIDDEN",
                byUserId: b.ownerCtx.userId,
                publicationId: result.publicationId,
                testReleaseId: made.release.id,
            },
        ]);
        const events = await audits(b.org.id, "site.publish_approval.override");
        expect(events).toEqual([
            expect.objectContaining({
                targetId: result.publicationId,
                metadata: {
                    siteId: b.site.id,
                    source: "go-live",
                    testReleaseId: made.release.id,
                },
            }),
        ]);
        // The release's own review history reads the override.
        const state = await sites.getReviewState(
            b.ownerCtx,
            b.site.id,
            made.release.id,
        );
        expect(state.latestApproval?.outcome).toBe("OVERRIDDEN");
    });

    it("takes an approved release as it is when an owner overrides anyway: APPROVED, not OVERRIDDEN", async () => {
        const b = await business();
        const made = await releases.create(b.adminCtx, b.site.id, {});
        await sites.createApproval(b.reviewerCtx, b.site.id, {
            outcome: "APPROVED",
            testReleaseId: made.release.id,
        });

        const result = await releases.goLive(
            b.ownerCtx,
            b.site.id,
            made.release.id,
            { override: true },
        );

        expect(result).toMatchObject({ route: "APPROVED", overridden: false });
        expect(await records(b.site.id)).toEqual([]);
    });
});

describe("Publishing needs approval: the setting (DEC-071, T9)", () => {
    it("is off by default, and getSite says so, and who may override", async () => {
        const b = await business({ needsApproval: false });
        const asOwner = await sites.getSite(b.ownerCtx, b.site.id);
        expect(asOwner).toMatchObject({
            publishNeedsApproval: false,
            canOverride: true,
        });
        const asAdmin = await sites.getSite(b.adminCtx, b.site.id);
        expect(asAdmin).toMatchObject({
            publishNeedsApproval: false,
            canOverride: false,
        });
    });

    it("refuses an admin turning it off (403); the owner turns it off, recorded", async () => {
        const b = await business();
        await expect(
            sites.updateSettings(b.adminCtx, b.site.id, {
                publishNeedsApproval: false,
            }),
        ).rejects.toThrow(ForbiddenException);
        expect(
            (await sites.getSite(b.adminCtx, b.site.id)).publishNeedsApproval,
        ).toBe(true);

        await sites.updateSettings(b.ownerCtx, b.site.id, {
            publishNeedsApproval: false,
        });

        expect(
            (await sites.getSite(b.ownerCtx, b.site.id)).publishNeedsApproval,
        ).toBe(false);
        expect(await audits(b.org.id, "site.publish_approval.on")).toEqual([
            expect.objectContaining({
                actorUserId: b.ownerCtx.userId,
                targetType: "site",
                targetId: b.site.id,
                metadata: { from: false, to: true },
            }),
        ]);
        expect(await audits(b.org.id, "site.publish_approval.off")).toEqual([
            expect.objectContaining({
                actorUserId: b.ownerCtx.userId,
                metadata: { from: true, to: false },
            }),
        ]);
        // And publishing is back to DEC-047: an admin publishes again.
        const result = await sites.publishSite(b.adminCtx, b.site.id);
        expect(result.route).toBe("NONE");
    });

    it("can't be turned on while test releases are off for the business (409)", async () => {
        const b = await business({ needsApproval: false });
        await prisma.featureFlagOverride.update({
            where: {
                flagKey_organizationId: {
                    flagKey: FLAG,
                    organizationId: b.org.id,
                },
            },
            data: { enabled: false },
        });
        await expect(
            sites.updateSettings(b.ownerCtx, b.site.id, {
                publishNeedsApproval: true,
            }),
        ).rejects.toThrow(ConflictException);
        expect(await audits(b.org.id, "site.publish_approval.on")).toEqual([]);
    });
});
