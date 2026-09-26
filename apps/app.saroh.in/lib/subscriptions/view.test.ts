import { describe, expect, it } from "vitest";

import type { Subscription, SubscriptionCharge } from "./service";
import {
    changeRows,
    chargeRow,
    collectionRows,
    dayText,
    gstNote,
    headline,
    listTab,
    monthlyTotal,
    olderPrice,
    paysBy,
    ranLine,
    rowWhen,
    tabFromQuery,
} from "./view";

const NOW = new Date("2026-09-18T06:30:00Z");
const TZ = "Asia/Kolkata";

const sub = (over: Partial<Subscription> = {}): Subscription => ({
    id: "s1",
    status: "ACTIVE",
    plan: { id: "p1", name: "Sourdough weekly" },
    contact: { id: "c1", name: "Meera Iyer", email: "meera@example.in" },
    price: "1200.00",
    currency: "INR",
    interval: "MONTH",
    timezone: TZ,
    currentPeriodStart: "2026-09-01T00:00:00.000Z",
    currentPeriodEnd: "2026-10-01T00:00:00.000Z",
    nextRenewalAt: "2026-09-30T18:30:00.000Z",
    startsAt: null,
    endsAt: null,
    pausedAt: null,
    cancelledAt: null,
    overdue: false,
    overdueCount: 0,
    unpaidCount: 0,
    unpaidTotal: "0.00",
    oldestUnpaid: null,
    latestInvoice: null,
    paymentFailed: false,
    failedCharge: null,
    collection: null,
    pendingPlan: null,
    startedAt: "2026-03-02T00:00:00.000Z",
    createdAt: "2026-03-02T00:00:00.000Z",
    ...over,
});

const charge = (
    over: Partial<SubscriptionCharge> = {},
): SubscriptionCharge => ({
    id: "i1",
    number: "RC/26-27/0012",
    status: "PAID",
    standing: "PAID",
    kind: "INVOICE",
    total: "1200.00",
    currency: "INR",
    issuedAt: "2026-09-01T00:30:00.000Z",
    dueAt: "2026-09-08T00:30:00.000Z",
    paidAt: "2026-09-02T00:30:00.000Z",
    periodStart: "2026-08-31T18:30:00.000Z",
    periodEnd: "2026-09-30T18:30:00.000Z",
    payment: { method: "UPI" },
    gst: null,
    issuedAutomatically: true,
    createdAt: "2026-09-01T00:30:00.000Z",
    ...over,
});

describe("listTab", () => {
    it("puts a failed renewal on Payment failed, running or paused", () => {
        expect(listTab(sub())).toBe("active");
        expect(listTab(sub({ paymentFailed: true }))).toBe("failed");
        expect(listTab(sub({ status: "PAUSED", paymentFailed: true }))).toBe(
            "failed",
        );
        expect(listTab(sub({ status: "PAUSED" }))).toBe("paused");
        expect(listTab(sub({ status: "CANCELLED", paymentFailed: true }))).toBe(
            "cancelled",
        );
    });

    it("reads the design's ?tab= and the old ?view=overdue", () => {
        expect(tabFromQuery("overdue")).toBe("failed");
        expect(tabFromQuery("paused")).toBe("paused");
        expect(tabFromQuery("plans")).toBe("active");
        expect(tabFromQuery(undefined)).toBe("active");
    });
});

describe("rowWhen", () => {
    it("says a failed renewal in words, and how late", () => {
        const failed = sub({
            paymentFailed: true,
            failedCharge: {
                id: "i2",
                number: "RC/26-27/0013",
                dueAt: "2026-09-15T00:00:00.000Z",
                total: "1200.00",
            },
        });
        expect(rowWhen(failed, NOW)).toEqual({
            text: "Renewal of ₹1,200 isn't paid — 3 days past due",
            danger: true,
        });
    });

    it("counts older overdue invoices on a running one", () => {
        const late = sub({
            overdue: true,
            overdueCount: 2,
            unpaidTotal: "2400.00",
        });
        expect(rowWhen(late, NOW)).toEqual({
            text: "2 older invoices overdue · ₹2,400",
            danger: true,
        });
    });

    it("says the next renewal in the business's day", () => {
        expect(rowWhen(sub(), NOW).text).toBe("Next 1 Oct");
        expect(
            rowWhen(sub({ endsAt: "2026-09-30T18:30:00.000Z" }), NOW).text,
        ).toBe("Ends 1 Oct");
    });
});

describe("monthlyTotal", () => {
    it("counts only running subscriptions, a year as a twelfth", () => {
        expect(
            monthlyTotal([
                sub({ price: "1200.00" }),
                sub({ price: "12000.00", interval: "YEAR" }),
                sub({ price: "500.00", status: "PAUSED" }),
                sub({ price: "900.00", paymentFailed: true }),
            ]),
        ).toEqual({ amount: 2200, currency: "INR" });
        expect(monthlyTotal([sub({ status: "PAUSED" })])).toBeNull();
    });
});

describe("olderPrice", () => {
    it("notes a subscriber who keeps an older price", () => {
        const plans = [{ id: "p1", price: "1400.00", currency: "INR" }];
        expect(olderPrice(sub(), plans)).toEqual({ listPrice: "1400.00" });
        expect(olderPrice(sub({ price: "1400.00" }), plans)).toBeNull();
    });
});

