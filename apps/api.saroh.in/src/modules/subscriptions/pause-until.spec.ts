// A pause with an end date (D8): when it ends, how many days it took, and
// what the job's resume does on that date. Pure, with a jest-mocked
// transaction; the real rows are in subscriptions.db.spec.ts.
import { BadRequestException } from "@nestjs/common";

import {
    pausedDays,
    pausedEventData,
    pauseEnd,
    pauseHasEnded,
    resumeWhenDue,
} from "./pause-until";

const at = (s: string) => new Date(s);

describe("when a pause ends", () => {
    // 1 Oct, 10:00 in Kolkata.
    const now = at("2026-10-01T04:30:00Z");

    it("is the start of the day 2, 4 or 8 weeks on, in the subscription's zone", () => {
        expect(pauseEnd({ weeks: 2 }, now, "Asia/Kolkata")).toEqual(
            at("2026-10-14T18:30:00Z"),
        );
        // 29 Oct, midnight in Kolkata.
        expect(pauseEnd({ weeks: 4 }, now, "Asia/Kolkata")).toEqual(
            at("2026-10-28T18:30:00Z"),
        );
        expect(pauseEnd({ weeks: 8 }, now, "Asia/Kolkata")).toEqual(
            at("2026-11-25T18:30:00Z"),
        );
    });

    it("counts from the business's today, not UTC's", () => {
        // 1 Oct 23:00 UTC is already 2 Oct in Kolkata.
        expect(
            pauseEnd({ weeks: 2 }, at("2026-10-01T23:00:00Z"), "Asia/Kolkata"),
        ).toEqual(at("2026-10-15T18:30:00Z"));
    });

    it("has no end for a pause until someone resumes it, or for an empty body", () => {
        expect(pauseEnd({ until: null }, now, "UTC")).toBeNull();
        expect(pauseEnd({}, now, "UTC")).toBeNull();
    });

    it("takes a day staff name, at the start of it", () => {
        expect(pauseEnd({ until: "2026-10-20" }, now, "Asia/Kolkata")).toEqual(
            at("2026-10-19T18:30:00Z"),
        );
    });

    it("refuses today, a day gone, a day that doesn't exist, more than a year, or both at once", () => {
        const refused = (choice: Parameters<typeof pauseEnd>[0]) => () =>
            pauseEnd(choice, now, "Asia/Kolkata");
        expect(refused({ until: "2026-10-01" })).toThrow(BadRequestException);
        expect(refused({ until: "2026-09-30" })).toThrow("after today");
        expect(refused({ until: "2026-02-30" })).toThrow("doesn't exist");
        expect(refused({ until: "2027-10-03" })).toThrow("a year at most");
        expect(refused({ weeks: 2, until: "2026-10-20" })).toThrow("not both");
        expect(refused({ weeks: 2, until: null })).toThrow("not both");
    });

    it("says the end date in its PAUSED event, or null", () => {
        expect(pausedEventData(at("2026-10-29T00:00:00Z"))).toEqual({
            until: "2026-10-29T00:00:00.000Z",
        });
        expect(pausedEventData(null)).toEqual({ until: null });
    });
});

describe("the days a pause took", () => {
    it("is 28 for 4 weeks, whatever hour it was paused", () => {
        expect(
            pausedDays(
                at("2026-10-01T04:30:00Z"),
                at("2026-10-28T18:30:00Z"),
                "Asia/Kolkata",
            ),
        ).toBe(28);
        expect(
            pausedDays(
                at("2026-10-01T23:59:00Z"),
                at("2026-10-29T00:00:00Z"),
                "UTC",
            ),
        ).toBe(28);
    });

    it("counts whole calendar days across a clock change", () => {
        // New York springs forward on 8 Mar 2026.
        expect(
            pausedDays(
                at("2026-03-01T17:00:00Z"),
                at("2026-03-15T04:00:00Z"),
                "America/New_York",
            ),
        ).toBe(14);
    });
});

