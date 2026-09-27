import { describe, expect, it } from "vitest";

import type { OpeningHoursDay, Weekday } from "./opening-hours";
import {
    clockText,
    isOpeningWeek,
    openState,
    openStateText,
    weekSummary,
} from "./opening-hours";

const DAYS: Weekday[] = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];

/** A week from a map of day → [open, close]; a day left out is closed. */
function week(
    hours: Partial<Record<Weekday, [string, string]>>,
): OpeningHoursDay[] {
    return DAYS.map((day) => {
        const h = hours[day];
        return h
            ? { day, open: h[0], close: h[1], closed: false }
            : { day, open: "09:00", close: "18:00", closed: true };
    });
}

const KOLKATA = "Asia/Kolkata";

/** An instant from a wall-clock time in Kolkata (+05:30, no DST). */
function ist(local: string): Date {
    return new Date(`${local}+05:30`);
}

/** Pulse: Mon–Fri 06:00–21:00, Sat 07:00–13:00, Sun closed. */
const PULSE = week({
    MON: ["06:00", "21:00"],
    TUE: ["06:00", "21:00"],
    WED: ["06:00", "21:00"],
    THU: ["06:00", "21:00"],
    FRI: ["06:00", "21:00"],
    SAT: ["07:00", "13:00"],
});

describe("openState", () => {
    it("is open at 18:00 with a 21:00 close, and says when it closes", () => {
        // 2026-09-25 is a Friday.
        const state = openState(PULSE, ist("2026-09-25T18:00:00"), KOLKATA);
        expect(state).toEqual({ open: true, closesAt: "21:00" });
        expect(openStateText(state)).toBe("Open now · closes 9pm");
    });

    it("on a closed Sunday, opens on Monday at 8am", () => {
        const clinic = week({
            MON: ["08:00", "17:00"],
            SAT: ["09:00", "12:00"],
        });
        // 2026-09-27 is a Sunday.
        const state = openState(clinic, ist("2026-09-27T11:00:00"), KOLKATA);
        expect(state).toEqual({
            open: false,
            opensAt: "08:00",
            opensOn: "MON",
            today: false,
        });
        expect(openStateText(state)).toBe("Closed · opens Mon 8am");
    });

    it("before opening, opens later today without naming the day", () => {
        const state = openState(PULSE, ist("2026-09-25T05:10:00"), KOLKATA);
        expect(state).toEqual({
            open: false,
            opensAt: "06:00",
            opensOn: "FRI",
            today: true,
        });
        expect(openStateText(state)).toBe("Closed · opens 6am");
    });

    it("after closing, looks to the next day that opens", () => {
        // Saturday 13:00 is closing time: closed from that minute on.
        const state = openState(PULSE, ist("2026-09-26T13:00:00"), KOLKATA);
        expect(openStateText(state)).toBe("Closed · opens Mon 6am");
    });

    it("counts the opening minute as open and the closing minute as closed", () => {
        expect(
            openState(PULSE, ist("2026-09-25T06:00:00"), KOLKATA)?.open,
        ).toBe(true);
        expect(
            openState(PULSE, ist("2026-09-25T21:00:00"), KOLKATA)?.open,
        ).toBe(false);
    });

    it("reads the day in the business's zone, not the machine's", () => {
        // 23:30 UTC on Friday is 05:00 on Saturday in Kolkata — closed until 7.
        const state = openState(
            PULSE,
            new Date("2026-09-25T23:30:00Z"),
            KOLKATA,
        );
        expect(openStateText(state)).toBe("Closed · opens 7am");
    });

    it("keeps wall-clock hours across a DST change", () => {
        const shop = week({ SUN: ["09:00", "17:00"], SAT: ["09:00", "17:00"] });
        const ny = "America/New_York";
        // Sat 7 Mar 2026, 09:30 EST (UTC−5) and Sun 8 Mar, 09:30 EDT (UTC−4).
        expect(
            openState(shop, new Date("2026-03-07T14:30:00Z"), ny)?.open,
        ).toBe(true);
        expect(
            openState(shop, new Date("2026-03-08T13:30:00Z"), ny)?.open,
        ).toBe(true);
        // 08:30 EDT on the Sunday is still before opening.
        expect(
            openState(shop, new Date("2026-03-08T12:30:00Z"), ny)?.open,
        ).toBe(false);
        // London falls back on Sun 25 Oct 2026: 16:30 GMT is 16:30 local.
        expect(
            openState(shop, new Date("2026-10-25T16:30:00Z"), "Europe/London"),
        ).toEqual({ open: true, closesAt: "17:00" });
    });

    it("carries overnight hours past midnight", () => {
        const bar = week({ FRI: ["18:00", "02:00"] });
        // Friday 23:00: open, closes at 2am.
        expect(
            openStateText(openState(bar, ist("2026-09-25T23:00:00"), KOLKATA)),
        ).toBe("Open now · closes 2am");
        // Saturday 01:30 is still Friday's night.
        expect(
            openStateText(openState(bar, ist("2026-09-26T01:30:00"), KOLKATA)),
        ).toBe("Open now · closes 2am");
        // Saturday 02:00: closed, next Friday.
        expect(
            openStateText(openState(bar, ist("2026-09-26T02:00:00"), KOLKATA)),
        ).toBe("Closed · opens Fri 6pm");
    });

    it("names the same weekday a week on when that is the only day", () => {
        const mondays = week({ MON: ["08:00", "12:00"] });
        // Monday 14:00, after closing.
        expect(
            openStateText(
                openState(mondays, ist("2026-09-28T14:00:00"), KOLKATA),
            ),
        ).toBe("Closed · opens Mon 8am");
    });

    it("says nothing when no hours are saved, or every day is closed", () => {
        const now = ist("2026-09-25T12:00:00");
        expect(openState(null, now, KOLKATA)).toBeNull();
        expect(openState([], now, KOLKATA)).toBeNull();
        expect(openState(week({}), now, KOLKATA)).toBeNull();
        expect(openStateText(null)).toBe("");
    });

    it("treats a day missing from the week as closed", () => {
        const partial: OpeningHoursDay[] = [
            { day: "MON", open: "08:00", close: "17:00", closed: false },
        ];
        // Friday.
        expect(
            openStateText(
                openState(partial, ist("2026-09-25T12:00:00"), KOLKATA),
            ),
        ).toBe("Closed · opens Mon 8am");
    });

    it("falls back to India when the zone is not a real one", () => {
        expect(
            openState(PULSE, ist("2026-09-25T18:00:00"), "Mars/Olympus"),
        ).toEqual({ open: true, closesAt: "21:00" });
    });
});

