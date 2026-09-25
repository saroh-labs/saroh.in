import { describe, expect, it } from "vitest";

import {
    financialYear,
    financialYearSpan,
    sampleInvoiceNumber,
} from "./invoice-number";

describe("financialYear", () => {
    it("runs April to March unless the business chose", () => {
        expect(financialYear(new Date("2026-09-23T10:00:00Z"))).toBe("26-27");
        expect(financialYear(new Date("2027-01-15T10:00:00Z"))).toBe("26-27");
        expect(financialYear(new Date("2026-03-15T10:00:00Z"))).toBe("25-26");
    });

    it("turns over at midnight in India, not in UTC", () => {
        // 31 March 18:40 UTC is already 1 April 00:10 in India.
        expect(financialYear(new Date("2027-03-31T18:40:00Z"))).toBe("27-28");
        expect(financialYear(new Date("2027-03-31T18:20:00Z"))).toBe("26-27");
    });

    it("starts in the month chosen, as the API numbers it", () => {
        const sept = new Date("2026-09-23T10:00:00Z");
        expect(financialYear(sept, 7)).toBe("26-27");
        expect(financialYear(sept, 10)).toBe("25-26");
        // A year from January carries its one calendar year.
        expect(financialYear(sept, 1)).toBe("2026");
        // Not a month: April.
        expect(financialYear(new Date("2026-03-15T10:00:00Z"), 0)).toBe(
            "25-26",
        );
    });
});

describe("financialYearSpan", () => {
    it("names the first and last month", () => {
        expect(financialYearSpan(4)).toBe("April – March");
        expect(financialYearSpan(1)).toBe("January – December");
        expect(financialYearSpan(7)).toBe("July – June");
        expect(financialYearSpan(undefined)).toBe("April – March");
    });
});

describe("sampleInvoiceNumber", () => {
    const now = new Date("2026-09-25T10:00:00Z");

    it("numbers a registered business per financial year", () => {
        expect(sampleInvoiceNumber("rc", true, 4, now)).toBe("RC/26-27/0001");
        expect(sampleInvoiceNumber("rc", true, 1, now)).toBe("RC/2026/0001");
    });

    it("numbers an unregistered business on a plain series", () => {
        expect(sampleInvoiceNumber("PF", false, 1, now)).toBe("PF-0001");
    });

    it("keeps a business with no prefix on the INV series", () => {
        expect(sampleInvoiceNumber("  ", false, 4, now)).toBe("INV-0001");
        expect(sampleInvoiceNumber("", true, 4, now)).toBe("INV/26-27/0001");
    });
});
