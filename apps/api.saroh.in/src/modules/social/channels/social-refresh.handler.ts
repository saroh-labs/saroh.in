import { Inject, Injectable, Logger, Optional } from "@nestjs/common";
import type { Job } from "@saroh/database";
import { prisma, runInOrgContext } from "@saroh/database";

import type { SocialMetaPort } from "../meta/social-meta.port";
import { isMetaError, SOCIAL_META } from "../meta/social-meta.port";
import type { SocialRefreshPayload } from "../shared/jobs";
import { queueRefreshInTx } from "../shared/jobs";
import type { AttentionReason } from "./channel-attention";
import { markAttentionInTx } from "./channel-attention";
import { THREADS_GRANT_MS } from "./channels.service";
import { seal, sealedToken, tokenColumns, unseal } from "./sealing";

export { SOCIAL_REFRESH_TYPE } from "../shared/jobs";

/** When Meta didn't answer a refresh: try again this much later. */
export const REFRESH_RETRY_MS = 6 * 3_600_000;

/**
 * `social.refresh` (U7, KTD4): a Threads token refreshed 7
 * days before it, or a Threads grant, ends; then the next one is queued.
 * A Threads profile's grant is extended by a refresh (public profiles);
 * a private one's ends at 90 days and Meta refuses the refresh then.
 *
 * - Refused (`auth`): the channel needs reconnecting, why worded as
 *   `grant-ended` (a Threads grant past its end), `expired` (the token
 *   ran out) or `revoked`, and the business is told once.
 * - Meta didn't answer: tried again in 6 hours, or, once the token has
 *   run out, marked `expired`.
 *
 * A job the channel no longer names (it was reconnected) does nothing.
 * Kept running whatever MODULE_SOCIAL says: a token left to lapse would
 * make every business reconnect when Social comes back on.
 */
@Injectable()
export class SocialRefreshHandler {
    private readonly logger = new Logger(SocialRefreshHandler.name);

    constructor(
        @Optional()
        @Inject(SOCIAL_META)
        private readonly meta: SocialMetaPort | null,
    ) {}

    readonly handle = async (job: Job): Promise<void> => {
        const channelId = payloadOf(job.payload)?.channelId;
        if (!channelId || !job.organizationId) {
            this.logger.warn(
                `social.refresh job ${job.id} names no channel; skipped`,
            );
            return;
        }
        await runInOrgContext(job.organizationId, () =>
            this.run(channelId, job.id),
        );
    };

    async run(
        channelId: string,
        jobId: string,
        now: Date = new Date(),
    ): Promise<"skipped" | "refreshed" | "attention" | "later"> {
        const channel = await prisma.socialChannel.findUnique({
            where: { id: channelId },
        });
        const sealed = channel ? sealedToken(channel) : null;
        if (
            !channel ||
            !sealed ||
            !this.meta ||
            // Facebook and Instagram hold Page tokens, which don't expire.
            channel.kind !== "THREADS" ||
            channel.status !== "CONNECTED" ||
            channel.refreshJobId !== jobId
        ) {
            return "skipped";
        }
        const kind = channel.kind;
        const binding = {
            organizationId: channel.organizationId,
            rowId: channel.id,
        };
        try {
            const fresh = await this.meta.refresh(
                kind,
                unseal(sealed, binding),
            );
            await prisma.$transaction(async (tx) => {
                const row = await tx.socialChannel.update({
                    where: { id: channel.id },
                    data: {
                        ...tokenColumns(seal(fresh.token, binding)),
                        tokenIssuedAt: now,
                        tokenExpiresAt: fresh.expiresAt,
                        grantExpiresAt: new Date(
                            now.getTime() + THREADS_GRANT_MS,
                        ),
                    },
                });
                await queueRefreshInTx(tx, row, now);
            });
            return "refreshed";
        } catch (error) {
            const ended =
                channel.tokenExpiresAt !== null &&
                channel.tokenExpiresAt <= now;
            if (isMetaError(error, "auth") || (ended && isMetaError(error))) {
                const grantEnded =
                    channel.grantExpiresAt !== null &&
                    channel.grantExpiresAt <= now;
                const reason: AttentionReason = grantEnded
                    ? "grant-ended"
                    : ended
                      ? "expired"
                      : "revoked";
                await prisma.$transaction((tx) =>
                    markAttentionInTx(tx, channel.id, reason, now),
                );
                return "attention";
            }
            if (!isMetaError(error)) throw error;
            this.logger.warn(
                `social_refresh_later channel=${channel.id} reason=${error.kind}:${error.detail}`,
            );
            await prisma.$transaction((tx) =>
                queueRefreshInTx(
                    tx,
                    channel,
                    now,
                    new Date(now.getTime() + REFRESH_RETRY_MS),
                ),
            );
            return "later";
        }
    }
}

function payloadOf(value: unknown): SocialRefreshPayload | null {
    if (typeof value !== "object" || value === null) return null;
    const channelId = (value as Record<string, unknown>).channelId;
    return typeof channelId === "string" && channelId !== ""
        ? { channelId }
        : null;
}