describe("clockText", () => {
    it("says a time the way a shop door does", () => {
        expect(clockText("21:00")).toBe("9pm");
        expect(clockText("08:00")).toBe("8am");
        expect(clockText("08:30")).toBe("8:30am");
        expect(clockText("12:00")).toBe("12pm");
        expect(clockText("12:15")).toBe("12:15pm");
        expect(clockText("00:00")).toBe("12am");
        expect(clockText("17:45")).toBe("5:45pm");
    });
});

describe("weekSummary", () => {
    it("says each run of days with the same hours once, closed days left out", () => {
        expect(weekSummary(PULSE)).toBe("Mon–Fri 6am–9pm · Sat 7am–1pm");
        expect(
            weekSummary(
                week({
                    TUE: ["07:00", "19:00"],
                    WED: ["07:00", "19:00"],
                    THU: ["07:00", "19:00"],
                    FRI: ["07:00", "19:00"],
                    SAT: ["07:00", "19:00"],
                    SUN: ["07:00", "19:00"],
                }),
            ),
        ).toBe("Tue–Sun 7am–7pm");
        expect(
            weekSummary(
                week({
                    MON: ["09:00", "19:00"],
                    TUE: ["09:00", "19:00"],
                    WED: ["09:00", "19:00"],
                    THU: ["09:00", "19:00"],
                    FRI: ["09:00", "19:00"],
                    SAT: ["09:00", "19:00"],
                    SUN: ["10:00", "13:00"],
                }),
            ),
        ).toBe("Mon–Sat 9am–7pm · Sun 10am–1pm");
    });

    it("breaks a run at a closed day", () => {
        expect(
            weekSummary(
                week({ MON: ["09:00", "17:00"], WED: ["09:00", "17:00"] }),
            ),
        ).toBe("Mon 9am–5pm · Wed 9am–5pm");
    });

    it("is null with nothing to say", () => {
        expect(weekSummary(null)).toBeNull();
        expect(weekSummary(week({}))).toBeNull();
    });
});

describe("isOpeningWeek", () => {
    it("accepts the API's week and refuses anything else", () => {
        expect(isOpeningWeek(PULSE)).toBe(true);
        expect(isOpeningWeek([])).toBe(true);
        expect(isOpeningWeek(null)).toBe(false);
        expect(
            isOpeningWeek([
                { day: "MON", open: "9", close: "17:00", closed: false },
            ]),
        ).toBe(false);
        expect(
            isOpeningWeek([
                { day: "FUN", open: "09:00", close: "17:00", closed: false },
            ]),
        ).toBe(false);
        expect(
            isOpeningWeek([{ day: "MON", open: "09:00", close: "17:00" }]),
        ).toBe(false);
    });
});
