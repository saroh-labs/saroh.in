import type { Prisma } from "@saroh/database";

/**
 * Publish post › Later (editor redesign U17a). `Post.scheduledAt` and one
 * PENDING `post.go_live` job, written together; the job publishes the draft
 * as it is then (`post-go-live.handler.ts`).
 */

/** The job type. Its handler is `post-go-live.handler.ts`. */
export const POST_GO_LIVE_TYPE = "post.go_live";

/** Ids and the instant it was queued for, nothing else. */
export interface PostGoLivePayload {
    postId: string;
    /** ISO instant. A post rescheduled since holds a different one. */
    at: string;
}

type Tx = Pick<Prisma.TransactionClient, "job" | "post">;

/** Take away the post's waiting go-live job, if any. A running one finishes. */
export async function dropPostGoLiveJob(tx: Tx, postId: string): Promise<void> {
    await tx.job.deleteMany({
        where: {
            type: POST_GO_LIVE_TYPE,
            status: "PENDING",
            payload: { path: ["postId"], equals: postId },
        },
    });
}

/** Schedule the post to go live at `at`, replacing any earlier schedule. */
export async function schedulePostInTx(
    tx: Tx,
    input: {
        organizationId: string;
        postId: string;
        at: Date;
        byUserId: string;
    },
): Promise<void> {
    await dropPostGoLiveJob(tx, input.postId);
    const payload: PostGoLivePayload = {
        postId: input.postId,
        at: input.at.toISOString(),
    };
    await tx.job.create({
        data: {
            organizationId: input.organizationId,
            type: POST_GO_LIVE_TYPE,
            runAt: input.at,
            payload: payload as unknown as Prisma.InputJsonValue,
        },
        select: { id: true },
    });
    await tx.post.update({
        where: { id: input.postId },
        data: { scheduledAt: input.at, scheduledByUserId: input.byUserId },
    });
}

/** Clear the schedule: the post was published, taken off or unscheduled. */
export async function clearPostScheduleInTx(
    tx: Tx,
    postId: string,
): Promise<void> {
    await dropPostGoLiveJob(tx, postId);
    await tx.post.update({
        where: { id: postId },
        data: { scheduledAt: null, scheduledByUserId: null },
    });
}
