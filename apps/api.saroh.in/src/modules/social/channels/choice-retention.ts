import { outsideOrgContext, prisma } from "@saroh/database";

/**
 * Delete Page choices past their 10 minutes (S-09): each holds sealed Page
 * tokens for every Page the person manages, so none is kept once it can no
 * longer be picked. Run by the waitlist's daily retention chain
 * (`waitlist/waitlist-retention.handler.ts`) for every business, and by
 * each connect for its own. Returns how many went.
 *
 * CROSS-TENANT: the daily run clears every business's expired rows; it
 * reads nothing back.
 */
export async function deleteExpiredSocialChoices(now: Date): Promise<number> {
    const { count } = await outsideOrgContext(() =>
        prisma.socialConnectChoice.deleteMany({
            where: { expiresAt: { lt: now } },
        }),
    );
    return count;
}
