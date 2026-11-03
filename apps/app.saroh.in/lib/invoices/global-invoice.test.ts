import { describe, expect, it } from "vitest";

import { formatNumber } from "./invoice-number";
import { previewSums } from "./new-invoice-lines";

const line = {
    description: "Design",
    quantity: "2",
    unitPrice: "100.00",
    gstRate: "",
    hsnSac: "",
};

describe("a Global business's invoice preview", () => {
    it("adds its named tax on top, as the API does", () => {
        const sums = previewSums(
            { lines: [line], billToGstin: "", billToState: "" } as never,
            {
                registered: false,
                businessState: null,
                taxLine: { label: "VAT 20%", rate: 20 },
            },
        );
        expect(sums.added).toEqual({ label: "VAT 20%", cents: 4000 });
        expect(sums.totalCents).toBe(24000);
    });

    it("rounds as the API does, where floats wouldn't", () => {
        const sums = previewSums(
            {
                lines: [{ ...line, quantity: "1", unitPrice: "10.00" }],
                billToGstin: "",
                billToState: "",
            } as never,
            {
                registered: false,
                businessState: null,
                taxLine: { label: "VAT 16.15%", rate: 16.15 },
            },
        );
        expect(sums.added?.cents).toBe(162);
    });

    it("has no tax line without one", () => {
        const sums = previewSums(
            { lines: [line], billToGstin: "", billToState: "" } as never,
            { registered: false, businessState: null },
        );
        expect(sums.added).toBeNull();
        expect(sums.totalCents).toBe(20000);
    });
});

describe("a numbering year", () => {
    const format = {
        parts: ["PREFIX", "FY"],
        separator: "/",
        digits: 4,
        restart: "FY",
    } as const;
    const at = new Date("2027-02-10T12:00:00Z");
    const number = (yearStartMonth?: number) =>
        formatNumber(format as never, {
            prefix: "INV",
            counter: 1,
            now: at,
            timezone: "Europe/London",
            yearStartMonth,
        });

    it("runs January to December when chosen", () => {
        expect(number(1)).toBe("INV/2027/0001");
    });

    it("stays April to March otherwise", () => {
        expect(number()).toBe("INV/26-27/0001");
        expect(number(4)).toBe("INV/26-27/0001");
    });
});
