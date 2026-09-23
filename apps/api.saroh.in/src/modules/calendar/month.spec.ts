import type { CalendarItem, DatedItem, ToActOn } from "./month";
import {
    buildDays,
    dayOf,
    isMonth,
    mergeToActOn,
    monthWindow,
    sumMoney,
} from "./month";
import { collectionsInMonth, upcomingRenewals } from "./schedules";

/**
 * The Business Calendar's month, as pure bucketing (U4): the month's edges
 * in the business's zone, every day present and every layer on it, each
 * rupee once, and each thing to act on once.
 */

function item(id: string, over: Partial<CalendarItem> = {}): CalendarItem {
    return {
        id,
        kind: "placed",
        title: id,
        subtitle: null,
        at: null,
        link: { type: "order", id },
        ...over,
    };
}

describe("monthWindow", () => {
    it("starts and ends at the business's midnights, not UTC's", () => {
        const w = monthWindow("2026-09", "Asia/Kolkata");
        expect(w.start.toISOString()).toBe("2026-08-31T18:30:00.000Z");
        expect(w.end.toISOString()).toBe("2026-09-30T18:30:00.000Z");
        expect(w.days).toHaveLength(30);
        expect(w.days[0]).toBe("2026-09-01");
        expect(w.days[29]).toBe("2026-09-30");
    });

    it("an order at 00:30 IST on the 1st is the 1st, though UTC says the 31st", () => {
        const at = new Date("2026-08-31T19:00:00Z");
        expect(dayOf(at, "Asia/Kolkata")).toBe("2026-09-01");
        expect(dayOf(at, "UTC")).toBe("2026-08-31");
    });

    it("keeps a month's days across a daylight-saving change", () => {
        const w = monthWindow("2026-03", "Europe/London");
        expect(w.days).toHaveLength(31);
        expect(w.start.toISOString()).toBe("2026-03-01T00:00:00.000Z");
        // April starts in summer time: an hour before UTC midnight.
        expect(w.end.toISOString()).toBe("2026-03-31T23:00:00.000Z");
    });

    it("knows a month from anything else", () => {
        expect(isMonth("2026-09")).toBe(true);
        expect(isMonth("2026-13")).toBe(false);
        expect(isMonth("2026-9")).toBe(false);
        expect(() => monthWindow("nope", "UTC")).toThrow();
    });
});

describe("buildDays", () => {
    const days = monthWindow("2026-09", "UTC").days;

    it("counts per day and layer, by kind, and drops what is outside the month", () => {
        const items: DatedItem[] = [
            ...["o1", "o2", "o3"].map((id) => ({
                layer: "orders" as const,
                date: "2026-09-05",
                item: item(id),
            })),
            {
                layer: "invoices",
                date: "2026-09-05",
                item: item("i1", { kind: "overdue" }),
            },
            { layer: "orders", date: "2026-10-01", item: item("late") },
        ];
        const out = buildDays({
            days,
            layers: ["orders", "invoices"],
            items,
            toActOn: [],
            takings: null,
        });
        expect(out).toHaveLength(30);
        const fifth = out[4];
        expect(fifth.layers.orders).toMatchObject({
            count: 3,
            kinds: { placed: 3 },
        });
        expect(fifth.layers.invoices?.kinds).toEqual({ overdue: 1 });
        expect(out.flatMap((d) => d.layers.orders?.items ?? [])).toHaveLength(
            3,
        );
    });

    it("a quiet day carries every visible layer, empty — never a missing key", () => {
        const out = buildDays({
            days,
            layers: ["orders", "bookings"],
            items: [],
            toActOn: [],
            takings: [],
        });
        for (const day of out) {
            expect(day.layers).toEqual({
                orders: { count: 0, kinds: {}, items: [] },
                bookings: { count: 0, kinds: {}, items: [] },
            });
            expect(day.toActOn).toBe(0);
            expect(day.takings).toEqual([]);
        }
    });

    it("leaves out a layer the viewer may not see, and takings without money", () => {
        const out = buildDays({
            days,
            layers: ["bookings"],
            items: [{ layer: "invoices", date: "2026-09-02", item: item("i") }],
            toActOn: [],
            takings: null,
        });
        expect(out[1].layers).not.toHaveProperty("invoices");
        expect(out[1]).not.toHaveProperty("takings");
    });

    it("caps a day's list but keeps the true count", () => {
        const items: DatedItem[] = Array.from({ length: 7 }, (_, i) => ({
            layer: "orders" as const,
            date: "2026-09-03",
            item: item(`o${i}`),
        }));
        const [, , third] = buildDays({
            days,
            layers: ["orders"],
            items,
            toActOn: [],
            takings: null,
            itemsPerDay: 5,
        });
        expect(third.layers.orders?.count).toBe(7);
        expect(third.layers.orders?.items).toHaveLength(5);
    });

    it("sums takings per day and per currency, in minor units", () => {
        const out = buildDays({
            days,
            layers: ["orders"],
            items: [],
            toActOn: [],
            takings: [
                { date: "2026-09-05", currency: "INR", amount: "100.10" },
                { date: "2026-09-05", currency: "INR", amount: "0.20" },
                { date: "2026-09-05", currency: "USD", amount: "5" },
            ],
        });
        expect(out[4].takings).toEqual([
            { currency: "INR", amount: "100.30" },
            { currency: "USD", amount: "5.00" },
        ]);
        expect(sumMoney([])).toEqual([]);
    });
});

