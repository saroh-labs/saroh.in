/**
 * Edit and delete your own note (DEC-200 U3, R4, R13) against a real
 * Postgres: author only, open notes only, and a note written before the
 * latest approval of its target (the draft, or its test release) is kept as
 * it was. Notes written after it are open again for the next round.
 *
 * Runs in the integration project (TEST_DATABASE_URL).
 */
import {
    ConflictException,
    ForbiddenException,
    NotFoundException,
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
const KEPT = "This was part of an approved review, so it's kept as it was.";

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
 * A business with test releases on, a site whose home page holds one
 * section, its owner Asha, and two reviewers invited to the site, Meera and
 * Ravi.
 */
async function business(opts: { releases?: boolean } = {}) {
    const org = await prisma.organization.create({
        data: { name: "Northwind U3", slug: uniq("u3-org-") },
    });
    if (opts.releases !== false) {
        await prisma.featureFlagOverride.create({
            data: { flagKey: FLAG, organizationId: org.id, enabled: true },
        });
    }
    await prisma.businessProfile.create({
        data: { organizationId: org.id, timezone: "Asia/Kolkata" },
    });
    const owner = await prisma.user.create({
        data: { email: `${uniq("u3-owner-")}@example.com`, name: "Asha" },
    });
    await prisma.membership.create({
        data: { organizationId: org.id, userId: owner.id, role: "OWNER" },
    });
    const site = await prisma.site.create({
        data: {
            organizationId: org.id,
            name: "Northwind",
            slug: uniq("u3-site-"),
            subdomain: uniq("u3sub"),
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
    await prisma.section.create({
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
    const reviewerCtx = async (name: string): Promise<OrganizationContext> => {
        const user = await prisma.user.create({
            data: { email: `${uniq("u3-rev-")}@example.com`, name },
        });
        await prisma.membership.create({
            data: { organizationId: org.id, userId: user.id, role: "REVIEWER" },
        });
        await prisma.siteReviewer.create({
            data: { organizationId: org.id, siteId: site.id, userId: user.id },
        });
        return { organizationId: org.id, userId: user.id, role: "REVIEWER" };
    };
    const ctx: OrganizationContext = {
        organizationId: org.id,
        userId: owner.id,
        role: "OWNER",
    };
    return {
        org,
        site,
        page,
        ctx,
        meera: await reviewerCtx("Meera"),
        ravi: await reviewerCtx("Ravi"),
    };
}

type Business = Awaited<ReturnType<typeof business>>;

function note(
    b: Business,
    who: OrganizationContext,
    body = "The opening line undersells you.",
    testReleaseId?: string,
) {
    return sites.createComment(who, b.site.id, {
        body,
        pageId: b.page.id,
        sectionKey: testReleaseId ? "0" : "intro",
        ...(testReleaseId ? { testReleaseId } : {}),
    });
}

/** Make sure the next row's createdAt is strictly later. */
const tick = () => new Promise((r) => setTimeout(r, 5));

describe("edit and delete your own note (DEC-200 U3)", () => {
    it("lets the author rewrite an open note, and stamps when", async () => {
        const b = await business();
        const { id } = await note(b, b.meera);
        const before = await prisma.siteComment.findUniqueOrThrow({
            where: { id },
            select: { updatedAt: true },
        });
        await tick();

        const edited = await sites.updateCommentBody(
            b.meera,
            b.site.id,
            id,
            "Say the hours up top.",
        );

        expect(edited).toMatchObject({ id, body: "Say the hours up top." });
        expect(edited.updatedAt.getTime()).toBeGreaterThan(
            before.updatedAt.getTime(),
        );
        const [listed] = await sites.listComments(b.meera, b.site.id);
        expect(listed).toMatchObject({
            body: "Say the hours up top.",
            editable: true,
        });
    });

    it("lets the author delete an open note: gone from the list and the open count", async () => {
        const b = await business();
        const { id } = await note(b, b.meera);
        await note(b, b.meera, "Keep this one.");
        expect((await sites.getReviewState(b.ctx, b.site.id)).openNotes).toBe(
            2,
        );

        await expect(
            sites.deleteComment(b.meera, b.site.id, id),
        ).resolves.toEqual({ id });

        const notes = await sites.listComments(b.meera, b.site.id);
        expect(notes.map((n) => n.body)).toEqual(["Keep this one."]);
        expect((await sites.getReviewState(b.ctx, b.site.id)).openNotes).toBe(
            1,
        );
    });

    it("refuses someone else's note with a readable 403, and changes nothing", async () => {
        const b = await business();
        const { id } = await note(b, b.meera);

        for (const op of [
            () => sites.updateCommentBody(b.ravi, b.site.id, id, "Mine now"),
            () => sites.deleteComment(b.ravi, b.site.id, id),
            // Not even the owner rewrites a reviewer's words.
            () => sites.updateCommentBody(b.ctx, b.site.id, id, "Edited"),
        ]) {
            await expect(op()).rejects.toMatchObject({
                status: 403,
                response: {
                    message:
                        "Only the person who wrote a note can change or delete it.",
                    details: { code: "ROLE_DENIED", action: "site:comment" },
                },
            });
        }
        await expect(
            prisma.siteComment.findUniqueOrThrow({ where: { id } }),
        ).resolves.toMatchObject({ body: "The opening line undersells you." });
        // And the list says so before anyone tries.
        const [listed] = await sites.listComments(b.ravi, b.site.id);
        expect(listed.editable).toBe(false);
    });

    it("refuses a MEMBER, who can't leave notes, by role", async () => {
        const b = await business();
        const { id } = await note(b, b.ctx);
        const member: OrganizationContext = { ...b.ctx, role: "MEMBER" };

        await expect(
            sites.deleteComment(member, b.site.id, id),
        ).rejects.toThrow(ForbiddenException);
    });

    it("Reviewer edits a note, the owner settles it, and it can't be changed after (409)", async () => {
        const b = await business();
        const { id } = await note(b, b.meera);
        await sites.updateCommentBody(b.meera, b.site.id, id, "Fix the hours");
        await sites.setCommentResolved(b.ctx, b.site.id, id, true);

        await expect(
            sites.updateCommentBody(b.meera, b.site.id, id, "And the phone"),
        ).rejects.toMatchObject({
            status: 409,
            message: "This note has been settled, so it's kept as it was.",
        });
        await expect(
            sites.deleteComment(b.meera, b.site.id, id),
        ).rejects.toThrow(ConflictException);
        const [listed] = await sites.listComments(b.meera, b.site.id);
        expect(listed).toMatchObject({
            body: "Fix the hours",
            editable: false,
        });
    });

    it("404s a note on another business's site, and on a site the reviewer isn't (or is no longer) invited to", async () => {
        const b = await business();
        const other = await business();
        const { id } = await note(other, other.meera);

        // Another business: its site isn't in this caller's org.
        await expect(
            sites.updateCommentBody(b.meera, other.site.id, id, "x"),
        ).rejects.toThrow(NotFoundException);

        // Invite removed: the site leaves the reviewer's scope (#276).
        await prisma.siteReviewer.deleteMany({
            where: { siteId: other.site.id, userId: other.meera.userId },
        });
        await expect(
            sites.deleteComment(other.meera, other.site.id, id),
        ).rejects.toThrow(NotFoundException);
        await expect(prisma.siteComment.count({ where: { id } })).resolves.toBe(
            1,
        );
    });

    it("404s a note that isn't there", async () => {
        const b = await business();
        await expect(
            sites.deleteComment(b.meera, b.site.id, "note_missing"),
        ).rejects.toMatchObject({
            status: 404,
            message: "That note isn't there any more.",
        });
    });

    it("deletes a note that went with an Ask for changes, before any approval", async () => {
        const b = await business();
        const { id } = await note(b, b.meera);
        await sites.createApproval(b.meera, b.site.id, {
            outcome: "CHANGES_REQUESTED",
            reason: "Fix the opening line",
        });

        await expect(
            sites.deleteComment(b.meera, b.site.id, id),
        ).resolves.toEqual({ id });
    });

    it("keeps notes written before the latest approval; notes after it are the next round", async () => {
        const b = await business();
        const { id: old } = await note(b, b.meera);
        await tick();
        // Approved by anyone: the work was signed off with this note in it.
        await sites.createApproval(b.ravi, b.site.id, { outcome: "APPROVED" });
        await tick();
        const { id: fresh } = await note(b, b.meera, "Next round: the footer");

        await expect(
            sites.updateCommentBody(b.meera, b.site.id, old, "Rewritten"),
        ).rejects.toMatchObject({ status: 409, message: KEPT });
        await expect(
            sites.deleteComment(b.meera, b.site.id, old),
        ).rejects.toMatchObject({ status: 409, message: KEPT });

        const listed = await sites.listComments(b.meera, b.site.id);
        expect(
            Object.fromEntries(listed.map((n) => [n.id, n.editable])),
        ).toEqual({ [old]: false, [fresh]: true });

        await expect(
            sites.updateCommentBody(b.meera, b.site.id, fresh, "The footer"),
        ).resolves.toMatchObject({ body: "The footer" });
        await expect(
            sites.deleteComment(b.meera, b.site.id, fresh),
        ).resolves.toEqual({ id: fresh });
    });

    it("measures a release's notes against that release's approval, not the draft's", async () => {
        const b = await business();
        const made = await releases.create(b.ctx, b.site.id, {});
        const { id: onRelease } = await note(
            b,
            b.meera,
            "On the release",
            made.release.id,
        );
        await tick();
        // The draft is approved; the release's notes are untouched by it.
        await sites.createApproval(b.ravi, b.site.id, { outcome: "APPROVED" });

        await expect(
            sites.updateCommentBody(
                b.meera,
                b.site.id,
                onRelease,
                "Still mine",
            ),
        ).resolves.toMatchObject({ body: "Still mine" });

        await tick();
        await sites.createApproval(b.ravi, b.site.id, {
            outcome: "APPROVED",
            testReleaseId: made.release.id,
        });
        await expect(
            sites.deleteComment(b.meera, b.site.id, onRelease),
        ).rejects.toMatchObject({ status: 409, message: KEPT });
    });

    it("409s a note on a discarded or live release", async () => {
        const b = await business();
        const gone = await releases.create(b.ctx, b.site.id, {});
        const { id: onGone } = await note(b, b.meera, "a", gone.release.id);
        await releases.discard(b.ctx, b.site.id, gone.release.id);
        const live = await releases.create(b.ctx, b.site.id, {});
        const { id: onLive } = await note(b, b.meera, "b", live.release.id);
        await releases.goLive(b.ctx, b.site.id, live.release.id);

        for (const id of [onGone, onLive]) {
            await expect(
                sites.updateCommentBody(b.meera, b.site.id, id, "late"),
            ).rejects.toThrow(ConflictException);
            await expect(
                sites.deleteComment(b.meera, b.site.id, id),
            ).rejects.toThrow(ConflictException);
        }
        const listed = await sites.listComments(
            b.meera,
            b.site.id,
            gone.release.id,
        );
        expect(listed.map((n) => n.editable)).toEqual([false]);
    });

    it("404s a release note once test releases are off for the business", async () => {
        const b = await business();
        const made = await releases.create(b.ctx, b.site.id, {});
        const { id } = await note(b, b.meera, "a", made.release.id);
        await prisma.featureFlagOverride.updateMany({
            where: { flagKey: FLAG, organizationId: b.org.id },
            data: { enabled: false },
        });

        await expect(
            sites.deleteComment(b.meera, b.site.id, id),
        ).rejects.toThrow(NotFoundException);
    });
});
