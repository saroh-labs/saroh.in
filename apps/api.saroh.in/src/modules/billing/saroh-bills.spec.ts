import { ConflictException } from "@nestjs/common";

import {
    assertSarohBills,
    SAROH_BILLS_ONLY_IN_INDIA,
    sarohSells,
} from "./saroh-bills";

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

describe("sarohSells (stage 9, KTD3)", () => {
    const flags = (on: boolean) => ({
        isEnabled: jest.fn(() => Promise.resolve(on)),
    });

    it("always sells in India, without asking the switch", async () => {
        const off = flags(false);
        await expect(
            sarohSells(
                { organizationId: "o", edition: "INDIA" },
                new Date(),
                off,
            ),
        ).resolves.toBe(true);
        expect(off.isEnabled).not.toHaveBeenCalled();
    });

    it("sells nothing abroad while the switch is off", async () => {
        await expect(
            sarohSells(
                { organizationId: "o", edition: "GLOBAL" },
                new Date(),
                flags(false),
            ),
        ).resolves.toBe(false);
    });
});
