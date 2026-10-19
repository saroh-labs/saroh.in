import { describe, expect, it } from "vitest";

import {
    comingExtra,
    comingOff,
    severalStart,
    usualDay,
    weekRows,
} from "./hours-view";
import type { StaffView, TimeOff, WeeklyRange } from "./types";

const IST = "Asia/Kolkata";
const TODAY = "2026-10-19";

function person(
    over: Partial<StaffView> & { id: string; name: string },
): StaffView {
    return {
        title: null,
        status: "ACTIVE",
        membership: null,
        serviceIds: [],
        hours: [],
        weeklyMinutes: 0,
        extraHours: [],
        timeOff: [],
        ...over,
    };
}

/** All of a local day in IST, as the API stores it. */
function dayOff(id: string, date: string, reason: string | null): TimeOff {
    const start = new Date(`${date}T00:00:00+05:30`);
    return {
        id,
        startAt: start.toISOString(),
        endAt: new Date(start.getTime() + 86_400_000).toISOString(),
        allDay: true,
        reason,
    };
}

const LUNCH_WEEK: WeeklyRange[] = [1, 2, 3, 4, 5].flatMap((dayOfWeek) => [
    { dayOfWeek, startMinute: 540, endMinute: 780 },
    { dayOfWeek, startMinute: 900, endMinute: 1140 },
]);

describe("the week's rows", () => {
    it("are one person's days, Monday first", () => {
        const rows = weekRows([{ name: "Meera", hours: LUNCH_WEEK }], false);
        expect(rows.map((r) => r.day)).toEqual([1, 2, 3, 4, 5, 6, 0]);
        expect(rows[0]).toEqual({
            day: 1,
            main: "9 am to 7 pm",
            sub: "Lunch 1 to 3 pm",
        });
        expect(rows[6]).toEqual({ day: 0, main: "Closed", sub: null });
    });

    it("are everyone's together, with who works each day", () => {
        const rows = weekRows(
            [
                { name: "Meera Iyer", hours: LUNCH_WEEK },
                {
                    name: "Arjun Rao",
                    hours: [{ dayOfWeek: 6, startMinute: 600, endMinute: 840 }],
                },
            ],
            true,
        );
        expect(rows[0]?.sub).toBe("Meera");
        expect(rows[5]).toEqual({
            day: 6,
            main: "10 am to 2 pm",
            sub: "Arjun",
        });
    });
});

describe("time off and extra hours coming up", () => {
    it("lists the people's and the business's, soonest first, past days left out", () => {
        const meera = person({
            id: "st_m",
            name: "Meera Iyer",
            timeOff: [
                dayOff("t_old", "2026-10-01", "Leave"),
                dayOff("t1", "2026-10-27", "Leave"),
            ],
        });
        const items = comingOff(
            [meera],
            [dayOff("c1", "2026-10-21", "Diwali")],
            IST,
            TODAY,
        );
        expect(items.map((i) => [i.line.ids[0], i.staffId, i.who])).toEqual([
            ["c1", null, null],
            ["t1", "st_m", "Meera Iyer"],
        ]);
    });

    it("counts what is booked in extra hours, or says it couldn't", () => {
        const arjun = person({
            id: "st_a",
            name: "Arjun",
            extraHours: [
                {
                    id: "x0",
                    date: "2026-10-01",
                    startMinute: 840,
                    endMinute: 1020,
                },
                {
                    id: "x1",
                    date: "2026-10-24",
                    startMinute: 840,
                    endMinute: 1020,
                },
            ],
        });
        expect(
            comingExtra([arjun], { "st_a|2026-10-24": 3 }, TODAY).map((i) => [
                i.x.id,
                i.booked,
            ]),
        ).toEqual([["x1", 3]]);
        expect(comingExtra([arjun], null, TODAY)[0]?.booked).toBeNull();
    });
});

describe("where Change several days starts", () => {
    it("from the person's usual day, or 9 am to 6 pm", () => {
        expect(usualDay(LUNCH_WEEK)).toEqual({
            open: true,
            opens: 540,
            closes: 1140,
            lunch: { from: 780, to: 900 },
        });
        expect(usualDay([])).toEqual({
            open: true,
            opens: 540,
            closes: 1080,
            lunch: null,
        });
    });

    it("picks the weekdays, the weekend with no lunch, or nothing", () => {
        expect(severalStart("weekdays", LUNCH_WEEK).days).toEqual([
            1, 2, 3, 4, 5,
        ]);
        expect(severalStart("weekend", LUNCH_WEEK)).toEqual({
            days: [6, 0],
            choice: { open: true, opens: 540, closes: 1140, lunch: null },
        });
        expect(severalStart("choose", LUNCH_WEEK).days).toEqual([]);
    });
});
