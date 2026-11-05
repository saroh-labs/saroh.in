import { PricingHero } from "@saroh/marketing/pricing-hero";
import type { PricingPageModel } from "@saroh/marketing/pricing-model";

import { PRICING_COPY } from "@/content/pricing";
import { demoHref } from "@/lib/demos";

import { DemoLink } from "../shared/buttons/demo-link";
import { CtaBand } from "../shared/sections/cta-band";
import { PricingPlans } from "./pricing-plans";

/**
 * The Pricing design, for a model (`lib/pricing-view.ts`): the published
 * page and the draft preview draw the same thing.
 */
export function PricingPage({ model }: { model: PricingPageModel }) {
    return (
        <>
            <PricingHero
                eyebrow={PRICING_COPY.eyebrow}
                title={PRICING_COPY.title}
                intro={PRICING_COPY.intro}
                actions={
                    <DemoLink
                        href={demoHref("salon")}
                        page="pricing"
                        trade="salon"
                    />
                }
            />
            <PricingPlans model={model} />
            <CtaBand
                title={PRICING_COPY.closer}
                src="pricing-band"
                className="pt-[120px]"
            />
        </>
    );
}