describe("collectionRows", () => {
    const upcoming = [
        { date: "2026-09-19", skipped: false, changeable: true },
        { date: "2026-09-26", skipped: true, changeable: true },
    ];
    const collecting = (over: Partial<Subscription> = {}) =>
        sub({ collection: { weekday: 6, note: "1 loaf", upcoming }, ...over });

    it("labels each Saturday and what happens on it", () => {
        const rows = collectionRows(collecting(), NOW);
        expect(rows.map((r) => [r.label, r.state, r.canSkip])).toEqual([
            ["Sat 19 Sep", "Collect", true],
            ["Sat 26 Sep", "Skipped", true],
        ]);
    });

    it("holds every collection while the renewal is unpaid", () => {
        const rows = collectionRows(collecting({ paymentFailed: true }), NOW);
        expect(rows.map((r) => [r.state, r.canSkip])).toEqual([
            ["On hold", false],
            ["On hold", false],
        ]);
    });

    it("pauses them, with no skipping", () => {
        const rows = collectionRows(collecting({ status: "PAUSED" }), NOW);
        expect(rows.every((r) => r.state === "Paused" && !r.canSkip)).toBe(
            true,
        );
    });
});

describe("charges", () => {
    it("says a paid renewal, its period and how it was paid", () => {
        expect(chargeRow(charge(), TZ, NOW)).toMatchObject({
            date: "1 Sep",
            result: "Paid",
            tone: "ok",
            note: "1 Sep – 30 Sep · paid by UPI",
            amount: "₹1,200",
        });
    });

    it("calls an overdue renewal failed", () => {
        const row = chargeRow(
            charge({ status: "ISSUED", standing: "OVERDUE", payment: null }),
            TZ,
            NOW,
        );
        expect(row.result).toBe("Failed");
        expect(row.note).toContain("due 8 Sep");
    });

    it("finds how it pays, and whether renewals are tax invoices", () => {
        expect(paysBy([charge()])).toBe("UPI");
        expect(paysBy([charge({ payment: { method: "ONLINE" } })])).toBe(
            "the pay link",
        );
        expect(paysBy([])).toBeNull();
        expect(gstNote([charge({ gst: { cgst: "0" } })])).toBe(
            "Each renewal makes a GST invoice.",
        );
        expect(gstNote([charge()])).toBe(
            "Not GST-registered — receipts, not tax invoices.",
        );
        expect(gstNote([])).toBe("");
    });
});

describe("changeRows", () => {
    it("lists what the subscription records, newest first", () => {
        const rows = changeRows(
            sub({
                pendingPlan: {
                    id: "p2",
                    name: "Sourdough fortnightly",
                    price: "700.00",
                    currency: "INR",
                    interval: "MONTH",
                    from: "2026-09-30T18:30:00.000Z",
                },
            }),
            NOW,
        );
        expect(rows.map((r) => r.what)).toEqual([
            "Switching to Sourdough fortnightly (₹700)",
            "Started on Sourdough weekly at ₹1,200",
        ]);
        expect(rows[0].when).toBe("From 1 Oct");
    });
});

describe("ranLine", () => {
    it("says when renewals last ran, in the business's day", () => {
        expect(
            ranLine(
                {
                    lastCheckedAt: "2026-09-18T00:30:00.000Z",
                    nextCheckAt: "2026-09-18T07:00:00.000Z",
                    issuedToday: 0,
                },
                TZ,
                NOW,
            ),
        ).toEqual({ text: "Renewals last ran Today, 06:00.", late: false });
    });

    it("warns when the next run is late, or none has run", () => {
        const late = ranLine(
            {
                lastCheckedAt: "2026-09-16T00:30:00.000Z",
                nextCheckAt: "2026-09-16T01:30:00.000Z",
                issuedToday: 0,
            },
            TZ,
            NOW,
        );
        expect(late.late).toBe(true);
        expect(late.text).toMatch(/^Renewals last ran 16 Sep, 06:00 — later/);
        expect(
            ranLine(
                { lastCheckedAt: null, nextCheckAt: null, issuedToday: 0 },
                TZ,
                NOW,
            ).late,
        ).toBe(true);
    });
});

describe("dayText", () => {
    it("adds the year only when it is not this one", () => {
        expect(dayText("2027-01-02", TZ, NOW, true)).toBe("Sat 2 Jan 2027");
    });
});

describe("headline", () => {
    it("puts a booked plan change's price first", () => {
        const h = headline(
            sub({
                pendingPlan: {
                    id: "p2",
                    name: "Monthly",
                    price: "1800.00",
                    currency: "INR",
                    interval: "MONTH",
                    from: "2026-09-30T18:30:00.000Z",
                },
            }),
            "UPI",
            NOW,
        );
        expect(h).toEqual({
            pill: { tone: "ok", label: "Active" },
            big: "₹1,800",
            when: "1 Oct",
            line: "₹1,800 on 1 Oct · pays by UPI",
        });
    });

    it("says a failed renewal and holds what is collected", () => {
        const h = headline(
            sub({
                paymentFailed: true,
                failedCharge: {
                    id: "i2",
                    number: null,
                    dueAt: "2026-09-15T00:00:00.000Z",
                    total: "1200.00",
                },
            }),
            null,
            NOW,
        );
        expect(h.pill).toEqual({ tone: "bad", label: "Payment failed" });
        expect(h.when).toBe("failed 15 Sep");
        expect(h.line).toBe(
            "Renewal of ₹1,200 isn't paid — 3 days past due. Nothing is collected until it's paid.",
        );
    });

    it("shows no next charge once it is set to end", () => {
        const h = headline(
            sub({ endsAt: "2026-09-30T18:30:00.000Z" }),
            null,
            NOW,
        );
        expect(h.big).toBe("—");
        expect(h.pill).toEqual({ tone: "accent", label: "Ends 1 Oct" });
    });
});
