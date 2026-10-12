import { describe, expect, it } from "vitest";

import {
    addedGst,
    addedGstWords,
    gstActivityWords,
    gstChangeLines,
    gstHistoryLines,
    modeSays,
    rateSays,
    sacOk,
    sacSays,
    tidySac,
    typedCents,
} from "./item-words";
import { PRICE_MODE_SMALL_PRINT } from "./price-mode";

/*
 * The GST a plan, a class pack and a course carry, in words (12 Oct 2026),
 * and what "GST is added" does to a price a desk dialog is about to charge.
 */

describe("the three fields, as words", () => {
    it("says a rate, exempt as its own, and none as not set", () => {
        expect(rateSays("18")).toBe("18%");
        expect(rateSays("18.00")).toBe("18%");
        expect(rateSays("0.25")).toBe("0.25%");
        expect(rateSays("0")).toBe("0%");
        expect(rateSays(null)).toBe("not set");
        expect(rateSays("")).toBe("not set");
        expect(rateSays(undefined)).toBe("not set");
    });

    it("says how a price carries GST, and none as the business's way", () => {
        expect(modeSays("ADDED")).toBe("GST is added");
        expect(modeSays("INCLUDED")).toBe("includes GST");
        expect(modeSays(null)).toBe("same as the business");
        expect(modeSays("")).toBe("same as the business");
    });

    it("says a SAC code", () => {
        expect(sacSays("999723")).toBe("999723");
        expect(sacSays(null)).toBe("not set");
        expect(sacSays("  ")).toBe("not set");
    });

    it("takes a SAC code of four to eight digits, spaces ignored, or none", () => {
        expect(sacOk("")).toBe(true);
        expect(sacOk(null)).toBe(true);
        expect(sacOk("9997")).toBe(true);
        expect(sacOk("9997 23")).toBe(true);
        expect(sacOk("99972399")).toBe(true);
        expect(sacOk("999")).toBe(false);
        expect(sacOk("999723999")).toBe(false);
        expect(sacOk("99AB")).toBe(false);
        expect(tidySac(" 9997 23 ")).toBe("999723");
    });
});

describe("When you publish", () => {
    it("lists each GST field that differs", () => {
        expect(
            gstChangeLines(
                { gstRate: null, sacCode: null, gstPriceMode: null },
                { gstRate: "18", sacCode: "999723", gstPriceMode: "ADDED" },
            ),
        ).toEqual([
            "GST rate not set → 18%",
            "GST on this price: GST is added",
            "SAC code not set → 999723",
        ]);
    });

    it("reads a form's empty box and the API's null as the same", () => {
        expect(
            gstChangeLines(
                { gstRate: null, sacCode: null, gstPriceMode: null },
                { gstRate: "", sacCode: "", gstPriceMode: "" },
            ),
        ).toEqual([]);
        expect(gstChangeLines({ gstRate: "18.00" }, { gstRate: "18" })).toEqual(
            [],
        );
    });
});

describe("a history's sentences", () => {
    it("says each GST change after the person's name", () => {
        expect(gstHistoryLines({ gstRate: [null, "18"] })).toEqual([
            "changed the GST rate from not set to 18%",
        ]);
        expect(gstHistoryLines({ gstPriceMode: [null, "ADDED"] })).toEqual([
            "changed GST on this price to GST is added",
        ]);
        expect(gstHistoryLines({ sacCode: [null, "999723"] })).toEqual([
            "changed the SAC code from not set to 999723",
        ]);
        expect(gstHistoryLines({ sacCode: ["999723", null] })).toEqual([
            "changed the SAC code from 999723 to not set",
        ]);
    });

    it("says nothing for a field that isn't there, isn't a pair, or didn't move", () => {
        expect(gstHistoryLines({})).toEqual([]);
        expect(gstHistoryLines({ gstRate: "18" })).toEqual([]);
        expect(gstHistoryLines({ gstRate: ["18", "18.00"] })).toEqual([]);
        expect(gstHistoryLines({ gstPriceMode: [null, ""] })).toEqual([]);
    });
});

