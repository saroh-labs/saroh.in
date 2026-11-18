import { Inject, Injectable, Logger, Optional } from "@nestjs/common";
import type { Job, Prisma } from "@saroh/database";
import { prisma, runInOrgContext } from "@saroh/database";

import { enqueueTeamAlert } from "../../notifications/team-alerts";
import { siteOriginOf } from "../../sites/site-origin";
import { SocialAccess } from "../access/social-access";
import { markAttentionInTx } from "../channels/channel-attention";
import { sealedToken, unseal } from "../channels/sealing";
import type { SocialMetaPort } from "../meta/social-meta.port";
import { isMetaError, SOCIAL_META } from "../meta/social-meta.port";
import { captionFor, trackedLink } from "../posts/captions";
import { captionsOf } from "../posts/post-view";
import type { SocialPublishPayload } from "../shared/jobs";
import { queuePublishInTx } from "../shared/jobs";
import { settledStatus } from "../shared/status";
import type { StepOutcome } from "./platform-steps";
import { nextStep } from "./platform-steps";

export { SOCIAL_PUBLISH_TYPE } from "../shared/jobs";

type Tx = Prisma.TransactionClient;

/** How long a platform's daily allowance runs. */
const DAY_MS = 86_400_000;

/**
 * `social.publish` (U6, KTD7): a post goes out at its time.
 *
 * 1. **Claim**, on one transaction with the post's row locked: a run of a
 *    job the post no longer names (moved, cancelled, deleted) does
 *    nothing. Then the rollout and the plan are asked again; off, the
 *    post's channels wait (`off`) and nothing is sent. A delivery left
 *    POSTING with no container by a run that died is UNKNOWN: looked for
 *    before anything is sent again.
 * 2. **Each channel's step** on its platform (`platform-steps.ts`),
 *    outside any transaction. A channel needing reconnecting waits
 *    (`attention`); a token Meta refuses marks it so and tells the
 *    business once, and its delivery waits too.
 * 3. **Record**, on one transaction: each delivery's result, the post's
 *    status from them, the next run when a container is being made or an
 *    unclear publish is to be checked, and one alert when a channel
 *    didn't post.
 *
 * Meta's answers never throw out of here, so the worker never re-runs a
 * post blind; only the database's failures do, and a re-run checks first.
 */
@Injectable()
export class SocialPublishHandler {
    private readonly logger = new Logger(SocialPublishHandler.name);

    constructor(
        @Optional()
        @Inject(SOCIAL_META)
        private readonly meta: SocialMetaPort | null,
        private readonly access: SocialAccess,
    ) {}

    readonly handle = async (job: Job): Promise<void> => {
        const postId = payloadOf(job.payload)?.postId;
        if (!postId || !job.organizationId) {
            this.logger.warn(
                `social.publish job ${job.id} names no post; skipped`,
            );
            return;
        }
        const org = job.organizationId;
        await runInOrgContext(org, () => this.run(org, postId, job.id));
    };

    async run(
        organizationId: string,
        postId: string,
        jobId: string,
        now: Date = new Date(),
    ): Promise<"skipped" | "off" | "ran"> {
        const on =
            (await this.access.rolledOut(organizationId)) &&
            (await this.access.included(organizationId, now));
        const claim = await prisma.$transaction((tx) =>
            claimRun(tx, organizationId, postId, jobId, on),
        );
        if (claim === "skipped" || claim === "off") return claim;
        const { post, deliveries } = claim;

        const origin = await siteOriginOf(organizationId);
        const link = origin
            ? trackedLink(origin, post.linkPath, post.ref)
            : null;
        const results = new Map<string, StepOutcome>();
        const attention: string[] = [];

        for (const d of deliveries) {
            const channel = await prisma.socialChannel.findUnique({
                where: {
                    organizationId_kind: { organizationId, kind: d.kind },
                },
            });
            const sealed = channel ? sealedToken(channel) : null;
            if (!channel) {
                results.set(d.id, { status: "FAILED", reason: "disconnected" });
                continue;
            }
            if (channel.status !== "CONNECTED" || !sealed) {
                results.set(d.id, { status: "WAITING", reason: "attention" });
                continue;
            }
            if (!this.meta || !post.imageUrl || !link) {
                results.set(d.id, {
                    status: "FAILED",
                    reason: !this.meta ? "unknown" : !link ? "site" : "media",
                });
                continue;
            }
            try {
                const token = unseal(sealed, {
                    organizationId,
                    rowId: channel.id,
                });
                results.set(
                    d.id,
                    await nextStep(this.meta, d, {
                        accountId: channel.accountId,
                        token,
                        imageUrl: post.imageUrl,
                        caption: captionFor(
                            d.kind,
                            post.caption,
                            captionsOf(post.captions)[d.kind],
                            link,
                        ),
                        ref: post.ref,
                        now,
                        limitFreesAt: () => limitFreesAt(channel.id, now),
                    }),
                );
            } catch (error) {
                if (isMetaError(error, "auth")) {
                    attention.push(channel.id);
                    results.set(d.id, {
                        status: "WAITING",
                        reason: "attention",
                    });
                } else {
                    this.logger.error(
                        `social_publish_step_failed post=${postId} kind=${d.kind} error=${error instanceof Error ? error.name : "unknown"}`,
                    );
                    results.set(d.id, { status: "FAILED", reason: "unknown" });
                }
            }
        }

        await prisma.$transaction((tx) =>
            recordRun(tx, organizationId, post, results, attention, now),
        );
        return "ran";
    }
}

