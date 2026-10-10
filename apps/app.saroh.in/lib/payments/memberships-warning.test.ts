import { describe, expect, it } from "vitest";

import { membershipsWarning } from "./memberships-warning";

describe("membershipsWarning (#921)", () => {
    it("says the owner's words, with how many are active", () => {
        expect(membershipsWarning("RAZORPAY", 3)).toBe(
            "Disconnecting stops Saroh syncing with Razorpay. It doesn't cancel your customers' autopay memberships there — 3 are active. Cancel them in your Razorpay dashboard if you want them stopped.",
        );
    });

    it("says one is active, and leaves the count out at none", () => {
        expect(membershipsWarning("CASHFREE", 1)).toContain(
            "there — 1 is active.",
        );
        expect(membershipsWarning("CASHFREE", 0)).toBe(
            "Disconnecting stops Saroh syncing with Cashfree. It doesn't cancel your customers' autopay memberships there. Cancel them in your Cashfree dashboard if you want them stopped.",
        );
    });

    it("names what stops the syncing", () => {
        expect(
            membershipsWarning("RAZORPAY", 2, "Deleting the business"),
        ).toMatch(/^Deleting the business stops Saroh syncing with Razorpay\./);
    });
});
