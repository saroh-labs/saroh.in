// Time off and closure ranges (E3): whole local days or the same hours on
// each day, in the business's zone, across a DST change, and the refusals.
import { offRangeRefusal, offSpans, spanBounds } from "./off-range";

const iso = (d: Date) => d.toISOString();

describe("offSpans — all day", () => {
    it("covers 2–6 Nov as one span, local midnight to the midnight after", () => {
        const spans = offSpans(
            { fromDate: "2026-11-02", toDate: "2026-11-06" },
            "Asia/Kolkata",
        );
        expect(spans).toHaveLength(1);
        expect(iso(spans[0]!.startAt)).toBe("2026-11-01T18:30:00.000Z");
        expect(iso(spans[0]!.endAt)).toBe("2026-11-06T18:30:00.000Z");
        expect(spans[0]!.allDay).toBe(true);
    });

    it("keeps whole local days over a DST change in a non-India zone", () => {
        // New York falls back on 1 Nov 2026: EDT (−4) to EST (−5).
        const [span] = offSpans(
            { fromDate: "2026-10-31", toDate: "2026-11-02" },
            "America/New_York",
        );
        expect(iso(span!.startAt)).toBe("2026-10-31T04:00:00.000Z");
        expect(iso(span!.endAt)).toBe("2026-11-03T05:00:00.000Z");
        // 3 local days, one of them 25 hours long.
        expect(span!.endAt.getTime() - span!.startAt.getTime()).toBe(
            73 * 3_600_000,
        );
    });

    it("is one day when there is no last day", () => {
        const [span] = offSpans({ fromDate: "2026-11-02" }, "UTC");
        expect(iso(span!.startAt)).toBe("2026-11-02T00:00:00.000Z");
        expect(iso(span!.endAt)).toBe("2026-11-03T00:00:00.000Z");
    });
});

describe("offSpans — part of the day", () => {
    it("repeats 14:00–18:00 on each of 3 days, one span per day", () => {
        const spans = offSpans(
            {
                fromDate: "2026-11-02",
                toDate: "2026-11-04",
                startMinute: 14 * 60,
                endMinute: 18 * 60,
            },
            "Asia/Kolkata",
        );
        expect(spans.map((s) => [iso(s.startAt), iso(s.endAt)])).toEqual([
            ["2026-11-02T08:30:00.000Z", "2026-11-02T12:30:00.000Z"],
            ["2026-11-03T08:30:00.000Z", "2026-11-03T12:30:00.000Z"],
            ["2026-11-04T08:30:00.000Z", "2026-11-04T12:30:00.000Z"],
        ]);
        expect(spans.every((s) => !s.allDay)).toBe(true);
    });

    it("keeps the wall-clock hours either side of a DST change", () => {
        const spans = offSpans(
            {
                fromDate: "2026-10-31",
                toDate: "2026-11-02",
                startMinute: 14 * 60,
                endMinute: 18 * 60,
            },
            "America/New_York",
        );
        expect(spans.map((s) => iso(s.startAt))).toEqual([
            "2026-10-31T18:00:00.000Z",
            "2026-11-01T19:00:00.000Z",
            "2026-11-02T19:00:00.000Z",
        ]);
    });

    it("runs to the end of the day at minute 1440", () => {
        const [span] = offSpans(
            { fromDate: "2026-11-02", startMinute: 20 * 60, endMinute: 1440 },
            "UTC",
        );
        expect(iso(span!.endAt)).toBe("2026-11-03T00:00:00.000Z");
    });
});

describe("offRangeRefusal", () => {
    it.each([
        [{ fromDate: "2026-02-30" }, "fromDate"],
        [{ fromDate: "2026-11-06", toDate: "2026-11-02" }, "toDate"],
        [{ fromDate: "2026-01-01", toDate: "2027-01-02" }, "toDate"],
        [{ fromDate: "2026-11-02", startMinute: 600 }, "endMinute"],
        [{ fromDate: "2026-11-02", endMinute: 600 }, "startMinute"],
        [
            { fromDate: "2026-11-02", startMinute: 1080, endMinute: 840 },
            "endMinute",
        ],
        [
            { fromDate: "2026-11-02", startMinute: 600, endMinute: 600 },
            "endMinute",
        ],
    ])("refuses %j on %s", (range, field) => {
        expect(offRangeRefusal(range)).toMatchObject({ field });
    });

    it("allows a range of a whole year, and a part-day range", () => {
        expect(
            offRangeRefusal({ fromDate: "2026-01-01", toDate: "2026-12-31" }),
        ).toBeNull();
        expect(
            offRangeRefusal({
                fromDate: "2026-11-02",
                toDate: "2026-11-04",
                startMinute: 840,
                endMinute: 1080,
            }),
        ).toBeNull();
    });
});

describe("spanBounds", () => {
    it("is the whole stretch, or null for none", () => {
        expect(spanBounds([])).toBeNull();
        const a = { startAt: new Date(10), endAt: new Date(20) };
        const b = { startAt: new Date(5), endAt: new Date(15) };
        expect(spanBounds([a, b])).toEqual({
            from: new Date(5),
            to: new Date(20),
        });
    });
});
