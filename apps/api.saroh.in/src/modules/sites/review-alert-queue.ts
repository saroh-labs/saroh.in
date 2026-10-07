import type { Prisma } from "@saroh/database";

import type { TeamAlertPayload } from "../notifications/team-alerts";
import { enqueueTeamAlert } from "../notifications/team-alerts";

type Tx = Pick<Prisma.TransactionClient, "job" | "siteReviewer">;

/**
 * Queue a review alert (UX-043, `notifications/review-alerts.ts`) on the
 * review write's own transaction (the outbox). One meant for the site's
 * reviewers (`reviewersOf`) is queued only when the site has one: a job
 * with nobody to tell is never written (`backend-jobs.md`).
 */
export async function queueReviewAlert(
    tx: Tx,
    organizationId: string,
    payload: Extract<TeamAlertPayload, { event: "review" }>,
    reviewersOf?: string,
): Promise<void> {
    if (reviewersOf) {
        const reviewers = await tx.siteReviewer.count({
            where: { organizationId, siteId: reviewersOf },
        });
        if (reviewers === 0) return;
    }
    await enqueueTeamAlert(tx, organizationId, payload);
}
