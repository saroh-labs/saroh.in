import { describe, expect, it } from "vitest";

import { bookingLanes } from "./diary-lanes";

const b = (key: string, start: number, end: number) => ({ key, start, end });

describe("bookingLanes", () => {
    it("keeps bookings that don't overlap in one lane", () => {
        const lanes = bookingLanes(
            [b("a", 540, 600), b("b", 600, 660), b("c", 700, 760)],
            0,
        );
        expect(Array.from(lanes.values())).toEqual([
            { lane: 0, lanes: 1 },
            { lane: 0, lanes: 1 },
            { lane: 0, lanes: 1 },
        ]);
    });

    it("puts overlapping bookings side by side, and only their cluster splits", () => {
        // 09:30–10:30 and 09:30–10:15 overlap; 11:00 stands alone.
        const lanes = bookingLanes(
            [b("asha", 570, 630), b("meera", 570, 615), b("later", 660, 720)],
            0,
        );
        expect(lanes.get("asha")).toEqual({ lane: 0, lanes: 2 });
        expect(lanes.get("meera")).toEqual({ lane: 1, lanes: 2 });
        expect(lanes.get("later")).toEqual({ lane: 0, lanes: 1 });
    });

    it("reuses a lane once it frees up inside a cluster", () => {
        const lanes = bookingLanes(
            [b("long", 540, 720), b("one", 540, 600), b("two", 600, 660)],
            0,
        );
        expect(lanes.get("long")).toEqual({ lane: 0, lanes: 2 });
        expect(lanes.get("one")).toEqual({ lane: 1, lanes: 2 });
        expect(lanes.get("two")).toEqual({ lane: 1, lanes: 2 });
    });

    it("counts a short booking at its drawn length, so it never covers the next", () => {
        // 15 minutes drawn at 28: the booking at 09:15 would sit under it.
        const lanes = bookingLanes(
            [b("short", 540, 555), b("next", 555, 600)],
            28,
        );
        expect(lanes.get("short")).toEqual({ lane: 0, lanes: 2 });
        expect(lanes.get("next")).toEqual({ lane: 1, lanes: 2 });
        // Long enough already: no split.
        const fine = bookingLanes([b("a", 540, 570), b("c", 570, 600)], 28);
        expect(fine.get("c")).toEqual({ lane: 0, lanes: 1 });
    });
});
