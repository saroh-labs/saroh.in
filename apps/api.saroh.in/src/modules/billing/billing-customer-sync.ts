import type { Prisma } from "@saroh/database";

/**
 * Make or bring up to date the business's customer at Saroh's billing
 * provider (`billing-customer.ts`). Its own small file so sign-up and
 * Settings › Business can queue it without importing billing.
 */
export const BILLING_CUSTOMER_SYNC_TYPE = "billing.customer.sync";

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
            payload: {},
        },
    });
}
