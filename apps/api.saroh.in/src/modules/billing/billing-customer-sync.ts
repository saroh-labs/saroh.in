import type { Prisma } from "@saroh/database";
import { prisma } from "@saroh/database";

/**
 * Make or bring up to date the business's customer at Saroh's billing
 * provider (`billing-customer.ts`). Its own small file so sign-up and
 * Settings › Business can queue it without importing billing.
 */
export const BILLING_CUSTOMER_SYNC_TYPE = "billing.customer.sync";

/**
 * Tries before the queue gives up (1 s doubling, 5 min cap: about 20
 * minutes), so a provider's blip or a burst of rate limiting (a backfill)
 * doesn't leave a business without its customer.
 */
export const BILLING_CUSTOMER_SYNC_MAX_ATTEMPTS = 10;

/**
 * Queue the sync on the caller's transaction (the outbox), so sign-up or a
 * saved profile never waits on the provider. One waiting run per business
 * is enough — it reads the details when it runs — so a second is not
 * queued while one waits.
 */
export async function enqueueBillingCustomerSync(
    tx: Pick<Prisma.TransactionClient, "job">,
    organizationId: string,
): Promise<void> {
    const waiting = await tx.job.findFirst({
        where: {
            type: BILLING_CUSTOMER_SYNC_TYPE,
            organizationId,
            status: "PENDING",
        },
        select: { id: true },
    });
    if (waiting) return;
    await tx.job.create({
        data: {
            type: BILLING_CUSTOMER_SYNC_TYPE,
            organizationId,
            maxAttempts: BILLING_CUSTOMER_SYNC_MAX_ATTEMPTS,
            payload: {},
        },
    });
}

/**
 * A user's email changed (Better Auth's `onUserEmailChanged`): the billing
 * email of every business they own is theirs, so each one's customer is
 * brought up to date. A deleted business is left alone.
 */
export async function enqueueOwnedBusinessesSync(
    userId: string,
): Promise<number> {
    const owned = await prisma.membership.findMany({
        where: {
            userId,
            role: "OWNER",
            organization: { deletedRetainedAt: null },
        },
        select: { organizationId: true },
    });
    if (owned.length === 0) return 0;
    await prisma.$transaction(async (tx) => {
        for (const { organizationId } of owned) {
            await enqueueBillingCustomerSync(tx, organizationId);
        }
    });
    return owned.length;
}