type Claimed =
    | "skipped"
    | "off"
    | {
          post: {
              id: string;
              organizationId: string;
              ref: string;
              linkPath: string;
              caption: string;
              captions: Prisma.JsonValue;
              imageUrl: string | null;
              publishJobId: string | null;
          };
          deliveries: {
              id: string;
              kind: "INSTAGRAM" | "FACEBOOK" | "THREADS";
              status: "WAITING" | "POSTING" | "UNKNOWN";
              containerId: string | null;
              checks: number;
              attempts: number;
          }[];
      };

async function claimRun(
    tx: Tx,
    organizationId: string,
    postId: string,
    jobId: string,
    on: boolean,
): Promise<Claimed> {
    const locked = await tx.$queryRaw<{ id: string }[]>`
        SELECT id FROM "SocialPost"
        WHERE id = ${postId} AND "organizationId" = ${organizationId}
        FOR UPDATE`;
    if (locked.length === 0) return "skipped";
    const post = await tx.socialPost.findUniqueOrThrow({
        where: { id: postId },
        select: {
            id: true,
            organizationId: true,
            ref: true,
            linkPath: true,
            caption: true,
            captions: true,
            imageUrl: true,
            status: true,
            publishJobId: true,
            removedAt: true,
        },
    });
    if (
        post.publishJobId !== jobId ||
        post.removedAt ||
        (post.status !== "SCHEDULED" && post.status !== "PUBLISHING")
    ) {
        return "skipped";
    }
    // A delivery a dead run left mid-publish: look before sending again.
    await tx.socialDelivery.updateMany({
        where: { postId, status: "POSTING", containerId: null },
        data: { status: "UNKNOWN" },
    });
    if (!on) {
        await tx.socialDelivery.updateMany({
            where: { postId, status: "WAITING" },
            data: { reason: "off" },
        });
        await tx.socialPost.update({
            where: { id: postId },
            data: { status: "PUBLISHING", publishJobId: null },
        });
        return "off";
    }
    await tx.socialPost.update({
        where: { id: postId },
        data: { status: "PUBLISHING" },
    });
    const deliveries = await tx.socialDelivery.findMany({
        where: { postId, status: { in: ["WAITING", "POSTING", "UNKNOWN"] } },
        orderBy: { kind: "asc" },
        select: {
            id: true,
            kind: true,
            status: true,
            containerId: true,
            checks: true,
            attempts: true,
        },
    });
    return {
        post,
        deliveries: deliveries as Exclude<Claimed, string>["deliveries"],
    };
}

async function recordRun(
    tx: Tx,
    organizationId: string,
    post: { id: string; organizationId: string; publishJobId: string | null },
    results: ReadonlyMap<string, StepOutcome>,
    attention: readonly string[],
    now: Date,
): Promise<void> {
    let newlyFailed = false;
    for (const [id, r] of results) {
        const { again: _again, ...fields } = r;
        if (r.status === "FAILED") newlyFailed = true;
        await tx.socialDelivery.update({
            where: { id },
            data: {
                ...fields,
                lastTriedAt: now,
                ...(r.status === "POSTED" ? { postedAt: now } : {}),
            },
            select: { id: true },
        });
    }
    for (const channelId of attention) {
        await markAttentionInTx(tx, channelId, "revoked", now);
    }
    const deliveries = await tx.socialDelivery.findMany({
        where: { postId: post.id },
        select: { status: true, reason: true },
    });
    const again = [...results.values()]
        .map((r) => r.again?.getTime())
        .filter((t): t is number => t !== undefined);
    if (again.length > 0) {
        await queuePublishInTx(tx, post, new Date(Math.min(...again)));
    } else {
        await tx.socialPost.update({
            where: { id: post.id },
            data: { publishJobId: null },
        });
    }
    await tx.socialPost.update({
        where: { id: post.id },
        data: { status: settledStatus(deliveries) },
    });
    if (newlyFailed) {
        await enqueueTeamAlert(tx, organizationId, {
            event: "social",
            about: "post",
            postId: post.id,
            at: now.toISOString(),
        });
    }
}

/**
 * When a platform's rolling day lets this channel post again: a day after
 * the oldest post Saroh made on it in the last day, else a day from now.
 */
async function limitFreesAt(channelId: string, now: Date): Promise<Date> {
    const oldest = await prisma.socialDelivery.findFirst({
        where: {
            channelId,
            status: "POSTED",
            postedAt: { gte: new Date(now.getTime() - DAY_MS) },
        },
        orderBy: { postedAt: "asc" },
        select: { postedAt: true },
    });
    return new Date((oldest?.postedAt ?? now).getTime() + DAY_MS);
}

function payloadOf(value: unknown): SocialPublishPayload | null {
    if (typeof value !== "object" || value === null) return null;
    const postId = (value as Record<string, unknown>).postId;
    return typeof postId === "string" && postId !== "" ? { postId } : null;
}
