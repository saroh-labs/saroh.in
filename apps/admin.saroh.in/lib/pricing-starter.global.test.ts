/**
 * The Global console starts its catalogue in dollars with no tax and no
 * yearly, every price empty (stage 9, U8).
 */
import { validateCatalog } from "@saroh/pricing-catalog";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/edition", async () => {
    const { editionProfile } = await import("@saroh/edition");
    return { PROFILE: editionProfile("GLOBAL") };
});

import { planCurrencySign, planMoney, planTaxed } from "./plan-money";
import { blankCatalog, starterCatalog } from "./pricing-starter";

describe("the Global console's catalogue", () => {
    it("starts in dollars with no tax, no yearly and no price", () => {
        for (const c of [starterCatalog(), blankCatalog()]) {
            expect([c.currency, c.tax]).toEqual(["USD", "none"]);
            expect(c.yearly.on).toBe(false);
            expect(c.plans.every((p) => p.pricePaise === 0)).toBe(true);
            expect(validateCatalog(c).ok).toBe(true);
        }
    });

    it("says its prices in dollars and hides GST", () => {
        expect(planMoney(1_950)).toBe("$19.50");
        expect(planCurrencySign()).toBe("$");
        expect(planTaxed()).toBe(false);
    });
});
