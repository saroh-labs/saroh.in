import { describe, expect, it } from "vitest";

import type { MrpPricing } from "./mrp";
import {
    MRP_BELOW_PRICE,
    NO_MRP_PRICING,
    optionOverMrpNote,
    overMrpProblem,
    payPreview,
    toPayLine,
} from "./mrp";

/**
 * GST is part of MRP (12 Oct 2026), as the product editor previews it: the
 * MRP is compared with the amount to pay for one, GST and all. The sums
 * here are the API's (`products/product-rules.spec.ts` there), to the
 * paisa.
 */

/** A registered business that adds GST to its prices, at `rate` percent. */
const added = (rate: string, over: Partial<MrpPricing> = {}): MrpPricing => ({
    registered: true,
    businessMode: "ADDED",
    itemMode: "",
    rate,
    ...over,
});

const included = (rate = "18"): MrpPricing => ({
    registered: true,
    businessMode: "INCLUDED",
    itemMode: "",
    rate,
});

describe("what one costs to pay", () => {
    it("adds the GST at each rate: ₹1,000 is ₹1,050, ₹1,120, ₹1,180 and ₹1,280", () => {
        // 1000 + 5% of 1000 = 1000 + 50
        expect(payPreview("1000", added("5"))?.payCents).toBe(105_000);
        // 1000 + 12% of 1000 = 1000 + 120
        expect(payPreview("1000", added("12"))?.payCents).toBe(112_000);
        // 1000 + 18% of 1000 = 1000 + 180
        expect(payPreview("1000", added("18"))?.payCents).toBe(118_000);
        // 1000 + 28% of 1000 = 1000 + 280
        expect(payPreview("1000", added("28"))?.payCents).toBe(128_000);
    });

    it("rounds the GST to the paisa, half up", () => {
        // 99.99 × 18% = 17.9982, which is ₹18.00; 99.99 + 18.00 = 117.99
        expect(payPreview("99.99", added("18"))?.payCents).toBe(11_799);
        // 49.50 × 5% = 2.475, which is ₹2.48; 49.50 + 2.48 = 51.98
        expect(payPreview("49.50", added("5"))?.payCents).toBe(5_198);
    });

    it("is the typed price when it includes GST, has no rate, is exempt, or the business isn't registered", () => {
        expect(payPreview("1000", included())).toEqual({
            listCents: 100_000,
            payCents: 100_000,
            addedRate: null,
        });
        expect(payPreview("1000", added(""))?.payCents).toBe(100_000);
        expect(payPreview("1000", added("0"))?.payCents).toBe(100_000);
        expect(
            payPreview("1000", added("18", { registered: false }))?.payCents,
        ).toBe(100_000);
        expect(payPreview("1000", NO_MRP_PRICING)?.payCents).toBe(100_000);
    });

    it("follows the product's own choice over the business's, both ways", () => {
        expect(
            payPreview("1000", { ...included(), itemMode: "ADDED" })?.payCents,
        ).toBe(118_000);
        expect(
            payPreview("1000", added("18", { itemMode: "INCLUDED" }))?.payCents,
        ).toBe(100_000);
    });

    it("adds nothing where the business's way couldn't be told and the product has none of its own", () => {
        expect(
            payPreview("1000", added("18", { businessMode: null }))?.payCents,
        ).toBe(100_000);
        // Its own choice is enough to know.
        expect(
            payPreview(
                "1000",
                added("18", { businessMode: null, itemMode: "ADDED" }),
            )?.payCents,
        ).toBe(118_000);
    });

    it("is null for something that isn't money", () => {
        expect(payPreview("", added("18"))).toBeNull();
        expect(payPreview("about ten", added("18"))).toBeNull();
    });
});

describe("the quiet line beside the MRP", () => {
    it("says the amount to pay and the rate where GST is added", () => {
        expect(toPayLine("1000", added("18"), "INR")).toBe(
            "₹1,180 to pay with 18% GST",
        );
        expect(toPayLine("1000", added("5"), "INR")).toBe(
            "₹1,050 to pay with 5% GST",
        );
        expect(toPayLine("99.99", added("18"), "INR")).toBe(
            "₹117.99 to pay with 18% GST",
        );
    });

    it("says nothing for a business that isn't registered, or a price that includes GST", () => {
        expect(toPayLine("1000", NO_MRP_PRICING, "INR")).toBeNull();
        expect(toPayLine("1000", included(), "INR")).toBeNull();
        expect(toPayLine("1000", added("0"), "INR")).toBeNull();
        expect(toPayLine("", added("18"), "INR")).toBeNull();
    });
});

