/**
 * The plan the console shows (UX-087): the resolver's, so a live plan
 * override wins over the subscription's plan, which stays beside it.
 */
import type { BusinessAccess } from "../billing/catalogue-access.service";
import { effectivePlan } from "./effective-plan";

const UNTIL = new Date("2026-12-31T18:29:59.999Z");

function onCatalogue(over: Record<string, unknown> = {}): BusinessAccess {
    return {
        source: "catalogue",
        version: 2,
        catalog: {
            plans: [
                { id: "free", name: "Free" },
                { id: "grow", name: "Grow" },
                { id: "pro", name: "Pro" },
            ],
        },
        basePlanId: "free",
        planId: "free",
        planName: "Free",
        planOverride: null,
        ...over,
    } as unknown as BusinessAccess;
}

describe("effectivePlan", () => {
    it("is the override's plan, until its date, with the base plan beside it", () => {
        expect(
            effectivePlan(
                onCatalogue({
                    planId: "pro",
                    planName: "Pro",
                    planOverride: { id: "o", planKey: "pro", expiresAt: UNTIL },
                }),
            ),
        ).toEqual({
            id: "pro",
            name: "Pro",
            basePlanId: "free",
            basePlanName: "Free",
            override: { expiresAt: UNTIL },
        });
    });

    it("keeps an override with no end as lasting until removed", () => {
        expect(
            effectivePlan(
                onCatalogue({
                    planId: "pro",
                    planName: "Pro",
                    planOverride: { id: "o", planKey: "pro", expiresAt: null },
                }),
            )?.override,
        ).toEqual({ expiresAt: null });
    });

    it("is the subscription's plan with no override", () => {
        expect(
            effectivePlan(
                onCatalogue({
                    basePlanId: "grow",
                    planId: "grow",
                    planName: "Grow",
                }),
            ),
        ).toEqual({
            id: "grow",
            name: "Grow",
            basePlanId: "grow",
            basePlanName: "Grow",
            override: null,
        });
    });

    it("doesn't call it an override when the resolver ignored it", () => {
        // A plan the version doesn't have: logged and read as its own plan.
        const plan = effectivePlan(
            onCatalogue({
                planOverride: { id: "o", planKey: "gone", expiresAt: UNTIL },
            }),
        );
        expect(plan).toMatchObject({ id: "free", override: null });
    });

    it("is null off the catalogue, where the subscription's row is the plan", () => {
        expect(
            effectivePlan({
                source: "legacy",
                reason: "no-catalogue",
                entitlements: {},
                planEntitlements: {},
                planOverride: null,
            }),
        ).toBeNull();
    });
});
