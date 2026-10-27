import { PRICING_COPY } from "@/content/pricing";
import { demoHref } from "@/lib/demos";
import type { PricingPageModel } from "@/lib/pricing-model";

import { DemoLink } from "../shared/buttons/demo-link";
import { Container } from "../shared/layout/container";
import { CtaBand } from "../shared/sections/cta-band";
import { Eyebrow } from "../shared/sections/eyebrow";
import { PricingPlans } from "./pricing-plans";

/**
 * The Pricing design, for a model (`lib/pricing-view.ts`): the published
 * page and the draft preview draw the same thing.
 */
export function PricingPage({ model }: { model: PricingPageModel }) {
    return (
        <>
            <Container
                as="header"
                className="grid justify-items-start gap-[18px] pt-[72px]"
            >
                <Eyebrow>{PRICING_COPY.eyebrow}</Eyebrow>
                <h1 className="m-0 max-w-[16ch] font-display text-mk-pricing-hero font-bold [text-wrap:balance]">
                    {PRICING_COPY.title}
                </h1>
                <p className="m-0 max-w-[58ch] text-mk-intro text-mk-copy [text-wrap:pretty]">
                    {PRICING_COPY.intro}
                </p>
                <DemoLink
                    href={demoHref("salon")}
                    page="pricing"
                    trade="salon"
                />
            </Container>
            <PricingPlans model={model} />
            <CtaBand
                title={PRICING_COPY.closer}
                src="pricing-band"
                className="pt-[120px]"
            />
        </>
    );
}