describe("a variant's own price against its MRP", () => {
    it("is compared as typed while prices include GST, in the words it always had", () => {
        expect(optionOverMrpNote("1000", "1100", included(), "INR")).toBeNull();
        expect(optionOverMrpNote("1100", "1100", included(), "INR")).toBeNull();
        expect(optionOverMrpNote("1200", "1100.00", included(), "INR")).toBe(
            "Above the MRP of ₹1,100. Lower it, or raise the MRP in Basics.",
        );
    });

    it("is compared by the amount to pay where GST is added: refused above, allowed at the MRP", () => {
        // ₹1,000 + ₹180 = ₹1,180 to pay.
        expect(optionOverMrpNote("1000", "1100", added("18"), "INR")).toBe(
            "With 18% GST added this is ₹1,180 to pay, above the MRP of ₹1,100. Lower it, or raise the MRP in Basics.",
        );
        expect(
            optionOverMrpNote("1000", "1180", added("18"), "INR"),
        ).toBeNull();
        // A typed price itself above the MRP keeps the plain words.
        expect(optionOverMrpNote("1200", "1100", added("18"), "INR")).toBe(
            "Above the MRP of ₹1,100. Lower it, or raise the MRP in Basics.",
        );
    });

    it("says nothing for a blank price, no MRP, or a business that isn't registered", () => {
        expect(optionOverMrpNote("", "1100", added("18"), "INR")).toBeNull();
        expect(optionOverMrpNote("1000", null, added("18"), "INR")).toBeNull();
        expect(
            optionOverMrpNote("1000", "1100", NO_MRP_PRICING, "INR"),
        ).toBeNull();
    });
});

describe("a price against its MRP", () => {
    it("includes GST: the typed price is compared, as it always was", () => {
        expect(overMrpProblem("1000", "1100", included(), "INR")).toBeNull();
        expect(overMrpProblem("1000", "1000", included(), "INR")).toBeNull();
        expect(overMrpProblem("1000", "999", included(), "INR")).toBe(
            MRP_BELOW_PRICE,
        );
    });

    it("GST is added: refused above the MRP with the sums, allowed at exactly the MRP and below it", () => {
        // ₹1,000 + ₹180 = ₹1,180 to pay.
        expect(overMrpProblem("1000", "1100", added("18"), "INR")).toBe(
            "With 18% GST added this is ₹1,180 to pay, more than its MRP of ₹1,100. Lower the price, raise the MRP, or set this product's price to include GST.",
        );
        expect(overMrpProblem("1000", "1179.99", added("18"), "INR")).toBe(
            "With 18% GST added this is ₹1,180 to pay, more than its MRP of ₹1,179.99. Lower the price, raise the MRP, or set this product's price to include GST.",
        );
        expect(overMrpProblem("1000", "1180", added("18"), "INR")).toBeNull();
        expect(overMrpProblem("1000", "1200", added("18"), "INR")).toBeNull();
    });

    it("says the same at 5, 12 and 28 percent", () => {
        // 1,050 against 1,049.99; 1,120 against 1,100; 1,280 against 1,279.
        expect(overMrpProblem("1000", "1049.99", added("5"), "INR")).toContain(
            "With 5% GST added this is ₹1,050 to pay, more than its MRP of ₹1,049.99.",
        );
        expect(overMrpProblem("1000", "1050", added("5"), "INR")).toBeNull();
        expect(overMrpProblem("1000", "1100", added("12"), "INR")).toContain(
            "With 12% GST added this is ₹1,120 to pay, more than its MRP of ₹1,100.",
        );
        expect(overMrpProblem("1000", "1120", added("12"), "INR")).toBeNull();
        expect(overMrpProblem("1000", "1279", added("28"), "INR")).toContain(
            "With 28% GST added this is ₹1,280 to pay, more than its MRP of ₹1,279.",
        );
        expect(overMrpProblem("1000", "1280", added("28"), "INR")).toBeNull();
    });

    it("a typed price that is itself above the MRP says what it always said", () => {
        expect(overMrpProblem("1200", "1100", added("18"), "INR")).toBe(
            MRP_BELOW_PRICE,
        );
    });

    it("the product's own choice decides, both ways", () => {
        expect(
            overMrpProblem(
                "1000",
                "1100",
                { ...included(), itemMode: "ADDED" },
                "INR",
            ),
        ).toContain("₹1,180 to pay");
        expect(
            overMrpProblem(
                "1000",
                "1100",
                added("18", { itemMode: "INCLUDED" }),
                "INR",
            ),
        ).toBeNull();
    });

    it("a business that isn't registered is untouched", () => {
        expect(
            overMrpProblem("1000", "1100", NO_MRP_PRICING, "INR"),
        ).toBeNull();
        expect(
            overMrpProblem(
                "1000",
                "1100",
                added("18", { registered: false }),
                "INR",
            ),
        ).toBeNull();
        expect(overMrpProblem("1000", "900", NO_MRP_PRICING, "INR")).toBe(
            MRP_BELOW_PRICE,
        );
    });
});
