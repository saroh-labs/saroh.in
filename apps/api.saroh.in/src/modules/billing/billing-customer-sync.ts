import type { Prisma } from "@saroh/database";

/**
 * DEC-165's per-business sync, kept so jobs already queued still run (an
 * operator's Sync again queues `billing.profile.sync` since 18 Oct 2026):
 * its handler now syncs the business's billing profile
 * (`billing-customer.ts`), and does nothing for a business without one.
 * New code queues `billing.profile.sync` (`billing-profile-sync.ts`).
 */
export const BILLING_CUSTOMER_SYNC_TYPE = "billing.customer.sync";

/** As `BILLING_PROFILE_SYNC_MAX_ATTEMPTS`. */
export const BILLING_CUSTOMER_SYNC_MAX_ATTEMPTS = 10;

/**
 * Queue the business's sync on the caller's transaction (the outbox). One
 * waiting run per business is enough, so a second is not queued while one
 * waits.
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
