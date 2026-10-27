import type { PricingPageModel } from "@/lib/pricing-model";

import { PricingCards } from "../pricing/pricing-cards";
import { Container } from "../shared/layout/container";

/**
 * "Pricing for shops": the Pricing page's own plan cards (`PricingCards`),
 * then "Compare every plan".
 */
export function SolutionPricing({
    title,
    model,
    src,
}: {
    title: string;
    model: PricingPageModel;
    src: string;
}) {
    return (
        <Container
            as="section"
            aria-labelledby="pricing-title"
            className="grid gap-[18px] pt-[130px]"
        >
            <h2
                id="pricing-title"
                className="m-0 font-display text-mk-h2-sm font-bold"
            >
                {title}
            </h2>
            <PricingCards model={model} src={src} compare />
        </Container>
    );
}
