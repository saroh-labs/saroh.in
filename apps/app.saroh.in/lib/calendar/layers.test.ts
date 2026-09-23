import { describe, expect, it } from "vitest";

import {
    actOnCount,
    dayChips,
    dayTitle,
    describeItem,
    itemsTotal,
    layersFor,
    leadingBlanks,
    linkHref,
    monthSummary,
    shiftMonth,
} from "./layers";
import { shortMoney, wholeMoney } from "./money";
import type {
    CalendarDay,
    CalendarItem,
    CalendarMonth,
    LayerKey,
} from "./types";

const IST = "Asia/Kolkata";

function item(over: Partial<CalendarItem> = {}): CalendarItem {
    return {
        id: "i1",
        kind: "placed",
        title: "1017",
        subtitle: "Kavya Iyer",
        at: "2026-09-18T04:30:00Z",
        link: { type: "order", id: "o1" },
        ...over,
    };
}

function day(
    date: string,
    layers: Partial<Record<LayerKey, CalendarItem[]>>,
    over: Partial<CalendarDay> = {},
): CalendarDay {
    const out: CalendarDay = { date, layers: {}, toActOn: 0 };
    for (const [key, items] of Object.entries(layers)) {
        const kinds: Record<string, number> = {};
        for (const i of items) kinds[i.kind] = (kinds[i.kind] ?? 0) + 1;
        out.layers[key as LayerKey] = { count: items.length, kinds, items };
    }
    return { ...out, ...over };
}

function month(over: Partial<CalendarMonth> = {}): CalendarMonth {
    return {
        month: "2026-09",
        timezone: IST,
        timezoneSource: "business",
        from: "",
        to: "",
        layers: ["orders", "collections", "subscriptions", "invoices"],
        totals: { orders: 3, collections: 2, subscriptions: 1, invoices: 1 },
        days: [],
        toActOn: [],
        unavailable: [],
        ...over,
    };
}

describe("layersFor", () => {
    it("a shop reads Orders, Collections, Subscriptions, Invoices in the design's colours", () => {
        expect(layersFor(month()).map((l) => [l.key, l.label, l.tone])).toEqual(
            [
                ["orders", "Orders", 1],
                ["collections", "Collections", 2],
                ["subscriptions", "Subscriptions", 3],
                ["invoices", "Invoices", 4],
            ],
        );
    });

    it("a business without orders leads with Bookings, and sells memberships", () => {
        const layers = layersFor(
            month({
                layers: [
                    "collections",
                    "subscriptions",
                    "invoices",
                    "bookings",
                    "classes",
                ],
                totals: {
                    collections: 0,
                    subscriptions: 4,
                    invoices: 2,
                    bookings: 9,
                    classes: 3,
                },
            }),
        );
        // Collections with nothing all month is not offered as a switch.
        expect(layers.map((l) => [l.key, l.label, l.tone])).toEqual([
            ["bookings", "Bookings", 1],
            ["classes", "Classes", 3],
            ["subscriptions", "Memberships", 2],
            ["invoices", "Invoices", 4],
        ]);
    });

    it("keeps the lead and a layer that could not be read, even at nothing", () => {
        const keys = layersFor(
            month({
                totals: {
                    orders: 0,
                    collections: 0,
                    subscriptions: 0,
                    invoices: null,
                },
            }),
        ).map((l) => l.key);
        expect(keys).toEqual(["orders", "invoices"]);
    });

    it("a role that reads no billing gets only what the API sent", () => {
        expect(
            layersFor(
                month({
                    layers: ["bookings", "classes"],
                    totals: { bookings: 2, classes: 1 },
                }),
            ).map((l) => l.key),
        ).toEqual(["bookings", "classes"]);
    });

    it("gives every layer its own colour when a business does both", () => {
        const tones = layersFor(
            month({
                layers: [
                    "orders",
                    "collections",
                    "subscriptions",
                    "invoices",
                    "bookings",
                    "classes",
                ],
                totals: {
                    orders: 1,
                    collections: 1,
                    subscriptions: 1,
                    invoices: 1,
                    bookings: 1,
                    classes: 1,
                },
            }),
        ).map((l) => l.tone);
        expect(new Set(tones).size).toBe(6);
    });
});

describe("a day's chips", () => {
    const layers = layersFor(month());
    const d = day("2026-09-15", {
        orders: [item()],
        subscriptions: [item({ kind: "failed" }), item({ kind: "renewal" })],
        invoices: [item({ kind: "overdue" })],
    });

    it("says what needs acting on first, then a count per layer", () => {
        expect(dayChips(d, layers, {}).map((c) => c.text)).toEqual([
            "2 to act on",
            "1 order",
            "2 renewals",
            "1 invoice",
        ]);
    });

    it("switching a layer off takes its chip and its things to act on", () => {
        const off = { invoices: true };
        expect(actOnCount(d, off)).toBe(1);
        expect(dayChips(d, layers, off).map((c) => c.text)).toEqual([
            "1 to act on",
            "1 order",
            "2 renewals",
        ]);
    });
});

