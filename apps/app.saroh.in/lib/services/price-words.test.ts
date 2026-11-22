import { describe, expect, it } from "vitest";

import { servicePriceWords } from "./price-words";

describe("servicePriceWords", () => {
    it("says No price for none, Free for 0, the amount otherwise", () => {
        expect(servicePriceWords(null, "INR")).toBe("No price");
        expect(servicePriceWords(undefined, "INR")).toBe("No price");
        expect(servicePriceWords(0, "INR")).toBe("Free");
        expect(servicePriceWords(120000, "INR")).toBe("₹1,200");
    });
});
