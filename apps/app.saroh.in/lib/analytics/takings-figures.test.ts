import { describe, expect, it } from "vitest";

import { compareSpans, shares, takingsFigures } from "./takings-figures";
import { takingsRead } from "./takings.fixture";

// Twelve weeks from 6 Jul: the last four are 31 Aug – 27 Sep, the four
// before them 3 Aug – 30 Aug.
const STEADY = [
    10_000, 12_000, 11_000, 9_000, 10_000, 10_000, 10_000, 10_000, 11_000,
    12_000, 15_000, 9_000,
];

describe("takingsFigures", () => {
    it("works out the windows, the change, the best, the usual and the quietest week", () => {
        const f = takingsFigures(takingsRead(STEADY));
        expect(f.state).toBe("SALES");
        expect(f.twelve).toEqual({ from: "2026-07-06", to: "2026-09-27" });
        expect(f.last4).toMatchObject({
            from: "2026-08-31",
            to: "2026-09-27",
            takingsMinor: 4_700_000,
        });
        expect(f.prior4).toMatchObject({
            from: "2026-08-03",
            to: "2026-08-30",
            takingsMinor: 4_000_000,
        });
        // 47,000 against 40,000: 17.5% rounds to 18.
        expect(f.change).toEqual({ kind: "UP", percent: 18 });
        expect(f.best).toEqual({
            start: "2026-09-14",
            end: "2026-09-20",
            takingsMinor: 1_500_000,
        });
        expect(f.weeksOnRecord).toBe(12);
        // 129,000 over twelve weeks is 10,750 a week; 15,000 is 40% above.
        expect(f.usualMinor).toBe(1_075_000);
        expect(f.bestAboveUsual).toBe(40);
        // Two weeks took 9,000; the earlier one is named.
        expect(f.quietest?.start).toBe("2026-07-27");
        expect(f.lastWeek).toMatchObject({ start: "2026-09-21" });
        expect(f.lastFollowsBest).toBe(true);
        expect(f.lastIsBest).toBe(false);
        expect(f.lastBelowBest).toBe(40);
    });

    it("marks only the best week and bands the rest, darker for higher", () => {
        const f = takingsFigures(takingsRead(STEADY));
        expect(f.bars.filter((b) => b.peak).map((b) => b.start)).toEqual([
            "2026-09-14",
        ]);
        const peak = f.bars[10];
        expect(peak).toMatchObject({ heightPercent: 100, band: 1 });
        // 9,000 of 15,000 is 60%: the middle band.
        expect(f.bars[11]).toMatchObject({ heightPercent: 60, band: 2 });
        const low = takingsFigures(
            takingsRead([...STEADY.slice(0, 11), 1_000]),
        );
        expect(low.bars[11].band).toBe(3);
    });

    it("calls a change that rounds to nothing level, never growth", () => {
        const f = takingsFigures(
            takingsRead([
                ...STEADY.slice(0, 4),
                10_000,
                10_000,
                10_000,
                10_000,
                10_010,
                9_990,
                10_000,
                10_020,
            ]),
        );
        expect(f.change).toEqual({ kind: "LEVEL" });
    });

    it("has no baseline when the business was not taking money for all of the four weeks before", () => {
        const f = takingsFigures(
            takingsRead(
                [0, 0, 0, 0, 0, 0, 5_000, 6_000, 7_000, 8_000, 9_000, 9_500],
                {
                    firstSaleOn: "2026-08-19",
                },
            ),
        );
        expect(f.change).toEqual({ kind: "FIRST_WEEKS" });
        // On record from the week of 17 Aug, the week the first sale fell in.
        expect(f.weeksOnRecord).toBe(6);
        expect(f.bars[5].onRecord).toBe(false);
        expect(f.bars[6].onRecord).toBe(true);
        // The usual week is the six on record, not twelve with six empty.
        expect(f.usualMinor).toBe(
            Math.round(((5 + 6 + 7 + 8 + 9 + 9.5) * 100_000) / 6),
        );
        expect(f.quietest?.start).toBe("2026-08-17");
    });

    it("has no baseline when the four weeks before held too few payments", () => {
        const f = takingsFigures(
            takingsRead(STEADY, {
                orders: [3, 3, 3, 3, 1, 0, 1, 0, 3, 3, 3, 3],
            }),
        );
        expect(f.change).toEqual({ kind: "THIN" });
        expect(
            compareSpans(
                {
                    takingsMinor: 1,
                    orderTakingsMinor: 1,
                    orders: 3,
                    payments: 3,
                },
                {
                    takingsMinor: 0,
                    orderTakingsMinor: 0,
                    orders: 3,
                    payments: 3,
                },
                true,
            ),
        ).toEqual({ kind: "THIN" });
    });

    it("splits the last four weeks by where the money came from, adding up to 100", () => {
        const split = { "location:hill": 6_600, online: 3_400 };
        const f = takingsFigures(
            takingsRead(
                STEADY.map(() => 10_000),
                {
                    split: STEADY.map(() => split),
                },
            ),
        );
        expect(f.places).toEqual([
            {
                key: "location:hill",
                kind: "LOCATION",
                name: "Hill Road",
                takingsMinor: 2_640_000,
                percent: 66,
            },
            {
                key: "online",
                kind: "ONLINE",
                name: null,
                takingsMinor: 1_360_000,
                percent: 34,
            },
        ]);
        expect(shares([1, 1, 1])).toEqual([34, 33, 33]);
        expect(shares([0, 0])).toEqual([0, 0]);
    });

    it("averages the last four weeks' paid orders", () => {
        const f = takingsFigures(
            takingsRead(STEADY, {
                orders: [...Array<number>(8).fill(3), 10, 10, 10, 17],
            }),
        );
        expect(f.last4.orders).toBe(47);
        expect(f.averageOrderMinor).toBe(100_000);
    });

    it("tells a business that never sold from one whose first money came this week", () => {
        const none = takingsFigures(
            takingsRead(Array<number>(12).fill(0), { firstSaleOn: null }),
        );
        expect(none.state).toBe("NO_SALES");
        expect(none.best).toBeNull();
        expect(none.weeksOnRecord).toBe(0);
        expect(none.averageOrderMinor).toBeNull();

        const soon = takingsFigures(
            takingsRead(Array<number>(12).fill(0), {
                firstSaleOn: "2026-09-29",
            }),
        );
        expect(soon.state).toBe("NOT_YET");
    });
});
