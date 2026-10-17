import type { PrismaClient } from "@prisma/client";

/**
 * The DEC-165 backfill: every business made before customers were made at
 * sign-up gets its `billing.customer.sync` job, which makes its one
 * customer at Saroh's billing provider (the API's `billing-customer.ts`).
 *
 * A business that paid before DEC-165 already has a customer Razorpay made
 * at its payment (on its `Subscription` or latest `BillingCheckout`): the
 * job adopts that one, checked at the provider, and brings it up to date
 * rather than making a second.
 *
 * Idempotent: a business that has its customer, or a sync waiting, is
 * skipped, so running it again queues nothing new; a sync that failed
 * (dead-lettered, its reason on `BillingCustomer.lastError`) is queued
 * again. A deleted business is left alone. Only queues jobs; the API's
 * worker calls the provider, and skips where the provider's keys aren't
 * set — run it only once they are (`PRICING_ROLLOUT.md`).
 */
export const BILLING_CUSTOMER_SYNC_JOB = "billing.customer.sync";
/** As the API's `BILLING_CUSTOMER_SYNC_MAX_ATTEMPTS`. */
const SYNC_MAX_ATTEMPTS = 10;
const PROVIDER = "RAZORPAY";

export interface BillingCustomersReport {
    /** Businesses not deleted. */
    businesses: number;
    /** Already have their customer. */
    made: number;
    /** A sync was already waiting. */
    waiting: number;
    /** Syncs queued by this run. */
    queued: number;
}

export async function backfillBillingCustomers(
    prisma: PrismaClient,
): Promise<BillingCustomersReport> {
    const orgs = await prisma.organization.findMany({
        where: { deletedRetainedAt: null },
        select: { id: true },
    });
    const made = new Set(
        (
            await prisma.billingCustomer.findMany({
                where: {
                    provider: PROVIDER,
                    providerCustomerId: { not: null },
                },
                select: { organizationId: true },
            })
        ).map((r) => r.organizationId),
    );
    const waiting = new Set(
        (
            await prisma.job.findMany({
                where: { type: BILLING_CUSTOMER_SYNC_JOB, status: "PENDING" },
                select: { organizationId: true },
            })
        ).map((j) => j.organizationId),
    );
    const todo = orgs.filter((o) => !made.has(o.id) && !waiting.has(o.id));
    if (todo.length > 0) {
        await prisma.job.createMany({
            data: todo.map((o) => ({
                type: BILLING_CUSTOMER_SYNC_JOB,
                organizationId: o.id,
                maxAttempts: SYNC_MAX_ATTEMPTS,
                payload: {},
            })),
        });
    }
    return {
        businesses: orgs.length,
        made: orgs.filter((o) => made.has(o.id)).length,
        waiting: orgs.filter((o) => !made.has(o.id) && waiting.has(o.id))
            .length,
        queued: todo.length,
    };
}
