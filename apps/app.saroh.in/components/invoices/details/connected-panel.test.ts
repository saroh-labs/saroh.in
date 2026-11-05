import { describe, expect, it } from "vitest";

import { customerLinkSub } from "./connected-panel";

describe("customerLinkSub: what the customer's page holds", () => {
    it("reads as it always did with Commerce and Payments on", () => {
        expect(customerLinkSub(true, true)).toBe(
            "Customer: orders, subscriptions and all invoices",
        );
    });

    it("names no module the business doesn't have", () => {
        expect(customerLinkSub(true, false)).toBe(
            "Customer: orders and all invoices",
        );
        expect(customerLinkSub(false, false)).toBe("Customer: all invoices");
    });
});
