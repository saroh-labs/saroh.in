import { BadRequestException } from "@nestjs/common";

import type { PublicDays } from "./public-booking-page";
import {
    sortSessions,
    TIMETABLE_MAX_IDS,
    timetableIds,
    timetableRows,
} from "./public-timetable";

/**
 * The Timetable block's read (industry templates U2): the sessions are the
 * booking page's own for the week, Full included, in the business's zone.
 */

const STRENGTH = { id: "svc_strength", name: "Strength", durationMinutes: 45 };

function week(
    days: { date: string; starts: { startAt: string; placesLeft: number }[] }[],
): PublicDays {
    return {
        timezone: "Asia/Kolkata",
        kind: "class",
        capacity: 12,
        days: days.map((d) => ({
            date: d.date,
            open: true,
            starts: d.starts.map((s) => ({
                startAt: s.startAt,
                endAt: s.startAt,
                staffId: "st_1",
                staffName: "Meera",
                placesLeft: s.placesLeft,
            })),
        })),
    };
}

describe("timetableRows", () => {
    it("lists every session of the week, Full ones too, in the business's zone", () => {
        const rows = timetableRows(
            STRENGTH,
            week([
                {
                    date: "2026-10-06",
                    // 07:00 in Bengaluru is 01:30 UTC.
                    starts: [
                        { startAt: "2026-10-06T01:30:00.000Z", placesLeft: 4 },
                    ],
                },
                {
                    date: "2026-10-07",
                    starts: [
                        { startAt: "2026-10-07T12:30:00.000Z", placesLeft: 0 },
                    ],
                },
            ]),
        );
        expect(rows).toEqual([
            {
                serviceId: STRENGTH.id,
                serviceName: "Strength",
                durationMinutes: 45,
                startAt: "2026-10-06T01:30:00.000Z",
                date: "2026-10-06",
                time: "07:00",
                staffName: "Meera",
                placesLeft: 4,
                capacity: 12,
            },
            expect.objectContaining({
                date: "2026-10-07",
                time: "18:00",
                placesLeft: 0,
            }),
        ]);
    });

    it("never reports fewer than no places", () => {
        const rows = timetableRows(
            STRENGTH,
            week([
                {
                    date: "2026-10-06",
                    starts: [
                        { startAt: "2026-10-06T01:30:00.000Z", placesLeft: -2 },
                    ],
                },
            ]),
        );
        expect(rows[0]!.placesLeft).toBe(0);
    });

    it("carries display names only, never an id for a person (ADR-008)", () => {
        const rows = timetableRows(
            STRENGTH,
            week([
                {
                    date: "2026-10-06",
                    starts: [
                        { startAt: "2026-10-06T01:30:00.000Z", placesLeft: 1 },
                    ],
                },
            ]),
        );
        expect(JSON.stringify(rows)).not.toMatch(/staffId|organizationId/);
    });
});

describe("sortSessions", () => {
    it("is soonest first, then by name at the same minute", () => {
        const at = "2026-10-06T01:30:00.000Z";
        const base = timetableRows(
            STRENGTH,
            week([
                {
                    date: "2026-10-06",
                    starts: [{ startAt: at, placesLeft: 1 }],
                },
            ]),
        )[0]!;
        const sorted = sortSessions([
            { ...base, startAt: "2026-10-06T05:00:00.000Z" },
            { ...base, serviceName: "Yoga" },
            { ...base, serviceName: "Barre" },
        ]);
        expect(sorted.map((s) => s.serviceName)).toEqual([
            "Barre",
            "Yoga",
            "Strength",
        ]);
    });
});

describe("timetableIds", () => {
    it("reads one comma list, trimmed and without repeats", () => {
        expect(timetableIds(" a, b ,a,,")).toEqual(["a", "b"]);
        expect(timetableIds(undefined)).toEqual([]);
        expect(timetableIds("")).toEqual([]);
    });

    it("refuses a repeated parameter and more than the cap", () => {
        expect(() => timetableIds(["a", "b"])).toThrow(BadRequestException);
        expect(() =>
            timetableIds(
                Array.from(
                    { length: TIMETABLE_MAX_IDS + 1 },
                    (_, i) => `s${i}`,
                ).join(","),
            ),
        ).toThrow(BadRequestException);
    });
});
