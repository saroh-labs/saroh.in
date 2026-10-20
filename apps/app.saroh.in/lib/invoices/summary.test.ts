import { describe, expect, it } from "vitest";

import type { InvoiceSummary } from "./summary";
import { chequesLine, monthName, stripFigures, totalsWords } from "./summary";

/**
 * The Invoices money strip's words (DEC-173, U8 #1120): four figures with
 * labels, amounts and counts, the filter each stands for as the API sent
 * it, counts only for a role without money, and the cheques line only
 * while a cheque waits.
 */

const inr = (amountMinor: number) => [{ currency: "INR", amountMinor }];

const SUMMARY: InvoiceSummary = {
    zone: "Asia/Kolkata",
    monthStart: "2026-10-01",
    money: true,
    owed: { count: 18, totals: inr(3_297_000), filter: { view: "owed" } },
    overdue: {
        count: 10,
        totals: inr(2_613_000),
        filter: { view: "overdue" },
    },
    paidThisMonth: {
        count: 64,
        totals: inr(4_186_000),
        filter: { paidFrom: "2026-10-01" },
    },
    drafts: { count: 1, totals: inr(750_000), filter: { view: "draft" } },
    chequesWaiting: {
        count: 2,
        totals: inr(1_400_000),
        filter: { view: "cheques" },
    },
};

/** The same, as a role without `payment:read` gets it: no totals. */
const COUNTS: InvoiceSummary = {
    ...SUMMARY,
    money: false,
    owed: { count: 18, filter: { view: "owed" } },
    overdue: { count: 10, filter: { view: "overdue" } },
    paidThisMonth: { count: 64, filter: { paidFrom: "2026-10-01" } },
    drafts: { count: 1, filter: { view: "draft" } },
    chequesWaiting: { count: 2, filter: { view: "cheques" } },
};

describe("stripFigures", () => {
    it("says Owed to you, Overdue, Paid in October and Drafts, with amounts and counts", () => {
        expect(
            stripFigures(SUMMARY).map(({ label, value, sub }) => [
                label,
                value,
                sub,
            ]),
        ).toEqual([
            ["Owed to you", "₹32,970", "18 invoices"],
            ["Overdue", "₹26,130", "10 invoices"],
            ["Paid in October", "₹41,860", "64 invoices"],
            ["Drafts", "₹7,500", "1 draft"],
        ]);
    });

    it("carries each figure's filter as the API sent it", () => {
        expect(stripFigures(SUMMARY).map((f) => f.filter)).toEqual([
            { view: "owed" },
            { view: "overdue" },
            { paidFrom: "2026-10-01" },
            { view: "draft" },
        ]);
    });

    it("reads Overdue as late only while something is", () => {
        expect(stripFigures(SUMMARY)[1].late).toBe(true);
        const none = stripFigures({
            ...SUMMARY,
            overdue: { count: 0, totals: [], filter: { view: "overdue" } },
        })[1];
        expect(none).toMatchObject({ late: false, value: "₹0", sub: "None" });
    });

    it("says counts and no amounts for a role without money (DEC-098)", () => {
        const figures = stripFigures(COUNTS);
        expect(figures.map((f) => [f.value, f.sub])).toEqual([
            ["18", "invoices"],
            ["10", "invoices"],
            ["64", "invoices"],
            ["1", "draft"],
        ]);
        expect(JSON.stringify(figures)).not.toContain("₹");
    });
});

describe("the strip's words", () => {
    it("adds a second currency rather than mixing them", () => {
        expect(
            totalsWords([
                { currency: "INR", amountMinor: 3_540_000 },
                { currency: "USD", amountMinor: 12_000 },
            ]),
        ).toBe("₹35,400 + $120");
    });

    it("names the month from its first day, whatever the viewer's zone", () => {
        expect(monthName("2026-10-01")).toBe("October");
        expect(monthName("2027-01-01")).toBe("January");
    });
});

describe("chequesLine", () => {
    it("says how many and how much while cheques wait", () => {
        expect(chequesLine(SUMMARY)).toBe(
            "Cheques not in the bank · 2 · ₹14,000",
        );
    });

    it("says how many without money", () => {
        expect(chequesLine(COUNTS)).toBe("Cheques not in the bank · 2");
    });

    it("says nothing while none waits", () => {
        expect(chequesLine({ ...SUMMARY, chequesWaiting: null })).toBeNull();
    });
});
