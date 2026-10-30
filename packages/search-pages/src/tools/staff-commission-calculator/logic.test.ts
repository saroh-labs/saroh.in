import { describe, expect, it } from "vitest";

import type { CommissionInput } from "./logic";
import { commission, payoutCsv, resultRows, workingNote } from "./logic";

// The boards' sample: Rye Studio, three stylists, 10% on services and 5%
// on products; slabs of 8% up to ₹50,000 and 12% above (genC/staff.py
// asserts the same sums).
const RYE: CommissionInput = {
    rule: "apart",
    service: 10,
    product: 5,
    ends: [5000000],
    slabRates: [8, 12],
    people: [
        { name: "Asha", services: 8400000, products: 600000 },
        { name: "Imran", services: 6250000, products: 240000 },
        { name: "Meera", services: 4100000, products: 980000 },
    ],
};

describe("commission", () => {
    it("works out services and products apart, to the rupee", () => {
        const c = commission(RYE);
        expect(resultRows(RYE, c)).toEqual([
            { k: "Asha", v: "₹8,700" },
            { k: "Imran", v: "₹6,370" },
            { k: "Meera", v: "₹4,590" },
            { k: "Sales counted", v: "₹2,05,700" },
            { k: "Commission this month", v: "₹19,660", total: true },
        ]);
        expect(workingNote(RYE)).toBe(
            "Asha: 10% of ₹84,000 in services is ₹8,400, and 5% of ₹6,000 in products is ₹300.",
        );
    });

    it("works out slabs on the part of sales inside each", () => {
        const i = { ...RYE, rule: "slabs" as const };
        const c = commission(i);
        expect(c.each).toEqual([838000, 562000, 377000]);
        expect(c.total).toBe(1777000);
        expect(workingNote(i)).toBe(
            "Asha: 8% of the first ₹50,000 (₹4,000), 12% of the next ₹34,000 (₹4,080), and ₹300 on products.",
        );
    });

    it("pays one rate on everything", () => {
        const i = { ...RYE, rule: "same" as const };
        expect(commission(i).each[0]).toBe(900000);
        expect(workingNote(i)).toBe("Asha: 10% of ₹90,000 is ₹9,000.");
    });

    it("rounds each payout to the paisa once", () => {
        const i = {
            ...RYE,
            service: 7.5,
            people: [{ name: "", services: 33333, products: 0 }],
        };
        expect(commission(i).each).toEqual([2500]);
        expect(resultRows(i, commission(i))[0]?.k).toBe("Person 1");
    });

    it("writes the payout sheet", () => {
        expect(payoutCsv(RYE, commission(RYE)).split("\n")).toEqual([
            "Person,Services (₹),Products (₹),Commission (₹)",
            '"Asha",84000.00,6000.00,8700.00',
            '"Imran",62500.00,2400.00,6370.00',
            '"Meera",41000.00,9800.00,4590.00',
            "Total,,,19660.00",
        ]);
    });
});
