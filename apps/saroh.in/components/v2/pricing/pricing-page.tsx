import type { PricingPageModel } from "@/lib/pricing-model";

import { Container } from "../container";
import { CtaBand } from "../cta-band";
import { Eyebrow } from "../eyebrow";
import { PricingPlans } from "./pricing-plans";

/** The words the Pricing design fixes; everything else comes from the catalogue. */
export const PRICING_COPY = {
    eyebrow: "Pricing",
    title: "Start free. Pay when you start selling.",
    intro: "Put your site up and take your first bookings for nothing. Move to Grow when you want orders, subscriptions and invoices, and to Pro when you want your own look and a bigger team.",
    closer: "Your site can be up tonight, for free.",
} as const;

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
