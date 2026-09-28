import { BadRequestException, ConflictException } from "@nestjs/common";

import {
    assertPlanOnSale,
    PLAN_NOT_PUBLISHED,
    PLANS_ON_SALE,
} from "./plan-on-sale";

/** Which plans are on sale (D21): only ACTIVE; a DRAFT is a 409. */
describe("assertPlanOnSale", () => {
    it("lets an active plan through", () => {
        expect(() => assertPlanOnSale({ status: "ACTIVE" })).not.toThrow();
    });

    it("refuses a draft with a 409 that says it isn't published, on the field", () => {
        let caught: unknown;
        try {
            assertPlanOnSale({ status: "DRAFT" });
        } catch (e) {
            caught = e;
        }
        expect(caught).toBeInstanceOf(ConflictException);
        const err = caught as ConflictException;
        expect(err.getStatus()).toBe(409);
        expect(err.getResponse()).toEqual({
            message: PLAN_NOT_PUBLISHED,
            details: { field: "planId" },
        });
    });

    it("keeps an archived plan's refusal as today: a 400 on the field", () => {
        let caught: unknown;
        try {
            assertPlanOnSale({ status: "ARCHIVED" }, "plan");
        } catch (e) {
            caught = e;
        }
        expect(caught).toBeInstanceOf(BadRequestException);
        expect((caught as BadRequestException).getResponse()).toEqual({
            message: "That plan is archived and takes no new sign-ups",
            details: { field: "plan" },
        });
    });

    it("refuses a status it doesn't know rather than selling it", () => {
        expect(() => assertPlanOnSale({ status: "" })).toThrow(
            BadRequestException,
        );
        expect(() => assertPlanOnSale({ status: "draft" })).toThrow();
    });
});

describe("PLANS_ON_SALE", () => {
    it("is the one filter a list of plans for sale uses: ACTIVE only", () => {
        expect(PLANS_ON_SALE).toEqual({ status: "ACTIVE" });
    });
});
