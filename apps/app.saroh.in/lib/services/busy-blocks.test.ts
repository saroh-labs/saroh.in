import { describe, expect, it } from "vitest";

import { busySpans } from "./busy-blocks";

const Z = "Asia/Kolkata";
// 2026-11-17 in IST: 11:30 is 06:00 UTC.
const at = (hhmm: string) => `2026-11-17T${hhmm}:00.000Z`;
const day = [480, 1140] as const;

describe("busySpans", () => {
    it("reads busy times as minutes on the day, in the business's zone", () => {
        expect(
            busySpans(
                [{ staffId: "a", startAt: at("06:00"), endAt: at("07:00") }],
                null,
                "2026-11-17",
                Z,
                [480, 1140],
            ),
        ).toEqual([[690, 750]]);
    });

    it("merges what touches and clips to the hours drawn", () => {
        expect(
            busySpans(
                [
                    { staffId: "a", startAt: at("06:00"), endAt: at("07:00") },
                    { staffId: "b", startAt: at("06:30"), endAt: at("08:00") },
                    { staffId: "a", startAt: at("00:00"), endAt: at("02:30") },
                ],
                null,
                "2026-11-17",
                Z,
                [480, 1140],
            ),
        ).toEqual([[690, 810]]);
    });

    it("keeps to the people asked for, and never carries a title", () => {
        const only = busySpans(
            [
                { staffId: "a", startAt: at("06:00"), endAt: at("07:00") },
                { staffId: "b", startAt: at("09:00"), endAt: at("10:00") },
            ],
            new Set(["b"]),
            "2026-11-17",
            Z,
            [...day],
        );
        expect(only).toEqual([[870, 930]]);
        expect(JSON.stringify(only)).not.toMatch(/title|summary/i);
    });

    it("draws nothing for another day", () => {
        expect(
            busySpans(
                [{ staffId: "a", startAt: at("06:00"), endAt: at("07:00") }],
                null,
                "2026-11-18",
                Z,
                [480, 1140],
            ),
        ).toEqual([]);
    });
});
