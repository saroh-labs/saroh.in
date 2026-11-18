import type { Prisma } from "@saroh/database";

import { enqueueTeamAlert } from "../../notifications/team-alerts";
import { dropWaitingJob } from "../shared/jobs";
import { NO_TOKEN } from "./sealing";

/** Why a channel needs reconnecting. */
export type AttentionReason =
    /** Meta refused the token, or the person took Saroh's access away. */
    | "revoked"
    /** The token ran out before Saroh could refresh it. */
    | "expired"
    /** A Threads grant's 90 days ended. */
    | "grant-ended";

type Tx = Pick<
    Prisma.TransactionClient,
    "socialChannel" | "job" | "socialDelivery"
>;

/**
 * CONNECTED → NEEDS_ATTENTION, once (U7, KTD4): the token is dropped (no
 * use now), the refresh chain stops, and the business is told once
 * (`team.alert`, `social` "channel"). True only for the write that made
 * the change, so ten jobs meeting the same refusal tell it once, and none
 * again until it is reconnected (which clears it). Its posts wait: their
 * deliveries stay WAITING until a reconnect.
 */
export async function markAttentionInTx(
    tx: Tx,
    channelId: string,
    reason: AttentionReason,
    now: Date = new Date(),
): Promise<boolean> {
    const row = await tx.socialChannel.findUnique({
        where: { id: channelId },
        select: { organizationId: true, refreshJobId: true },
    });
    if (!row) return false;
    const { count } = await tx.socialChannel.updateMany({
        where: { id: channelId, status: "CONNECTED" },
        data: {
            status: "NEEDS_ATTENTION",
            attentionReason: reason,
            attentionAt: now,
            refreshJobId: null,
            ...NO_TOKEN,
        },
    });
    if (count !== 1) return false;
    await dropWaitingJob(tx, row.refreshJobId);
    await enqueueTeamAlert(tx, row.organizationId, {
        event: "social",
        about: "channel",
        channelId,
        since: now.toISOString(),
    });
    return true;
}
