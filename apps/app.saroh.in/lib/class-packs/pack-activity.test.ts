import { describe, expect, it } from "vitest";

import {
    activityRow,
    activityText,
    usedEmptyText,
    usedRows,
} from "./pack-activity";
import type {
    PackEvent,
    PackEventsPage,
    PackSale,
    PackUse,
} from "./pack-detail-data";
import { priceHistory, saleRow, salesByMonth } from "./pack-sales";

/**
 * Pack Detail's Used this week, Sales and Activity in words (round-2 E17).
 */

const ZONE = "Asia/Kolkata";
const NOW = new Date("2026-10-01T06:30:00.000Z");
const PACK = { price: "1500.00", currency: "INR" };

function sale(over: Partial<PackSale> = {}): PackSale {
    return {
        purchaseId: "pp_1",
        contact: { id: "c_1", name: "Asha Rao" },
        soldAt: "2026-09-10T06:30:00.000Z",
        credits: 10,
        price: "1500.00",
        currency: "INR",
        paidBy: "UPI",
        soldBy: { kind: "TEAM", userId: "u_1", name: "Priya" },
        invoiceId: "inv_1",
        ...over,
    };
}

function event(over: Partial<PackEvent> = {}): PackEvent {
    return {
        id: "ev_1",
        kind: "CREATED",
        details: {},
        holder: null,
        actor: { kind: "TEAM", userId: "u_1", name: "Priya" },
        createdAt: "2026-09-10T06:30:00.000Z",
        ...over,
    };
}

function page(
    events: PackEvent[],
    over: Partial<PackEventsPage> = {},
): PackEventsPage {
    return { events, nextCursor: null, earlierUnrecorded: false, ...over };
}

function use(over: Partial<PackUse> = {}): PackUse {
    return {
        bookingId: "b_1",
        purchaseId: "pp_1",
        startAt: "2026-09-29T01:30:00.000Z",
        service: { id: "s1", name: "HIIT" },
        contact: { id: "c_1", name: "Asha Rao" },
        state: "CAME",
        ...over,
    };
}

describe("Used this week", () => {
    it("lists the week latest first, with the class, person and state", () => {
        const rows = usedRows(
            {
                from: "",
                to: "",
                uses: [
                    use(),
                    use({
                        bookingId: "b_2",
                        startAt: "2026-10-01T12:30:00.000Z",
                        state: "BOOKED",
                    }),
                    use({ bookingId: "b_3", state: "NO_SHOW" }),
                ],
            },
            ZONE,
        );
        expect(rows.map((r) => r.when)).toEqual([
            "Thu 1 Oct 18:00",
            "Tue 29 Sep 07:00",
            "Tue 29 Sep 07:00",
        ]);
        expect(rows[0]).toMatchObject({
            what: "HIIT",
            who: "Asha Rao",
            state: { label: "Booked", tone: "accent" },
        });
        expect(rows[1].state).toEqual({ label: "Came", tone: "ok" });
        expect(rows[2].state).toEqual({ label: "No-show", tone: "bad" });
    });

    it("says a cancel in time gave the credit back, and a late one didn't", () => {
        const rows = usedRows(
            {
                from: "",
                to: "",
                uses: [
                    use({ state: "CREDIT_BACK" }),
                    use({ bookingId: "b_2", state: "LATE_CANCEL" }),
                ],
            },
            ZONE,
        );
        expect(rows.map((r) => r.state.label).sort()).toEqual([
            "Credit back",
            "Late cancel",
        ]);
    });

    it("an empty week names what the pack pays for", () => {
        expect(usedEmptyText("CLASSES")).toBe(
            "No classes booked with this pack this week.",
        );
        expect(usedEmptyText("ONE_TO_ONE")).toBe(
            "No sessions booked with this pack this week.",
        );
    });
});

