import { describe, expect, it } from "vitest";

import { LABELS } from "./layers";
import {
    calendarCash,
    cellMoney,
    dayMoney,
    groupMoney,
    minorMoney,
    moneyByDate,
    moneyCurrency,
    monthStrip,
    monthWhen,
    shownEntries,
    stripBreakdown,
} from "./money";
import type { CalendarMonth, MoneyEntry } from "./types";

function entry(over: Partial<MoneyEntry> = {}): MoneyEntry {
    return {
        date: "2026-09-04",
        kind: "order_paid",
        layer: "orders",
        title: "1017",
        subtitle: "Kavya Iyer",
        currency: "INR",
        in: 0,
        out: 0,
        due: 0,
        failed: 0,
        link: { type: "order", id: "o1" },
        itemId: "o1",
        ...over,
    };
}

const today = "2026-09-18";
const at = (when: "past" | "current" | "future") => ({
    when,
    today,
    currency: "INR",
});

/** September, today the 18th: money in and out so far, and due ahead. */
const september: MoneyEntry[] = [
    entry({ in: 380_000 }),
    entry({ date: "2026-09-10", kind: "refund", out: 20_000 }),
    entry({
        date: "2026-09-12",
        kind: "invoice_paid",
        layer: "bookings",
        title: "INV-0007",
        in: 120_000,
    }),
    // Due earlier this month and not paid: Overdue now, not Due (E23).
    entry({
        date: "2026-09-05",
        kind: "invoice_due",
        layer: "invoices",
        due: 30_000,
    }),
    entry({
        date: "2026-09-25",
        kind: "renewal_due",
        layer: "subscriptions",
        due: 90_000,
    }),
];

const word = (strip: ReturnType<typeof monthStrip>) =>
    strip.map((p) => [p.label, p.value]);

describe("monthStrip", () => {
    it("the current month reads In so far · Out so far · Net · Due, and Overdue before today", () => {
        expect(word(monthStrip(september, at("current")))).toEqual([
            ["In so far", "₹5,000"],
            ["Out so far", "₹200"],
            ["Net", "₹4,800"],
            // Due counts from today, as the design shows (DEC-067).
            ["Due", "₹900"],
            ["Overdue", "₹300"],
        ]);
        expect(
            monthStrip(september, at("current")).find(
                (p) => p.key === "overdue",
            )?.out,
        ).toBe(true);
    });

    it("a past month drops 'so far', and all it still asks for is Overdue", () => {
        const strip = monthStrip(september, at("past"));
        expect(strip.map((p) => p.label)).toEqual([
            "In",
            "Out",
            "Net",
            "Due",
            "Overdue",
        ]);
        expect(word(strip).slice(3)).toEqual([
            ["Due", "₹0"],
            ["Overdue", "₹1,200"],
        ]);
    });

    it("no Overdue part when nothing due before today is unpaid", () => {
        const ahead = september.filter((e) => e.date >= "2026-09-18");
        expect(monthStrip(ahead, at("current")).map((p) => p.key)).toEqual([
            "in",
            "out",
            "net",
            "due",
        ]);
    });

    it("Due counts today itself", () => {
        const today = entry({
            date: "2026-09-18",
            kind: "invoice_due",
            layer: "invoices",
            due: 5_000,
        });
        expect(word(monthStrip([today], at("current"))).at(-1)).toEqual([
            "Due",
            "₹50",
        ]);
    });

    it("a month still to come has nothing in or out yet, only Due", () => {
        expect(word(monthStrip(september, at("future")))).toEqual([
            ["In", "—"],
            ["Out", "—"],
            ["Net", "—"],
            ["Due", "₹1,200"],
        ]);
    });

    it("Out is red only when money went out, and Net goes below zero", () => {
        const strip = monthStrip(
            [entry({ kind: "refund", out: 50_000 })],
            at("past"),
        );
        expect(strip.find((p) => p.key === "out")?.out).toBe(true);
        expect(strip.find((p) => p.key === "net")?.value).toBe("−₹500");
        expect(
            monthStrip([entry({ in: 100 })], at("past")).find(
                (p) => p.key === "out",
            )?.out,
        ).toBe(false);
    });
});

