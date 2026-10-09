import type { Prisma } from "@saroh/database";
import { prisma } from "@saroh/database";

import { keptByCut, pausedByCut } from "../billing/over-limit";
import { overLimit } from "../billing/over-limit.service";
import { pausedByPlan } from "../billing/paused-errors";

/**
 * A live blog post past the plan's limit after a move to a lower plan is
 * hidden from the site and read-only (#800, `billing/over-limit.ts`): an
 * edit or a republish is refused with `PAUSED_BY_PLAN`. Taking it down
 * (unpublish) and deleting it stay allowed. A draft is never counted, so
 * never paused. Nothing pauses with `PLAN_ENFORCEMENT` off or off the
 * catalogue.
 */
export async function assertPostEditable(
    organizationId: string,
    postId: string,
): Promise<void> {
    const paused = await overLimit.pausedNow(organizationId);
    if (!paused?.posts) return;
    const post = await prisma.post.findFirst({
        where: { id: postId, site: { organizationId, deletedAt: null } },
        select: { id: true, createdAt: true, currentPublicationId: true },
    });
    if (!post?.currentPublicationId) return;
    if (pausedByCut(post, paused.posts)) throw pausedByPlan("post");
}

/**
 * The live posts a move to a lower plan keeps on a site (#800), as a
 * `where` to spread into the public reads: a paused post is in no list
 * and its page is a 404. Everything, when nothing is paused.
 */
export async function keptPostsOnSite(
    siteId: string,
): Promise<Prisma.PostWhereInput> {
    const site = await prisma.site.findUnique({
        where: { id: siteId },
        select: { organizationId: true },
    });
    if (!site) return {};
    const paused = await overLimit.pausedNow(site.organizationId);
    return keptByCut(paused?.posts ?? null);
}
