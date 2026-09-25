import { describe, expect, it } from "vitest";

import { financialYear, sampleInvoiceNumber } from "./invoice-number";

describe("financialYear", () => {
    it("runs April to March", () => {
        expect(financialYear(new Date("2026-09-23T10:00:00Z"))).toBe("26-27");
        expect(financialYear(new Date("2027-01-15T10:00:00Z"))).toBe("26-27");
        expect(financialYear(new Date("2026-03-15T10:00:00Z"))).toBe("25-26");
    });

    it("turns over at midnight in India, not in UTC", () => {
        // 31 March 18:40 UTC is already 1 April 00:10 in India.
        expect(financialYear(new Date("2027-03-31T18:40:00Z"))).toBe("27-28");
        expect(financialYear(new Date("2027-03-31T18:20:00Z"))).toBe("26-27");
    });
});

describe("sampleInvoiceNumber", () => {
    const now = new Date("2026-09-25T10:00:00Z");

    it("numbers a registered business per financial year", () => {
        expect(sampleInvoiceNumber("rc", true, now)).toBe("RC/26-27/0001");
    });

    it("numbers an unregistered business on a plain series", () => {
        expect(sampleInvoiceNumber("PF", false, now)).toBe("PF-0001");
    });

    it("keeps a business with no prefix on the INV series", () => {
        expect(sampleInvoiceNumber("  ", false, now)).toBe("INV-0001");
        expect(sampleInvoiceNumber("", true, now)).toBe("INV/26-27/0001");
    });
});
