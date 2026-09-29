import { BadRequestException, ConflictException } from "@nestjs/common";
import type { Prisma } from "@saroh/database";

import { useMembershipInTx } from "./use-membership";

/**
 * Paying a class with a membership reads the period's allowance (D10): the
 * subscription's own classes a month, or — for a row the previous image
 * wrote, never set — the plan's, never unlimited. Mocked transaction; the
 * real rows are in subscriptions/subscription-classes.db.spec.ts.
 */

const findFirst = jest.fn();
const count = jest.fn();
const queryRaw = jest.fn();
const tx = {
    customerSubscription: { findFirst },
    booking: { count },
    $queryRaw: queryRaw,
} as unknown as Prisma.TransactionClient;

const USE = {
    organizationId: "org_1",
    bookingId: "b_new",
    contactId: "c_1",
    subscriptionId: "sub_1",
    startAt: new Date("2026-10-20T05:00:00Z"),
};

function membership(over: Record<string, unknown> = {}) {
    return {
        id: "sub_1",
        contactId: "c_1",
        status: "ACTIVE",
        timezone: "Asia/Kolkata",
        classesPerPeriod: 8,
        classesPerPeriodSetAt: new Date("2026-10-01T00:00:00Z"),
        plan: { name: "Monthly 8", classesPerMonth: 8 },
        ...over,
    };
}

beforeEach(() => {
    jest.clearAllMocks();
    queryRaw.mockResolvedValue([]);
    count.mockResolvedValue(0);
});

describe("a class paid with a membership (D10)", () => {
    it("keeps this period's 8 after the plan moved to 10", async () => {
        findFirst.mockResolvedValue(
            membership({ plan: { name: "Monthly", classesPerMonth: 10 } }),
        );
        count.mockResolvedValue(8);
        await expect(useMembershipInTx(tx, USE)).rejects.toThrow(
            "Monthly includes 8 classes a month, and this month's are used.",
        );
    });

    it("gives 10 once the renewal took them", async () => {
        findFirst.mockResolvedValue(
            membership({
                classesPerPeriod: 10,
                plan: { name: "Monthly", classesPerMonth: 10 },
            }),
        );
        count.mockResolvedValue(8);
        await expect(useMembershipInTx(tx, USE)).resolves.toBeUndefined();
    });

    it("counts nothing when the period has no allowance, even if the plan now has one", async () => {
        findFirst.mockResolvedValue(membership({ classesPerPeriod: null }));
        await expect(useMembershipInTx(tx, USE)).resolves.toBeUndefined();
        expect(count).not.toHaveBeenCalled();
    });

    it("reads the plan's 8 for a row never set, not unlimited", async () => {
        findFirst.mockResolvedValue(
            membership({ classesPerPeriod: null, classesPerPeriodSetAt: null }),
        );
        count.mockResolvedValue(8);
        const attempt = useMembershipInTx(tx, USE);
        await expect(attempt).rejects.toBeInstanceOf(ConflictException);
        await expect(attempt).rejects.toThrow("includes 8 classes a month");
    });

    it("locks the membership before counting", async () => {
        findFirst.mockResolvedValue(membership());
        await useMembershipInTx(tx, USE);
        expect(queryRaw).toHaveBeenCalledTimes(1);
        expect(queryRaw.mock.invocationCallOrder[0]!).toBeLessThan(
            count.mock.invocationCallOrder[0]!,
        );
    });

    it("still refuses a paused membership before any allowance", async () => {
        findFirst.mockResolvedValue(membership({ status: "PAUSED" }));
        await expect(useMembershipInTx(tx, USE)).rejects.toBeInstanceOf(
            BadRequestException,
        );
        expect(count).not.toHaveBeenCalled();
    });
});

describe("a customer booking a class with their membership online (A10)", () => {
    const MINE = { ...USE, actor: "customer" as const };

    it("uses one of the month's classes", async () => {
        findFirst.mockResolvedValue(membership());
        count.mockResolvedValue(7);
        await expect(useMembershipInTx(tx, MINE)).resolves.toBeUndefined();
    });

    it("treats someone else's membership as missing: 404, credit-gone", async () => {
        findFirst.mockResolvedValue(membership({ contactId: "c_other" }));
        await expect(useMembershipInTx(tx, MINE)).rejects.toMatchObject({
            status: 404,
            response: { details: { reason: "credit-gone" } },
        });
    });

    it("never pays a class from a membership with no classes a month", async () => {
        findFirst.mockResolvedValue(membership({ classesPerPeriod: null }));
        await expect(useMembershipInTx(tx, MINE)).rejects.toMatchObject({
            response: {
                message:
                    "Your membership doesn't include classes to book online.",
                details: { reason: "credit-gone" },
            },
        });
    });

    it("says the month's classes are used, in their words", async () => {
        findFirst.mockResolvedValue(membership());
        count.mockResolvedValue(8);
        const attempt = useMembershipInTx(tx, MINE);
        await expect(attempt).rejects.toBeInstanceOf(ConflictException);
        await expect(attempt).rejects.toMatchObject({
            response: {
                message: "Your membership's classes for that month are used.",
                details: { reason: "credit-gone" },
            },
        });
    });

    it("says a paused membership is theirs and paused", async () => {
        findFirst.mockResolvedValue(membership({ status: "PAUSED" }));
        await expect(useMembershipInTx(tx, MINE)).rejects.toThrow(
            "Your membership is paused.",
        );
    });
});
