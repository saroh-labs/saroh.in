import { describe, expect, it } from "vitest";

import { INDIA_SITE_BUSINESS, struckWordOf, taxWordOf } from "./site-business";

describe("a site's words from its business's facts", () => {
    const global = {
        ...INDIA_SITE_BUSINESS,
        taxSystem: "named-line" as const,
        struckPrice: "original-price" as const,
    };

    it("India unchanged: MRP and GST, absent facts reading as India's", () => {
        expect(struckWordOf(INDIA_SITE_BUSINESS)).toBe("MRP");
        expect(struckWordOf(INDIA_SITE_BUSINESS, true)).toBe("MRP");
        expect(taxWordOf(INDIA_SITE_BUSINESS)).toBe("GST");
    });

    it("Global: the original price ('Was' beside a card's price), and tax", () => {
        expect(struckWordOf(global)).toBe("Original price");
        expect(struckWordOf(global, true)).toBe("Was");
        expect(taxWordOf(global)).toBe("tax");
    });
});
