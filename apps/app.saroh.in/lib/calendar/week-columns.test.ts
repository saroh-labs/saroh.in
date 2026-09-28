import { describe, expect, it } from "vitest";

import { layersFor } from "./layers";
import { calendarCash } from "./money";
import { calendarRange } from "./range";
import { forPerson } from "./team";
import type {
    CalendarDay,
    CalendarItem,
    CalendarMonth,
    LayerKey,
    MoneyEntry,
} from "./types";
import { weekDates } from "./week";
import {
    COLUMN_CARDS,
    dayCards,
    weekColumns,
    weekSummary,
} from "./week-columns";

/*
 * The Week's card columns (plan 005 E25), on the week of 14 September:
 * Rye & Co.'s orders, Saturday pick-ups and an overdue invoice, and — for
 * the team filter — Pulse's two trainers. Today is Friday the 18th.
 */

const TODAY = "2026-09-18";
const ZONE = "Asia/Kolkata";
const DATES = weekDates("2026-09-14");
const RANGE = calendarRange("2026-06-02", "2026-09");

/** "HH:MM" in India as an instant. */
const at = (date: string, time: string) =>
    new Date(`${date}T${time}:00+05:30`).toISOString();

function item(over: Partial<CalendarItem> & { id: string }): CalendarItem {
    return {
        kind: "paid",
        title: over.id,
        subtitle: null,
        at: null,
        link: { type: "order", id: over.id },
        ...over,
    };
}

function day(
    date: string,
    layers: Partial<Record<LayerKey, CalendarItem[]>>,
    count?: Partial<Record<LayerKey, number>>,
): CalendarDay {
    const out: CalendarDay = { date, layers: {}, toActOn: 0 };
    for (const [key, items] of Object.entries(layers) as [
        LayerKey,
        CalendarItem[],
    ][]) {
        const kinds: Record<string, number> = {};
        for (const i of items) kinds[i.kind] = (kinds[i.kind] ?? 0) + 1;
        out.layers[key] = {
            count: count?.[key] ?? items.length,
            kinds,
            items,
        };
    }
    return out;
}

function week(
    days: CalendarDay[],
    over: Partial<CalendarMonth> = {},
): CalendarMonth {
    const layers: LayerKey[] = ["orders", "collections", "invoices"];
    const totals: CalendarMonth["totals"] = {};
    for (const key of layers) {
        totals[key] = days.reduce((n, d) => n + (d.layers[key]?.count ?? 0), 0);
    }
    return {
        month: "2026-09",
        timezone: ZONE,
        timezoneSource: "business",
        from: "",
        to: "",
        layers,
        totals,
        days: DATES.map(
            (date) =>
                days.find((d) => d.date === date) ?? {
                    date,
                    layers: {},
                    toActOn: 0,
                },
        ),
        toActOn: [],
        unavailable: [],
        joinedAt: "2026-06-02",
        ...over,
    };
}

function entry(over: Partial<MoneyEntry>): MoneyEntry {
    return {
        date: "2026-09-18",
        kind: "order_paid",
        layer: "orders",
        title: "",
        subtitle: null,
        currency: "INR",
        in: 0,
        out: 0,
        due: 0,
        failed: 0,
        link: { type: "order", id: "o1" },
        itemId: null,
        ...over,
    };
}

const saturday = day("2026-09-19", {
    collections: [
        item({
            id: "c1",
            kind: "collection",
            title: "Asha Rao",
            subtitle: "Sourdough",
            link: { type: "subscription", id: "s1" },
        }),
    ],
    orders: [
        item({
            id: "o9",
            title: "1021",
            subtitle: "Meera",
            at: at("2026-09-19", "11:30"),
            amount: "640.00",
            currency: "INR",
        }),
        item({
            id: "o8",
            title: "1020",
            subtitle: "Kabir",
            at: at("2026-09-19", "08:05"),
            flags: ["late"],
            amount: "1200.00",
            currency: "INR",
        }),
    ],
});

const friday = day("2026-09-18", {
    invoices: [
        item({
            id: "i1",
            kind: "overdue",
            title: "INV-0042",
            subtitle: "Café Nook",
            link: { type: "invoice", id: "i1" },
        }),
    ],
});

function columns(
    month: CalendarMonth,
    opts: { off?: Record<string, boolean>; person?: string | null } = {},
) {
    const shown = forPerson(month, opts.person ?? null);
    return weekColumns({
        week: shown,
        dates: DATES,
        layers: layersFor(month),
        off: opts.off ?? {},
        today: TODAY,
        selected: TODAY,
        range: RANGE,
        cash: calendarCash(shown, opts.off ?? {}, "INR"),
        person: opts.person ?? null,
    });
}

