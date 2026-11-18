import type { Prisma } from "@saroh/database";

type DeliveryStatus = "WAITING" | "POSTING" | "POSTED" | "FAILED" | "UNKNOWN";
export type SettledStatus = "PUBLISHING" | "DONE" | "PARTLY_DONE" | "FAILED";

/**
 * A post's status once it has started, from its deliveries: still going
 * while any waits, posts or is unclear; else done, partly done or failed.
 */
export function settledStatus(
    deliveries: readonly { status: DeliveryStatus }[],
): SettledStatus {
    if (
        deliveries.some(
            (d) =>
                d.status === "WAITING" ||
                d.status === "POSTING" ||
                d.status === "UNKNOWN",
        )
    ) {
        return "PUBLISHING";
    }
    const posted = deliveries.filter((d) => d.status === "POSTED").length;
    if (posted > 0 && posted === deliveries.length) return "DONE";
    return posted > 0 ? "PARTLY_DONE" : "FAILED";
}

/**
 * Set started posts' statuses from their deliveries, after a write that
 * changed some (a disconnect, a reconnect to another account). A post not
 * started yet (scheduled, a draft) keeps its own.
 */
export async function settlePostsInTx(
    tx: Pick<Prisma.TransactionClient, "socialPost">,
    postIds: readonly string[],
): Promise<void> {
    if (postIds.length === 0) return;
    const posts = await tx.socialPost.findMany({
        where: {
            id: { in: [...new Set(postIds)] },
            status: { in: ["PUBLISHING", "DONE", "PARTLY_DONE", "FAILED"] },
        },
        select: { id: true, deliveries: { select: { status: true } } },
    });
    for (const post of posts) {
        await tx.socialPost.update({
            where: { id: post.id },
            data: { status: settledStatus(post.deliveries) },
            select: { id: true },
        });
    }
}
