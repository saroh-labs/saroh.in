import type { Prisma } from "@saroh/database";

/**
 * Saroh Social's two jobs, and queueing them on the caller's transaction
 * (the outbox, `backend-jobs.md`):
 *
 * - `social.publish` `{ postId }`: a post's run at its time, and each
 *   follow-up while a container is being made. The post keeps the waiting
 *   job's id (`publishJobId`); a run of any other job is a no-op, so moving
 *   or cancelling a post drops its job and a stale one does nothing.
 * - `social.refresh` `{ channelId }`: an Instagram or Threads token
 *   refreshed 7 days before it ends. The channel keeps the waiting job's id
 *   (`refreshJobId`) the same way.
 */

export const SOCIAL_PUBLISH_TYPE = "social.publish";
export const SOCIAL_REFRESH_TYPE = "social.refresh";

export interface SocialPublishPayload {
    postId: string;
}

export interface SocialRefreshPayload {
    channelId: string;
}

type Tx = Pick<
    Prisma.TransactionClient,
    "job" | "socialPost" | "socialChannel"
>;

/** Delete a job while it still waits; one already running or done is left. */
export async function dropWaitingJob(
    tx: Pick<Prisma.TransactionClient, "job">,
    jobId: string | null | undefined,
): Promise<boolean> {
    if (!jobId) return true;
    const { count } = await tx.job.deleteMany({
        where: { id: jobId, status: "PENDING" },
    });
    if (count > 0) return true;
    const job = await tx.job.findUnique({
        where: { id: jobId },
        select: { status: true },
    });
    return job?.status !== "PROCESSING";
}

/** Queue a post's run at `runAt`, in place of any it was waiting on. */
export async function queuePublishInTx(
    tx: Tx,
    post: { id: string; organizationId: string; publishJobId: string | null },
    runAt: Date,
): Promise<string> {
    await dropWaitingJob(tx, post.publishJobId);
    const payload: SocialPublishPayload = { postId: post.id };
    const job = await tx.job.create({
        data: {
            organizationId: post.organizationId,
            type: SOCIAL_PUBLISH_TYPE,
            runAt,
            payload: payload as unknown as Prisma.InputJsonValue,
        },
        select: { id: true },
    });
    await tx.socialPost.update({
        where: { id: post.id },
        data: { publishJobId: job.id },
        select: { id: true },
    });
    return job.id;
}

/** How long before a token ends Saroh refreshes it. */
export const REFRESH_AHEAD_MS = 7 * 86_400_000;
/** Meta refreshes a long-lived token only once it is a day old. */
export const REFRESH_MIN_AGE_MS = 86_400_000;

/**
 * When to refresh a channel's token: 7 days before it (or a Threads
 * grant) ends, never before it is a day old.
 */
export function refreshAt(
    channel: {
        tokenIssuedAt: Date | null;
        tokenExpiresAt: Date | null;
        grantExpiresAt: Date | null;
    },
    now: Date,
): Date | null {
    const ends = [channel.tokenExpiresAt, channel.grantExpiresAt].filter(
        (d): d is Date => d !== null,
    );
    if (ends.length === 0) return null;
    const soonest = Math.min(...ends.map((d) => d.getTime()));
    const oldEnough =
        (channel.tokenIssuedAt ?? now).getTime() + REFRESH_MIN_AGE_MS;
    return new Date(
        Math.max(soonest - REFRESH_AHEAD_MS, oldEnough, now.getTime()),
    );
}

/** Queue a channel's next refresh, in place of any it was waiting on. */
export async function queueRefreshInTx(
    tx: Tx,
    channel: {
        id: string;
        organizationId: string;
        refreshJobId: string | null;
        tokenIssuedAt: Date | null;
        tokenExpiresAt: Date | null;
        grantExpiresAt: Date | null;
    },
    now: Date,
    /** Try again at this time instead (a refresh Meta didn't answer). */
    retryAt?: Date,
): Promise<void> {
    await dropWaitingJob(tx, channel.refreshJobId);
    const at = retryAt ?? refreshAt(channel, now);
    let jobId: string | null = null;
    if (at) {
        const payload: SocialRefreshPayload = { channelId: channel.id };
        jobId = (
            await tx.job.create({
                data: {
                    organizationId: channel.organizationId,
                    type: SOCIAL_REFRESH_TYPE,
                    runAt: at,
                    payload: payload as unknown as Prisma.InputJsonValue,
                },
                select: { id: true },
            })
        ).id;
    }
    await tx.socialChannel.update({
        where: { id: channel.id },
        data: { refreshJobId: jobId },
        select: { id: true },
    });
}
