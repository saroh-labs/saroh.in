// What the subscription routes accept, checked with the same validator the
// global ValidationPipe runs. Timezones and dates that parse but do not
// exist are the service's to refuse.
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";

import { CancelSubscriptionDto, PlanInputDto, SubscribeDto } from "./dto";

async function refused<T extends object>(
    cls: new () => T,
    body: unknown,
): Promise<string[]> {
    return (await validate(plainToInstance(cls, body))).map((e) => e.property);
}

describe("what a plan accepts", () => {
    it("takes a whole plan", async () => {
        expect(
            await refused(PlanInputDto, {
                name: "Monthly membership",
                price: "1200",
                currency: "INR",
                interval: "MONTH",
            }),
        ).toEqual([]);
    });

    it("refuses an interval it does not bill on", async () => {
        expect(await refused(PlanInputDto, { interval: "DAY" })).toContain(
            "interval",
        );
    });

    it("refuses a price with three decimals", async () => {
        expect(await refused(PlanInputDto, { price: "12.345" })).toContain(
            "price",
        );
    });

    it("upper-cases the currency", () => {
        expect(
            plainToInstance(PlanInputDto, { currency: "inr" }).currency,
        ).toBe("INR");
    });
});

describe("what subscribing accepts", () => {
    it("needs a person and a plan", async () => {
        const errors = await refused(SubscribeDto, {});
        expect(errors).toEqual(expect.arrayContaining(["contactId", "planId"]));
    });

    it("takes a start date only as YYYY-MM-DD", async () => {
        const base = { contactId: "c_1", planId: "plan_1" };
        expect(
            await refused(SubscribeDto, { ...base, startDate: "2026-03-15" }),
        ).toEqual([]);
        expect(
            await refused(SubscribeDto, { ...base, startDate: "15/03/2026" }),
        ).toContain("startDate");
    });
});

describe("what cancelling accepts", () => {
    it("ends now or at the period end, nothing else", async () => {
        expect(await refused(CancelSubscriptionDto, { when: "now" })).toEqual(
            [],
        );
        expect(
            await refused(CancelSubscriptionDto, { when: "periodEnd" }),
        ).toEqual([]);
        expect(
            await refused(CancelSubscriptionDto, { when: "tomorrow" }),
        ).toContain("when");
    });
});
