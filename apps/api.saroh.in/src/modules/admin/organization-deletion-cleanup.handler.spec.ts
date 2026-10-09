jest.mock("@saroh/database", () => {
    const prisma = {
        organization: { findUnique: jest.fn() },
        job: { updateMany: jest.fn(), create: jest.fn() },
        merchantPaymentProvider: { deleteMany: jest.fn() },
        storePaymentConfig: { deleteMany: jest.fn() },
        integrationSecret: { deleteMany: jest.fn() },
        $transaction: jest.fn((fn: (tx: unknown) => unknown) => fn(prisma)),
    };
    return { prisma };
});

import type { Job } from "@saroh/database";
import { prisma } from "@saroh/database";

import type { DeletedBusinessBilling } from "../billing/business-closing";
import type { DomainsService } from "../domains/domains.service";
import type { MediaService } from "../media/media.service";
import {
    CLEANUP_KEEPS_JOB_TYPES,
    enqueueDeletionCleanup,
    ORGANIZATION_DELETION_CLEANUP_ATTEMPTS,
    ORGANIZATION_DELETION_CLEANUP_TYPE,
    OrganizationDeletionCleanupHandler,
} from "./organization-deletion-cleanup.handler";

const readOrg = prisma.organization.findUnique as jest.Mock;
const jobs = prisma.job.updateMany as jest.Mock;
const merchantKeys = prisma.merchantPaymentProvider.deleteMany as jest.Mock;
const storeKeys = prisma.storePaymentConfig.deleteMany as jest.Mock;
const secrets = prisma.integrationSecret.deleteMany as jest.Mock;

function build() {
    const billing = {
        end: jest.fn(async () => ({
            cancelledAtProvider: true,
            subscriptionCancelled: true,
            checkoutsDropped: 1,
        })),
    };
    const domains = {
        releaseForDeletedBusiness: jest.fn(async () => ({
            released: 2,
            failed: 0,
        })),
    };
    const media = {
        removeAllForDeletedBusiness: jest.fn(async () => ({
            removed: 5,
            failed: 0,
        })),
    };
    const handler = new OrganizationDeletionCleanupHandler(
        billing as unknown as DeletedBusinessBilling,
        domains as unknown as DomainsService,
        media as unknown as MediaService,
    );
    return { handler, billing, domains, media };
}

const job = (extra: Partial<Job> = {}) =>
    ({
        id: "job_1",
        organizationId: "org_1",
        payload: { organizationId: "org_1" },
        ...extra,
    }) as Job;

beforeEach(() => {
    jest.clearAllMocks();
    readOrg.mockResolvedValue({ lifecycleStatus: "DELETED_RETAINED" });
    jobs.mockResolvedValue({ count: 3 });
    merchantKeys.mockResolvedValue({ count: 1 });
    storeKeys.mockResolvedValue({ count: 1 });
    secrets.mockResolvedValue({ count: 0 });
});

describe("enqueueDeletionCleanup (#921)", () => {
    it("queues one job for the business, with room for a long outage", async () => {
        const create = jest.fn();
        await enqueueDeletionCleanup({ job: { create } } as never, "org_1");
        expect(create).toHaveBeenCalledWith({
            data: {
                type: ORGANIZATION_DELETION_CLEANUP_TYPE,
                organizationId: "org_1",
                payload: { organizationId: "org_1" },
                maxAttempts: ORGANIZATION_DELETION_CLEANUP_ATTEMPTS,
            },
        });
    });
});

describe("OrganizationDeletionCleanupHandler (#921)", () => {
    it("runs every step for a deleted business and counts what it did", async () => {
        const { handler, billing, domains, media } = build();
        const result = await handler.run("org_1", "job_1");

        expect(result).toEqual({
            ran: true,
            failed: [],
            counts: {
                jobsCancelled: 3,
                billingCancelledAtProvider: 1,
                billingSubscriptionCancelled: 1,
                billingCheckoutsDropped: 1,
                domainsReleased: 2,
                mediaRemoved: 5,
                keysDeleted: 2,
            },
        });
        expect(billing.end).toHaveBeenCalledWith("org_1");
        expect(domains.releaseForDeletedBusiness).toHaveBeenCalledWith("org_1");
        expect(media.removeAllForDeletedBusiness).toHaveBeenCalledWith("org_1");
    });

    it("cancels only its pending jobs, never the clean-up machinery", async () => {
        const { handler } = build();
        await handler.run("org_1", "job_1");
        expect(jobs).toHaveBeenCalledWith({
            where: {
                organizationId: "org_1",
                status: "PENDING",
                type: { notIn: [...CLEANUP_KEEPS_JOB_TYPES] },
                id: { not: "job_1" },
            },
            data: expect.objectContaining({ status: "CANCELLED" }),
        });
        expect(CLEANUP_KEEPS_JOB_TYPES).toEqual(
            expect.arrayContaining([
                ORGANIZATION_DELETION_CLEANUP_TYPE,
                "billing.provider.cancel",
                "subscription.charge",
            ]),
        );
    });

    it("deletes the payment keys of the business and of its storefronts", async () => {
        const { handler } = build();
        await handler.run("org_1");
        expect(merchantKeys).toHaveBeenCalledWith({
            where: { organizationId: "org_1" },
        });
        expect(storeKeys).toHaveBeenCalledWith({
            where: { store: { organizationId: "org_1" } },
        });
        expect(secrets).toHaveBeenCalledWith({
            where: { store: { organizationId: "org_1" } },
        });
    });

    it.each(["ACTIVE", "SUSPENDED", "PENDING_DELETION"])(
        "does nothing to a %s business",
        async (lifecycleStatus) => {
            readOrg.mockResolvedValue({ lifecycleStatus });
            const { handler, billing, domains, media } = build();
            await expect(handler.handle(job())).resolves.toBeUndefined();
            expect(jobs).not.toHaveBeenCalled();
            expect(billing.end).not.toHaveBeenCalled();
            expect(domains.releaseForDeletedBusiness).not.toHaveBeenCalled();
            expect(media.removeAllForDeletedBusiness).not.toHaveBeenCalled();
            expect(merchantKeys).not.toHaveBeenCalled();
        },
    );

    it("goes on past a failing step, then throws naming it so the queue retries", async () => {
        const { handler, billing, media } = build();
        billing.end.mockRejectedValueOnce(new Error("provider down"));
        await expect(handler.handle(job())).rejects.toThrow(
            "Deletion clean-up unfinished: billing",
        );
        // The others still ran.
        expect(media.removeAllForDeletedBusiness).toHaveBeenCalled();
        expect(merchantKeys).toHaveBeenCalled();
    });

    it("names every failing step", async () => {
        const { handler, domains, media } = build();
        domains.releaseForDeletedBusiness.mockRejectedValueOnce(new Error("x"));
        media.removeAllForDeletedBusiness.mockRejectedValueOnce(new Error("y"));
        const result = await handler.run("org_1");
        expect(result.failed).toEqual(["domains", "media"]);
    });
});
