import { describe, expect, it } from "vitest";

import { layersFor } from "./layers";
import type { CalendarDay, CalendarMonth } from "./types";
import { weekDates } from "./week";
import {
    closedDay,
    dayOnWords,
    weekDayList,
    weekTotals,
    weekZone,
} from "./week-days";

/*
 * The Calendar week's words (bookings U14): a week of 19 October 2026 at
 * Kaya Physio, Meera working Monday to Saturday and Arjun Monday to Friday,
 * Diwali closing the Wednesday.
 */

const DATES = weekDates("2026-10-19");
const STAFF = [
    { id: "meera", name: "Meera Iyer", title: null },
    { id: "arjun", name: "Arjun Rao", title: null },
];

function week(over: Partial<CalendarMonth> = {}): CalendarMonth {
    return {
        month: "2026-10",
        timezone: "Asia/Kolkata",
        timezoneSource: "business",
        from: "2026-10-18T18:30:00.000Z",
        to: "2026-10-25T18:30:00.000Z",
        layers: ["bookings", "invoices"],
        totals: { bookings: 3, invoices: 1 },
        days: DATES.map((date) => ({ date, layers: {}, toActOn: 0 })),
        toActOn: [],
        unavailable: [],
        staff: STAFF,
        daysOff: [
            {
                kind: "closure",
                startAt: "2026-10-20T18:30:00.000Z",
                endAt: "2026-10-21T18:30:00.000Z",
                allDay: true,
                dates: ["2026-10-21"],
                reason: "Diwali",
            },
        ],
        hours: [
            ...DATES.slice(0, 6).map((date) => ({
                date,
                startMinute: 540,
                endMinute: 1080,
                staffId: "meera",
            })),
            ...DATES.slice(0, 5).map((date) => ({
                date,
                startMinute: 600,
                endMinute: 1140,
                staffId: "arjun",
            })),
        ],
        ...over,
    };
}

describe("closedDay", () => {
    it("says a weekday nobody works, in the boards' words", () => {
        expect(closedDay(week(), "2026-10-25", null)).toEqual({
            title: "Closed on Sundays",
            line: "Nothing is on this day.",
        });
        expect(closedDay(week(), "2026-10-24", null)).toBeNull();
    });

    it("says a closure with its reason", () => {
        expect(closedDay(week(), "2026-10-21", null)?.title).toBe(
            "Closed · Diwali",
        );
    });

    it("names the person picked who doesn't work that day", () => {
        expect(closedDay(week(), "2026-10-24", "arjun")?.title).toBe(
            "Arjun doesn't work on Saturdays",
        );
        expect(closedDay(week(), "2026-10-24", "meera")).toBeNull();
    });

    it("never calls a day closed when the hours are unknown or unset", () => {
        expect(closedDay(week({ hours: null }), "2026-10-25", null)).toBeNull();
        expect(closedDay(week({ hours: [] }), "2026-10-25", null)).toBeNull();
    });
});

describe("dayOnWords", () => {
    it("counts what is on, or says closed", () => {
        expect(dayOnWords(11, false)).toBe("11 on");
        expect(dayOnWords(0, true)).toBe("Closed");
        expect(dayOnWords(0, false)).toBe("None");
        // Something booked on a closed day still counts.
        expect(dayOnWords(2, true)).toBe("2 on");
    });
});

function busy(): CalendarMonth {
    const days: CalendarDay[] = DATES.map((date) => ({
        date,
        layers: {},
        toActOn: 0,
    }));
    days[0] = {
        date: DATES[0],
        toActOn: 0,
        layers: {
            bookings: {
                count: 3,
                kinds: { booked: 3 },
                items: [
                    {
                        id: "b2",
                        kind: "booked",
                        title: "Sports massage · Farah Khan",
                        subtitle: "With Arjun Rao",
                        at: "2026-10-19T06:30:00.000Z",
                        link: { type: "booking", id: "b2" },
                        durationMinutes: 60,
                    },
                    {
                        id: "b1",
                        kind: "booked",
                        title: "Physio assessment · Ananya Desai",
                        subtitle: "With Meera Iyer",
                        at: "2026-10-19T03:30:00.000Z",
                        link: { type: "booking", id: "b1" },
                        durationMinutes: 45,
                    },
                ],
            },
            invoices: {
                count: 1,
                kinds: { overdue: 1 },
                items: [
                    {
                        id: "i1",
                        kind: "overdue",
                        title: "INV-0121",
                        subtitle: "Rohan Mehta",
                        at: "2026-10-19T05:00:00.000Z",
                        link: { type: "invoice", id: "i1" },
                    },
                ],
            },
        },
    };
    return week({ days });
}

describe("weekTotals", () => {
    const base = {
        layers: layersFor(busy()),
        off: {},
        title: "19 to 25 Oct",
        past: false,
    };

    it("counts each layer on, then money and the zone on the desk", () => {
        expect(
            weekTotals({
                ...base,
                week: busy(),
                current: true,
                money: { in: "₹3,600", out: "₹200" },
                zone: "IST",
            }).text,
        ).toBe(
            "This week · 3 bookings · 1 invoice · In ₹3,600 · Out ₹200 · times in IST",
        );
        expect(weekTotals({ ...base, week: busy(), current: false }).text).toBe(
            "3 bookings · 1 invoice",
        );
    });

    it("says an empty week, a past one and everything switched off", () => {
        expect(weekTotals({ ...base, week: week(), current: true })).toEqual({
            text: "Nothing on the calendar this week yet.",
            empty: true,
        });
        expect(weekTotals({ ...base, week: week(), current: false }).text).toBe(
            "Nothing on the calendar from 19 to 25 Oct yet.",
        );
        expect(
            weekTotals({ ...base, week: week(), current: false, past: true })
                .text,
        ).toBe("Nothing happened from 19 to 25 Oct.");
        expect(
            weekTotals({
                ...base,
                week: busy(),
                current: true,
                off: { bookings: true, invoices: true },
            }).text,
        ).toBe("Nothing is switched on. Choose what to show above.");
    });

    it("calls India's zone IST", () => {
        expect(weekZone("Asia/Kolkata", "2026-10-19")).toBe("IST");
    });
});

describe("weekDayList", () => {
    const opts = {
        layers: layersFor(busy()),
        off: {},
        today: "2026-10-19",
        timeZone: "Asia/Kolkata",
        can: { remind: true },
    };

    it("lists a day in time order, with what has no length on top", () => {
        const list = weekDayList(busy().days[0], { ...opts, byHour: true });
        expect(list.rows.map((r) => r.time)).toEqual(["9:00 am", "12:00 pm"]);
        expect(list.rows[0].title).toBe("Ananya Desai");
        expect(list.chips.map((c) => c.href)).toEqual(["/billing/invoices/i1"]);
        expect(list.chips[0].bad).toBe(true);
        // The third booking the API didn't send.
        expect(list.more).toBe(1);
    });

    it("without a team, only what has no time is a chip; a problem has its fix", () => {
        const list = weekDayList(busy().days[0], { ...opts, byHour: false });
        expect(list.chips).toEqual([]);
        expect(list.rows.map((r) => r.time)).toEqual([
            "9:00 am",
            "10:30 am",
            "12:00 pm",
        ]);
        expect(list.rows[1].action).toBe("Send a reminder");
    });

    it("leaves out a layer switched off", () => {
        const list = weekDayList(busy().days[0], {
            ...opts,
            off: { bookings: true },
            byHour: false,
        });
        expect(list.rows).toHaveLength(1);
        expect(list.more).toBe(0);
    });
});