describe("Sales by month", () => {
    it("draws six months, this one last, with counts and takings", () => {
        const { months, note } = salesByMonth(
            [
                sale(),
                sale({
                    purchaseId: "pp_2",
                    soldAt: "2026-10-01T02:00:00.000Z",
                }),
                sale({
                    purchaseId: "pp_3",
                    soldAt: "2026-09-12T06:30:00.000Z",
                    price: "1200.00",
                }),
                // Too old for the card.
                sale({
                    purchaseId: "pp_4",
                    soldAt: "2026-03-01T06:30:00.000Z",
                }),
            ],
            "INR",
            NOW,
            ZONE,
        );
        expect(months.map((m) => m.label)).toEqual([
            "May",
            "Jun",
            "Jul",
            "Aug",
            "Sep",
            "Oct",
        ]);
        expect(months[4]).toMatchObject({
            n: "2 sold",
            amt: "₹2,700",
            pct: 100,
        });
        expect(months[5]).toMatchObject({ n: "1 sold", amt: "₹1,500" });
        expect(months[5].pct).toBe(56);
        expect(months[0]).toMatchObject({ n: "—", amt: "", pct: 0 });
        expect(note).toBe("₹4,200 in the last six months");
    });

    it("counts a sale in the business's zone, not the server's", () => {
        // 30 Sep 20:00 UTC is 1 Oct in Kolkata.
        const { months } = salesByMonth(
            [sale({ soldAt: "2026-09-30T20:00:00.000Z" })],
            "INR",
            NOW,
            ZONE,
        );
        expect(months[5].n).toBe("1 sold");
        expect(months[4].n).toBe("—");
    });

    it("no sales, and none lately, are said differently", () => {
        expect(salesByMonth([], "INR", NOW, ZONE).note).toBe("No sales yet.");
        expect(
            salesByMonth(
                [sale({ soldAt: "2025-01-01T06:30:00.000Z" })],
                "INR",
                NOW,
                ZONE,
            ).note,
        ).toBe("None in the last six months.");
    });
});

describe("Price history", () => {
    const changed = (at: string, before: unknown, after: unknown) =>
        event({
            id: at,
            kind: "CHANGED",
            details: { price: [before, after] },
            createdAt: at,
        });

    it("today's price and each earlier one, with who bought at it", () => {
        const h = priceHistory(
            PACK,
            page([
                changed("2026-09-01T06:30:00.000Z", "1200.00", "1500.00"),
                changed("2026-08-01T06:30:00.000Z", "1000.00", "1200.00"),
            ]),
            [
                sale(),
                sale({ purchaseId: "pp_2", price: "1200.00" }),
                sale({ purchaseId: "pp_3", price: "1200.00" }),
            ],
            ZONE,
        );
        expect(h.entries).toEqual([
            { t: "₹1,500 now", sub: "Since 1 Sep · 1 bought at this price" },
            {
                t: "₹1,200",
                sub: "Until 1 Sep · 2 bought at it — they keep it",
            },
            {
                t: "₹1,000",
                sub: "Until 1 Aug · 0 bought at it — they keep it",
            },
        ]);
        expect(h.about).toBe("₹1,000 until 1 Aug · ₹1,200 until 1 Sep");
        expect(h.note).toBeNull();
    });

    it("never changed, with its whole history", () => {
        const h = priceHistory(PACK, page([event()]), [sale()], ZONE);
        expect(h.entries).toEqual([
            {
                t: "₹1,500 now",
                sub: "Since it was created · 1 bought at this price",
            },
        ]);
        expect(h.about).toBe("Unchanged since it was created");
    });

    it("older than its history: says so rather than 'never changed'", () => {
        const h = priceHistory(
            PACK,
            page([], { earlierUnrecorded: true }),
            null,
            ZONE,
        );
        expect(h.entries).toEqual([
            { t: "₹1,500 now", sub: "No change recorded" },
        ]);
        expect(h.about).toBe("No change recorded");
        expect(h.note).toBe("Earlier changes weren't recorded.");
    });

    it("a draft's first price isn't a change", () => {
        const h = priceHistory(
            PACK,
            page([changed("2026-09-01T06:30:00.000Z", null, "1500.00")]),
            [],
            ZONE,
        );
        expect(h.entries).toHaveLength(1);
        expect(h.about).toBe("Unchanged since it was created");
    });

    it("a history longer than the page read points to Activity", () => {
        const h = priceHistory(
            PACK,
            page([], { nextCursor: "ev_9" }),
            [],
            ZONE,
        );
        expect(h.note).toBe("Older changes are further back in Activity.");
        expect(h.about).toBe("No change recorded");
    });
});

