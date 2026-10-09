// The renewal job: it renews what is due, throws only when it cannot leave
// the next run waiting, and a chain check restarts it. Database and service mocked.
jest.mock("@saroh/database", () => {
    const actual = jest.requireActual("@saroh/database");
    return {
        ...actual,
        prisma: {
            customerSubscription: { findMany: jest.fn() },
            job: { create: jest.fn(), count: jest.fn() },
            $queryRaw: jest.fn(),
        },
    };
});

import { Logger } from "@nestjs/common";
import { Prisma, prisma } from "@saroh/database";

import { fakePaymentsRow } from "../../../test/fixtures/pricing-catalog";
import { planMeter } from "../billing/metering.service";

import {
    RENEW_BATCH,
    RENEW_EVERY_MS,
    SUBSCRIPTION_RENEW_TYPE,
    SubscriptionRenewHandler,
} from "./subscription-renew.handler";
import type { SubscriptionsService } from "./subscriptions.service";

/** Only a business that may be charged renews (#921). */
const CHARGEABLE = {
    lifecycleStatus: { in: ["ACTIVE", "SUSPENDED"] },
};

const findMany = prisma.customerSubscription.findMany as jest.Mock;
const jobCreate = prisma.job.create as jest.Mock;
const jobCount = prisma.job.count as jest.Mock;
const queryRaw = prisma.$queryRaw as unknown as jest.Mock;

const renewOne = jest.fn();
const renewEarlyOne = jest.fn();
const handler = new SubscriptionRenewHandler({
    renewOne,
    renewEarlyOne,
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
    queryRaw.mockResolvedValue([]);
    jobCreate.mockResolvedValue({});
    renewOne.mockResolvedValue("renewed");
});

afterEach(() => jest.useRealTimers());

describe("subscription.renew", () => {
    it("asks for due subscriptions with Payments on, any set to end, and pauses that have ended", async () => {
        const now = new Date("2026-10-01T02:00:00Z");
        await handler.handle(JOB);
        expect(findMany).toHaveBeenCalledWith(
            expect.objectContaining({
                where: {
                    OR: [
                        {
                            currentPeriodEnd: { lte: now },
                            status: "ACTIVE",
                            organization: {
                                // A closing or deleted business renews
                                // nothing (#921).
                                ...CHARGEABLE,
                                organizationModules: {
                                    none: {
                                        moduleKey: "PAYMENTS",
                                        status: { not: "ENABLED" },
                                    },
                                },
                            },
                        },
                        {
                            currentPeriodEnd: { lte: now },
                            status: { in: ["ACTIVE", "PAUSED"] },
                            cancelAtPeriodEnd: true,
                        },
                        // D8: a pause whose end date has come.
                        {
                            status: "PAUSED",
                            pausedUntil: { lte: now },
                            organization: CHARGEABLE,
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

    it("renews on a plan without online payments: subscriptions a business already has never ask the plan", async () => {
        // The business's plan leaves `payments` and `subscriptions` off
        // (`billing/online-payments-plan.ts`): new ones stop, these go on.
        const enforcedRow = jest
            .spyOn(planMeter, "enforcedRow")
            .mockImplementation((_org: string, moduleId: string) =>
                Promise.resolve(
                    fakePaymentsRow(
                        "free",
                        moduleId as "payments" | "subscriptions",
                    ),
                ),
            );
        const assertIncluded = jest.spyOn(planMeter, "assertIncluded");
        findMany.mockResolvedValue([
            { id: "sub_1", organizationId: "org_free" },
            { id: "sub_2", organizationId: "org_free" },
        ]);

        await handler.handle(JOB);

        expect(renewOne.mock.calls.map((c) => c[0])).toEqual([
            "sub_1",
            "sub_2",
        ]);
        expect(enforcedRow).not.toHaveBeenCalled();
        expect(assertIncluded).not.toHaveBeenCalled();
        enforcedRow.mockRestore();
        assertIncluded.mockRestore();
    });

    it("counts a period left uncharged by skips in the run's log", async () => {
        findMany.mockResolvedValue([
            { id: "sub_1", organizationId: "org_1" },
            { id: "sub_2", organizationId: "org_1" },
        ]);
        renewOne
            .mockResolvedValueOnce("uncharged")
            .mockResolvedValueOnce("renewed");
        const log = jest
            .spyOn(Logger.prototype, "log")
            .mockImplementation(() => undefined);

        await handler.handle(JOB);
        expect(log).toHaveBeenCalledWith(
            expect.stringContaining('"renewed":1,"advanced":0,"uncharged":1'),
        );
        log.mockRestore();
    });

    it("counts pauses it resumed, and ones Payments being off kept paused (D8)", async () => {
        findMany.mockResolvedValue([
            { id: "sub_1", organizationId: "org_1" },
            { id: "sub_2", organizationId: "org_2" },
        ]);
        renewOne
            .mockResolvedValueOnce("resumed")
            .mockResolvedValueOnce("refused");
        const log = jest
            .spyOn(Logger.prototype, "log")
            .mockImplementation(() => undefined);

        await handler.handle(JOB);
        expect(log).toHaveBeenCalledWith(
            expect.stringContaining('"resumed":1,"refused":1'),
        );
        log.mockRestore();
    });

    it("leaves out pauses already refused for Payments being off (review S-4)", async () => {
        const now = new Date("2026-10-01T02:00:00Z");
        queryRaw.mockResolvedValueOnce([
            { id: "parked_1" },
            { id: "parked_2" },
        ]);
        await handler.handle(JOB);
        // Once for the refused pauses; the second is D13B's early pass.
        expect(queryRaw).toHaveBeenCalledTimes(2);
        const ors = findMany.mock.calls[0]![0].where.OR;
        expect(ors[2]).toEqual({
            status: "PAUSED",
            pausedUntil: { lte: now },
            id: { notIn: ["parked_1", "parked_2"] },
            organization: CHARGEABLE,
        });
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

    it("invoices early the renewals that charge on the renewal date (D13B), one failing never stopping the rest", async () => {
        queryRaw
            .mockResolvedValueOnce([])
            .mockResolvedValueOnce([{ id: "early_1" }, { id: "early_2" }]);
        renewEarlyOne
            .mockRejectedValueOnce(new Error("deadlock"))
            .mockResolvedValueOnce("issued");
        const error = jest
            .spyOn(Logger.prototype, "error")
            .mockImplementation(() => undefined);
        await handler.handle(JOB);
        expect(renewEarlyOne.mock.calls.map((c) => c[0])).toEqual([
            "early_1",
            "early_2",
        ]);
        expect(error).toHaveBeenCalledWith(
            expect.stringContaining("early_1 was not invoiced early"),
        );
        expect(jobCreate).toHaveBeenCalled();
        error.mockRestore();
    });

    it("a failed early pass still leaves the next run waiting", async () => {
        queryRaw
            .mockResolvedValueOnce([])
            .mockRejectedValueOnce(new Error("connection refused"));
        const error = jest
            .spyOn(Logger.prototype, "error")
            .mockImplementation(() => undefined);
        await expect(handler.handle(JOB)).resolves.toBeUndefined();
        expect(jobCreate).toHaveBeenCalled();
        error.mockRestore();
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
