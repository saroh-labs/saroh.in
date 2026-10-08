// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { solutions } from "@/content/solutions";
import { solutionPlanTeasers } from "@/lib/plan-teasers";

import { SolutionPricing } from "./solution-pricing";

afterEach(cleanup);

/** A currency sign (written as an escape: no sign in the repo) or a digit. */
const NO_PRICE = new RegExp("\\u20B9|\\d");

/** The Solutions design's pricing block (plan U23), with no catalogue. */
describe("SolutionPricing", () => {
    it("gyms: Grow featured with its fit line, Free second, no price", () => {
        const { container } = render(
            <SolutionPricing
                title="Pricing for gyms and studios"
                plans={solutionPlanTeasers(null, solutions.gyms.pricing)}
                footnote={null}
                src="solutions-gyms-pricing"
            />,
        );
        const cards = Array.from(
            container.querySelectorAll<HTMLElement>("[data-plan]"),
        );
        expect(cards.map((c) => c.getAttribute("data-plan"))).toEqual([
            "grow",
            "free",
        ]);
        const grow = within(cards[0]);
        expect(grow.getByText(solutions.gyms.pricing.fit)).toBeTruthy();
        expect(grow.getByRole("link").getAttribute("href")).toContain(
            "plan=grow",
        );
        expect(
            within(cards[1]).queryByText(solutions.gyms.pricing.fit),
        ).toBeNull();
        expect(container.textContent).not.toMatch(NO_PRICE);
        expect(
            screen.getByRole("link", { name: "Compare every plan" }),
        ).toBeTruthy();
    });
});
