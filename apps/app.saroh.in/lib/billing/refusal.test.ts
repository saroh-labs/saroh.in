import { describe, expect, it } from "vitest";

import { planRefusalOf } from "./refusal";

const UP = { planId: "b", name: "Plan B", pricePaise: 11_100 };

describe("planRefusalOf", () => {
    it("reads a limit refusal's ready notice", () => {
        expect(
            planRefusalOf(
                {
                    code: "PLAN_LIMIT_REACHED",
                    limit: 10,
                    used: 10,
                    upgradeTo: UP,
                    notice: {
                        title: "You've reached your 10 products on Plan A",
                        body: "You can't add more products.",
                        cta: "Upgrade or add more",
                    },
                },
                "You've reached your 10 products on Plan A",
            ),
        ).toEqual({
            code: "PLAN_LIMIT_REACHED",
            title: "You've reached your 10 products on Plan A",
            body: "You can't add more products.",
            cta: "Upgrade or add more",
            upgradeTo: UP,
            limit: 10,
            used: 10,
        });
    });

    it("words a lock with its way up", () => {
        const r = planRefusalOf(
            { code: "MODULE_LOCKED", upgradeTo: UP },
            "Roles isn't in your Plan A plan. It comes with Plan B.",
        );
        expect(r).toMatchObject({
            code: "MODULE_LOCKED",
            title: "Roles isn't in your Plan A plan. It comes with Plan B.",
            cta: "See Plan B",
            upgradeTo: UP,
        });
        expect(r?.body).toContain("₹111 a month + GST");
    });

    it("is null for anything else, and never trusts a bad upgrade", () => {
        expect(planRefusalOf({ code: "OTHER" }, "x")).toBeNull();
        expect(planRefusalOf(null, "x")).toBeNull();
        expect(
            planRefusalOf(
                {
                    code: "MODULE_LOCKED",
                    upgradeTo: { planId: "b", name: "B", pricePaise: 1.5 },
                },
                "Locked",
            )?.upgradeTo,
        ).toBeNull();
    });
});
