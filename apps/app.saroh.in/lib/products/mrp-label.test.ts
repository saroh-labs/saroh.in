import type { Edition } from "@saroh/edition";
import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * The struck price's word follows `struckPrice` (DEC-204): India's MRP, an
 * original price elsewhere. Each reader holds it from load, so each edition
 * loads the modules afresh.
 */
async function load(edition: Edition) {
    vi.resetModules();
    vi.doMock("@/lib/edition", async () => {
        const { editionProfile } = await import("@saroh/edition");
        return { PROFILE: editionProfile(edition), EDITION: edition };
    });
    return {
        label: await import("./mrp-label"),
        overview: await import("./overview-words"),
        sheet: await import("./stock-sheet"),
        mrp: await import("@/lib/gst/mrp"),
        changes: await import("@/lib/settings/activity-changes"),
        history: await import("@/lib/price-history/words"),
    };
}

afterEach(() => {
    vi.doUnmock("@/lib/edition");
});

const note = {
    price: "80",
    variantPrices: [],
    optionName: null,
    mrp: "100",
    savingPercent: 20,
};
const money = (a: string) => `$${a}`;

describe("struck price words by the edition", () => {
    it("India keeps MRP and the GSTIN", async () => {
        const m = await load("INDIA");
        expect(m.label.MRP_LABEL).toBe("MRP");
        expect(m.overview.customerPriceNote(note, money)).toBe(
            "$80, with MRP $100 struck through.",
        );
        expect(m.mrp.MRP_BELOW_PRICE).toBe(
            "MRP can't be lower than the price it sells for.",
        );
        expect(m.changes.FIELD_PHRASES.taxId?.label).toBe("GSTIN or tax ID");
        expect(
            m.history.changeLine(
                { field: "mrp", before: null, after: "100" },
                { currency: "INR" },
            ),
        ).toBe("MRP set to ₹100");
    });

    it("Global says original price and tax ID, never MRP or GSTIN", async () => {
        const m = await load("GLOBAL");
        expect(m.label.MRP_LABEL).toBe("Original price");
        expect(m.overview.customerPriceNote(note, money)).toBe(
            "$80, with original price $100 struck through.",
        );
        expect(
            m.overview.customerPriceNote(
                { ...note, variantPrices: ["80", "90"] },
                money,
            ),
        ).toContain("Original price $100 is shown struck through.");
        expect(m.mrp.MRP_BELOW_PRICE).toBe(
            "Original price can't be lower than the price it sells for.",
        );
        expect(
            m.history.changeLine(
                { field: "mrp", before: null, after: "100" },
                { currency: "USD" },
            ),
        ).toBe("Original price set to $100");
        expect(m.changes.FIELD_PHRASES.taxId).toEqual({
            phrase: "the tax ID",
            label: "Tax ID",
            tab: "tax",
        });
    });
});
