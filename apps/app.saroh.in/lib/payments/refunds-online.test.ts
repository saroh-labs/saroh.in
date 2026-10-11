import { describe, expect, it } from "vitest";

import { refundsOnline } from "./refunds-online";

describe("refundsOnline (DEC-120)", () => {
    it("is true while any payment provider is connected", () => {
        expect(
            refundsOnline([
                { provider: "RAZORPAY", status: "DISABLED" },
                { provider: "CASHFREE", status: "CONNECTED" },
            ]),
        ).toBe(true);
    });

    it("is false once the keys are gone", () => {
        expect(refundsOnline([])).toBe(false);
        expect(
            refundsOnline([{ provider: "RAZORPAY", status: "DISABLED" }]),
        ).toBe(false);
    });
});