describe("the job's resume on the end date", () => {
    const tx = {
        organizationModule: { findFirst: jest.fn() },
        subscriptionEvent: { findFirst: jest.fn(), create: jest.fn() },
    };
    const resume = jest.fn();
    const now = at("2026-10-29T01:00:00Z");

    function paused(over: Record<string, unknown> = {}) {
        return {
            id: "sub_1",
            organizationId: "org_1",
            status: "PAUSED",
            timezone: "UTC",
            pausedAt: at("2026-10-01T10:00:00Z"),
            pausedUntil: at("2026-10-29T00:00:00Z"),
            // Paid to 1 Nov: the pause ends inside it.
            currentPeriodEnd: at("2026-11-01T00:00:00Z"),
            cancelAtPeriodEnd: false,
            ...over,
        };
    }
    const run = (sub: ReturnType<typeof paused>) =>
        resumeWhenDue(tx as never, sub, now, resume);

    beforeEach(() => {
        jest.clearAllMocks();
        tx.organizationModule.findFirst.mockResolvedValue(null);
        tx.subscriptionEvent.findFirst.mockResolvedValue(null);
        resume.mockResolvedValue(undefined);
    });

    it("resumes through the manual resume, as the job, with the 28 days it took", async () => {
        await expect(run(paused())).resolves.toBe("resumed");
        expect(resume).toHaveBeenCalledWith(expect.any(Function), 28);
        // The log it hands over records as the job.
        await resume.mock.calls[0]![0]("RESUMED", {
            data: { extendedDays: 28 },
        });
        expect(tx.subscriptionEvent.create).toHaveBeenCalledWith({
            data: expect.objectContaining({
                kind: "RESUMED",
                actorKind: "JOB",
                actorUserId: null,
                organizationId: "org_1",
                subscriptionId: "sub_1",
            }),
        });
    });

    it("does nothing before the end date, for an open-ended pause, or once resumed", async () => {
        for (const sub of [
            paused({ pausedUntil: at("2026-10-30T00:00:00Z") }),
            paused({ pausedUntil: null }),
            paused({ status: "ACTIVE", pausedAt: null, pausedUntil: null }),
        ]) {
            await expect(run(sub)).resolves.toBe("skipped");
        }
        expect(resume).not.toHaveBeenCalled();
        expect(tx.subscriptionEvent.create).not.toHaveBeenCalled();
    });

    it("still resumes inside the paid period while Payments is off", async () => {
        tx.organizationModule.findFirst.mockResolvedValue({ id: "m_1" });
        await expect(run(paused())).resolves.toBe("resumed");
        expect(resume).toHaveBeenCalledTimes(1);
    });

    it("leaves one that would restart billing paused while Payments is off, and says so once", async () => {
        tx.organizationModule.findFirst.mockResolvedValue({ id: "m_1" });
        const outlasted = paused({
            currentPeriodEnd: at("2026-10-15T00:00:00Z"),
        });
        await expect(run(outlasted)).resolves.toBe("refused");
        expect(resume).not.toHaveBeenCalled();
        expect(tx.subscriptionEvent.create).toHaveBeenCalledTimes(1);
        expect(
            tx.subscriptionEvent.create.mock.calls[0]![0].data,
        ).toMatchObject({
            kind: "RESUME_REFUSED",
            actorKind: "JOB",
            data: {
                until: "2026-10-29T00:00:00.000Z",
                reason: "PAYMENTS_OFF",
            },
        });
        // Asked about this pause only: since it was paused.
        expect(tx.subscriptionEvent.findFirst).toHaveBeenCalledWith({
            where: {
                organizationId: "org_1",
                subscriptionId: "sub_1",
                kind: "RESUME_REFUSED",
                createdAt: { gte: at("2026-10-01T10:00:00Z") },
            },
            select: { id: true },
        });

        // The next hourly run finds it said, and writes nothing.
        tx.subscriptionEvent.create.mockClear();
        tx.subscriptionEvent.findFirst.mockResolvedValue({ id: "ev_1" });
        await expect(run(outlasted)).resolves.toBe("refused");
        expect(tx.subscriptionEvent.create).not.toHaveBeenCalled();
    });

    it("lets one set to end go through with Payments off: it only ends", async () => {
        tx.organizationModule.findFirst.mockResolvedValue({ id: "m_1" });
        await expect(
            run(
                paused({
                    currentPeriodEnd: at("2026-10-15T00:00:00Z"),
                    cancelAtPeriodEnd: true,
                }),
            ),
        ).resolves.toBe("resumed");
        expect(resume).toHaveBeenCalledTimes(1);
    });
});

describe("a pause that has ended", () => {
    const row = {
        id: "sub_1",
        organizationId: "org_1",
        status: "PAUSED",
        timezone: "UTC",
        pausedAt: at("2026-10-01T10:00:00Z"),
        pausedUntil: at("2026-10-29T00:00:00Z"),
        currentPeriodEnd: at("2026-11-01T00:00:00Z"),
        cancelAtPeriodEnd: false,
    };

    it("is paused with an end date on or before now", () => {
        expect(pauseHasEnded(row, at("2026-10-29T00:00:00Z"))).toBe(true);
        expect(pauseHasEnded(row, at("2026-10-28T23:59:59Z"))).toBe(false);
        expect(
            pauseHasEnded(
                { ...row, pausedUntil: null },
                at("2027-01-01T00:00:00Z"),
            ),
        ).toBe(false);
        expect(
            pauseHasEnded(
                { ...row, status: "CANCELLED" },
                at("2027-01-01T00:00:00Z"),
            ),
        ).toBe(false);
    });
});
