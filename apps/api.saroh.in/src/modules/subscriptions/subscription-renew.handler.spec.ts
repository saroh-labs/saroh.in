// The renewal job: it renews what is due, never throws, and always leaves
// the next run waiting. The database and the service are mocked.
jest.mock("@saroh/database", () => {
    const actual = jest.requireActual("@saroh/database");
    return {
        ...actual,
        prisma: {
            customerSubscription: { findMany: jest.fn() },
            job: { create: jest.fn() },
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
    it("asks only for active, due subscriptions in businesses with Payments on", async () => {
        await handler.handle(JOB);
        expect(findMany).toHaveBeenCalledWith(
            expect.objectContaining({
                where: {
                    status: "ACTIVE",
                    currentPeriodEnd: { lte: new Date("2026-10-01T02:00:00Z") },
                    organization: {
                        organizationModules: {
                            none: {
                                moduleKey: "PAYMENTS",
                                status: { not: "ENABLED" },
                            },
                        },
                    },
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

    it("runs again straight away when the batch was full", async () => {
        findMany.mockResolvedValue(
            Array.from({ length: RENEW_BATCH }, (_, i) => ({
                id: `sub_${i}`,
                organizationId: "org_1",
            })),
        );
        await handler.handle(JOB);
        expect(jobCreate.mock.calls[0]![0].data.runAt).toEqual(new Date());
    });

    it("never throws, even when it cannot read what is due", async () => {
        findMany.mockRejectedValue(new Error("connection refused"));
        await expect(handler.handle(JOB)).resolves.toBeUndefined();
        expect(jobCreate).toHaveBeenCalledTimes(1);
    });

    it("treats a run already waiting as scheduled", async () => {
        jobCreate.mockRejectedValue(duplicate());
        await expect(handler.schedule(new Date())).resolves.toBeUndefined();
    });

    it("does not throw when scheduling fails for another reason", async () => {
        jobCreate.mockRejectedValue(new Error("connection refused"));
        await expect(handler.schedule(new Date())).resolves.toBeUndefined();
    });
});
