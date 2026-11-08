import { README } from "./data-export-build";

const made = new Date("2026-11-08T10:00:00Z");

describe("the export README's money and tax words", () => {
    it("India: paise, rupees and GST, as before", () => {
        const text = README("Rye", made);
        expect(text).toContain(
            "a column ending in Cents is in the smallest unit (paise), the others in rupees.",
        );
        expect(text).toContain("If GST is added to your prices");
        expect(text).toContain("the customer was charged, GST and all.");
        expect(README("Rye", made, "INDIA", "INR")).toBe(text);
    });

    it("Global in USD: cents, no paise, rupees or GST", () => {
        const text = README("Walk Test Co", made, "GLOBAL", "USD");
        expect(text).toContain(
            "cents of the currency (the smallest unit of USD)",
        );
        expect(text).toContain("the customer was charged, tax and all.");
        expect(text).not.toMatch(/paise|rupee|GST/);
    });
});
