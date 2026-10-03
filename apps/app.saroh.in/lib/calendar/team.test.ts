import { describe, expect, it } from "vitest";

import { cellOff } from "./days-off";
import { dayChips, layersFor, monthSummary } from "./layers";
import { calendarCash, wholeMoney } from "./money";
import { dayProblems } from "./problems";
import { calendarHref, forPerson, pickedPerson, teamOptions } from "./team";
import type {
    CalendarDay,
    CalendarItem,
    CalendarMonth,
    LayerKey,
    MoneyEntry,
} from "./types";

/*
 * The team filter (plan 005 E24), on a month shaped like Kavi Dental's (E29):
 * two dentists, Dr. Arun Pillai at a conference on the 23rd, and the clinic's
 * paid invoices as its Payments layer.
 */

const PILLAI = "st-pillai";
const RAO = "st-rao";

function item(over: Partial<CalendarItem> = {}): CalendarItem {
    return {
        id: "b1",
        kind: "confirmed",
        title: "Check-up",
        subtitle: "Asha Rao",
        at: "2026-09-22T04:30:00Z",
        link: { type: "booking", id: "b1" },
        ...over,
    };
}

function day(
    date: string,
    layers: Partial<Record<LayerKey, CalendarItem[]>>,
): CalendarDay {
    const out: CalendarDay = { date, layers: {}, toActOn: 0 };
    for (const [key, items] of Object.entries(layers)) {
        const kinds: Record<string, number> = {};
        for (const i of items) kinds[i.kind] = (kinds[i.kind] ?? 0) + 1;
        out.layers[key as LayerKey] = { count: items.length, kinds, items };
    }
    return out;
}

function entry(over: Partial<MoneyEntry>): MoneyEntry {
    return {
        date: "2026-09-22",
        kind: "invoice_paid",
        layer: "payments",
        title: "Check-up",
        subtitle: null,
        currency: "INR",
        in: 0,
        out: 0,
        due: 0,
        failed: 0,
        link: { type: "invoice", id: "inv" },
        itemId: null,
        ...over,
    };
}

const withPillai = item({ id: "b-p", staffId: PILLAI, title: "Root canal" });
const withRao = item({ id: "b-r", staffId: RAO, title: "Cleaning" });
const noShowRao = item({
    id: "b-ns",
    staffId: RAO,
    kind: "no_show",
    flags: ["no_show"],
});
const paidRao = item({
    id: "inv-r",
    kind: "paid",
    staffId: RAO,
    link: { type: "invoice", id: "inv-r" },
});

function kavi(over: Partial<CalendarMonth> = {}): CalendarMonth {
    return {
        month: "2026-09",
        timezone: "Asia/Kolkata",
        timezoneSource: "business",
        from: "",
        to: "",
        layers: ["bookings", "invoices", "payments"],
        totals: { bookings: 3, invoices: 1, payments: 1 },
        days: [
            day("2026-09-21", { bookings: [noShowRao] }),
            day("2026-09-22", {
                bookings: [withPillai, withRao],
                invoices: [
                    item({
                        id: "inv-o",
                        kind: "overdue",
                        link: { type: "invoice", id: "inv-o" },
                    }),
                ],
                payments: [paidRao],
            }),
            day("2026-09-23", {}),
        ],
        toActOn: [
            {
                kind: "invoice_overdue",
                date: "2026-09-22",
                title: "INV-7",
                subtitle: null,
                link: { type: "invoice", id: "inv-o" },
            },
        ],
        takings: {
            lead: "bookings",
            total: [{ currency: "INR", amount: "2400.00" }],
        },
        unavailable: [],
        daysOff: [
            {
                kind: "time_off",
                startAt: "2026-09-22T18:30:00Z",
                endAt: "2026-09-23T18:30:00Z",
                allDay: true,
                dates: ["2026-09-23"],
                staffId: PILLAI,
                name: "Dr. Arun Pillai",
                reason: "At a dental conference in Chennai",
            },
        ],
        hasStaff: true,
        staff: [
            { id: PILLAI, name: "Dr. Arun Pillai", title: "Dentist" },
            { id: RAO, name: "Dr. Meenakshi Rao", title: "Dentist" },
        ],
        money: {
            total: [
                {
                    currency: "INR",
                    in: 240000,
                    out: 0,
                    net: 240000,
                    due: 150000,
                    failed: 0,
                },
            ],
            entries: [
                entry({ in: 90000, itemId: "inv-r" }),
                entry({
                    kind: "booking_due",
                    layer: "bookings",
                    due: 150000,
                    itemId: "b-p",
                }),
                // Paid, but on no one's item: a counter sale, say.
                entry({ in: 150000, itemId: null, layer: "invoices" }),
            ],
        },
        ...over,
    };
}

describe("teamOptions", () => {
    it("lists a team of two or more for a viewer it is named to", () => {
        expect(teamOptions(kavi())).toEqual([
            { id: PILLAI, name: "Dr. Arun Pillai" },
            { id: RAO, name: "Dr. Meenakshi Rao" },
        ]);
    });

    it("offers no filter to a business with no staff", () => {
        expect(teamOptions(kavi({ hasStaff: false, staff: [] }))).toEqual([]);
    });

    it("offers no filter to a business of one", () => {
        expect(
            teamOptions(
                kavi({
                    staff: [
                        { id: RAO, name: "Dr. Meenakshi Rao", title: null },
                    ],
                }),
            ),
        ).toEqual([]);
    });

    it("offers no filter to a viewer the team isn't named to", () => {
        // No `booking:read`: the API sends `hasStaff` but not who.
        expect(teamOptions(kavi({ staff: undefined }))).toEqual([]);
    });

    it("offers no filter when days off couldn't be read", () => {
        expect(teamOptions(kavi({ hasStaff: null, staff: undefined }))).toEqual(
            [],
        );
    });
});

