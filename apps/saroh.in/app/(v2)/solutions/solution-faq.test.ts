import { describe, expect, it } from "vitest";

import { solutionFaq } from "@/content/faq";
import { solutions } from "@/content/solutions";
import { SOLUTION_SLUGS } from "@/content/types";
import { faqWithPlans } from "@/lib/plan-teasers";
import { fakeCatalog } from "@/lib/pricing.fixture";

/**
 * A solution page's questions (#1186): the start-free answer goes through
 * the same swap as home's, so it names the Free plan from the catalogue,
 * and no answer says plans are "announced at launch".
 */
describe.each(SOLUTION_SLUGS)("/solutions/%s questions", (slug) => {
    const ids = solutionFaq(solutions[slug].faq);

    it("with a catalogue, the start-free answer names the free plan", () => {
        const [start] = faqWithPlans(fakeCatalog(), ids);
        expect(start.a).toMatch(/^The Plan A plan is /);
        expect(start.a).not.toMatch(/announced at launch/);
    });

    it("without one, no answer says announced at launch", () => {
        for (const item of faqWithPlans(null, ids)) {
            expect(item.a).not.toMatch(/announced at launch/);
        }
    });
});
