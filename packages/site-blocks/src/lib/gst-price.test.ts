import { describe, expect, it } from "vitest";

import type { GstOnPrice } from "./gst-price";
import {
    browsePriceWords,
    gstLineWords,
    gstNoteWords,
    gstOnPriceOf,
    gstPayWords,
    gstPriceWords,
    isGstOnPrice,
    startOfLine,
} from "./gst-price";

const included: GstOnPrice = {
    mode: "INCLUDED",
    rate: "18",
    listCents: 100000,
    gstCents: 15254,
    payCents: 100000,
};
const added: GstOnPrice = {
    mode: "ADDED",
    rate: "18",
    listCents: 100000,
    gstCents: 18000,
    payCents: 118000,
};

describe("the GST words beside a price", () => {
    it("writes a price that includes GST as one sentence", () => {
        expect(gstPriceWords(included, "INR")).toBe(
            "₹1,000, includes ₹152.54 GST (18%)",
        );
    });

    it("writes a price GST is added to as a sum", () => {
        expect(gstPriceWords(added, "INR")).toBe("₹1,000 + ₹180 GST (18%)");
    });

    it("writes only the note after a price already on the page", () => {
        expect(gstNoteWords(included, "INR")).toBe(
            "includes ₹152.54 GST (18%)",
        );
        expect(gstNoteWords(added, "INR")).toBe("+ ₹180 GST (18%)");
    });

    it("writes the amount to pay as money", () => {
        expect(gstPayWords(added, "INR")).toBe("₹1,180");
        expect(gstPayWords(included, "INR")).toBe("₹1,000");
    });

    it("keeps the paise the API sent", () => {
        const paise: GstOnPrice = {
            mode: "ADDED",
            rate: "5",
            listCents: 49950,
            gstCents: 2498,
            payCents: 52448,
        };
        expect(gstPriceWords(paise, "INR")).toBe("₹499.50 + ₹24.98 GST (5%)");
        expect(gstPayWords(paise, "INR")).toBe("₹524.48");
    });

    it("writes a rate under one percent as it is", () => {
        const gold: GstOnPrice = {
            mode: "ADDED",
            rate: "0.25",
            listCents: 100000,
            gstCents: 250,
            payCents: 100250,
        };
        expect(gstPriceWords(gold, "INR")).toBe("₹1,000 + ₹2.50 GST (0.25%)");
        expect(gstNoteWords({ ...gold, mode: "INCLUDED" }, "INR")).toBe(
            "includes ₹2.50 GST (0.25%)",
        );
    });

    it("explains a line that already shows the amount to pay", () => {
        expect(gstLineWords(included, "INR")).toBe(
            "includes ₹152.54 GST (18%)",
        );
        expect(gstLineWords(added, "INR")).toBe("₹1,000 + ₹180 GST (18%)");
    });

    it("raises the first letter where the words start a line", () => {
        expect(startOfLine(gstNoteWords(included, "INR"))).toBe(
            "Includes ₹152.54 GST (18%)",
        );
        expect(startOfLine(gstNoteWords(added, "INR"))).toBe(
            "+ ₹180 GST (18%)",
        );
    });
});

describe("a price that is only being browsed", () => {
    it("says + GST only when GST comes on top", () => {
        expect(browsePriceWords("₹1,000", true)).toBe("₹1,000 + GST");
        expect(browsePriceWords("₹1,000", false)).toBe("₹1,000");
    });
});

describe("narrowing what the API sent", () => {
    it("takes the whole shape", () => {
        expect(isGstOnPrice(added)).toBe(true);
        expect(gstOnPriceOf(included)).toEqual(included);
    });

    it("reads anything else as nothing said about GST", () => {
        for (const junk of [
            null,
            undefined,
            "18",
            18,
            [],
            {},
            { ...added, mode: "EXEMPT" },
            { ...added, rate: 18 },
            { ...added, gstCents: "18000" },
            { mode: "ADDED", rate: "18", listCents: 100000 },
        ]) {
            expect(isGstOnPrice(junk)).toBe(false);
            expect(gstOnPriceOf(junk)).toBeNull();
        }
    });
});
