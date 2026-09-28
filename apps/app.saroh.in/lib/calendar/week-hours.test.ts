import { describe, expect, it } from "vitest";

import { layersFor } from "./layers";
import { calendarRange } from "./range";
import { forPerson } from "./team";
import type {
    CalendarDay,
    CalendarItem,
    CalendarMonth,
    LayerKey,
    WorkingHours,
} from "./types";
import { weekDates } from "./week";
import { weekColumns } from "./week-columns";
import { ALL_DAY_CHIPS, dayShade, weekHours } from "./week-hours";

/**
 * The Week hour grid's days (plan 005 E27), on a week shaped like Kavi
 * Dental's of 14 September 2026: Dr. Rao works Monday to Saturday
 * mornings, Dr. Pillai late mornings and is off on Wednesday. Today is
 * Friday the 18th.
 */

const RAO = "st_rao";
const PILLAI = "st_pillai";
const TODAY = "2026-09-18";
const DATES = weekDates("2026-09-14");

const at = (date: string, time: string) =>
    new Date(`${date}T${time}:00+05:30`).toISOString();

function booking(
    id: string,
    date: string,
    time: string,
    minutes: number,
    staffId: string,
    over: Partial<CalendarItem> = {},
): CalendarItem {
    return {
        id,
        kind: "booked",
        title: `Check-up · ${id}`,
        subtitle: null,
        at: at(date, time),
        link: { type: "booking", id },
        staffId,
        durationMinutes: minutes,
        ...over,
    };
}

function day(
    date: string,
    layers: Partial<Record<LayerKey, CalendarItem[]>>,
): CalendarDay {
    const out: CalendarDay = { date, layers: {}, toActOn: 0 };
    for (const [key, items] of Object.entries(layers) as [
        LayerKey,
        CalendarItem[],
    ][]) {
        const kinds: Record<string, number> = {};
        for (const i of items) kinds[i.kind] = (kinds[i.kind] ?? 0) + 1;
        out.layers[key] = { count: items.length, kinds, items };
    }
    return out;
}

/** Monday–Saturday for Dr. Rao 09:00–13:00; Dr. Pillai 10:00–14:00 bar Wednesday. */
function hours(): WorkingHours[] {
    const out: WorkingHours[] = [];
    for (const date of DATES.slice(0, 6)) {
        out.push({ date, startMinute: 540, endMinute: 780, staffId: RAO });
        if (date !== "2026-09-16") {
            out.push({
                date,
                startMinute: 600,
                endMinute: 840,
                staffId: PILLAI,
            });
        }
    }
    return out;
}

function kavi(filled: CalendarDay[], over: Partial<CalendarMonth> = {}) {
    const month: CalendarMonth = {
        month: "2026-09",
        timezone: "Asia/Kolkata",
        timezoneSource: "business",
        from: "2026-09-13T18:30:00.000Z",
        to: "2026-09-20T18:30:00.000Z",
        layers: ["bookings", "payments"],
        totals: { bookings: 0, payments: 0 },
        days: DATES.map(
            (date) =>
                filled.find((d) => d.date === date) ?? {
                    date,
                    layers: {},
                    toActOn: 0,
                },
        ),
        toActOn: [],
        unavailable: [],
        joinedAt: "2026-06-02",
        daysOff: [],
        hasStaff: true,
        staff: [
            { id: PILLAI, name: "Dr. Arun Pillai", title: "Dentist" },
            { id: RAO, name: "Dr. Meenakshi Rao", title: "Dentist" },
        ],
        hours: hours(),
        ...over,
    };
    for (const d of month.days) {
        for (const [k, cell] of Object.entries(d.layers)) {
            month.totals[k as LayerKey] =
                (month.totals[k as LayerKey] ?? 0) + cell.count;
        }
    }
    return month;
}

