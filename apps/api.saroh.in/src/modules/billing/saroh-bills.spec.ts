import { ConflictException } from "@nestjs/common";

import { assertSarohBills, SAROH_BILLS_ONLY_IN_INDIA } from "./saroh-bills";

describe("assertSarohBills", () => {
    it("lets an India business through, and one with no edition set", () => {
        expect(() => assertSarohBills("INDIA")).not.toThrow();
        expect(() => assertSarohBills(undefined)).not.toThrow();
        expect(() => assertSarohBills(null)).not.toThrow();
    });

    it("refuses a Global business with a 409 and the sentence", () => {
        let thrown: unknown;
        try {
            assertSarohBills("GLOBAL");
        } catch (error) {
            thrown = error;
        }
        expect(thrown).toBeInstanceOf(ConflictException);
        expect(thrown).toMatchObject({
            status: 409,
            response: {
                message: SAROH_BILLS_ONLY_IN_INDIA,
                details: { code: "saroh-billing-unavailable" },
            },
        });
        expect(SAROH_BILLS_ONLY_IN_INDIA).toBe(
            "Saroh's plans aren't available for businesses outside India yet.",
        );
    });
});
