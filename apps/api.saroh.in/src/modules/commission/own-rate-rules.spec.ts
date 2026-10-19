/**
 * A business's own rate, its pure rules (DEC-169, #1035): days in India,
 * the floor (its first paid plan), one in force at a time, which payments
 * it prices, and the one way out of NO_RATE. No rate is written here.
 */
import { isLegalLineMove, LINE_STATUSES } from "./commission-rules";
import type { OwnRateWindow } from "./own-rate-rules";
import {
    backPayStatus,
    dayOf,
    dayStart,
    isDay,
    isEmptyWindow,
    isLegalBackPay,
    nextDay,
    ownRateCovers,
    ownRateEndAt,
    ownRateFloor,
    ownRateOverlap,
    ownRateWindowProblem,
} from "./own-rate-rules";

const at = (iso: string) => new Date(iso);

function rate(over: Partial<OwnRateWindow> = {}): OwnRateWindow {
    return {
        id: "r1",
        platformAdminId: "pa-1",
        earnsFrom: dayStart("2026-09-10"),
        until: null,
        ...over,
    };
}

describe("days in India", () => {
    it("reads and writes a day, and knows a real one", () => {
        expect(isDay("2026-09-10")).toBe(true);
        expect(isDay("2026-02-30")).toBe(false);
        expect(isDay("2026-9-10")).toBe(false);
        expect(isDay(20260910)).toBe(false);
        expect(nextDay("2026-12-31")).toBe("2027-01-01");
    });

    it("a day starts at midnight in India, and an instant falls on India's day", () => {
        expect(dayStart("2026-09-10").toISOString()).toBe(
            "2026-09-09T18:30:00.000Z",
        );
        // 20:00 UTC on the 9th is already the 10th in India.
        expect(dayOf(at("2026-09-09T20:00:00Z"))).toBe("2026-09-10");
        expect(dayOf(at("2026-09-09T18:29:59Z"))).toBe("2026-09-09");
        expect(() => dayStart("nope")).toThrow(RangeError);
    });
});