function grid(
    month: CalendarMonth,
    { person = null, off = {} }: { person?: string | null; off?: object } = {},
) {
    const shown = forPerson(month, person);
    const layers = layersFor(month);
    const columns = weekColumns({
        week: shown,
        dates: DATES,
        layers,
        off,
        today: TODAY,
        selected: TODAY,
        range: calendarRange(month.joinedAt, "2026-09"),
        cash: null,
        person,
    });
    return weekHours({
        week: shown,
        columns,
        layers,
        off,
        today: TODAY,
        person,
    });
}

describe("weekHours: blocks and the All day row", () => {
    it("draws bookings as blocks by time and length, and a payment all day", () => {
        const days = grid(
            kavi([
                day("2026-09-14", {
                    bookings: [
                        booking("Asha", "2026-09-14", "10:00", 30, RAO),
                        booking("Ravi", "2026-09-14", "10:00", 60, PILLAI),
                    ],
                    payments: [
                        {
                            id: "inv1",
                            kind: "paid",
                            title: "Check-up · Asha",
                            subtitle: null,
                            at: at("2026-09-14", "10:40"),
                            link: { type: "invoice", id: "inv1" },
                        },
                    ],
                }),
            ]),
        );
        const monday = days[0];
        expect(monday.blocks.map((b) => [b.time, b.title, b.width])).toEqual([
            ["10:00–10:30", "Check-up · Asha", 50],
            ["10:00–11:00", "Check-up · Ravi", 50],
        ]);
        expect(monday.blocks[1].left).toBe(50);
        expect(monday.blocks[0].href).toBe("/bookings/Asha");
        expect(monday.allDay).toEqual([
            expect.objectContaining({
                title: "Paid · Check-up · Asha",
                href: "/billing/invoices/inv1",
                bad: false,
            }),
        ]);
    });

    it("a no-show is flagged in the danger fill; a cancelled class is struck", () => {
        const days = grid(
            kavi([
                day("2026-09-15", {
                    bookings: [
                        booking("Asha", "2026-09-15", "09:00", 30, RAO, {
                            kind: "no_show",
                            flags: ["no_show"],
                        }),
                        booking("Ravi", "2026-09-15", "11:00", 30, RAO, {
                            flags: ["cancelled"],
                        }),
                    ],
                }),
            ]),
        );
        const [noShow, gone] = days[1].blocks;
        expect(noShow).toMatchObject({
            flag: { label: "No-show", tone: "bad" },
            bad: true,
            struck: false,
        });
        expect(noShow.full).toBe("09:00–09:30 Check-up · Asha · No-show");
        expect(gone).toMatchObject({
            flag: { label: "Cancelled", tone: "bad" },
            bad: true,
            struck: true,
        });
    });

    it("a booking before 06:00 says it starts earlier", () => {
        const days = grid(
            kavi([
                day("2026-09-17", {
                    bookings: [
                        booking("Early", "2026-09-17", "05:30", 60, RAO),
                    ],
                }),
            ]),
        );
        expect(days[3].blocks[0]).toMatchObject({
            time: "05:30–06:30",
            startsEarlier: true,
            top: 1,
        });
        expect(days[3].blocks[0].full).toContain("starts before 06:00");
    });

    it("a failed renewal is an all-day chip in the danger fill", () => {
        const days = grid(
            kavi(
                [
                    day("2026-09-16", {
                        subscriptions: [
                            {
                                id: "s1",
                                kind: "failed",
                                title: "Asha Rao",
                                subtitle: "Monthly care plan",
                                at: null,
                                link: { type: "subscription", id: "s1" },
                            },
                        ],
                    }),
                ],
                { layers: ["bookings", "subscriptions"] },
            ),
        );
        expect(days[2].allDay[0]).toMatchObject({
            title: "Renewal failed · Asha Rao",
            bad: true,
        });
    });

    it("lists a few all-day things and counts the rest", () => {
        const invoices = Array.from({ length: ALL_DAY_CHIPS + 2 }, (_, i) => ({
            id: `i${i}`,
            kind: "due",
            title: `INV-${i}`,
            subtitle: null,
            at: null,
            link: { type: "invoice" as const, id: `i${i}` },
        }));
        const days = grid(
            kavi([day("2026-09-17", { invoices })], {
                layers: ["bookings", "invoices"],
            }),
        );
        expect(days[3].allDay).toHaveLength(ALL_DAY_CHIPS);
        expect(days[3].allDayMore).toBe(2);
    });

    it("a layer switched off leaves the grid", () => {
        const days = grid(
            kavi([
                day("2026-09-14", {
                    bookings: [booking("Asha", "2026-09-14", "10:00", 30, RAO)],
                }),
            ]),
            { off: { bookings: true } },
        );
        expect(days[0].blocks).toEqual([]);
    });
});