describe("the month's summary", () => {
    const money = wholeMoney;
    const layers = layersFor(month());
    const data = month({
        days: [
            day("2026-09-17", { orders: [item(), item({ id: "i2" })] }),
            day("2026-09-19", {
                orders: [item()],
                subscriptions: [
                    item({ kind: "renewal", amount: "480", currency: "INR" }),
                ],
            }),
        ],
        takings: {
            lead: "orders",
            total: [{ currency: "INR", amount: "29180.00" }],
        },
    });

    it("counts the lead so far, what was taken and the renewals to come", () => {
        expect(
            monthSummary({
                month: data,
                layers,
                off: {},
                today: "2026-09-18",
                money,
            }),
        ).toBe("Orders: 2 so far · ₹29,180 · ₹480 in renewals to come");
    });

    it("without money it only counts", () => {
        const { takings: _, ...noMoney } = data;
        const summary = monthSummary({
            month: {
                ...noMoney,
                days: noMoney.days.map((d) => ({
                    ...d,
                    layers: {
                        ...d.layers,
                        subscriptions: d.layers.subscriptions && {
                            ...d.layers.subscriptions,
                            items: d.layers.subscriptions.items.map(
                                ({ amount: _a, currency: _c, ...rest }) => rest,
                            ),
                        },
                    },
                })),
            },
            layers,
            off: {},
            today: "2026-09-18",
            money,
        });
        expect(summary).toBe("Orders: 2 so far");
    });

    it("with the lead off it names each layer that is on", () => {
        expect(
            monthSummary({
                month: data,
                layers,
                off: { orders: true, collections: true },
                today: "2026-09-18",
                money,
            }),
        ).toBe("Subscriptions 1 · Invoices 1");
    });
});

describe("how things read", () => {
    const at = { timeZone: IST, ahead: false };

    it("an order, with its number and the time it came in", () => {
        expect(describeItem("orders", item(), at)).toEqual({
            title: "Order #1017 · Kavya Iyer",
            sub: "Placed 10:00",
            flag: null,
            href: "/commerce/orders/o1",
        });
    });

    it("a renewal still to come, and one that failed", () => {
        const sub = item({
            kind: "renewal",
            title: "Priya Raman",
            subtitle: "Sourdough weekly",
            link: { type: "subscription", id: "s1" },
        });
        expect(
            describeItem("subscriptions", sub, { timeZone: IST, ahead: true }),
        ).toMatchObject({
            title: "Renews · Priya Raman",
            sub: "Sourdough weekly · coming up",
        });
        expect(
            describeItem("subscriptions", { ...sub, kind: "failed" }, at),
        ).toMatchObject({
            title: "Renewal failed · Priya Raman",
            flag: { label: "Failed", tone: "bad" },
        });
    });

    it("an overdue invoice and a full class carry their flags", () => {
        expect(
            describeItem(
                "invoices",
                item({
                    kind: "overdue",
                    title: "RC/26-27/0007",
                    link: { type: "invoice", id: "v1" },
                }),
                at,
            ),
        ).toMatchObject({
            title: "Was due · RC/26-27/0007",
            flag: { label: "Overdue", tone: "bad" },
            href: "/billing/invoices/v1",
        });
        expect(
            describeItem(
                "classes",
                item({
                    kind: "full",
                    title: "HIIT circuit",
                    at: "2026-09-18T12:30:00Z",
                    link: { type: "service", id: "sv" },
                }),
                at,
            ),
        ).toMatchObject({
            title: "18:00 HIIT circuit",
            flag: { label: "Full", tone: "accent" },
            href: "/services/sv",
        });
    });

    it("links every kind of record somewhere that exists", () => {
        expect(linkHref({ type: "booking", id: "b1" })).toBe("/bookings/b1");
        expect(linkHref({ type: "subscription", id: "s1" })).toBe(
            "/billing/subscriptions/s1",
        );
    });
});

describe("money and dates", () => {
    it("adds a day's amounts in minor units, and not a capped list", () => {
        const items = [
            item({ amount: "0.10", currency: "INR" }),
            item({ amount: "0.20", currency: "INR" }),
        ];
        expect(itemsTotal(items, 2, "INR")).toBe(0.3);
        expect(itemsTotal(items, 60, "INR")).toBeNull();
        expect(itemsTotal([item()], 1, "INR")).toBeNull();
    });

    it("writes a cell's takings short, as the design does", () => {
        expect(shortMoney(3800, "INR")).toBe("₹3.8k");
        expect(shortMoney(14_700, "INR")).toBe("₹14.7k");
        expect(shortMoney(960, "INR")).toBe("₹960");
    });

    it("lays the month out from Monday and steps across years", () => {
        // 1 Sep 2026 is a Tuesday.
        expect(leadingBlanks("2026-09")).toBe(1);
        expect(leadingBlanks("2026-11")).toBe(6);
        expect(shiftMonth("2026-12", 1)).toBe("2027-01");
        expect(shiftMonth("2026-01", -1)).toBe("2025-12");
        expect(dayTitle("2026-09-18", "2026-09-23")).toBe("Fri 18 Sep");
        expect(dayTitle("2027-01-02", "2026-09-23")).toBe("Sat 2 Jan 2027");
    });
});
