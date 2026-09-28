import type { MoneySource } from "./money";
import { moneyByDay, moneyCells, placeMoney } from "./money";
import type { CalendarItem, DatedItem } from "./month";
import { buildDays } from "./month";

/**
 * The calendar's money (plan 005 E19): each source placed on the item it
 * belongs to that day, or on none, and every entry counted once in the
 * day's and the month's cells.
 */

function dated(
    layer: DatedItem["layer"],
    date: string,
    item: Partial<CalendarItem> & { id: string; link: CalendarItem["link"] },
    owes?: DatedItem["owes"],
): DatedItem {
    return {
        layer,
        date,
        item: {
            kind: "placed",
            title: item.id,
            subtitle: null,
            at: null,
            ...item,
        },
        ...(owes ? { owes } : {}),
    };
}

function source(over: Partial<MoneySource>): MoneySource {
    return {
        date: "2026-09-05",
        kind: "order_paid",
        layer: "orders",
        title: "ORD-1",
        subtitle: null,
        currency: "INR",
        cents: 50000,
        links: [{ type: "order", id: "o1" }],
        ...over,
    };
}

describe("placeMoney", () => {
    it("puts in and out on the item they belong to that day", () => {
        const order = dated("orders", "2026-09-05", {
            id: "o1",
            link: { type: "order", id: "o1" },
            currency: "INR",
        });
        const entries = placeMoney(
            [order],
            [
                source({}),
                source({ kind: "refund", cents: 10000 }),
                source({ kind: "fee", cents: 1180 }),
            ],
        );
        expect(order.item).toMatchObject({
            in: 50000,
            out: 11180,
            due: 0,
            failed: 0,
            outWhy: ["refund", "fee"],
        });
        expect(entries.every((e) => e.itemId === "o1")).toBe(true);
    });

    it("a booking's paid invoice sits on its invoice first, else on its booking", () => {
        const booking = dated("bookings", "2026-09-05", {
            id: "bk_1",
            link: { type: "booking", id: "bk_1" },
        });
        const links = [
            { type: "invoice" as const, id: "inv_1" },
            { type: "booking" as const, id: "bk_1" },
        ];
        const [alone] = placeMoney(
            [booking],
            [source({ kind: "invoice_paid", layer: "bookings", links })],
        );
        expect(alone.itemId).toBe("bk_1");

        const invoice = dated("invoices", "2026-09-05", {
            id: "inv_1",
            link: { type: "invoice", id: "inv_1" },
        });
        const fresh = dated("bookings", "2026-09-05", {
            id: "bk_1",
            link: { type: "booking", id: "bk_1" },
        });
        const [both] = placeMoney(
            [fresh, invoice],
            [source({ kind: "invoice_paid", layer: "bookings", links })],
        );
        expect(both.itemId).toBe("inv_1");
        expect(fresh.item).not.toHaveProperty("in");
    });

    it("never on another day's item, nor on an item in another currency", () => {
        const other = dated("orders", "2026-09-04", {
            id: "o1",
            link: { type: "order", id: "o1" },
        });
        const usd = dated("orders", "2026-09-05", {
            id: "o1",
            link: { type: "order", id: "o1" },
            currency: "USD",
        });
        const entries = placeMoney([other, usd], [source({})]);
        expect(entries[0].itemId).toBeNull();
        expect(other.item).not.toHaveProperty("in");
        expect(usd.item).not.toHaveProperty("in");
    });

    it("an item's own Due and failed charge are entries on it", () => {
        const renewal = dated(
            "subscriptions",
            "2026-09-13",
            { id: "inv_f:failed", link: { type: "subscription", id: "s1" } },
            { kind: "renewal_failed", currency: "INR", cents: 180000 },
        );
        const booking = dated(
            "bookings",
            "2026-09-24",
            { id: "bk_1", link: { type: "booking", id: "bk_1" } },
            { kind: "booking_due", currency: "INR", cents: 100000 },
        );
        const entries = placeMoney([renewal, booking], []);
        expect(entries).toEqual([
            expect.objectContaining({
                kind: "renewal_failed",
                failed: 180000,
                due: 0,
                itemId: "inv_f:failed",
            }),
            expect.objectContaining({
                kind: "booking_due",
                due: 100000,
                itemId: "bk_1",
            }),
        ]);
        expect(renewal.item.failed).toBe(180000);
        expect(booking.item.due).toBe(100000);
    });
});

describe("moneyCells and moneyByDay", () => {
    it("adds per currency, never across, with net = in - out", () => {
        const entries = placeMoney(
            [],
            [
                source({}),
                source({ kind: "fee", cents: 1180 }),
                source({ currency: "USD", cents: 2000, date: "2026-09-06" }),
            ],
        );
        expect(moneyCells(entries)).toEqual([
            {
                currency: "INR",
                in: 50000,
                out: 1180,
                net: 48820,
                due: 0,
                failed: 0,
            },
            {
                currency: "USD",
                in: 2000,
                out: 0,
                net: 2000,
                due: 0,
                failed: 0,
            },
        ]);
        const byDay = moneyByDay(["2026-09-05"], entries);
        expect([...byDay.keys()]).toEqual(["2026-09-05"]);
    });

    it("buildDays gives every day its cells, an empty list on a quiet one", () => {
        const entries = placeMoney([], [source({})]);
        const days = buildDays({
            days: ["2026-09-05", "2026-09-06"],
            layers: ["orders"],
            items: [],
            toActOn: [],
            takings: null,
            money: moneyByDay(["2026-09-05", "2026-09-06"], entries),
        });
        expect(days[0].money).toEqual([expect.objectContaining({ in: 50000 })]);
        expect(days[1].money).toEqual([]);
        const none = buildDays({
            days: ["2026-09-05"],
            layers: ["orders"],
            items: [],
            toActOn: [],
            takings: null,
        });
        expect(none[0]).not.toHaveProperty("money");
    });
});
