import { describe, expect, it } from "vitest";

import { dayProblems, problemAction, problemChip, problemOf } from "./problems";
import type { CalendarDay, CalendarItem, LayerKey } from "./types";

/** A Friday; its week began on Monday the 14th. */
const TODAY = "2026-09-18";

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
): CalendarDay {
    const out: CalendarDay = { date, layers: {}, toActOn: 0 };
    for (const [key, items] of Object.entries(layers)) {
        const kinds: Record<string, number> = {};
        for (const i of items) kinds[i.kind] = (kinds[i.kind] ?? 0) + 1;
        out.layers[key as LayerKey] = { count: items.length, kinds, items };
    }
    return out;
}

const overdue = item({
    id: "inv1",
    kind: "overdue",
    title: "INV-0042",
    link: { type: "invoice", id: "inv1" },
});
const failed = item({
    id: "c1:failed",
    kind: "failed",
    flags: ["failed"],
    link: { type: "subscription", id: "s1" },
});
const late = item({ id: "o2", flags: ["late"] });
const noShow = item({
    id: "b1",
    kind: "no_show",
    flags: ["no_show"],
    link: { type: "booking", id: "b1" },
});

const can = { remind: true };

describe("a day's named problem", () => {
    it("an overdue invoice is named, and its fix is a reminder", () => {
        const d = day("2026-09-10", { invoices: [overdue, item()] });
        expect(problemChip(dayProblems(d, {}, TODAY))).toBe(
            "1 invoice overdue",
        );
        const kind = problemOf("invoices", overdue, {
            date: d.date,
            today: TODAY,
        });
        expect(kind).toBe("invoice_overdue");
        expect(problemAction("invoice_overdue", { can, shop: true })).toBe(
            "Send a reminder",
        );
    });

    it("mixed problems say how many need you", () => {
        const d = day("2026-09-10", {
            invoices: [overdue],
            orders: [late],
        });
        expect(problemChip(dayProblems(d, {}, TODAY))).toBe("2 need you");
    });

    it("several of one kind are counted in its plural", () => {
        const d = day("2026-09-17", {
            orders: [late, { ...late, id: "o3" }, item({ id: "o4" })],
        });
        expect(problemChip(dayProblems(d, {}, TODAY))).toBe("2 late orders");
    });

    it("each kind reads in the design's words", () => {
        const one = (layers: Partial<Record<LayerKey, CalendarItem[]>>) =>
            problemChip(dayProblems(day("2026-09-16", layers), {}, TODAY));
        expect(one({ subscriptions: [failed] })).toBe("1 renewal failed");
        expect(one({ orders: [late] })).toBe("1 late order");
        expect(one({ bookings: [noShow] })).toBe("1 no-show");
        expect(one({ bookings: [noShow, { ...noShow, id: "b2" }] })).toBe(
            "2 no-shows",
        );
    });

    it("nothing wrong, no chip", () => {
        const d = day("2026-09-10", {
            orders: [item()],
            invoices: [item({ kind: "due" })],
            subscriptions: [item({ kind: "renewal" })],
        });
        expect(problemChip(dayProblems(d, {}, TODAY))).toBe("");
    });

    it("a layer switched off takes its problems with it", () => {
        const d = day("2026-09-10", {
            invoices: [overdue],
            orders: [late],
        });
        expect(problemChip(dayProblems(d, { orders: true }, TODAY))).toBe(
            "1 invoice overdue",
        );
        expect(
            problemChip(
                dayProblems(d, { orders: true, invoices: true }, TODAY),
            ),
        ).toBe("");
    });

    it("a no-show needs you this week, and is history before it", () => {
        const monday = day("2026-09-14", { bookings: [noShow] });
        const lastWeek = day("2026-09-13", { bookings: [noShow] });
        expect(problemChip(dayProblems(monday, {}, TODAY))).toBe("1 no-show");
        expect(problemChip(dayProblems(lastWeek, {}, TODAY))).toBe("");
        expect(
            problemOf("bookings", noShow, {
                date: lastWeek.date,
                today: TODAY,
            }),
        ).toBeNull();
    });

    it("a cancelled order is not late, and a renewal to come is not failed", () => {
        expect(
            problemOf(
                "orders",
                item({ kind: "cancelled", flags: ["cancelled"] }),
                {
                    date: "2026-09-10",
                    today: TODAY,
                },
            ),
        ).toBeNull();
        expect(
            problemOf("subscriptions", item({ kind: "renewal" }), {
                date: "2026-09-20",
                today: TODAY,
            }),
        ).toBeNull();
    });
});

describe("the fix beside each problem", () => {
    it("opens the order and the booking, in the design's words", () => {
        expect(problemAction("late_order", { can, shop: true })).toBe(
            "Open order",
        );
        expect(problemAction("no_show", { can, shop: false })).toBe(
            "Open the booking",
        );
    });

    it("a reminder is not offered to someone who can't send one", () => {
        expect(
            problemAction("invoice_overdue", {
                can: { remind: false },
                shop: true,
            }),
        ).toBe("Open invoice");
    });

    it("Retry charge stays hidden until autopay charging (D13) is live", () => {
        expect(problemAction("renewal_failed", { can, shop: true })).toBe(
            "Open subscription",
        );
        expect(problemAction("renewal_failed", { can, shop: false })).toBe(
            "Open membership",
        );
    });
});
