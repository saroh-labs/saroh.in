import { BadRequestException } from "@nestjs/common";

import { creditChoiceOf, isClassService } from "./booking-credit";

/**
 * What a CREDIT booking may name (A10). The offer and the spend against
 * real rows are in `public-booking-credit.db.spec.ts`.
 */

const CLASS = { capacity: 12 };
const ONE_TO_ONE = { capacity: 1 };

describe("the credit a booking names (A10)", () => {
    it("takes a pack for any service", () => {
        expect(creditChoiceOf({ packPurchaseId: "pp_1" }, ONE_TO_ONE)).toEqual({
            kind: "PACK",
            packPurchaseId: "pp_1",
        });
    });

    it("takes a membership for a class", () => {
        expect(creditChoiceOf({ subscriptionId: "sub_1" }, CLASS)).toEqual({
            kind: "MEMBERSHIP",
            subscriptionId: "sub_1",
        });
    });

    it("refuses a membership for a one-to-one", () => {
        expect(() =>
            creditChoiceOf({ subscriptionId: "sub_1" }, ONE_TO_ONE),
        ).toThrow(BadRequestException);
    });

    it("refuses none, and both", () => {
        expect(() => creditChoiceOf({}, CLASS)).toThrow(
            "Choose the credit this class comes out of.",
        );
        expect(() =>
            creditChoiceOf(
                { packPurchaseId: "pp_1", subscriptionId: "sub_1" },
                CLASS,
            ),
        ).toThrow("A class is paid with one credit. Choose one.");
    });

    it("says credit-gone, so the page offers another way to pay", () => {
        try {
            creditChoiceOf({}, CLASS);
        } catch (err) {
            expect((err as BadRequestException).getResponse()).toMatchObject({
                details: { reason: "credit-gone" },
            });
        }
        expect.assertions(1);
    });

    it("refuses any credit for a treatment, which is paid on its order (E9)", () => {
        const treatment = { capacity: 1, visits: 3 };
        expect(() =>
            creditChoiceOf({ packPurchaseId: "pp_1" }, treatment),
        ).toThrow(
            "A treatment is paid for on its order, not with a pack or a membership.",
        );
        expect(() =>
            creditChoiceOf(
                { subscriptionId: "sub_1" },
                { ...treatment, capacity: 8 },
            ),
        ).toThrow(BadRequestException);
        expect(
            creditChoiceOf(
                { packPurchaseId: "pp_1" },
                { capacity: 1, visits: 1 },
            ),
        ).toEqual({ kind: "PACK", packPurchaseId: "pp_1" });
    });

    it("calls a service of more than one place a class", () => {
        expect(isClassService(CLASS)).toBe(true);
        expect(isClassService(ONE_TO_ONE)).toBe(false);
    });
});