describe("weekHours: working hours and the team filter", () => {
    it("shades outside the team's hours, both dentists together", () => {
        const monday = grid(kavi([]))[0];
        // 09:00 (Dr. Rao) to 14:00 (Dr. Pillai).
        expect(monday.shade).toEqual({
            striped: false,
            bands: [
                { top: 0, height: 3 * 44 },
                { top: 8 * 44, height: 8 * 44 },
            ],
        });
    });

    it("filtering to one dentist narrows the blocks and the shaded hours", () => {
        const month = kavi([
            day("2026-09-14", {
                bookings: [
                    booking("Asha", "2026-09-14", "09:00", 30, RAO),
                    booking("Ravi", "2026-09-14", "10:00", 60, PILLAI),
                ],
            }),
        ]);
        const monday = grid(month, { person: PILLAI })[0];
        expect(monday.blocks.map((b) => b.title)).toEqual(["Check-up · Ravi"]);
        expect(monday.blocks[0].width).toBe(100);
        expect(monday.shade.bands[0]).toEqual({ top: 0, height: 4 * 44 });
    });

    it("a filtered person's off day is striped", () => {
        const month = kavi([], {
            daysOff: [
                {
                    kind: "time_off",
                    startAt: "2026-09-16T18:30:00Z",
                    endAt: "2026-09-17T18:30:00Z",
                    allDay: true,
                    dates: ["2026-09-17"],
                    staffId: RAO,
                    name: "Dr. Meenakshi Rao",
                },
            ],
        });
        expect(grid(month, { person: RAO })[3].shade.striped).toBe(true);
        // Everyone: one of two is off, so the day is shaded, not striped.
        expect(grid(month)[3].shade.striped).toBe(false);
        expect(grid(month, { person: PILLAI })[3].shade.striped).toBe(false);
    });

    it("a day the person picked never works is striped; a closed day for everyone", () => {
        // Dr. Pillai has no Wednesday hours.
        expect(grid(kavi([]), { person: PILLAI })[2].shade.striped).toBe(true);
        expect(grid(kavi([]))[2].shade.striped).toBe(false);
        const closed = kavi([], {
            daysOff: [
                {
                    kind: "closure",
                    startAt: "2026-09-14T18:30:00Z",
                    endAt: "2026-09-15T18:30:00Z",
                    allDay: true,
                    dates: ["2026-09-15"],
                    reason: "Onam",
                },
            ],
        });
        expect(grid(closed)[1].shade.striped).toBe(true);
        // Sunday: nobody works.
        expect(grid(kavi([]))[6].shade.striped).toBe(true);
    });
});

describe("dayShade", () => {
    const base = {
        date: "2026-09-14",
        person: null,
        striped: false,
        outside: false,
    };

    it("shades nothing when no hours were sent", () => {
        expect(dayShade({ ...base, hours: undefined })).toEqual({
            striped: false,
            bands: [],
        });
        expect(dayShade({ ...base, hours: null }).striped).toBe(false);
    });

    it("a team that set no hours at all is not drawn as always away", () => {
        expect(dayShade({ ...base, hours: [] }).striped).toBe(false);
    });

    it("a day outside the range is left to the column's muted fill", () => {
        expect(
            dayShade({ ...base, hours: hours(), striped: true, outside: true }),
        ).toEqual({ striped: false, bands: [] });
    });
});
