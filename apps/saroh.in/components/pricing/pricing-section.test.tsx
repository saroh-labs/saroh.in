// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { placeholderPricingModel, pricingPageModel } from "@/lib/pricing-view";
import { fakeCatalog } from "@/lib/pricing.fixture";

import { PricingSection } from "./pricing-section";

afterEach(cleanup);

/** Home's and a solution page's Pricing: the Pricing page's own cards (`PricingCards`). */
describe("PricingSection", () => {
    it("draws every plan the Pricing page draws, then Compare every plan", () => {
        const model = pricingPageModel(fakeCatalog());
        const { container } = render(
            <PricingSection
                title="Pricing for gyms and studios"
                model={model}
                src="solutions-gyms-pricing"
            />,
        );
        const cards = Array.from(
            container.querySelectorAll<HTMLElement>("[data-plan]"),
        );
        expect(cards.map((c) => c.getAttribute("data-plan"))).toEqual(
            Object.values(model.views)[0]?.plans.map((p) => p.id),
        );
        expect(cards.length).toBe(3);
        expect(
            screen.getByRole("link", { name: /Compare every plan/ }),
        ).toBeTruthy();
    });

    it("with no catalogue, the placeholder cards", () => {
        const { container } = render(
            <PricingSection
                title="Pricing for gyms and studios"
                model={placeholderPricingModel()}
                src="solutions-gyms-pricing"
            />,
        );
        expect(container.querySelectorAll("[data-plan]").length).toBe(3);
    });
});