describe("dayCards", () => {
    it("puts a day's things in time order, untimed last, each opening its record", () => {
        const month = week([saturday]);
        const cards = dayCards(saturday, {
            layers: layersFor(month),
            off: {},
            today: TODAY,
            timeZone: ZONE,
            money: false,
        });
        expect(cards.map((c) => [c.at, c.title])).toEqual([
            ["08:05", "Order #1020 · Kabir"],
            ["11:30", "Order #1021 · Meera"],
            // A pick-up has no time: its layer's name stands in.
            ["Pick-ups", "Collects · Asha Rao"],
        ]);
        expect(cards[0]).toMatchObject({
            flag: { label: "Late", tone: "bad" },
            href: "/commerce/orders/o8",
            amount: null,
        });
        expect(cards[2].href).toBe("/billing/subscriptions/s1");
        // The tooltip keeps the whole line.
        expect(cards[0].full).toBe(
            "Order #1020 · Kabir · Placed 08:05 · coming up",
        );
    });

    it("drops the time from a booking's title, since the card shows it", () => {
        const booking = day("2026-09-17", {
            bookings: [
                item({
                    id: "b1",
                    kind: "no_show",
                    title: "Personal training",
                    subtitle: "Kiran",
                    at: at("2026-09-17", "07:00"),
                    link: { type: "booking", id: "b1" },
                }),
            ],
        });
        const [card] = dayCards(booking, {
            layers: layersFor(
                week([booking], {
                    layers: ["bookings"],
                    totals: { bookings: 1 },
                }),
            ),
            off: {},
            today: TODAY,
            timeZone: ZONE,
            money: false,
        });
        expect(card).toMatchObject({
            at: "07:00",
            title: "Personal training",
            flag: { label: "No-show", tone: "bad" },
            href: "/bookings/b1",
        });
    });

    it("shows amounts only to a role that reads money", () => {
        const cards = dayCards(saturday, {
            layers: layersFor(week([saturday])),
            off: {},
            today: TODAY,
            timeZone: ZONE,
            money: true,
        });
        expect(cards.map((c) => c.amount)).toEqual(["₹1,200", "₹640", null]);
    });

    it("leaves out a layer switched off", () => {
        const cards = dayCards(saturday, {
            layers: layersFor(week([saturday])),
            off: { orders: true },
            today: TODAY,
            timeZone: ZONE,
            money: false,
        });
        expect(cards.map((c) => c.layer)).toEqual(["collections"]);
    });
});

