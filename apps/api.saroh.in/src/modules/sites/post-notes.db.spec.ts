/**
 * Notes on a post (DEC-200 U8, R10, R14) against a real Postgres: a
 * Reviewer leaves a note on a draft post, the owner reads and settles it,
 * the note counts with the rest, follows the approval lock (R13), and
 * outlives its post. A note is about a section or a post, never both.
 *
 * Runs in the integration project (TEST_DATABASE_URL).
 */
import {
    BadRequestException,
    ConflictException,
    NotFoundException,
} from "@nestjs/common";
import { prisma } from "@saroh/database";

import type { OrganizationContext } from "../../common/types/organization-context";
import type { EntitlementService } from "../billing/entitlement.service";
import { SitesService } from "./sites.service";

const sites = new SitesService({
    check: jest.fn().mockResolvedValue(true),
    can: jest.fn().mockResolvedValue(true),
    getEntitlements: jest.fn(),
} as unknown as EntitlementService);

let seq = 0;
const uniq = (label: string) => `${label}${process.pid}x${++seq}`;
const tick = () => new Promise((r) => setTimeout(r, 5));

/**
 * A site with a home page holding one section and one draft post, its owner
 * Asha, Meera invited to review it, and Ravi, a Reviewer of the business
 * not invited to this site.
 */
