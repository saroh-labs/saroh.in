import type { PrismaClient } from "@prisma/client";

/**
 * The DEC-167 backfill: every billing profile without its customer at
 * Saroh's billing provider gets its `billing.profile.sync` job, which makes
 * the profile's one customer (the API's `billing-customer.ts`).
 *
 * A profile the migration made from a business that already had a
 * customer (DEC-165's `BillingCustomer`) carries that customer's id, so it
 * is counted as made and left alone; the job adopts or brings up to date
 * rather than making a second.
 *
 * Idempotent: a profile that has its customer, or a sync waiting, is
 * skipped, so running it again queues nothing new; a sync that failed
 * (dead-lettered, its reason on `BillingProfile.lastError`) is queued
 * again. Only queues jobs; the API's worker calls the provider, and skips
 * where the provider's keys aren't set — run it only once they are
 * (`PRICING_ROLLOUT.md`).
 *
 * It also counts the businesses with no profile yet (the migration leaves a
 * business unplaced when its GST identity differs from its owner's first
 * business): nothing is queued for them; an owner chooses a profile in
 * Plan & billing before the business can pay.
 */
export const BILLING_PROFILE_SYNC_JOB = "billing.profile.sync";
/** As the API's `BILLING_PROFILE_SYNC_MAX_ATTEMPTS`. */
const SYNC_MAX_ATTEMPTS = 10;

export interface BillingProfilesReport {
    /** Every billing profile. */
    profiles: number;
    /** Already have their customer. */
    made: number;
    /** A sync was already waiting. */
    waiting: number;
    /** Syncs queued by this run. */
    queued: number;
    /** Businesses (not deleted) that haven't chosen a profile yet. */
    businessesWithoutProfile: number;
}

export async function backfillBillingProfiles(
    prisma: PrismaClient,
): Promise<BillingProfilesReport> {
    const profiles = await prisma.billingProfile.findMany({
        select: { id: true, providerCustomerId: true },
    });
    const waiting = new Set(
        (
            await prisma.job.findMany({
                where: { type: BILLING_PROFILE_SYNC_JOB, status: "PENDING" },
                select: { payload: true },
            })
        ).map((j) => profileIdOf(j.payload)),
    );
    const without = profiles.filter((p) => !p.providerCustomerId);
    const todo = without.filter((p) => !waiting.has(p.id));
    if (todo.length > 0) {
        await prisma.job.createMany({
            data: todo.map((p) => ({
                type: BILLING_PROFILE_SYNC_JOB,
                maxAttempts: SYNC_MAX_ATTEMPTS,
                payload: { billingProfileId: p.id },
            })),
        });
    }
    const businessesWithoutProfile = await prisma.organization.count({
        where: { deletedRetainedAt: null, billingProfileId: null },
    });
    return {
        profiles: profiles.length,
        made: profiles.length - without.length,
        waiting: without.length - todo.length,
        queued: todo.length,
        businessesWithoutProfile,
    };
}

function profileIdOf(payload: unknown): string | null {
    if (!payload || typeof payload !== "object") return null;
    const id = (payload as Record<string, unknown>).billingProfileId;
    return typeof id === "string" ? id : null;
}
