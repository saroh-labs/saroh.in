// The renewal job: it renews what is due, throws only when it cannot leave
// the next run waiting, and a chain check restarts it. Database and service mocked.
jest.mock("@saroh/database", () => {
    const actual = jest.requireActual("@saroh/database");
    return {
        ...actual,
        prisma: {
            customerSubscription: { findMany: jest.fn() },
            job: { create: jest.fn(), count: jest.fn() },
        },
    };
});

import { Prisma, prisma } from "@saroh/database";

import {
    RENEW_BATCH,
    RENEW_EVERY_MS,
    SUBSCRIPTION_RENEW_TYPE,
    SubscriptionRenewHandler,
} from "./subscription-renew.handler";
import type { SubscriptionsService } from "./subscriptions.service";

const findMany = prisma.customerSubscription.findMany as jest.Mock;
const jobCreate = prisma.job.create as jest.Mock;
const jobCount = prisma.job.count as jest.Mock;

const renewOne = jest.fn();
const handler = new SubscriptionRenewHandler({
    renewOne,
} as unknown as SubscriptionsService);

const JOB = {} as never;

function duplicate(): Error {
    return new Prisma.PrismaClientKnownRequestError("Unique constraint", {
        code: "P2002",
        clientVersion: "test",
    });
}

beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers({ now: new Date("2026-10-01T02:00:00Z") });
    findMany.mockResolvedValue([]);
    jobCreate.mockResolvedValue({});
    renewOne.mockResolvedValue("renewed");
});

afterEach(() => jest.useRealTimers());

describe("subscription.renew", () => {
    it("asks for due subscriptions with Payments on, and any set to end", async () => {
        await handler.handle(JOB);
        expect(findMany).toHaveBeenCalledWith(
            expect.objectContaining({
                where: {
                    currentPeriodEnd: { lte: new Date("2026-10-01T02:00:00Z") },
                    OR: [
                        {
                            status: "ACTIVE",
                            organization: {
                                organizationModules: {
                                    none: {
                                        moduleKey: "PAYMENTS",
                                        status: { not: "ENABLED" },
                                    },
                                },
                            },
                        },
                        {
                            status: { in: ["ACTIVE", "PAUSED"] },
                            cancelAtPeriodEnd: true,
                        },
                    ],
                },
                take: RENEW_BATCH,
            }),
        );
    });

    it("renews each due subscription, and a failure does not stop the rest", async () => {
        findMany.mockResolvedValue([
            { id: "sub_1", organizationId: "org_1" },
            { id: "sub_2", organizationId: "org_1" },
            { id: "sub_3", organizationId: "org_2" },
        ]);
        renewOne
            .mockResolvedValueOnce("renewed")
            .mockRejectedValueOnce(new Error("database went away"))
            .mockResolvedValueOnce("renewed");

        await expect(handler.handle(JOB)).resolves.toBeUndefined();
        expect(renewOne.mock.calls.map((c) => c[0])).toEqual([
            "sub_1",
            "sub_2",
            "sub_3",
        ]);
        // …and the next run is still enqueued.
        expect(jobCreate).toHaveBeenCalledTimes(1);
    });

    it("schedules the next run an hour on", async () => {
        await handler.handle(JOB);
        expect(jobCreate).toHaveBeenCalledWith({
            data: {
                type: SUBSCRIPTION_RENEW_TYPE,
                payload: {},
                runAt: new Date(Date.now() + RENEW_EVERY_MS),
            },
        });
    });

    it("runs again straight away when every batch it may take was full", async () => {
        findMany.mockResolvedValue(
            Array.from({ length: RENEW_BATCH }, (_, i) => ({
                id: `sub_${i}`,
                organizationId: "org_1",
            })),
        );
        await handler.handle(JOB);
        expect(jobCreate.mock.calls[0]![0].data.runAt).toEqual(new Date());
    });

    it("keeps going past a batch that failed, and never fetches those again this run", async () => {
        const batch = Array.from({ length: RENEW_BATCH }, (_, i) => ({
            id: `bad_${i}`,
            organizationId: "org_1",
        }));
        findMany
            .mockResolvedValueOnce(batch)
            .mockResolvedValueOnce([{ id: "good", organizationId: "org_2" }]);
        renewOne.mockImplementation((id: string) =>
            id === "good"
                ? Promise.resolve("renewed")
                : Promise.reject(new Error("broken")),
        );
        await handler.handle(JOB);

        expect(findMany).toHaveBeenCalledTimes(2);
        expect(findMany.mock.calls[1]![0].where.id).toEqual({
            notIn: batch.map((b) => b.id),
        });
        expect(renewOne).toHaveBeenCalledWith("good", expect.any(Date));
        // It got to the end, so the next run is the usual hour away.
        expect(jobCreate.mock.calls[0]![0].data.runAt).toEqual(
            new Date(Date.now() + RENEW_EVERY_MS),
        );
    });

    it("never throws, even when it cannot read what is due", async () => {
        findMany.mockRejectedValue(new Error("connection refused"));
        await expect(handler.handle(JOB)).resolves.toBeUndefined();
        expect(jobCreate).toHaveBeenCalledTimes(1);
    });

    it("treats a run already waiting as scheduled", async () => {
        jobCreate.mockRejectedValue(duplicate());
        await expect(handler.schedule(new Date())).resolves.toBe(true);
    });

    it("does not throw when scheduling fails for another reason", async () => {
        jobCreate.mockRejectedValue(new Error("connection refused"));
        await expect(handler.schedule(new Date())).resolves.toBe(false);
    });

    it("throws when it cannot leave the next run waiting, so this one is retried", async () => {
        jobCreate.mockRejectedValue(new Error("connection refused"));
        await expect(handler.handle(JOB)).rejects.toThrow(
            "Could not schedule the next subscription renewal run",
        );
    });

    it("finishes quietly when the next run is already waiting", async () => {
        jobCreate.mockRejectedValue(duplicate());
        await expect(handler.handle(JOB)).resolves.toBeUndefined();
    });
});

describe("the chain check", () => {
    it("leaves a live chain alone", async () => {
        jobCount.mockResolvedValue(1);
        await handler.ensureScheduled();
        expect(jobCount).toHaveBeenCalledWith({
            where: {
                type: SUBSCRIPTION_RENEW_TYPE,
                status: { in: ["PENDING", "PROCESSING"] },
            },
        });
        expect(jobCreate).not.toHaveBeenCalled();
    });

    it("starts a stopped chain now", async () => {
        jobCount.mockResolvedValue(0);
        await handler.ensureScheduled();
        expect(jobCreate.mock.calls[0]![0].data).toMatchObject({
            type: SUBSCRIPTION_RENEW_TYPE,
            runAt: new Date(),
        });
    });

    it("never throws", async () => {
        jobCount.mockRejectedValue(new Error("connection refused"));
        await expect(handler.ensureScheduled()).resolves.toBeUndefined();
    });
});
