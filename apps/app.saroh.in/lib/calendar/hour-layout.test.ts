import { describe, expect, it } from "vitest";

import {
    GRID_PX,
    hhmm,
    hourLabels,
    MIN_BLOCK_PX,
    minutesOf,
    placeBlocks,
    workBands,
} from "./hour-layout";

/**
 * The Week hour grid's geometry (plan 005 E27): 06:00–22:00 at 44px an
 * hour, blocks side by side where they overlap, clipped at the edges, and
 * the hours outside working time shaded.
 */

const at = (clock: string, minutes: number) => ({
    start: minutesOf(clock),
    end: minutesOf(clock) + minutes,
});

describe("placeBlocks", () => {
    it("two overlapping 60-minute bookings sit side by side at half width", () => {
        const [a, b] = placeBlocks([at("09:00", 60), at("09:30", 60)]);
        expect(a).toMatchObject({ lane: 0, lanes: 2 });
        expect(b).toMatchObject({ lane: 1, lanes: 2 });
        // 09:00 is three hours down: 132px, less the block's 1px inset.
        expect(a.top).toBe(133);
        expect(a.height).toBe(42);
        expect(b.top).toBe(155);
    });

    it("a booking on its own keeps the whole width, beside an overlapping pair", () => {
        const placed = placeBlocks([
            at("09:00", 60),
            at("09:30", 60),
            at("14:00", 45),
        ]);
        expect(placed[2]).toMatchObject({ lane: 0, lanes: 1 });
    });

    it("a lane freed by an earlier end is taken again within the cluster", () => {
        // 09:00–10:00 and 09:30–11:00 overlap; 10:00–10:30 takes lane 0 back.
        const placed = placeBlocks([
            at("09:00", 60),
            at("09:30", 90),
            at("10:00", 30),
        ]);
        expect(placed.map((p) => [p.lane, p.lanes])).toEqual([
            [0, 2],
            [1, 2],
            [0, 2],
        ]);
    });

    it("back-to-back bookings do not overlap", () => {
        const placed = placeBlocks([at("09:00", 60), at("10:00", 60)]);
        expect(placed.map((p) => p.lanes)).toEqual([1, 1]);
    });

    it("keeps the order given, whatever order they start in", () => {
        const placed = placeBlocks([at("18:00", 60), at("07:00", 60)]);
        expect(placed[0].span.start).toBe(minutesOf("18:00"));
        expect(placed[1].span.start).toBe(minutesOf("07:00"));
    });

    it("a booking starting at 05:30 is clipped to 06:00 and marked as starting earlier", () => {
        const [p] = placeBlocks([at("05:30", 60)]);
        expect(p.startsEarlier).toBe(true);
        expect(p.endsLater).toBe(false);
        expect(p.top).toBe(1);
        // Only 06:00–06:30 is drawn.
        expect(p.height).toBe(20);
    });

    it("a booking past 22:00 is clipped at the bottom and says so", () => {
        const [p] = placeBlocks([at("21:30", 60)]);
        expect(p.endsLater).toBe(true);
        expect(p.top + p.height).toBeLessThanOrEqual(GRID_PX);
    });

    it("a booking wholly after 22:00 sits against the bottom edge", () => {
        const [p] = placeBlocks([at("22:30", 30)]);
        expect(p.endsLater).toBe(true);
        expect(p.top).toBe(GRID_PX - MIN_BLOCK_PX);
    });

    it("a short booking is at least tall enough for its time", () => {
        const [p] = placeBlocks([at("09:00", 10)]);
        expect(p.height).toBe(MIN_BLOCK_PX);
    });
});

describe("workBands", () => {
    it("shades before the first stretch and after the last, not between", () => {
        // Vikram: 06:00–10:00 and 17:00–21:00.
        expect(
            workBands([
                { startMinute: 360, endMinute: 600 },
                { startMinute: 1020, endMinute: 1260 },
            ]),
        ).toEqual([{ top: 15 * 44, height: 44 }]);
    });

    it("shades both ends of a day worked 09:00–13:00", () => {
        expect(workBands([{ startMinute: 540, endMinute: 780 }])).toEqual([
            { top: 0, height: 3 * 44 },
            { top: 7 * 44, height: 9 * 44 },
        ]);
    });

    it("nobody at work is null, for the caller to stripe", () => {
        expect(workBands([])).toBeNull();
    });
});

describe("labels and clocks", () => {
    it("labels 07:00 to 21:00, each at its line", () => {
        const labels = hourLabels();
        expect(labels[0]).toEqual({ text: "07:00", top: 38 });
        expect(labels.at(-1)?.text).toBe("21:00");
        expect(labels).toHaveLength(15);
    });

    it("reads and writes a wall clock", () => {
        expect(minutesOf("09:15")).toBe(555);
        expect(hhmm(555)).toBe("09:15");
        expect(hhmm(1470)).toBe("00:30");
    });
});