describe("weekColumns", () => {
    it("heads each of Monday to Sunday, today and the picked day marked", () => {
        const cols = columns(week([friday, saturday]));
        expect(cols.map((c) => `${c.dow} ${c.n}`)).toEqual([
            "Mon 14",
            "Tue 15",
            "Wed 16",
            "Thu 17",
            "Fri 18",
            "Sat 19",
            "Sun 20",
        ]);
        expect(cols[4]).toMatchObject({ isToday: true, selected: true });
        expect(cols[0]).toMatchObject({ past: true, empty: "Nothing" });
        expect(cols[6]).toMatchObject({ past: false, empty: "Nothing yet" });
    });

    it("names a day's problem and says it in the header's label", () => {
        const cols = columns(week([friday, saturday]));
        expect(cols[4].problem).toBe("1 invoice overdue");
        expect(cols[5].problem).toBe("1 late order");
        expect(cols[4].label).toBe(
            "Fri 18 Sep, today: 1 thing, 1 invoice overdue",
        );
    });

    it("draws in and out only for a role the API sent money to", () => {
        const withMoney = week([saturday], {
            money: {
                total: [
                    {
                        currency: "INR",
                        in: 184_000,
                        out: 20_000,
                        net: 164_000,
                        due: 0,
                        failed: 0,
                    },
                ],
                entries: [
                    entry({ date: "2026-09-19", in: 184_000, itemId: "o8" }),
                    entry({
                        date: "2026-09-19",
                        kind: "refund",
                        out: 20_000,
                        itemId: "o9",
                    }),
                ],
            },
        });
        const sat = columns(withMoney)[5];
        expect([sat.moneyIn, sat.moneyOut]).toEqual(["+₹1.8k", "−₹200"]);
        expect(sat.label).toContain("₹1,840 in, ₹200 out");

        const without = columns(week([saturday]))[5];
        expect([without.moneyIn, without.moneyOut]).toEqual(["", ""]);
        expect(without.cards.every((c) => c.amount === null)).toBe(true);
    });

    it("says a closed day and leaves its empty column quiet", () => {
        const closed = week([], {
            daysOff: [
                {
                    kind: "closure",
                    startAt: "2026-09-19T18:30:00Z",
                    endAt: "2026-09-20T18:30:00Z",
                    allDay: true,
                    dates: ["2026-09-20"],
                    reason: "Staff outing",
                },
            ],
        });
        const sun = columns(closed)[6];
        expect(sun.off).toMatchObject({ text: "Closed", striped: true });
        expect(sun.empty).toBe("");
        expect(sun.label).toBe("Sun 20 Sep: nothing, Closed · Staff outing");
    });

    it("counts what the column doesn't list", () => {
        const busy = day(
            "2026-09-16",
            {
                orders: Array.from({ length: COLUMN_CARDS + 5 }, (_, i) =>
                    item({
                        id: `o${i}`,
                        at: at("2026-09-16", "09:00"),
                    }),
                ),
            },
            // The API stops a layer's list at 50; the count is the truth.
            { orders: 60 },
        );
        const wed = columns(week([busy]))[2];
        expect(wed.cards).toHaveLength(COLUMN_CARDS);
        expect(wed.more).toBe(60 - COLUMN_CARDS);
    });

    it("mutes days before the business joined", () => {
        const joined = week([], { joinedAt: "2026-09-16" });
        const cols = weekColumns({
            week: joined,
            dates: DATES,
            layers: layersFor(joined),
            off: {},
            today: TODAY,
            selected: TODAY,
            range: calendarRange("2026-09-16", "2026-09"),
            cash: null,
            person: null,
        });
        expect(cols.map((c) => c.outside)).toEqual([
            true,
            true,
            false,
            false,
            false,
            false,
            false,
        ]);
        expect(cols[0].empty).toBe("");
    });

    it("narrows to the person the team filter picked, and stripes their day off", () => {
        const VIKRAM = "st-vikram";
        const NEHA = "st-neha";
        const booking = (id: string, staffId: string) =>
            item({
                id,
                kind: "confirmed",
                title: id,
                at: at("2026-09-17", "07:00"),
                staffId,
                link: { type: "booking", id },
            });
        const pulse = week(
            [
                day("2026-09-17", {
                    bookings: [
                        booking("PT with Vikram", VIKRAM),
                        booking("Yoga with Neha", NEHA),
                    ],
                }),
            ],
            {
                layers: ["bookings"],
                totals: { bookings: 2 },
                hasStaff: true,
                staff: [
                    { id: VIKRAM, name: "Vikram Shah", title: null },
                    { id: NEHA, name: "Neha Joshi", title: null },
                ],
                daysOff: [
                    {
                        kind: "time_off",
                        startAt: "2026-09-18T18:30:00Z",
                        endAt: "2026-09-19T18:30:00Z",
                        allDay: true,
                        dates: ["2026-09-19"],
                        staffId: VIKRAM,
                        name: "Vikram Shah",
                    },
                ],
            },
        );
        const everyone = columns(pulse);
        expect(everyone[3].cards.map((c) => c.title)).toEqual([
            "PT with Vikram",
            "Yoga with Neha",
        ]);
        expect(everyone[5].off).toMatchObject({
            text: "Vikram off",
            striped: false,
        });

        const vikram = columns(pulse, { person: VIKRAM });
        expect(vikram[3].cards.map((c) => c.title)).toEqual(["PT with Vikram"]);
        expect(vikram[5].off).toMatchObject({ text: "Off", striped: true });
        expect(vikram[5].empty).toBe("");

        const neha = columns(pulse, { person: NEHA });
        expect(neha[5].off).toBeNull();
    });
});

describe("weekSummary", () => {
    const month = week([friday, saturday]);
    const layers = layersFor(month);

    it("counts each layer switched on for a role without money", () => {
        expect(
            weekSummary({ week: month, layers, off: {}, money: false }),
        ).toBe("2 orders · 1 pick-up · 1 invoice");
        expect(
            weekSummary({
                week: month,
                layers,
                off: { orders: true },
                money: false,
            }),
        ).toBe("1 pick-up · 1 invoice");
    });

    it("leaves the line to the columns for a money role", () => {
        expect(weekSummary({ week: month, layers, off: {}, money: true })).toBe(
            "",
        );
    });

    it("says every layer is off", () => {
        expect(
            weekSummary({
                week: month,
                layers,
                off: { orders: true, collections: true, invoices: true },
                money: true,
            }),
        ).toBe("Every layer is off");
    });
});
