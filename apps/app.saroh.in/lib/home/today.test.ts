import { describe, expect, it } from "vitest";

import type { HomeToday, HomeTodayItem } from "./service";
import {
    arrivedLabel,
    dayCountLabel,
    laterTodayLabel,
    todayView,
} from "./today";

// 09:30 in Mumbai on 18 Sep 2026.
const NOW = new Date("2026-09-18T09:30:00+05:30");
const at = (hhmm: string) =>
    new Date(`2026-09-18T${hhmm}:00+05:30`).toISOString();

function item(time: string, over: Partial<HomeTodayItem> = {}): HomeTodayItem {
    return {
        id: `bk_${time}`,
        kind: "BOOKING",
        startAt: at(time),
        time,
        what: "Cleaning · Farah Khan",
        who: "With Dr. Arun",
        person: "Farah Khan",
        outcome: null,
        outcomeTime: null,
        stage: null,
        flags: [],
        href: `/bookings/bk_${time}`,
        markable: true,
        ...over,
    };
}

function day(items: HomeTodayItem[], bookings = true): HomeToday {
    return { zone: "Asia/Kolkata", date: "2026-09-18", bookings, items };
}

describe("todayView", () => {
    it("shows the day's rows in time order, the first still to come as Next", () => {
        const view = todayView(
            day([item("10:00"), item("11:30"), item("14:00")]),
            NOW,
        );
        expect(view.rows.map((r) => [r.time, r.state])).toEqual([
            ["10:00", "Next"],
            ["11:30", ""],
            ["14:00", ""],
        ]);
        expect(view.count).toBe("3 still to come");
        expect(view.empty).toBe(false);
    });

    it("tags a booking marked Came with the time it was marked", () => {
        const view = todayView(
            day([
                item("09:00", { outcome: "ATTENDED", outcomeTime: "09:32" }),
                item("10:00"),
            ]),
            NOW,
        );
        expect(view.rows[0].state).toBe("Came at 9:32 am");
        expect(view.rows[0].canArrive).toBe(false);
        expect(view.count).toBe("1 still to come · 1 came");
    });

    it("keeps the last ninety minutes, and an earlier booking nobody marked; drops what's older and marked", () => {
        const view = todayView(
            day([
                item("07:00", { outcome: "ATTENDED", outcomeTime: "07:02" }),
                item("07:30"),
                item("08:15"),
                item("09:00", { outcome: "NO_SHOW" }),
                item("10:00"),
            ]),
            NOW,
        );
        expect(view.rows.map((r) => [r.time, r.state])).toEqual([
            ["07:30", "Not here yet"],
            ["08:15", "Not here yet"],
            ["09:00", "Didn't come"],
            ["10:00", "Next"],
        ]);
        expect(view.count).toBe("1 still to come · 2 not here yet");
    });

    it("shows five still to come; the rest are the calendar's", () => {
        const times = ["10:00", "11:00", "12:00", "13:00", "14:00", "15:00"];
        const view = todayView(day(times.map((t) => item(t))), NOW);
        expect(view.rows).toHaveLength(5);
        expect(view.count).toBe("6 still to come");
    });

    it("offers Mark arrived from an hour before, and Didn't come once it has started", () => {
        const view = todayView(
            day([item("09:00"), item("10:15"), item("10:45")]),
            NOW,
        );
        const [started, soon, later] = view.rows;
        expect([started.canArrive, started.canNoShow]).toEqual([true, true]);
        expect([soon.canArrive, soon.canNoShow]).toEqual([true, false]);
        expect([later.canArrive, later.canNoShow]).toEqual([false, false]);
    });

    it("is read-only without booking:write", () => {
        const view = todayView(day([item("09:00", { markable: false })]), NOW);
        expect(view.rows[0].state).toBe("Not here yet");
        expect(view.rows[0].canArrive).toBe(false);
        expect(view.rows[0].canNoShow).toBe(false);
    });

    it("never offers marks on a class or a pick-up", () => {
        const view = todayView(
            day([
                item("09:00", { kind: "CLASS", id: "class", person: null }),
                item("09:15", {
                    kind: "PICKUP",
                    id: "ord",
                    stage: "PREPARING",
                    person: null,
                }),
                item("10:00", {
                    kind: "PICKUP",
                    id: "ord2",
                    stage: "READY",
                    person: null,
                }),
                item("11:00", {
                    kind: "PICKUP",
                    id: "ord3",
                    stage: "READY",
                    person: null,
                }),
            ]),
            NOW,
        );
        expect(view.rows.map((r) => r.state)).toEqual([
            "Started",
            "Not ready",
            "Next",
            "Ready",
        ]);
        expect(view.rows.some((r) => r.canArrive || r.canNoShow)).toBe(false);
        // Nobody is "not here yet" for a class or a pick-up.
        expect(view.count).toBe("2 still to come");
    });

    it("says the day is empty only when bookings were read", () => {
        expect(todayView(day([]), NOW)).toMatchObject({
            visible: true,
            empty: true,
        });
        // Pick-ups only, none due: no column, rather than "Nothing booked".
        expect(todayView(day([], false), NOW)).toMatchObject({
            visible: false,
            empty: false,
        });
    });

    it("draws nothing without a today block", () => {
        expect(todayView(null, NOW)).toEqual({
            rows: [],
            count: "",
            visible: false,
            empty: false,
            dayDone: false,
            laterToday: 0,
            dayCount: "",
        });
    });

    it('leaves the rest of the day to the calendar: "3 more later today" (Home A)', () => {
        const view = todayView(
            day(
                [
                    "10:00",
                    "11:00",
                    "12:00",
                    "13:00",
                    "14:00",
                    "15:00",
                    "16:00",
                    "17:00",
                ].map((t) => item(t)),
            ),
            NOW,
        );
        expect(view.rows).toHaveLength(5);
        expect(view.laterToday).toBe(3);
        expect(laterTodayLabel(view.laterToday)).toBe("3 more later today");
        expect(laterTodayLabel(0)).toBe("");
    });

    it("counts the whole day for Home A's heading", () => {
        const view = todayView(
            day([
                item("09:00"),
                item("10:00", { kind: "CLASS" }),
                item("11:00", { kind: "PICKUP" }),
            ]),
            NOW,
        );
        expect(view.dayCount).toBe("2 bookings, 1 pick-up");
        expect(dayCountLabel([])).toBe("");
        expect(dayCountLabel([item("09:00", { kind: "PICKUP" })])).toBe(
            "1 pick-up",
        );
    });

    it("says nothing is left when the day is over, never that nothing was booked", () => {
        const view = todayView(
            day([item("07:00", { outcome: "ATTENDED", outcomeTime: "07:02" })]),
            NOW,
        );
        expect(view.rows).toEqual([]);
        expect(view.empty).toBe(false);
        expect(view.dayDone).toBe(true);
        expect(view.count).toBe("");
    });

    it("still offers an unmarked morning booking in the evening", () => {
        const evening = new Date("2026-09-18T19:30:00+05:30");
        const view = todayView(day([item("10:00")]), evening);
        expect(view.rows.map((r) => [r.time, r.state])).toEqual([
            ["10:00", "Not here yet"],
        ]);
        expect(view.rows[0]).toMatchObject({
            canArrive: true,
            canNoShow: true,
        });
        expect(view.dayDone).toBe(false);
    });
});

describe("arrivedLabel", () => {
    it("adds the time when there is one", () => {
        expect(arrivedLabel("09:32")).toBe("Came at 9:32 am");
        expect(arrivedLabel(null)).toBe("Came");
    });
});
