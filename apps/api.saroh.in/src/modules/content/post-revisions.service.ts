import {
    ConflictException,
    Injectable,
    NotFoundException,
} from "@nestjs/common";
import { prisma } from "@saroh/database";

import type { OrganizationContext } from "../../common/types/organization-context";
import { authorize } from "../organizations/organization-policy";
import { assertSiteInOrg } from "../sites/site-access";
import { postFingerprint } from "./post-approval";
import { assertPostEditable } from "./post-paused";
import {
    REVISION_FIELDS,
    revisionStateOf,
    writeRevision,
} from "./post-revisions";

/** History lists at most this many, newest first. */
const REVISIONS_LISTED = 200;

/**
 * A post's History and Compare (editor redesign U17a). Read with
 * `site:read`, as the post is; restored with `section:write`, as it is
 * saved. A post on another business's site, or one a reviewer may not
 * reach, is a 404 (`assertSiteInOrg`).
 */
@Injectable()
export class PostRevisionsService {
    /** Newest first: who saved it, why, and when. No bodies. */
    async list(ctx: OrganizationContext, siteId: string, postId: string) {
        authorize(ctx, "site:read");
        await this.requirePost(ctx, siteId, postId);
        const rows = await prisma.postRevision.findMany({
            where: { postId },
            orderBy: { createdAt: "desc" },
            take: REVISIONS_LISTED,
            select: {
                id: true,
                reason: true,
                note: true,
                title: true,
                slug: true,
                createdAt: true,
                savedBy: { select: { id: true, name: true } },
            },
        });
        return { revisions: rows };
    }

    /** One revision in full, for Compare. */
    async get(
        ctx: OrganizationContext,
        siteId: string,
        postId: string,
        revisionId: string,
    ) {
        authorize(ctx, "site:read");
        await this.requirePost(ctx, siteId, postId);
        const row = await prisma.postRevision.findFirst({
            where: { id: revisionId, postId },
            select: {
                id: true,
                ...REVISION_FIELDS,
                reason: true,
                note: true,
                createdAt: true,
                savedBy: { select: { id: true, name: true } },
            },
        });
        if (!row) throw new NotFoundException("That version isn't there");
        return row;
    }

    /**
     * Make a revision the draft. The draft as it is is kept as a revision
     * first, so a restore can itself be undone. The live copy is untouched
     * until the post is published. A link another post took since keeps the
     * draft's current link; a category deleted since is cleared.
     */
    async restore(
        ctx: OrganizationContext,
        siteId: string,
        postId: string,
        revisionId: string,
    ) {
        authorize(ctx, "section:write");
        await this.requirePost(ctx, siteId, postId);
        // A live post the plan paused is read-only (#800).
        await assertPostEditable(ctx.organizationId, postId);
        const revision = await prisma.postRevision.findFirst({
            where: { id: revisionId, postId },
            select: REVISION_FIELDS,
        });
        if (!revision) throw new NotFoundException("That version isn't there");

        // The kept draft sorts just before the restore in History.
        const now = Date.now();
        return prisma.$transaction(async (tx) => {
            const current = await tx.post.findUniqueOrThrow({
                where: { id: postId },
                select: REVISION_FIELDS,
            });
            const [slugTaken, category] = await Promise.all([
                tx.post.findFirst({
                    where: { siteId, slug: revision.slug, id: { not: postId } },
                    select: { id: true },
                }),
                revision.categoryId
                    ? tx.postCategory.findFirst({
                          where: { id: revision.categoryId, siteId },
                          select: { id: true },
                      })
                    : null,
            ]);
            const state = {
                ...revisionStateOf(revision),
                slug: slugTaken ? current.slug : revision.slug,
                categoryId: category ? revision.categoryId : null,
            };
            // R3: restoring what the draft already says changes nothing, so
            // it doesn't make the restorer the post's last editor.
            if (postFingerprint(state) === postFingerprint(current)) {
                return { id: postId };
            }
            await writeRevision(tx, {
                organizationId: ctx.organizationId,
                postId,
                state: revisionStateOf(current),
                reason: "autosave",
                savedByUserId: ctx.userId,
                at: new Date(now - 1),
            });
            try {
                await tx.post.update({ where: { id: postId }, data: state });
            } catch {
                throw new ConflictException({
                    message:
                        "Another post already uses that address. Change the post's path in Details.",
                    field: "slug",
                });
            }
            await writeRevision(tx, {
                organizationId: ctx.organizationId,
                postId,
                state,
                reason: "restored",
                savedByUserId: ctx.userId,
                at: new Date(now),
            });
            return { id: postId };
        });
    }

    private async requirePost(
        ctx: OrganizationContext,
        siteId: string,
        postId: string,
    ): Promise<void> {
        await assertSiteInOrg(ctx, siteId);
        const post = await prisma.post.findFirst({
            where: { id: postId, siteId },
            select: { id: true },
        });
        if (!post) throw new NotFoundException("Post not found");
    }
}
