/**
 * The period summaries' shared window (14 Nov): named periods and from/to
 * days in the business's calendar, the equal period before, the bars.
 */
import { ToolError } from "../tool-registry";
import { change, resolveSpan, spanLine } from "./period";

// Saturday 14 Nov 2026, 10:00 in Kolkata.
const now = new Date("2026-11-14T04:30:00Z");
const zone = "Asia/Kolkata";

describe("resolveSpan", () => {
    it("reads last_3_months as rolling, ending today, in Asia/Kolkata", () => {
        const s = resolveSpan({ period: "last_3_months" }, now, zone);
        expect([s.firstDay, s.lastDay]).toEqual(["2026-08-15", "2026-11-14"]);
        // 00:00 in Kolkata is 18:30 UTC the day before.
        expect(s.from.toISOString()).toBe("2026-08-14T18:30:00.000Z");
        expect(s.to.toISOString()).toBe("2026-11-14T18:30:00.000Z");
        expect(s.days).toBe(92);
        expect([s.before.firstDay, s.before.lastDay]).toEqual([
            "2026-05-15",
            "2026-08-14",
        ]);
        expect(s.by).toBe("month");
        expect(s.words).toBe("15 Aug to 14 Nov 2026");
    });

    it.each([
        [
            "today",
            "2026-11-14",
            "2026-11-14",
            "2026-11-13",
            "2026-11-13",
            "day",
        ],
        [
            "this_week",
            "2026-11-09",
            "2026-11-15",
            "2026-11-02",
            "2026-11-07",
            "day",
        ],
        [
            "last_week",
            "2026-11-02",
            "2026-11-08",
            "2026-10-26",
            "2026-11-01",
            "day",
        ],
        // So far: 14 days of November against the first 14 of October.
        [
            "this_month",
            "2026-11-01",
            "2026-11-30",
            "2026-10-01",
            "2026-10-14",
            "week",
        ],
        [
            "last_month",
            "2026-10-01",
            "2026-10-31",
            "2026-09-01",
            "2026-09-30",
            "week",
        ],
        [
            "last_6_months",
            "2026-05-15",
            "2026-11-14",
            "2025-11-12",
            "2026-05-14",
            "month",
        ],
        [
            "this_year",
            "2026-01-01",
            "2026-12-31",
            "2025-01-01",
            "2025-11-14",
            "month",
        ],
    ] as const)(
        "%s is %s to %s, before %s to %s, by %s",
        (period, first, last, beforeFirst, beforeLast, by) => {
            const s = resolveSpan({ period }, now, zone);
            expect([s.firstDay, s.lastDay]).toEqual([first, last]);
            expect([s.before.firstDay, s.before.lastDay]).toEqual([
                beforeFirst,
                beforeLast,
            ]);
            expect(s.by).toBe(by);
        },
    );

    it("defaults to this month", () => {
        expect(resolveSpan({}, now, zone).period).toBe("this_month");
    });

    it("takes from and to as days, to defaulting to today", () => {
        const s = resolveSpan(
            { from: "2026-08-01", to: "2026-08-31" },
            now,
            zone,
        );
        expect(s.period).toBe("custom");
        expect([s.firstDay, s.lastDay, s.days]).toEqual([
            "2026-08-01",
            "2026-08-31",
            31,
        ]);
        expect([s.before.firstDay, s.before.lastDay]).toEqual([
            "2026-07-01",
            "2026-07-31",
        ]);
        expect(resolveSpan({ from: "2026-11-01" }, now, zone).lastDay).toBe(
            "2026-11-14",
        );
    });

    it.each([
        [{ to: "2026-11-01" }, /needs from/],
        [{ from: "2026-11-10", to: "2026-11-01" }, /before from/],
        [{ from: "2025-01-01", to: "2026-11-01" }, /longer than a year/],
        [{ from: "1 Nov" }, /not a day/],
        [{ from: "2026-02-30" }, /not a day/],
    ])("refuses %j", (input, message) => {
        expect(() => resolveSpan(input, now, zone)).toThrow(ToolError);
        expect(() => resolveSpan(input, now, zone)).toThrow(message);
    });

    it("states the exact days and the period before", () => {
        const s = resolveSpan({ period: "last_month" }, now, zone);
        expect(spanLine(s, "Orders placed")).toBe(
            "Orders placed, 1 Oct to 31 Oct 2026 (2026-10-01 to 2026-10-31, Asia/Kolkata). Compared with 2026-09-01 to 2026-09-30.",
        );
        expect(spanLine(s, "Invoices issued", false)).not.toContain("Compared");
    });
});

describe("change", () => {
    it("says the change against before in words", () => {
        expect(change(12, 10)).toBe("up 20% on before (10)");
        expect(change(5, 10)).toBe("down 50% on before (10)");
        expect(change(10, 10)).toBe("the same as before");
        expect(change(3, 0)).toBe("none before");
        expect(change(0, 0)).toBe("the same as before");
    });
});
