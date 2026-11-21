import type { Prisma } from "@saroh/database";

import type { RevisionReason } from "./post-revisions";

/**
 * How many of a post's newest prunable revisions (autosaves, Ask AI,
 * restores) are kept (W5/W7, 21 Nov 2026): as many as History lists, so
 * pruning never takes one it shows.
 */
export const REVISIONS_KEPT_PER_POST = 200;

/** Kept whatever their age: the post's record of going live and of approval. */
export const REVISIONS_KEPT_ALWAYS: readonly RevisionReason[] = [
    "published",
    "approved",
    "sent",
];

/** Posts pruned per run, so one run stays well inside the job lease. */
export const REVISION_PRUNE_POSTS_PER_RUN = 500;

type Db = Pick<Prisma.TransactionClient, "postRevision">;

/**
 * Keep each post's newest {@link REVISIONS_KEPT_PER_POST} prunable revisions
 * and every one kept always; delete the older prunable ones. Run by the daily
 * `analytics.retention` sweep; `held` are the businesses on legal hold
 * (DEC-122), whose revisions stay. A pruned post has no more than the cap
 * left, so it isn't read again. `more` when a run stopped at its cap.
 */
export async function prunePostRevisions(
    db: Db,
    held: readonly string[],
): Promise<{ deleted: number; more: boolean }> {
    const prunable = {
        reason: { notIn: [...REVISIONS_KEPT_ALWAYS] },
        ...(held.length > 0 ? { organizationId: { notIn: [...held] } } : {}),
    };
    const posts = await db.postRevision.groupBy({
        by: ["postId"],
        where: prunable,
        having: { postId: { _count: { gt: REVISIONS_KEPT_PER_POST } } },
        orderBy: { postId: "asc" },
        take: REVISION_PRUNE_POSTS_PER_RUN + 1,
    });
    let deleted = 0;
    for (const { postId } of posts.slice(0, REVISION_PRUNE_POSTS_PER_RUN)) {
        // The oldest prunable revision that stays.
        const edge = await db.postRevision.findFirst({
            where: { postId, ...prunable },
            orderBy: [{ createdAt: "desc" }, { id: "desc" }],
            skip: REVISIONS_KEPT_PER_POST - 1,
            select: { createdAt: true },
        });
        if (!edge) continue;
        const { count } = await db.postRevision.deleteMany({
            where: { postId, ...prunable, createdAt: { lt: edge.createdAt } },
        });
        deleted += count;
    }
    return { deleted, more: posts.length > REVISION_PRUNE_POSTS_PER_RUN };
}