describe("ownRateWindowProblem: the floor is the first paid plan", () => {
    const firstPaidAt = at("2026-09-10T08:00:00Z");

    it("refuses any day for a business that hasn't paid for a plan", () => {
        expect(
            ownRateWindowProblem({
                earnsFrom: "2030-01-01",
                lastDay: null,
                firstPaidAt: null,
                manager: null,
            }),
        ).toMatch(/hasn't paid for a plan yet/);
    });

    it("refuses a day before the first paid plan's day, saying which day", () => {
        expect(
            ownRateWindowProblem({
                earnsFrom: "2026-09-09",
                lastDay: null,
                firstPaidAt,
                manager: null,
            }),
        ).toMatch(
            /^It can earn from 10 Sep\w* 2026 at the earliest, the day of its first paid plan\.$/,
        );
    });

    it("allows that day itself, any later day, and a future day", () => {
        for (const day of ["2026-09-10", "2026-10-01", "2099-01-01"]) {
            expect(
                ownRateWindowProblem({
                    earnsFrom: day,
                    lastDay: null,
                    firstPaidAt,
                    manager: null,
                }),
            ).toBeNull();
        }
    });

    it("refuses a last day before the first, and days not written as days", () => {
        expect(
            ownRateWindowProblem({
                earnsFrom: "2026-10-01",
                lastDay: "2026-09-30",
                firstPaidAt,
                manager: null,
            }),
        ).toMatch(/last day comes before/);
        expect(
            ownRateWindowProblem({
                earnsFrom: "2026-10-01",
                lastDay: "2026-10-01",
                firstPaidAt,
                manager: null,
            }),
        ).toBeNull();
        expect(
            ownRateWindowProblem({
                earnsFrom: "soon",
                lastDay: null,
                firstPaidAt,
                manager: null,
            }),
        ).toMatch(/Pick the day/);
    });
});

describe("ownRateWindowProblem: never before the manager took it on", () => {
    // Joined 1 Nov on Pro and paid, given Arjun on 1 Jan (owner, 19 Oct).
    const firstPaidAt = at("2026-11-01T06:00:00Z");
    const manager = { name: "Arjun", since: at("2027-01-01T05:00:00Z") };

    it("the floor is the later of the first paid plan and the manager's first day", () => {
        expect(
            ownRateFloor({ firstPaidAt, managerSince: manager.since }),
        ).toEqual({ day: "2027-01-01", by: "manager" });
        expect(
            ownRateFloor({
                firstPaidAt,
                managerSince: at("2026-10-01T05:00:00Z"),
            }),
        ).toEqual({ day: "2026-11-01", by: "first-paid" });
        expect(
            ownRateFloor({ firstPaidAt: null, managerSince: manager.since }),
        ).toBeNull();
    });

    it("refuses November and December, saying when the manager took it on", () => {
        for (const day of ["2026-11-01", "2026-12-31"]) {
            expect(
                ownRateWindowProblem({
                    earnsFrom: day,
                    lastDay: null,
                    firstPaidAt,
                    manager,
                }),
            ).toMatch(
                /^Arjun took it on in Jan\w* 2027\. A rate can start from 1 Jan\w* 2027, the start of that month\.$/,
            );
        }
    });

    it("allows January from its first day", () => {
        for (const day of ["2027-01-01", "2027-01-31"]) {
            expect(
                ownRateWindowProblem({
                    earnsFrom: day,
                    lastDay: null,
                    firstPaidAt,
                    manager,
                }),
            ).toBeNull();
        }
    });

    it("the month counts: a manager added on the 20th earns from the 1st", () => {
        const mid = { name: "Arjun", since: at("2027-01-20T05:00:00Z") };
        expect(ownRateFloor({ firstPaidAt, managerSince: mid.since })).toEqual({
            day: "2027-01-01",
            by: "manager",
        });
        expect(
            ownRateWindowProblem({
                earnsFrom: "2027-01-01",
                lastDay: null,
                firstPaidAt,
                manager: mid,
            }),
        ).toBeNull();
        expect(
            ownRateWindowProblem({
                earnsFrom: "2026-12-31",
                lastDay: null,
                firstPaidAt,
                manager: mid,
            }),
        ).toMatch(/^Arjun took it on in Jan/);
        // 00:30 on 1 Feb in India is still February there.
        expect(
            ownRateFloor({
                firstPaidAt,
                managerSince: at("2027-01-31T19:00:00Z"),
            }),
        ).toEqual({ day: "2027-02-01", by: "manager" });
    });

    it("a manager there before the first paid plan leaves the first paid plan the floor", () => {
        expect(
            ownRateWindowProblem({
                earnsFrom: "2026-10-15",
                lastDay: null,
                firstPaidAt,
                manager: { name: "Arjun", since: at("2026-10-01T05:00:00Z") },
            }),
        ).toMatch(/the day of its first paid plan\.$/);
    });
});

describe("ownRateCovers: precedence for one manager, inside the window", () => {
    it("prices only its manager's payments, from its first day, before its end", () => {
        const r = rate({ until: dayStart("2026-10-01") });
        expect(ownRateCovers(r, "pa-1", dayStart("2026-09-10"))).toBe(true);
        expect(ownRateCovers(r, "pa-1", at("2026-09-30T18:00:00Z"))).toBe(true);
        expect(ownRateCovers(r, "pa-1", dayStart("2026-10-01"))).toBe(false);
        expect(
            ownRateCovers(
                r,
                "pa-1",
                new Date(dayStart("2026-09-10").getTime() - 1),
            ),
        ).toBe(false);
        expect(ownRateCovers(r, "pa-2", dayStart("2026-09-15"))).toBe(false);
        expect(ownRateCovers(rate(), "pa-1", at("2099-01-01T00:00:00Z"))).toBe(
            true,
        );
    });
});

describe("ownRateOverlap: one in force at a time", () => {
    it("ends one that runs past the new start at that start", () => {
        const open = rate({ id: "a" });
        const closedLater = rate({ id: "b", until: dayStart("2026-12-01") });
        const from = dayStart("2026-11-01");
        expect(ownRateOverlap([open, closedLater], from)).toEqual([
            { id: "a", until: from },
            { id: "b", until: from },
        ]);
    });

    it("ends one that starts on or after it before it began; leaves stopped ones", () => {
        const later = rate({ id: "later", earnsFrom: dayStart("2026-11-15") });
        const sameDay = rate({ id: "same", earnsFrom: dayStart("2026-11-01") });
        const stopped = rate({ id: "old", until: dayStart("2026-10-01") });
        const empty = rate({
            id: "empty",
            earnsFrom: dayStart("2026-11-20"),
            until: dayStart("2026-11-20"),
        });
        const from = dayStart("2026-11-01");
        expect(ownRateOverlap([later, sameDay, stopped, empty], from)).toEqual([
            { id: "later", until: dayStart("2026-11-15") },
            { id: "same", until: from },
        ]);
        expect(isEmptyWindow(empty)).toBe(true);
        expect(isEmptyWindow(stopped)).toBe(false);
    });
});

describe("ownRateEndAt", () => {
    const now = at("2026-10-19T06:00:00Z");

    it("ends a running one now, one to come at its start, a stopped one never", () => {
        expect(ownRateEndAt(rate(), now)).toEqual(now);
        const toCome = rate({ earnsFrom: dayStart("2026-11-01") });
        expect(ownRateEndAt(toCome, now)).toEqual(dayStart("2026-11-01"));
        expect(
            ownRateEndAt(rate({ until: dayStart("2026-10-01") }), now),
        ).toBeNull();
        expect(
            ownRateEndAt(rate({ until: dayStart("2026-12-01") }), now),
        ).toEqual(now);
    });
});

describe("the one way out of NO_RATE", () => {
    it("isLegalLineMove still never leaves NO_RATE; isLegalBackPay only to an open state", () => {
        for (const to of LINE_STATUSES) {
            expect(isLegalLineMove("NO_RATE", to)).toBe(to === "NO_RATE");
            expect(isLegalBackPay("NO_RATE", to)).toBe(
                to === "PENDING" || to === "HELD" || to === "PAYABLE",
            );
            for (const from of LINE_STATUSES) {
                if (from !== "NO_RATE") {
                    expect(isLegalBackPay(from, to)).toBe(false);
                }
            }
        }
    });

    it("backPayStatus moves a priced line on as a fresh one, never a refunded one", () => {
        expect(
            backPayStatus({ refund: "none", held: false, periodEnded: true }),
        ).toBe("PAYABLE");
        expect(
            backPayStatus({ refund: "none", held: false, periodEnded: false }),
        ).toBe("PENDING");
        expect(
            backPayStatus({ refund: "wait", held: false, periodEnded: true }),
        ).toBe("PENDING");
        expect(
            backPayStatus({ refund: "none", held: true, periodEnded: true }),
        ).toBe("HELD");
        expect(
            backPayStatus({ refund: "cancel", held: false, periodEnded: true }),
        ).toBeNull();
    });
});