async function business() {
    const org = await prisma.organization.create({
        data: { name: "Northwind U8", slug: uniq("u8-org-") },
    });
    await prisma.businessProfile.create({
        data: { organizationId: org.id, timezone: "Asia/Kolkata" },
    });
    const owner = await prisma.user.create({
        data: { email: `${uniq("u8-owner-")}@example.com`, name: "Asha" },
    });
    await prisma.membership.create({
        data: { organizationId: org.id, userId: owner.id, role: "OWNER" },
    });
    const site = await prisma.site.create({
        data: {
            organizationId: org.id,
            name: "Northwind",
            slug: uniq("u8-site-"),
            subdomain: uniq("u8sub"),
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
    const post = await prisma.post.create({
        data: {
            siteId: site.id,
            title: "Our sourdough starter",
            slug: uniq("starter-"),
            content: "<p>Fed every morning.</p>",
        },
    });
    const reviewer = async (name: string, invited: boolean) => {
        const user = await prisma.user.create({
            data: { email: `${uniq("u8-rev-")}@example.com`, name },
        });
        await prisma.membership.create({
            data: { organizationId: org.id, userId: user.id, role: "REVIEWER" },
        });
        if (invited) {
            await prisma.siteReviewer.create({
                data: {
                    organizationId: org.id,
                    siteId: site.id,
                    userId: user.id,
                },
            });
        }
        return {
            organizationId: org.id,
            userId: user.id,
            role: "REVIEWER",
        } as OrganizationContext;
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
        post,
        ctx,
        meera: await reviewer("Meera", true),
        ravi: await reviewer("Ravi", false),
    };
}

type Business = Awaited<ReturnType<typeof business>>;

const postNote = (b: Business, who: OrganizationContext, body = "Too long.") =>
    sites.createComment(who, b.site.id, { body, postId: b.post.id });

describe("notes on a post (DEC-200 U8)", () => {
    it("a Reviewer's note on a draft post reaches the owner, who settles it", async () => {
        const b = await business();
        const { id } = await postNote(b, b.meera, "The intro is too long.");

        const [owners] = await sites.listComments(b.ctx, b.site.id);
        expect(owners).toMatchObject({
            id,
            postId: b.post.id,
            postTitle: "Our sourdough starter",
            sectionKey: null,
            pageId: null,
            orphaned: false,
            editable: false,
        });
        const [meeras] = await sites.listComments(b.meera, b.site.id);
        expect(meeras?.editable).toBe(true);

        await sites.setCommentResolved(b.ctx, b.site.id, id, true);
        const [settled] = await sites.listComments(b.ctx, b.site.id);
        expect(settled?.resolvedAt).not.toBeNull();
        // Settled: kept as it was.
        await expect(
            sites.updateCommentBody(b.meera, b.site.id, id, "Shorter"),
        ).rejects.toBeInstanceOf(ConflictException);
    });

    it("counts post notes in the open-note total, beside section notes", async () => {
        const b = await business();
        await sites.createComment(b.meera, b.site.id, {
            body: "Lead with the bread.",
            pageId: b.page.id,
            sectionKey: "intro",
        });
        await postNote(b, b.meera);

        const notes = await sites.listComments(b.ctx, b.site.id);
        expect(notes).toHaveLength(2);
        // Section notes still list as they did, null-tolerant readers.
        expect(notes.find((n) => n.sectionKey === "intro")).toMatchObject({
            pageTitle: "Home",
            postId: null,
            orphaned: false,
        });
        const state = await sites.getReviewState(b.ctx, b.site.id);
        expect(state.openNotes).toBe(2);
    });

    it("refuses a note naming both a section and a post, or neither", async () => {
        const b = await business();
        await expect(
            sites.createComment(b.meera, b.site.id, {
                body: "Both?",
                pageId: b.page.id,
                sectionKey: "intro",
                postId: b.post.id,
            }),
        ).rejects.toBeInstanceOf(BadRequestException);
        await expect(
            sites.createComment(b.meera, b.site.id, { body: "Neither?" }),
        ).rejects.toBeInstanceOf(BadRequestException);
    });

    it("refuses a post on another site, and a site the Reviewer isn't invited to", async () => {
        const b = await business();
        const other = await business();
        await expect(
            sites.createComment(b.meera, b.site.id, {
                body: "Wrong site",
                postId: other.post.id,
            }),
        ).rejects.toBeInstanceOf(NotFoundException);
        await expect(postNote(b, b.ravi)).rejects.toBeInstanceOf(
            NotFoundException,
        );
        await expect(postNote(other, b.meera)).rejects.toBeInstanceOf(
            NotFoundException,
        );
    });

    it("keeps the note, and the post's title, once the post is deleted", async () => {
        const b = await business();
        const { id } = await postNote(b, b.meera);
        await prisma.post.delete({ where: { id: b.post.id } });

        const [note] = await sites.listComments(b.ctx, b.site.id);
        expect(note).toMatchObject({
            id,
            postId: null,
            postTitle: "Our sourdough starter",
            orphaned: true,
        });
    });

    it("follows the approval lock: notes before the approval are history", async () => {
        const b = await business();
        const before = await postNote(b, b.meera, "Before");
        await tick();
        await sites.createApproval(b.meera, b.site.id, {
            outcome: "APPROVED",
        });
        await tick();
        const after = await postNote(b, b.meera, "After");

        await expect(
            sites.deleteComment(b.meera, b.site.id, before.id),
        ).rejects.toBeInstanceOf(ConflictException);
        await sites.updateCommentBody(b.meera, b.site.id, after.id, "Later");
        await sites.deleteComment(b.meera, b.site.id, after.id);
        const left = await sites.listComments(b.ctx, b.site.id);
        expect(left.map((n) => n.id)).toEqual([before.id]);
    });

    it("the table itself refuses a note with two targets", async () => {
        const b = await business();
        // Only the migration builds the CHECK; `db push` (the plain run)
        // does not, so this proves it under TEST_RLS=on.
        if (!["1", "on", "true"].includes(process.env.TEST_RLS ?? "")) return;
        await expect(
            prisma.siteComment.create({
                data: {
                    siteId: b.site.id,
                    organizationId: b.org.id,
                    authorUserId: b.meera.userId,
                    body: "Both",
                    sectionKey: "intro",
                    postId: b.post.id,
                    postTitle: b.post.title,
                },
            }),
        ).rejects.toThrow(/SiteComment_one_target_check/);
    });
});