describe("mergeToActOn", () => {
    const act = (over: Partial<ToActOn>): ToActOn => ({
        kind: "invoice_overdue",
        date: "2026-09-10",
        title: "INV-1",
        subtitle: null,
        link: { type: "invoice", id: "inv_1" },
        ...over,
    });

    it("a failed renewal is not also an overdue invoice", () => {
        const out = mergeToActOn(
            [
                {
                    ...act({
                        kind: "renewal_failed",
                        link: { type: "subscription", id: "sub_1" },
                    }),
                    invoiceId: "inv_1",
                },
            ],
            [
                { ...act({ kind: "renewal_failed" }), invoiceId: "inv_1" },
                {
                    ...act({ title: "INV-2", date: "2026-09-03" }),
                    invoiceId: "inv_2",
                },
            ],
        );
        expect(out.map((a) => [a.kind, a.link.type])).toEqual([
            ["invoice_overdue", "invoice"],
            ["renewal_failed", "subscription"],
        ]);
    });
});

describe("a subscription's month", () => {
    const base = {
        status: "ACTIVE",
        interval: "WEEK",
        timezone: "Asia/Kolkata",
        anchorAt: new Date("2026-08-01T04:00:00Z"),
        createdAt: new Date("2026-08-01T04:00:00Z"),
        currentPeriodEnd: new Date("2026-09-05T04:00:00Z"),
        cancelAtPeriodEnd: false,
        pausedAt: null,
        cancelledAt: null,
        // Saturday.
        collectionWeekday: 6,
    };
    const sept = monthWindow("2026-09", "Asia/Kolkata");

    it("renews at each period end still to come in the month", () => {
        const dates = upcomingRenewals(base, sept.start, sept.end).map((d) =>
            dayOf(d, "Asia/Kolkata"),
        );
        expect(dates).toEqual([
            "2026-09-05",
            "2026-09-12",
            "2026-09-19",
            "2026-09-26",
        ]);
        expect(
            upcomingRenewals(
                { ...base, cancelAtPeriodEnd: true },
                sept.start,
                sept.end,
            ),
        ).toEqual([]);
    });

    it("collects every Saturday, and a skipped one is absent", () => {
        expect(collectionsInMonth(base, sept.days, new Set())).toEqual([
            "2026-09-05",
            "2026-09-12",
            "2026-09-19",
            "2026-09-26",
        ]);
        expect(
            collectionsInMonth(base, sept.days, new Set(["2026-09-12"])),
        ).toEqual(["2026-09-05", "2026-09-19", "2026-09-26"]);
    });

    it("stops at a pause, a cancel, or the end it is set for", () => {
        expect(
            collectionsInMonth(
                {
                    ...base,
                    status: "PAUSED",
                    pausedAt: new Date("2026-09-15T06:00:00Z"),
                },
                sept.days,
                new Set(),
            ),
        ).toEqual(["2026-09-05", "2026-09-12"]);
        expect(
            collectionsInMonth(
                {
                    ...base,
                    status: "CANCELLED",
                    cancelledAt: new Date("2026-09-12T06:00:00Z"),
                },
                sept.days,
                new Set(),
            ),
        ).toEqual(["2026-09-05"]);
        expect(
            collectionsInMonth(
                {
                    ...base,
                    cancelAtPeriodEnd: true,
                    currentPeriodEnd: new Date("2026-09-19T04:00:00Z"),
                },
                sept.days,
                new Set(),
            ),
        ).toEqual(["2026-09-05", "2026-09-12"]);
    });

    it("starts no earlier than the subscription did; no weekday, none at all", () => {
        expect(
            collectionsInMonth(
                {
                    ...base,
                    anchorAt: new Date("2026-09-14T04:00:00Z"),
                    createdAt: new Date("2026-09-14T04:00:00Z"),
                },
                sept.days,
                new Set(),
            ),
        ).toEqual(["2026-09-19", "2026-09-26"]);
        expect(
            collectionsInMonth(
                { ...base, collectionWeekday: null },
                sept.days,
                new Set(),
            ),
        ).toEqual([]);
    });
});
