// What the subscription routes accept, checked with the same validator the
// global ValidationPipe runs. Timezones and dates that parse but do not
// exist are the service's to refuse.
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";

import {
    CancelSubscriptionDto,
    ChangePlanDto,
    CollectionScheduleDto,
    PlanInputDto,
    SkipCollectionDto,
    SubscribeDto,
} from "./dto";

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

describe("what a collection schedule accepts", () => {
    it("takes an ISO weekday, or null to stop collecting", async () => {
        expect(await refused(CollectionScheduleDto, { weekday: 6 })).toEqual(
            [],
        );
        expect(await refused(CollectionScheduleDto, { weekday: null })).toEqual(
            [],
        );
        expect(await refused(CollectionScheduleDto, { weekday: 0 })).toContain(
            "weekday",
        );
        expect(await refused(CollectionScheduleDto, {})).toContain("weekday");
    });

    it("lets subscribing name the day, 1 to 7", async () => {
        const base = { contactId: "c_1", planId: "plan_1" };
        expect(
            await refused(SubscribeDto, { ...base, collectionWeekday: 8 }),
        ).toContain("collectionWeekday");
    });
});

describe("what skipping and changing plan accept", () => {
    it("skips a collection by YYYY-MM-DD", async () => {
        expect(
            await refused(SkipCollectionDto, { date: "2026-10-03" }),
        ).toEqual([]);
        expect(await refused(SkipCollectionDto, { date: "3 Oct" })).toContain(
            "date",
        );
    });

    it("needs the plan to move to", async () => {
        expect(await refused(ChangePlanDto, {})).toContain("planId");
    });
});