describe("Each sale", () => {
    it("its method, amount and who sold it, with the receipt for invoice:read", () => {
        expect(
            saleRow(sale(), PACK, { timeZone: ZONE, invoices: true }),
        ).toEqual({
            purchaseId: "pp_1",
            when: "10 Sep",
            name: "Asha Rao",
            href: "/contacts/c_1",
            amount: "₹1,500",
            older: false,
            method: "UPI",
            soldBy: "Sold by Priya",
            receiptHref: "/billing/invoices/inv_1",
        });
    });

    it("sold with no payment says None; no receipt link without invoice:read", () => {
        const row = saleRow(sale({ paidBy: "NONE", price: "1200.00" }), PACK, {
            timeZone: ZONE,
            invoices: false,
        });
        expect(row.method).toBe("None");
        expect(row.older).toBe(true);
        expect(row.receiptHref).toBeNull();
    });

    it("an old sale with nothing recorded, one bought online, one by support", () => {
        expect(
            saleRow(sale({ paidBy: null, soldBy: null }), PACK, {
                timeZone: ZONE,
                invoices: true,
            }),
        ).toMatchObject({ method: "Not recorded", soldBy: null });
        expect(
            saleRow(
                sale({
                    paidBy: "ONLINE",
                    soldBy: { kind: "CUSTOMER", userId: null, name: null },
                }),
                PACK,
                { timeZone: ZONE, invoices: true },
            ),
        ).toMatchObject({
            method: "Online",
            soldBy: "Bought on the booking page",
        });
        expect(
            saleRow(
                sale({
                    soldBy: {
                        kind: "OPERATOR",
                        userId: null,
                        name: "Saroh support",
                    },
                }),
                PACK,
                { timeZone: ZONE, invoices: true },
            ).soldBy,
        ).toBe("Sold by Saroh support");
    });
});

describe("Activity", () => {
    it("says each kind of event in the design's words", () => {
        const say = (e: Partial<PackEvent>) =>
            activityText(event(e), PACK, "CLASSES");
        expect(say({ kind: "CREATED" })).toBe("Created");
        expect(say({ kind: "PUBLISHED" })).toBe("Published — on sale");
        expect(say({ kind: "ARCHIVED" })).toBe(
            "Archived — nobody new can buy it",
        );
        expect(say({ kind: "RESTORED" })).toBe("Back on sale");
        expect(
            say({
                kind: "SOLD",
                holder: { purchaseId: "pp_1", contactId: "c_1", name: "Asha" },
                details: {
                    price: "1500.00",
                    currency: "INR",
                    credits: 10,
                    paidBy: "CASH",
                },
            }),
        ).toBe("Sold to Asha · ₹1,500 · Cash");
        expect(
            say({
                kind: "SOLD",
                holder: null,
                details: { price: "1500.00", currency: "INR", paidBy: null },
            }),
        ).toBe("Sold · ₹1,500");
        expect(
            say({
                kind: "EXTENDED",
                holder: { purchaseId: "pp_1", contactId: "c_1", name: "Asha" },
                details: { days: 1, reason: "Fever", expiresAt: ["a", "b"] },
            }),
        ).toBe("Asha's pack extended 1 day — Fever");
    });

    it("names what changed, before and after", () => {
        expect(
            activityText(
                event({
                    kind: "CHANGED",
                    details: {
                        price: ["1200.00", "1500.00"],
                        credits: [8, 10],
                        validityDays: [30, 60],
                        serviceIds: [["s1"], ["s1", "s2"]],
                        firstPackOnly: [false, true],
                    },
                }),
                PACK,
                "CLASSES",
            ),
        ).toBe(
            "Price ₹1,500, was ₹1,200; 10 classes, was 8; use within 60 days, was 30; classes it covers changed; now for a first pack only",
        );
        expect(
            activityText(
                event({
                    kind: "CHANGED",
                    details: {
                        name: ["Ten", "Ten classes"],
                        kind: ["CLASSES", "ONE_TO_ONE"],
                    },
                }),
                PACK,
                "ONE_TO_ONE",
            ),
        ).toBe(
            "Renamed to “Ten classes”, was “Ten”; now for one-to-one sessions",
        );
        expect(
            activityText(
                event({ kind: "CHANGED", details: {} }),
                PACK,
                "CLASSES",
            ),
        ).toBe("Terms changed");
    });

    it("says who did it: a teammate, support, or the customer online", () => {
        const row = (actor: PackEvent["actor"]) =>
            activityRow(event({ actor }), PACK, "CLASSES", ZONE);
        expect(row({ kind: "TEAM", userId: "u_1", name: "Priya" })).toEqual({
            id: "ev_1",
            when: "10 Sep",
            text: "Created",
            who: "Priya",
        });
        expect(row({ kind: "TEAM", userId: "u_2", name: null }).who).toBe(
            "A teammate",
        );
        expect(
            row({ kind: "OPERATOR", userId: null, name: "Saroh support" }).who,
        ).toBe("Saroh support");
        expect(row({ kind: "CUSTOMER", userId: null, name: null }).who).toBe(
            "The customer, online",
        );
    });
});
