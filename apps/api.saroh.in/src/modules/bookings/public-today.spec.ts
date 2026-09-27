import type { PublicOpeningDay } from "../sites/public-visit.service";
import type { PublicDays } from "./public-booking-page";
import type { TodayItem } from "./public-today";
import { closedDates, pickToday, TODAY_ITEMS, todayRows } from "./public-today";

/**
 * On today (G18): the rows are the booking page's own starts for today,
 * listed as they come back, and the closed days that keep "opens …" true.
 */

const HATHA = { id: "svc_hatha", name: "Hatha", durationMinutes: 60 };
const PT = { id: "svc_pt", name: "Personal training", durationMinutes: 45 };

function days(
    kind: "one" | "class",
    starts: {
        startAt: string;
        placesLeft?: number | null;
        staffName?: string;
    }[],
    date = "2026-09-18",
    timezone = "Asia/Kolkata",
): PublicDays {
    return {
        timezone,
        kind,
        capacity: kind === "class" ? 12 : 1,
        days: [
            {
                date,
                open: true,
                starts: starts.map((s) => ({
                    startAt: s.startAt,
                    endAt: s.startAt,
                    staffId: "st_1",
                    staffName: s.staffName ?? "Karan",
                    placesLeft: s.placesLeft ?? null,
                })),
            },
        ],
    };
}

function row(over: Partial<TodayItem>): TodayItem {
    return {
        kind: "one",
        serviceId: PT.id,
        serviceName: PT.name,
        durationMinutes: 45,
        startAt: "2026-09-18T05:30:00.000Z",
        date: "2026-09-18",
        time: "11:00",
        staffName: "Karan",
        placesLeft: null,
        ...over,
    };
}

describe("todayRows", () => {
    it("lists a class at 11:00 with 3 places as 11:00 Hatha, 3 left", () => {
        // 11:00 in Bengaluru is 05:30 UTC.
        const rows = todayRows(
            HATHA,
            days("class", [
                { startAt: "2026-09-18T05:30:00.000Z", placesLeft: 3 },
            ]),
            "2026-09-18",
        );
        expect(rows).toEqual([
            {
                kind: "class",
                serviceId: HATHA.id,
                serviceName: "Hatha",
                durationMinutes: 60,
                startAt: "2026-09-18T05:30:00.000Z",
                date: "2026-09-18",
                time: "11:00",
                staffName: "Karan",
                placesLeft: 3,
            },
        ]);
    });

    it("shows 10:15 when the booking page offers 10:15 — no rounding", () => {
        const rows = todayRows(
            PT,
            days("one", [{ startAt: "2026-09-18T04:45:00.000Z" }]),
            "2026-09-18",
        );
        expect(rows[0]).toMatchObject({ time: "10:15", placesLeft: null });
    });

    it("keeps a full class as Full (0 left), as the design lists it", () => {
        const rows = todayRows(
            HATHA,
            days("class", [
                { startAt: "2026-09-18T12:30:00.000Z", placesLeft: 0 },
            ]),
            "2026-09-18",
        );
        expect(rows[0]).toMatchObject({ time: "18:00", placesLeft: 0 });
    });

    it("reads nothing from another day", () => {
        expect(
            todayRows(
                PT,
                days(
                    "one",
                    [{ startAt: "2026-09-19T04:30:00.000Z" }],
                    "2026-09-19",
                ),
                "2026-09-18",
            ),
        ).toEqual([]);
    });

    it("writes the day and time in the business's zone, not UTC", () => {
        // 23:30 UTC on the 17th is 05:00 on the 18th in Bengaluru.
        const rows = todayRows(
            PT,
            days("one", [{ startAt: "2026-09-17T23:30:00.000Z" }]),
            "2026-09-18",
        );
        expect(rows[0]).toMatchObject({ date: "2026-09-18", time: "05:00" });
    });
});

describe("pickToday", () => {
    it("lists soonest first, at most four", () => {
        const rows = [
            "2026-09-18T08:00:00.000Z",
            "2026-09-18T05:00:00.000Z",
            "2026-09-18T07:00:00.000Z",
            "2026-09-18T06:00:00.000Z",
            "2026-09-18T09:00:00.000Z",
        ].map((startAt) => row({ startAt }));
        const picked = pickToday(rows);
        expect(picked).toHaveLength(TODAY_ITEMS);
        expect(picked.map((r) => r.startAt)).toEqual([
            "2026-09-18T05:00:00.000Z",
            "2026-09-18T06:00:00.000Z",
            "2026-09-18T07:00:00.000Z",
            "2026-09-18T08:00:00.000Z",
        ]);
    });

    it("says a free time once, however many services are free then", () => {
        const at = "2026-09-18T05:00:00.000Z";
        const picked = pickToday([
            row({ startAt: at }),
            row({ startAt: at, serviceId: "svc_other" }),
        ]);
        expect(picked).toHaveLength(1);
        expect(picked[0]!.serviceId).toBe(PT.id);
    });

    it("puts a class before a free slot at the same minute, and keeps both", () => {
        const at = "2026-09-18T05:00:00.000Z";
        const picked = pickToday([
            row({ startAt: at }),
            row({ startAt: at, kind: "class", serviceId: HATHA.id }),
        ]);
        expect(picked.map((r) => r.kind)).toEqual(["class", "one"]);
    });

    it("is empty after closing: nothing left today", () => {
        expect(pickToday([])).toEqual([]);
    });
});

describe("closedDates", () => {
    const week: PublicOpeningDay[] = (
        ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"] as const
    ).map((day) => ({
        day,
        open: "09:00",
        close: "19:00",
        closed: day === "SUN",
    }));
    // Friday 18 Sep 2026, 10:00 in Bengaluru.
    const now = new Date("2026-09-18T04:30:00.000Z");
    const zone = "Asia/Kolkata";

    it("names a day a closure covers from open to close (E3)", () => {
        // Closed all of Saturday 19 Sep, local midnight to midnight.
        const closure = {
            startAt: new Date("2026-09-18T18:30:00.000Z"),
            endAt: new Date("2026-09-19T18:30:00.000Z"),
        };
        expect(closedDates(week, [closure], zone, now)).toEqual(["2026-09-19"]);
    });

    it("leaves a day with an afternoon closure open", () => {
        const closure = {
            startAt: new Date("2026-09-19T08:30:00.000Z"),
            endAt: new Date("2026-09-19T10:30:00.000Z"),
        };
        expect(closedDates(week, [closure], zone, now)).toEqual([]);
    });

    it("says nothing without hours or closures", () => {
        expect(closedDates(null, [], zone, now)).toEqual([]);
        expect(closedDates(week, [], zone, now)).toEqual([]);
    });
});
