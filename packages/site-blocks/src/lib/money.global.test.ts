import { describe, expect, it } from "vitest";

import { formatAmount } from "./money";

describe("a site's amounts", () => {
    it("group by the business's currency", () => {
        expect(formatAmount("2044971", "INR")).toBe("₹20,44,971");
        expect(formatAmount("2044971", "USD")).toBe("$2,044,971");
        expect(formatAmount("1250.5", "GBP")).toBe("£1,250.50");
    });
});
