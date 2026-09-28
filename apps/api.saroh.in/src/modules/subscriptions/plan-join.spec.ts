import {
    MAX_OPEN_PLAN_JOINS,
    openPlanJoinsWhere,
    PLAN_JOIN_HOURS,
    planTermsOf,
    readPlanTerms,
    samePlanTerms,
} from "./plan-join";

/**
 * G20 — a plan joined online: its snapshot, read back strictly, and which
 * drafts count as waiting. Pure; the real rows are in
 * public-plan-join.db.spec.ts.
 */

const PLAN = {
    id: "plan_1",
    name: "Monthly unlimited",
    price: { toString: () => "2500" },
    currency: "INR",
    interval: "MONTH",
    classesPerMonth: 8,
};

describe("the plan's terms as joined", () => {
    it("takes the published columns, the price as a two-place decimal, and who joined", () => {
        expect(planTermsOf(PLAN, "acct_1")).toEqual({
            planId: "plan_1",
            name: "Monthly unlimited",
            price: "2500.00",
            currency: "INR",
            interval: "MONTH",
            classesPerMonth: 8,
            accountId: "acct_1",
        });
    });

    it("keeps no allowance as null (as many as they like)", () => {
        expect(
            planTermsOf({ ...PLAN, classesPerMonth: null }, "a")
                ?.classesPerMonth,
        ).toBeNull();
    });

    it("refuses an interval this build doesn't know", () => {
        expect(planTermsOf({ ...PLAN, interval: "FORTNIGHT" }, "a")).toBeNull();
    });
});

describe("reading a draft's snapshot", () => {
    const terms = planTermsOf(PLAN, "acct_1");

    it("reads back what was written", () => {
        expect(readPlanTerms({ ...terms })).toEqual(terms);
    });

    it("is null for nothing, an array, or anything malformed", () => {
        expect(readPlanTerms(null)).toBeNull();
        expect(readPlanTerms(undefined)).toBeNull();
        expect(readPlanTerms([terms])).toBeNull();
        for (const broken of [
            { ...terms, planId: "" },
            { ...terms, price: "lots" },
            { ...terms, interval: "DAY" },
            { ...terms, classesPerMonth: 0 },
            { ...terms, classesPerMonth: 1.5 },
            { ...terms, accountId: undefined },
        ]) {
            expect(readPlanTerms(broken)).toBeNull();
        }
    });
});

describe("the same terms", () => {
    const a = planTermsOf(PLAN, "acct_1");
    if (!a) throw new Error("terms");

    it("match on the plan, price, how often and classes, whoever joined", () => {
        expect(samePlanTerms(a, { ...a, price: "2500", accountId: "x" })).toBe(
            true,
        );
    });

    it("differ when anything the customer was shown changed", () => {
        for (const change of [
            { price: "2600.00" },
            { name: "Monthly" },
            { interval: "YEAR" as const },
            { classesPerMonth: null },
            { planId: "plan_2" },
        ]) {
            expect(samePlanTerms(a, { ...a, ...change })).toBe(false);
        }
    });
});

describe("the joins still waiting", () => {
    it("are this person's unnumbered SUBSCRIPTION drafts inside the last day", () => {
        const now = new Date("2026-10-01T12:00:00Z");
        expect(openPlanJoinsWhere("org", "contact", now)).toEqual({
            organizationId: "org",
            contactId: "contact",
            kind: "INVOICE",
            source: "SUBSCRIPTION",
            status: "DRAFT",
            number: null,
            createdAt: {
                gt: new Date(now.getTime() - PLAN_JOIN_HOURS * 3_600_000),
            },
        });
        expect(MAX_OPEN_PLAN_JOINS).toBe(3);
    });
});
