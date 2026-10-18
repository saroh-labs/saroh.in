/**
 * The DEC-167 backfill (`packages/database/src/backfill/billing-profiles.ts`):
 * one `billing.profile.sync` per billing profile without its provider
 * customer, none for a profile that has one or whose sync is waiting, and
 * none at all on a second run; it counts the businesses that haven't
 * chosen a profile yet, and queues nothing for them.
 * Runs in the integration project (TEST_DATABASE_URL).
 */
import { backfillBillingProfiles, prisma } from "@saroh/database";

import { BILLING_PROFILE_SYNC_TYPE } from "./billing-profile-sync";

const tag = `${process.pid}-${Date.now()}`;
let seq = 0;

async function profile(over: { providerCustomerId?: string } = {}) {
    seq += 1;
    const owner = await prisma.user.create({
        data: { email: `backfill-${seq}-${tag}@example.com` },
    });
    return prisma.billingProfile.create({
        data: {
            ownerUserId: owner.id,
            legalName: `Backfill ${seq}`,
            billingEmail: `accounts-${seq}-${tag}@example.com`,
            provider: "RAZORPAY",
            ...over,
        },
    });
}

async function business(billingProfileId: string | null) {
    seq += 1;
    return prisma.organization.create({
        data: {
            name: `Backfill business ${seq}`,
            slug: `backfill-${seq}-${tag}`,
            billingProfileId,
        },
    });
}

const profileJobs = () =>
    prisma.job.findMany({ where: { type: BILLING_PROFILE_SYNC_TYPE } });

describe("backfillBillingProfiles (DEC-167)", () => {
    it("queues one sync per profile without a customer; a second run queues none", async () => {
        const bare = await profile();
        const shared = await profile();
        const made = await profile({
            providerCustomerId: `cust_backfill${process.pid}`,
        });
        const waiting = await profile();
        await prisma.job.create({
            data: {
                type: BILLING_PROFILE_SYNC_TYPE,
                payload: { billingProfileId: waiting.id },
            },
        });
        await business(bare.id);
        // Two businesses on one profile: still one job for it.
        await business(shared.id);
        await business(shared.id);
        await business(made.id);
        // Left without a profile by the data move: counted, nothing queued.
        await business(null);
        await business(null);
        const deleted = await business(null);
        await prisma.organization.update({
            where: { id: deleted.id },
            data: { deletedRetainedAt: new Date() },
        });

        const first = await backfillBillingProfiles(prisma);
        expect(first).toEqual({
            profiles: 4,
            made: 1,
            waiting: 1,
            queued: 2,
            businessesWithoutProfile: 2,
        });
        const jobs = await profileJobs();
        expect(
            jobs
                .map(
                    (j) =>
                        (j.payload as { billingProfileId: string })
                            .billingProfileId,
                )
                .sort(),
        ).toEqual([bare.id, shared.id, waiting.id].sort());
        expect(jobs.every((j) => j.organizationId === null)).toBe(true);
        expect(jobs.every((j) => j.status === "PENDING")).toBe(true);

        const second = await backfillBillingProfiles(prisma);
        expect(second).toEqual({
            profiles: 4,
            made: 1,
            waiting: 3,
            queued: 0,
            businessesWithoutProfile: 2,
        });
        expect(await profileJobs()).toHaveLength(3);
    });

    it("queues a profile again once its sync was given up", async () => {
        await prisma.job.updateMany({
            where: { type: BILLING_PROFILE_SYNC_TYPE },
            data: { status: "FAILED" },
        });
        const r = await backfillBillingProfiles(prisma);
        expect(r.queued).toBe(3);
        expect(r.waiting).toBe(0);
    });
});
