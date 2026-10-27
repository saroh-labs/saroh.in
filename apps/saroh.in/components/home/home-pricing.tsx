import { home } from "@/content/home";
import type { PricingPageModel } from "@/lib/pricing-model";

import { PricingCards } from "../pricing/pricing-cards";
import { Container } from "../shared/layout/container";

/**
 * Home's pricing (`#pricing`): the Pricing page's own plan cards
 * (`PricingCards`), then "Compare every plan". With no catalogue the model
 * is the placeholder one, as on /pricing.
 */
export function HomePricing({ model }: { model: PricingPageModel }) {
    return (
        <Container
            as="section"
            id="pricing"
            aria-labelledby="pricing-title"
            className="grid scroll-mt-6 gap-[18px] pt-[110px]"
        >
            <h2
                id="pricing-title"
                className="m-0 font-display text-mk-h2-sm font-bold"
            >
                {home.pricingTitle}
            </h2>
            <PricingCards model={model} src="home-pricing" compare />
        </Container>
    );
}
