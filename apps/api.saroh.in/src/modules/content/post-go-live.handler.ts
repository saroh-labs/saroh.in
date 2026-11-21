import { HttpException, Injectable, Logger } from "@nestjs/common";
import type { Job, Prisma } from "@saroh/database";
import { prisma, runInOrgContext } from "@saroh/database";

import { schedulerStanding } from "../sites/go-live.handler";
import { isLead, postFingerprint, postHeldForApproval } from "./post-approval";
import { assertPostEditable } from "./post-paused";
import { publishPostInTx } from "./post-publish";
import {
    REVISION_FIELDS,
    revisionStateOf,
    writeRevision,
} from "./post-revisions";
import type { PostGoLivePayload } from "./post-schedule";
import { clearPostScheduleInTx, POST_GO_LIVE_TYPE } from "./post-schedule";

export { POST_GO_LIVE_TYPE } from "./post-schedule";

type Tx = Prisma.TransactionClient;

export type PostGoLiveRun =
    | { outcome: "LIVE"; publicationId: string }
    | { outcome: "NOT_LIVE"; reason: string }
    | { outcome: "skipped" };

const AGAIN = "Publish it now, or schedule it again.";
export const NOT_APPROVED =
    "It wasn't approved by then, or it changed after it was approved. Send it for approval again.";

/**
 * Consumer for `post.go_live` (editor redesign U17a): Publish post › Later,
 * when its time comes. Publishes the draft as it is then, as the person who
 * scheduled it.
 *
 * Idempotent per post and instant: the post's row lock (`publishPostInTx`)
 * and `scheduledAt` are the guard. A run whose post was rescheduled,
 * unscheduled, published or taken off since finds a different (or no)
 * `scheduledAt` and does nothing, so two runs for one instant publish once.
 *
 * A clear no-go (the scheduler left or can no longer write, the plan paused
 * the post or has no room) clears the schedule and writes a
 * `not_published` revision saying why, which History shows; it never
 * retries. A transient failure throws and the worker retries; the last
 * attempt records the no-go first, so a post never hangs as scheduled.
 *
 * Approval (O7) is re-checked beside the scheduler's, as `site.go_live`
 * re-checks a test release's: a teammate's post goes live only if it was
 * approved as it is now.
 */
@Injectable()
export class PostGoLiveHandler {
    private readonly logger = new Logger(PostGoLiveHandler.name);

    readonly handle = async (job: Job): Promise<void> => {
        const payload = payloadOf(job.payload);
        const organizationId = job.organizationId;
        if (!payload || !organizationId) {
            this.logger.warn(
                `${POST_GO_LIVE_TYPE} job ${job.id} names no post; skipped`,
            );
            return;
        }
        try {
            const run = await runInOrgContext(organizationId, () =>
                prisma.$transaction((tx) =>
                    runScheduledPost(tx, organizationId, payload),
                ),
            );
            this.logger.log(
                `${POST_GO_LIVE_TYPE} ${payload.postId}: ${run.outcome}`,
            );
        } catch (err) {
            if (job.attempts + 1 < job.maxAttempts) throw err;
            try {
                await runInOrgContext(organizationId, () =>
                    prisma.$transaction((tx) =>
                        notLiveIfStillScheduled(
                            tx,
                            organizationId,
                            payload,
                            `It couldn't be published at the time you picked. ${AGAIN}`,
                        ),
                    ),
                );
            } catch (recordErr) {
                this.logger.error(
                    `${POST_GO_LIVE_TYPE} ${payload.postId}: gave up, and couldn't record it; the post still reads as scheduled`,
                    recordErr instanceof Error
                        ? recordErr.stack
                        : String(recordErr),
                );
            }
            throw err;
        }
    };
}

