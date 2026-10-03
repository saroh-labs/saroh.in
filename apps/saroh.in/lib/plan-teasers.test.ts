import { describe, expect, it } from "vitest";

import { solutions } from "@/content/solutions";
import {
    PLAN_DETAILS_PLACEHOLDER,
    PRICE_NOTE,
    PRICE_PLACEHOLDER,
} from "@/content/types";

import { solutionPlanTeasers } from "./plan-teasers";

/** A currency sign (written as an escape: no sign in the repo) or a digit. */
const NO_PRICE = new RegExp("\\u20B9|\\d");

/** A solution page's two plan cards (plan U23), on the placeholder. */
describe("solutionPlanTeasers", () => {
    it("gyms: Grow featured with the fit line, then Free", () => {
        const [first, second] = solutionPlanTeasers(solutions.gyms.pricing);
        expect(first).toMatchObject({
            plan: "grow",
            name: "Grow",
            featured: true,
            fit: solutions.gyms.pricing.fit,
        });
        expect(second).toMatchObject({
            plan: "free",
            name: "Free",
            featured: false,
        });
        expect(second.fit).toBeUndefined();
    });

    it.each(["shops", "clinics"] as const)("%s shows Pro second", (slug) => {
        const [, second] = solutionPlanTeasers(solutions[slug].pricing);
        expect(second.name).toBe("Pro");
    });

    it("shows the placeholder, never a price", () => {
        for (const s of Object.values(solutions)) {
            for (const t of solutionPlanTeasers(s.pricing)) {
                expect(t.price).toBe(PRICE_PLACEHOLDER);
                expect(t.priceNote).toBe(PRICE_NOTE);
                expect(t.what).toBe(PLAN_DETAILS_PLACEHOLDER);
                expect(JSON.stringify(t)).not.toMatch(NO_PRICE);
            }
        }
    });
});
