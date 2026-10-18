import type { Prisma } from "@saroh/database";

/**
 * Make or bring up to date a billing profile's customer at Saroh's billing
 * provider (`billing-customer.ts`, DEC-167). Its own small file so sign-up,
 * a profile's save and a checkout can queue it without importing billing.
 */
export const BILLING_PROFILE_SYNC_TYPE = "billing.profile.sync";

/**
 * Tries before the queue gives up (1 s doubling, 5 min cap: about 20
 * minutes), so a provider's blip or a burst of rate limiting (a backfill)
 * doesn't leave a profile without its customer.
 */
export const BILLING_PROFILE_SYNC_MAX_ATTEMPTS = 10;

export interface BillingProfileSyncPayload {
    billingProfileId: string;
}

type JobTx = Pick<Prisma.TransactionClient, "job">;

/**
 * Queue the sync on the caller's transaction (the outbox), so a sign-up or
 * a saved profile never waits on the provider. One waiting run per profile
 * is enough — it reads the details when it runs — so a second is not
 * queued while one waits. A profile spans businesses, so the job names
 * none.
 */
export async function enqueueBillingProfileSync(
    tx: JobTx,
    billingProfileId: string,
): Promise<void> {
    const waiting = await tx.job.findFirst({
        where: {
            type: BILLING_PROFILE_SYNC_TYPE,
            status: "PENDING",
            payload: { path: ["billingProfileId"], equals: billingProfileId },
        },
        select: { id: true },
    });
    if (waiting) return;
    const payload: BillingProfileSyncPayload = { billingProfileId };
    await tx.job.create({
        data: {
            type: BILLING_PROFILE_SYNC_TYPE,
            maxAttempts: BILLING_PROFILE_SYNC_MAX_ATTEMPTS,
            payload: { ...payload },
        },
    });
}

/**
 * Queue the sync of the profile a business is billed to, if it has one
 * (a checkout that was given details, an operator's Sync again).
 */
export async function enqueueBusinessProfileSync(
    tx: JobTx & Pick<Prisma.TransactionClient, "organization">,
    organizationId: string,
): Promise<boolean> {
    const org = await tx.organization.findUnique({
        where: { id: organizationId },
        select: { billingProfileId: true },
    });
    if (!org?.billingProfileId) return false;
    await enqueueBillingProfileSync(tx, org.billingProfileId);
    return true;
}