describe("pickedPerson", () => {
    const options = teamOptions(kavi());

    it("keeps a person the filter lists", () => {
        expect(pickedPerson(PILLAI, options)).toBe(PILLAI);
    });

    it("opens anyone else on Everyone", () => {
        expect(pickedPerson("st-elsewhere", options)).toBeNull();
        expect(pickedPerson(PILLAI, [])).toBeNull();
        expect(pickedPerson(undefined, options)).toBeNull();
        expect(pickedPerson("", options)).toBeNull();
    });
});

describe("forPerson", () => {
    it("is the month as sent for Everyone", () => {
        const month = kavi();
        expect(forPerson(month, null)).toBe(month);
    });

    it("filtering to one dentist hides the other's bookings and stripes their day off", () => {
        const month = kavi();
        const pillai = forPerson(month, PILLAI);
        const the22nd = pillai.days[1];
        expect(the22nd.layers.bookings?.items.map((i) => i.id)).toEqual([
            "b-p",
        ]);
        expect(the22nd.layers.bookings?.count).toBe(1);
        // Rao's no-show is gone, and with it the day's problem.
        expect(pillai.days[0].layers.bookings?.count).toBe(0);
        expect(
            dayProblems(pillai.days[0], {}, "2026-09-28").no_show,
        ).toBeUndefined();
        // Pillai's day off: "Off", striped.
        expect(cellOff(month, "2026-09-23", PILLAI)).toEqual({
            text: "Off",
            title: "Dr. Arun Pillai off · At a dental conference in Chennai",
            striped: true,
        });
        // Rao is in that day: nothing said, nothing striped.
        expect(cellOff(month, "2026-09-23", RAO)).toBeNull();
    });

    it("leaves out what belongs to nobody on the team", () => {
        const pillai = forPerson(kavi(), PILLAI);
        expect(pillai.days[1].layers.invoices?.count).toBe(0);
        expect(pillai.days[1].layers.payments?.count).toBe(0);
        expect(pillai.toActOn).toEqual([]);
    });

    it("counts the switches and the day's chips from the person's items", () => {
        const month = kavi();
        const rao = forPerson(month, RAO);
        expect(rao.totals).toEqual({ bookings: 2, invoices: 0, payments: 1 });
        const layers = layersFor(month);
        expect(dayChips(rao.days[1], layers, {}, "2026-09-28")).toEqual([
            { key: "bookings", text: "1 appointment", tone: 1 },
            { key: "payments", text: "1 payment", tone: 2 },
        ]);
        // Kinds follow the items, so a problem counts only the person's.
        expect(rao.days[0].layers.bookings?.kinds).toEqual({ no_show: 1 });
    });

    it("keeps every layer's switch while a person is picked", () => {
        const month = kavi();
        const keys = (m: CalendarMonth) => layersFor(m).map((l) => l.key);
        // The switches are drawn from the whole month.
        expect(keys(month)).toEqual(["bookings", "invoices", "payments"]);
    });

    it("keeps a layer that couldn't be read as unknown", () => {
        const month = kavi({ totals: { bookings: 3, invoices: null } });
        expect(forPerson(month, RAO).totals.invoices).toBeNull();
    });

    it("keeps only the money on the person's items", () => {
        const rao = forPerson(kavi(), RAO);
        expect(rao.money?.entries.map((e) => e.itemId)).toEqual(["inv-r"]);
        expect(rao.money?.total).toEqual([
            {
                currency: "INR",
                in: 90000,
                out: 0,
                net: 90000,
                due: 0,
                failed: 0,
            },
        ]);
        const cash = calendarCash(rao, {}, "INR");
        expect(cash?.shown).toHaveLength(1);
    });

    it("matches money to an item within its own layer", () => {
        // A booking and an invoice could never share an id, but the match
        // is by layer as well, so one can't borrow the other's money.
        const month = kavi();
        const rao = forPerson(month, RAO);
        expect(rao.money?.entries.some((e) => e.layer === "bookings")).toBe(
            false,
        );
    });

    it("leaves money that couldn't be added up as it was", () => {
        const month = kavi({ money: { total: null, entries: [] } });
        expect(forPerson(month, RAO).money).toEqual({
            total: null,
            entries: [],
        });
    });

    it("drops the API's takings, which can't be split by person", () => {
        const rao = forPerson(kavi(), RAO);
        expect(rao.takings).toEqual({ lead: "bookings", total: null });
        const summary = monthSummary({
            month: rao,
            layers: layersFor(kavi()),
            off: {},
            today: "2026-09-28",
            money: wholeMoney,
        });
        expect(summary).toBe("Appointments: 2 so far");
    });
});

describe("calendarHref", () => {
    it("keeps the person across months and days", () => {
        expect(
            calendarHref({
                month: "2026-10",
                thisMonth: "2026-09",
                team: PILLAI,
            }),
        ).toBe(`/calendar?month=2026-10&team=${PILLAI}`);
        expect(
            calendarHref({
                month: "2026-09",
                thisMonth: "2026-09",
                day: "2026-09-30",
                team: PILLAI,
            }),
        ).toBe(`/calendar?day=2026-09-30&team=${PILLAI}`);
    });

    it("is the bare calendar for this month and Everyone", () => {
        expect(calendarHref({ month: "2026-09", thisMonth: "2026-09" })).toBe(
            "/calendar",
        );
        expect(
            calendarHref({
                month: "2026-08",
                thisMonth: "2026-09",
                day: "2026-08-31",
                team: null,
            }),
        ).toBe("/calendar?month=2026-08&day=2026-08-31");
    });
});