describe("a pack's activity", () => {
    it("says a GST field in the list's own form", () => {
        expect(gstActivityWords("gstRate", null, "18")).toBe(
            "GST rate 18%, was not set",
        );
        expect(gstActivityWords("gstPriceMode", null, "ADDED")).toBe(
            "GST on this price: GST is added",
        );
        expect(gstActivityWords("sacCode", "9997", "999723")).toBe(
            "SAC code 999723, was 9997",
        );
    });

    it("is null for another field, or one that didn't move", () => {
        expect(gstActivityWords("price", "1", "2")).toBeNull();
        expect(gstActivityWords("gstRate", "18", "18.00")).toBeNull();
    });
});

describe("what GST is added does to a typed price", () => {
    const ADDED = { asked: true, priceMode: "ADDED" } as const;
    const INCLUDED = { asked: true, priceMode: "INCLUDED" } as const;
    const course = { gstRate: "18", gstPriceMode: null };

    it("reads a typed price in whole paise", () => {
        expect(typedCents("5000")).toBe(500_000);
        expect(typedCents("5000.5")).toBe(500_050);
        expect(typedCents("5000.50")).toBe(500_050);
        expect(typedCents("")).toBeNull();
        expect(typedCents("five")).toBeNull();
        expect(typedCents("5000.505")).toBeNull();
    });

    it("works out ₹5,000 + ₹900 GST (18%) = ₹5,900 to pay", () => {
        const added = addedGst("5000", course, ADDED);
        expect(added).toEqual({
            listCents: 500_000,
            gstCents: 90_000,
            payCents: 590_000,
            rate: "18",
        });
        expect(added && addedGstWords(added, "INR")).toBe(
            "₹5,000 + ₹900 GST (18%) = ₹5,900 to pay",
        );
    });

    it("adds GST to a price typed for one person too", () => {
        const added = addedGst("4200.50", course, ADDED);
        expect(added && addedGstWords(added, "INR")).toBe(
            "₹4,200.50 + ₹756.09 GST (18%) = ₹4,956.59 to pay",
        );
    });

    it("follows the item's own way over the business's", () => {
        expect(
            addedGst("5000", { gstRate: "18", gstPriceMode: "ADDED" }, INCLUDED)
                ?.payCents,
        ).toBe(590_000);
        expect(
            addedGst(
                "5000",
                { gstRate: "18", gstPriceMode: "INCLUDED" },
                ADDED,
            ),
        ).toBeNull();
        // The item's own way is enough where the business's wasn't read.
        expect(
            addedGst(
                "5000",
                { gstRate: "18", gstPriceMode: "ADDED" },
                { asked: true, priceMode: null },
            )?.payCents,
        ).toBe(590_000);
    });

    it("says nothing extra whenever the typed price is the amount to pay", () => {
        expect(addedGst("5000", course, INCLUDED)).toBeNull();
        expect(addedGst("5000", { gstRate: null }, ADDED)).toBeNull();
        expect(addedGst("5000", { gstRate: "0" }, ADDED)).toBeNull();
        expect(
            addedGst("5000", course, { asked: false, priceMode: null }),
        ).toBeNull();
        expect(
            addedGst("5000", course, { asked: true, priceMode: null }),
        ).toBeNull();
        expect(addedGst("5000", course, null)).toBeNull();
        expect(addedGst("5000", course, undefined)).toBeNull();
        expect(addedGst("", course, ADDED)).toBeNull();
        expect(addedGst("0", course, ADDED)).toBeNull();
        expect(addedGst("lots", course, ADDED)).toBeNull();
    });
});

describe("the settings sheet's small print", () => {
    it("covers everything sold with a rate, and says what it leaves alone", () => {
        expect(PRICE_MODE_SMALL_PRINT).toBe(
            "This is for the prices of your services, products, courses, class packs and membership plans. You can set any one of them differently where you edit it. Members already on a plan with a GST rate pay this way from their next renewal. Invoices already issued don't change, and orders and bookings already made keep what they were charged. A delivery charge and a line you type on an invoice are charged as typed, with GST included.",
        );
    });

    it("no longer says a course, a class pack or a plan is charged as typed", () => {
        const kept = PRICE_MODE_SMALL_PRINT.split(". ").at(-1) ?? "";
        expect(kept).toContain("charged as typed, with GST included");
        expect(kept).toContain("A delivery charge");
        expect(kept).toContain("a line you type on an invoice");
        for (const word of ["course", "class pack", "membership plan"]) {
            expect(kept).not.toContain(word);
        }
    });
});
