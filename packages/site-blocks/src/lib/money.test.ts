import { describe, expect, it } from "vitest";

import { accountMoney } from "../account/model";
import { formatPrice } from "../blocks/services-list";
import { formatMoney } from "../booking-flow/model";
import { formatAmount } from "../product/product-page";
import { siteMoney } from "./money";

/**
 * One rule for every price on a merchant's site (DEC-073 #11): whole rupees
 * without decimals, anything else with two.
 */
describe("siteMoney", () => {
    it("drops the decimals of a whole amount", () => {
        expect(siteMoney(500, "INR", "en-IN")).toBe("₹500");
        expect(siteMoney(1099, "INR", "en-IN")).toBe("₹1,099");
        expect(siteMoney(125000, "INR", "en-IN")).toBe("₹1,25,000");
        expect(siteMoney(0, "INR", "en-IN")).toBe("₹0");
    });

    it("keeps two decimals for a fractional amount", () => {
        expect(siteMoney(499.5, "INR", "en-IN")).toBe("₹499.50");
        expect(siteMoney(12.05, "INR", "en-IN")).toBe("₹12.05");
        // A float a hair off whole is whole.
        expect(siteMoney(0.1 + 0.2 + 499.7, "INR", "en-IN")).toBe("₹500");
    });

    it("is no price for an unknown currency or a non-number", () => {
        expect(siteMoney(500, "NOT-A-CODE")).toBeNull();
        expect(siteMoney(Number.NaN, "INR")).toBeNull();
        expect(siteMoney(500, "")).toBeNull();
    });
});

describe("every price helper on the site follows it", () => {
    it("services and the booking page (amount x 100)", () => {
        expect(formatPrice(50000, "INR", "en-IN")).toBe("₹500");
        expect(formatPrice(49950, "INR", "en-IN")).toBe("₹499.50");
        expect(formatMoney(50000, "INR")).toBe("₹500");
        expect(formatMoney(49950, "INR")).toBe("₹499.50");
    });

    it("products, the bag and checkout (decimal strings)", () => {
        expect(formatAmount("500.00", "INR")).toBe("₹500");
        expect(formatAmount("1099.00", "INR")).toBe("₹1,099");
        expect(formatAmount("499.5", "INR")).toBe("₹499.50");
        expect(formatAmount("oops", "INR")).toBe("oops");
    });

    it("plans, packs and the account (decimal strings)", () => {
        expect(accountMoney("500.00", "INR")).toBe("₹500");
        expect(accountMoney("499.50", "INR")).toBe("₹499.50");
        expect(accountMoney("oops", "INR")).toBe("INR oops");
    });
});
