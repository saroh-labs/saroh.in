import { BadRequestException } from "@nestjs/common";

import { datesTouched } from "./days-off";
import {
    assertWithinReach,
    rangeWindow,
    reachOf,
    spanOf,
    windowOf,
} from "./range";

/**
 * How far the calendar reads (plan 005 E20): the joined month back, three
 * months on, a range's days in the business's zone — pure, so the edges
 * are tested without a database.
 */

const IST = "Asia/Kolkata";

describe("reachOf", () => {
    it("runs from the joined month's 1st to the end of the third month on", () => {
        expect(reachOf("2026-06-02", "2026-09-20")).toEqual({
            first: "2026-06-01",
            last: "2026-12-31",
        });
    });

    it("crosses a year, and lands on a short month's last day", () => {
        expect(reachOf(null, "2026-11-30")).toEqual({
            first: null,
            last: "2027-02-28",
        });
    });
});

describe("assertWithinReach", () => {
    const reach = reachOf("2026-06-02", "2026-09-20");

    it("lets a range inside, or crossing an edge, through", () => {
        for (const [from, to] of [
            ["2026-06-01", "2026-06-30"],
            ["2026-05-25", "2026-06-07"],
            ["2026-12-28", "2027-01-03"],
        ]) {
            expect(() => assertWithinReach({ from, to }, reach)).not.toThrow();
        }
    });

    it("refuses a range wholly outside, naming the month to open", () => {
        const refused = (from: string, to: string) => {
            try {
                assertWithinReach({ from, to }, reach);
            } catch (e) {
                expect(e).toBeInstanceOf(BadRequestException);
                return (e as BadRequestException).getResponse();
            }
            throw new Error("not refused");
        };
        expect(refused("2026-05-01", "2026-05-31")).toMatchObject({
            details: { reason: "before_joined", month: "2026-06" },
        });
        expect(refused("2027-01-04", "2027-01-10")).toMatchObject({
            details: { reason: "too_far_ahead", month: "2026-12" },
        });
    });
});

describe("spanOf and windows", () => {
    it("a range, and nothing else (the month alias is gone: Z3)", () => {
        expect(spanOf({ from: "2026-09-28", to: "2026-10-04" })).toEqual({
            from: "2026-09-28",
            to: "2026-10-04",
        });
        expect(() => spanOf({})).toThrow("from and to are both needed.");
    });

    it("a range of one day is that day, between its midnights", () => {
        const w = rangeWindow("2026-09-15", "2026-09-15", IST);
        expect(w.days).toEqual(["2026-09-15"]);
        expect(w.start.toISOString()).toBe("2026-09-14T18:30:00.000Z");
        expect(w.end.toISOString()).toBe("2026-09-15T18:30:00.000Z");
    });

    it("a whole month's range is the month's days", () => {
        expect(
            windowOf({ from: "2026-02-01", to: "2026-02-28" }, IST).days,
        ).toHaveLength(28);
    });
});

describe("datesTouched", () => {
    const week = rangeWindow("2026-09-14", "2026-09-20", IST);
    const at = (s: string) => new Date(s);

    it("a whole day ending at midnight is that day alone", () => {
        expect(
            datesTouched(
                at("2026-09-14T18:30:00Z"),
                at("2026-09-15T18:30:00Z"),
                week,
                IST,
            ),
        ).toEqual(["2026-09-15"]);
    });

    it("a stretch running past the window is clipped to it", () => {
        expect(
            datesTouched(
                at("2026-09-18T18:30:00Z"),
                at("2026-09-23T18:30:00Z"),
                week,
                IST,
            ),
        ).toEqual(["2026-09-19", "2026-09-20"]);
    });

    it("one outside the window touches nothing", () => {
        expect(
            datesTouched(
                at("2026-09-21T04:00:00Z"),
                at("2026-09-21T06:00:00Z"),
                week,
                IST,
            ),
        ).toEqual([]);
    });
});
