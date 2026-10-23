import { describe, expect, it } from "vitest";

import type { OwedInvoice } from "./owed-bills";
import { owedAgeOf, owedBills } from "./owed-bills";

/**
 * An age's bills in "Who owes me?" (DEC-171, #1093; `IBOwedD`): aged as the
 * API's owed by age ages them, only bills someone still owes on, by what
 * is left to pay, most late first.
 */

const NOW = new Date("2026-10-19T03:30:00.000Z");
const DAY = 24 * 60 * 60 * 1000;
const ZONE = "Asia/Kolkata";

let n = 0;
function bill(over: Partial<OwedInvoice> = {}): OwedInvoice {
    n += 1;
    return {
        id: `inv-${n}`,
        number: `RC/26-27/00${n}`,
        status: "ISSUED",
        source: "MANUAL",
        currency: "INR",
        total: "1000.00",
        dueAt: null,
        contact: { name: "Shruti Menon" },
        billTo: null,
        summary: { description: "Sourdough, monthly" },
        ...over,
    };
}

const ago = (days: number) =>
    new Date(NOW.getTime() - days * DAY).toISOString();

describe("owed bills", () => {
    it("ages a bill as the API does", () => {
        expect(owedAgeOf(null, NOW)).toBe("notDue");
        expect(owedAgeOf(ago(-3), NOW)).toBe("notDue");
        expect(owedAgeOf(ago(1), NOW)).toBe("late1to30");
        expect(owedAgeOf(ago(30), NOW)).toBe("late1to30");
        expect(owedAgeOf(ago(31), NOW)).toBe("lateOver30");
    });

    it("lists only bills still owed on, by what is left, most late first", () => {
        const invoices = [
            bill({ dueAt: ago(29), total: "11250.00" }),
            bill({
                dueAt: ago(45),
                leftToPay: "1280.00",
                total: "2000.00",
                contact: { name: "Arjun Mehta" },
            }),
            bill({ dueAt: ago(40), status: "PAID" }),
            bill({ dueAt: ago(40), source: "ORDER" }),
            bill({ dueAt: ago(40), kind: "CREDIT_NOTE" }),
            bill({ dueAt: ago(40), leftToPay: "0.00" }),
            bill({
                dueAt: ago(50),
                number: null,
                contact: null,
                billTo: { name: "Café Bloom" },
            }),
        ];
        const late = owedBills(invoices, "lateOver30", NOW, ZONE);
        expect(late.map((b) => [b.who, b.leftMinor, b.daysLate])).toEqual([
            ["Café Bloom", 100_000, 50],
            ["Arjun Mehta", 128_000, 45],
        ]);
        expect(late[0].line).toBe(
            "Sourdough, monthly · was due 30 Aug · 50 days late",
        );
        const month = owedBills(invoices, "late1to30", NOW, ZONE);
        expect(month).toHaveLength(1);
        expect(month[0].line).toMatch(
            /^RC\/26-27\/\d+ · was due 20 Sep · 29 days late$/,
        );
    });

    it("says a bill not yet due by its due date, or that it has none", () => {
        const rows = owedBills(
            [bill({ dueAt: ago(-5) }), bill({ dueAt: null })],
            "notDue",
            NOW,
            ZONE,
        );
        expect(rows.map((r) => r.line.split(" · ")[1])).toEqual([
            "due 24 Oct",
            "no due date",
        ]);
    });
});
