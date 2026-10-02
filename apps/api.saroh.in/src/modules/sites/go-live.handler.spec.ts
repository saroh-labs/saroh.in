/**
 * The scheduled go-live without a database (DEC-071, T10): the local time a
 * merchant picks becomes the right instant in their zone, the window, how a
 * time is said back, what a job must carry, and that a failure retries until
 * the last attempt, which records "didn't go live" before giving up.
 * What a run does against real rows is `test-release-schedule.db.spec.ts`.
 */
jest.mock("@saroh/database", () => ({
    ...jest.requireActual("@saroh/database"),
    prisma: { $transaction: jest.fn() },
    runInOrgContext: jest.fn((_org: string, fn: () => unknown) => fn()),
}));

import { BadRequestException } from "@nestjs/common";
import type { Job } from "@saroh/database";
import { prisma } from "@saroh/database";

import { GoLiveHandler, payloadOf, SITE_GO_LIVE_TYPE } from "./go-live.handler";
import {
    assertScheduleWindow,
    localTime,
    scheduleInstant,
} from "./test-release-schedule";

const transaction = prisma.$transaction as jest.Mock;

describe("the job type (T10)", () => {
    it("is site.go_live", () => {
        expect(SITE_GO_LIVE_TYPE).toBe("site.go_live");
    });
});

describe("a local date and time, in the business's zone", () => {
    it("reads 18:00 in Asia/Kolkata as 12:30 UTC", () => {
        expect(
            scheduleInstant(
                "2026-10-03",
                "18:00",
                "Asia/Kolkata",
            ).toISOString(),
        ).toBe("2026-10-03T12:30:00.000Z");
    });

    it("keeps the local time across a DST change in Europe/London", () => {
        // Summer time: 18:00 BST is 17:00 UTC.
        expect(
            scheduleInstant(
                "2026-10-24",
                "18:00",
                "Europe/London",
            ).toISOString(),
        ).toBe("2026-10-24T17:00:00.000Z");
        // The clocks went back on 25 October: 18:00 GMT is 18:00 UTC.
        expect(
            scheduleInstant(
                "2026-10-26",
                "18:00",
                "Europe/London",
            ).toISOString(),
        ).toBe("2026-10-26T18:00:00.000Z");
    });

    it("refuses a time the clocks skip, rather than moving it", () => {
        // 29 March 2026, 01:00 → 02:00 in London: 01:30 never happens.
        expect(() =>
            scheduleInstant("2026-03-29", "01:30", "Europe/London"),
        ).toThrow(BadRequestException);
        expect(() =>
            scheduleInstant("2026-03-29", "01:30", "Europe/London"),
        ).toThrow(/clocks go forward/);
    });

    it("takes the first of a time that happens twice", () => {
        // 25 October 2026, 02:00 → 01:00: 01:30 BST is 00:30 UTC.
        expect(
            scheduleInstant(
                "2026-10-25",
                "01:30",
                "Europe/London",
            ).toISOString(),
        ).toBe("2026-10-25T00:30:00.000Z");
    });

    it("refuses a date that doesn't exist", () => {
        expect(() =>
            scheduleInstant("2026-02-30", "10:00", "Asia/Kolkata"),
        ).toThrow(BadRequestException);
    });
});

describe("how far ahead", () => {
    const now = new Date("2026-10-01T10:00:00.000Z");
    const plus = (ms: number) => new Date(now.getTime() + ms);
    const MIN = 60 * 1000;
    const DAY = 24 * 60 * MIN;

    it("takes 5 minutes to 60 days", () => {
        expect(() => assertScheduleWindow(plus(5 * MIN), now)).not.toThrow();
        expect(() => assertScheduleWindow(plus(60 * DAY), now)).not.toThrow();
    });

    it("refuses sooner than 5 minutes, and the past", () => {
        expect(() => assertScheduleWindow(plus(4 * MIN), now)).toThrow(
            /at least 5 minutes/,
        );
        expect(() => assertScheduleWindow(plus(-MIN), now)).toThrow(
            /at least 5 minutes/,
        );
    });

    it("refuses further than 60 days", () => {
        expect(() => assertScheduleWindow(plus(60 * DAY + MIN), now)).toThrow(
            /next 60 days/,
        );
    });
});

describe("a time, said back", () => {
    const now = new Date("2026-10-03T06:00:00.000Z"); // 11:30am in Kolkata

    it("is the clock alone today, in the business's zone", () => {
        expect(
            localTime(
                new Date("2026-10-03T09:40:00.000Z"),
                "Asia/Kolkata",
                now,
            ),
        ).toBe("3:10pm");
    });

    it("names the day on any other day", () => {
        expect(
            localTime(
                new Date("2026-10-02T12:30:00.000Z"),
                "Asia/Kolkata",
                now,
            ),
        ).toBe("Fri 2 Oct, 6:00pm");
    });
});

describe("the payload", () => {
    it("carries a release id and the instant it was queued for", () => {
        expect(
            payloadOf({
                testReleaseId: "rel_1",
                goLiveAt: "2026-10-03T12:30:00.000Z",
            }),
        ).toEqual({
            testReleaseId: "rel_1",
            goLiveAt: "2026-10-03T12:30:00.000Z",
        });
    });

    it.each([
        null,
        "rel_1",
        {},
        { testReleaseId: "", goLiveAt: "2026-10-03T12:30:00.000Z" },
        { testReleaseId: "rel_1" },
        { testReleaseId: "rel_1", goLiveAt: "soon" },
    ])("names nothing to run for %p", (value) => {
        expect(payloadOf(value)).toBeNull();
    });
});

describe("GoLiveHandler", () => {
    const job = (over: Partial<Job> = {}): Job =>
        ({
            id: "job_1",
            organizationId: "org_1",
            type: SITE_GO_LIVE_TYPE,
            payload: {
                testReleaseId: "rel_1",
                goLiveAt: "2026-10-03T12:30:00.000Z",
            },
            attempts: 0,
            maxAttempts: 5,
            ...over,
        }) as Job;

    beforeEach(() => jest.clearAllMocks());

    it("skips a job that names nothing, without touching the database", async () => {
        await new GoLiveHandler().handle(job({ payload: {} }));
        await new GoLiveHandler().handle(job({ organizationId: null }));
        expect(transaction).not.toHaveBeenCalled();
    });

    it("throws a transient failure so the worker retries it", async () => {
        transaction.mockRejectedValueOnce(new Error("connection reset"));
        await expect(new GoLiveHandler().handle(job())).rejects.toThrow(
            "connection reset",
        );
        // One try, and no "didn't go live" written: there are retries left.
        expect(transaction).toHaveBeenCalledTimes(1);
    });

    it("on the last attempt, records that it didn't go live before giving up", async () => {
        transaction
            .mockRejectedValueOnce(new Error("connection reset"))
            .mockResolvedValueOnce(undefined);
        await expect(
            new GoLiveHandler().handle(job({ attempts: 4 })),
        ).rejects.toThrow("connection reset");
        expect(transaction).toHaveBeenCalledTimes(2);
    });

    it("gives up with the run's own error when recording it fails too", async () => {
        transaction
            .mockRejectedValueOnce(new Error("connection reset"))
            .mockRejectedValueOnce(new Error("still down"));
        await expect(
            new GoLiveHandler().handle(job({ attempts: 4 })),
        ).rejects.toThrow("connection reset");
        expect(transaction).toHaveBeenCalledTimes(2);
    });
});