describe("stripBreakdown", () => {
    const labelOf = (k: MoneyEntry["layer"]) => LABELS[k](true).label;

    it("opens each part by kind, in the calendar's order", () => {
        expect(
            stripBreakdown("in", september, { ...at("current"), labelOf }),
        ).toEqual({
            title: "Money in by kind:",
            rows: [
                { label: "Orders", value: "₹3,800" },
                { label: "Bookings", value: "₹1,200" },
            ],
        });
        expect(
            stripBreakdown("due", september, { ...at("current"), labelOf })
                .rows,
        ).toEqual([{ label: "Subscriptions", value: "₹900" }]);
        expect(
            stripBreakdown("overdue", september, {
                ...at("current"),
                labelOf,
            }),
        ).toEqual({
            title: "Overdue by kind:",
            rows: [{ label: "Invoices", value: "₹300" }],
        });
    });

    it("says nothing when a part holds nothing", () => {
        expect(
            stripBreakdown("out", september, { ...at("future"), labelOf }),
        ).toEqual({ title: "Money out by kind: nothing", rows: [] });
    });
});

describe("cells and the day", () => {
    it("a cell shows +in and −out, short", () => {
        const byDate = moneyByDate([
            entry({ in: 380_000 }),
            entry({ kind: "refund", out: 20_000 }),
        ]);
        expect(cellMoney(byDate.get("2026-09-04"), "INR")).toEqual({
            in: "+₹3.8k",
            out: "−₹200",
        });
        expect(cellMoney(byDate.get("2026-09-05"), "INR")).toEqual({
            in: "",
            out: "",
        });
    });

    it("the day says In, Out, Due and what Out is", () => {
        expect(
            dayMoney(
                [
                    entry({ in: 100_000 }),
                    entry({ kind: "refund", out: 20_000 }),
                    entry({ kind: "fee", out: 2_000 }),
                    entry({ kind: "fee", out: 500 }),
                ],
                "INR",
            ),
        ).toEqual({
            in: "₹1,000",
            out: "₹225",
            due: null,
            why: "Out is a refund and fees.",
        });
        expect(
            dayMoney([entry({ kind: "booking_due", due: 50_000 })], "INR"),
        ).toMatchObject({ out: "₹0", due: "₹500", why: "" });
    });

    it("a day with no money has no money line", () => {
        expect(dayMoney([], "INR")).toBeNull();
        expect(
            dayMoney([entry({ kind: "renewal_failed", failed: 1 })], "INR"),
        ).toBeNull();
    });

    it("a layer's heading adds what it took, is due and failed", () => {
        expect(
            groupMoney(
                [
                    entry({ in: 240_000 }),
                    entry({ kind: "invoice_due", due: 60_000 }),
                    entry({ kind: "renewal_failed", failed: 180_000 }),
                ],
                "INR",
            ),
        ).toBe("₹2,400 · ₹600 due · ₹1,800 failed");
        expect(groupMoney([], "INR")).toBe("");
    });
});

describe("what is added up", () => {
    it("one currency, and none of a layer switched off", () => {
        const all = [
            entry({ in: 100 }),
            entry({ in: 200, currency: "USD" }),
            entry({ in: 300, layer: "bookings" }),
        ];
        expect(shownEntries(all, "INR", { bookings: true })).toEqual([all[0]]);
    });

    it("a viewer without payment:read draws no money at all", () => {
        const month = { money: undefined } as unknown as CalendarMonth;
        expect(calendarCash(month, {}, "INR")).toBeNull();
        const shut = {
            money: { total: null, entries: [] },
        } as unknown as CalendarMonth;
        expect(calendarCash(shut, {}, "INR")).toBeNull();
    });

    it("with it: the whole month for the file, the switched-on for the screen", () => {
        const all = [entry({ in: 100 }), entry({ in: 300, layer: "bookings" })];
        const month = {
            money: { total: [], entries: all },
        } as unknown as CalendarMonth;
        expect(calendarCash(month, { bookings: true }, "INR")).toEqual({
            currency: "INR",
            all,
            shown: [all[0]],
        });
    });

    it("the money's own currency leads", () => {
        const month = {
            money: {
                total: [
                    {
                        currency: "USD",
                        in: 0,
                        out: 0,
                        net: 0,
                        due: 0,
                        failed: 0,
                    },
                ],
                entries: [],
            },
        } as unknown as CalendarMonth;
        expect(moneyCurrency(month, "INR")).toBe("USD");
        expect(moneyCurrency({} as CalendarMonth, "INR")).toBe("INR");
    });

    it("months sit before, at or after this one", () => {
        expect(monthWhen("2026-08", "2026-09")).toBe("past");
        expect(monthWhen("2026-09", "2026-09")).toBe("current");
        expect(monthWhen("2026-10", "2026-09")).toBe("future");
    });

    it("minor units read as whole money, below zero with a minus", () => {
        expect(minorMoney(2_918_000, "INR")).toBe("₹29,180");
        expect(minorMoney(-40_000, "INR")).toBe("−₹400");
    });
});
