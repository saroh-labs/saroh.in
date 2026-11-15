import { ClosingCTA } from "@saroh/marketing/kit/closing-cta";
import type { PricingPageModel } from "@saroh/marketing/pricing-model";

import { CTA_BAND } from "@/content/home";
import { PRICING_COPY } from "@/content/pricing";
import { demoHref } from "@/lib/demos";

import { PageHero } from "@saroh/marketing/page-hero";
import { CtaLink } from "../shared/buttons/cta-link";
import { DemoLink } from "../shared/buttons/demo-link";
import { PricingPlans } from "./pricing-plans";

/**
 * The Pricing design, for a model (`lib/pricing-view.ts`): the published
 * page and the draft preview draw the same thing. The redesign's head (the
 * kit h1 and its mark) and closing; the plan cards stay, the one place a
 * plan strip is drawn (KIT.md, PlanLine).
 */
export function PricingPage({ model }: { model: PricingPageModel }) {
    return (
        <>
            <PricingHero />
            <PricingPlans model={model} />
            <ClosingCTA
                id="pricing-start"
                className="mt-[72px] min-[760px]:mt-[120px]"
                title={PRICING_COPY.closer}
                primary={<CtaLink src="pricing-band" size="kit" />}
                note={`${CTA_BAND.body} ${CTA_BAND.note}`}
            />
        </>
    );
}

function PricingHero() {
    const demo = demoHref("salon");
    return (
        <PageHero
            crumbs={[{ name: PRICING_COPY.eyebrow }]}
            title={PRICING_COPY.title}
            mark="free."
            lead={PRICING_COPY.intro}
            className="pb-8 min-[760px]:pb-10"
        >
            {demo ? (
                <div className="flex flex-wrap gap-3">
                    <DemoLink href={demo} page="pricing" trade="salon" />
                </div>
            ) : null}
        </PageHero>
    );
}
