import { parseCatalog } from "@saroh/pricing-catalog";
import { describe, expect, it } from "vitest";

import { features } from "@/content/features";
import { freePlanLine } from "@/lib/plan-teasers";
import { fakeCatalog, fakeCatalogInput } from "@/lib/pricing.fixture";

import { heroPlanLine } from "./feature-hero";

/** The fake catalogue with an `ask-ai` row on the two paid plans only. */
function withAskAi(free = false) {
    const input = fakeCatalogInput();
    input.modules.push({
        id: "ask-ai",
        name: "Ask AI",
        group: "two",
        cells: {
            ...(free ? { free: { inc: true, text: "Some" } } : {}),
            grow: { inc: true, text: "Some" },
            pro: { inc: true, text: "More" },
        },
    });
    return parseCatalog(input);
}

describe("heroPlanLine", () => {
    it("names Ask AI's plans from the catalogue, never a literal", () => {
        expect(heroPlanLine(features["ask-ai"], withAskAi())).toBe(
            "Ask AI comes with Plan B and Plan C.",
        );
    });

    it("says the free-plan line when Ask AI is on every plan, missing, or there is no catalogue", () => {
        const ask = features["ask-ai"];
        expect(heroPlanLine(ask, withAskAi(true))).toBe(
            freePlanLine(withAskAi(true)),
        );
        expect(heroPlanLine(ask, fakeCatalog())).toBe(
            freePlanLine(fakeCatalog()),
        );
        expect(heroPlanLine(ask, null)).toBe(freePlanLine(null));
    });

    it("leaves every other feature on the free-plan line", () => {
        expect(heroPlanLine(features.social, withAskAi())).toBe(
            freePlanLine(withAskAi()),
        );
    });
});