/** Run one scheduled publish, inside the caller's transaction. */
export async function runScheduledPost(
    tx: Tx,
    organizationId: string,
    payload: PostGoLivePayload,
    now: Date = new Date(),
): Promise<PostGoLiveRun> {
    const post = await tx.post.findFirst({
        where: {
            id: payload.postId,
            site: { organizationId, deletedAt: null },
        },
        select: {
            ...REVISION_FIELDS,
            siteId: true,
            scheduledAt: true,
            scheduledByUserId: true,
        },
    });
    if (
        !post?.scheduledByUserId ||
        post.scheduledAt?.toISOString() !== payload.at
    ) {
        return { outcome: "skipped" };
    }

    const no = async (reason: string): Promise<PostGoLiveRun> => {
        await notLiveIfStillScheduled(tx, organizationId, payload, reason);
        return { outcome: "NOT_LIVE", reason };
    };
    const scheduler = await schedulerStanding(
        tx,
        organizationId,
        post.scheduledByUserId,
    );
    if (!scheduler.member) {
        return no(
            `${scheduler.name}, who scheduled it, is no longer on the team. ${AGAIN}`,
        );
    }
    if (!scheduler.canWrite) {
        return no(
            `${scheduler.name}, who scheduled it, can no longer publish posts. ${AGAIN}`,
        );
    }
    // K2: an owner's or admin's schedule covers the post as they scheduled
    // it. Edited since, it goes live only if its last editor needs no
    // approval or it was approved as it is now.
    const unchanged =
        payload.fingerprint === postFingerprint(revisionStateOf(post));
    if (
        await postHeldForApproval(tx, {
            organizationId,
            siteId: post.siteId,
            postId: payload.postId,
            userId: post.scheduledByUserId,
            lead:
                unchanged &&
                (await isLead(tx, organizationId, post.scheduledByUserId)),
        })
    ) {
        return no(NOT_APPROVED);
    }

    try {
        // A live post the plan paused is read-only (#800).
        await assertPostEditable(organizationId, payload.postId);
        const live = await publishPostInTx(tx, {
            organizationId,
            siteId: post.siteId,
            postId: payload.postId,
            actorUserId: post.scheduledByUserId,
            onlyIfScheduledAt: payload.at,
            now,
        });
        return live
            ? { outcome: "LIVE", publicationId: live.publicationId }
            : { outcome: "skipped" };
    } catch (err) {
        // A refusal (paused, no room on the plan): said in the words
        // publishing by hand would use. Anything else is retried.
        if (err instanceof HttpException && err.getStatus() < 500) {
            return no(`${messageOf(err)} ${AGAIN}`);
        }
        throw err;
    }
}

/** Clear the schedule and say why in History, if it is still this one. */
async function notLiveIfStillScheduled(
    tx: Tx,
    organizationId: string,
    payload: PostGoLivePayload,
    reason: string,
): Promise<void> {
    const post = await tx.post.findFirst({
        where: { id: payload.postId, site: { organizationId } },
        select: {
            ...REVISION_FIELDS,
            scheduledAt: true,
            scheduledByUserId: true,
        },
    });
    if (post?.scheduledAt?.toISOString() !== payload.at) return;
    await clearPostScheduleInTx(tx, payload.postId);
    await writeRevision(tx, {
        organizationId,
        postId: payload.postId,
        state: revisionStateOf(post),
        reason: "not_published",
        savedByUserId: post.scheduledByUserId,
        note: reason,
    });
}

function messageOf(err: HttpException): string {
    const body = err.getResponse();
    const message =
        typeof body === "object" && "message" in body ? body.message : body;
    return typeof message === "string" ? message : err.message;
}

function payloadOf(raw: unknown): PostGoLivePayload | null {
    if (raw === null || typeof raw !== "object") return null;
    const { postId, at, fingerprint } = raw as Record<string, unknown>;
    if (typeof postId !== "string" || typeof at !== "string") return null;
    return typeof fingerprint === "string"
        ? { postId, at, fingerprint }
        : { postId, at };
}
