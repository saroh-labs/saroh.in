import { ClosingCTA } from "@saroh/marketing/kit/closing-cta";
import type { PricingPageModel } from "@saroh/marketing/pricing-model";

import { CTA_BAND } from "@/content/home";
import { PRICING_COPY } from "@/content/pricing";
import { demoHref } from "@/lib/demos";

import { PageHero } from "@saroh/marketing/page-hero";
import { PricingFaq } from "@saroh/marketing/pricing-faq";
import { TalkToUs } from "@saroh/marketing/talk-to-us";

import { SAROH_CONTACT_EMAIL } from "@/content/contact";
import { CtaLink } from "../shared/buttons/cta-link";
import { DemoLink } from "../shared/buttons/demo-link";
import { PricingPlans } from "./pricing-plans";

/**
 * The Pricing design, for a model (`lib/pricing-view.ts`): the published
 * page and the draft preview draw the same thing. The redesign's head (the
 * kit h1 and its mark) and closing; the plan cards stay, the one place a
 * plan strip is drawn (KIT.md, PlanLine).
 */
export function PricingPage({
    model,
    questions = [],
}: {
    model: PricingPageModel;
    /** "Questions about paying" (`lib/pricing-faq.ts`); none on the placeholder. */
    questions?: readonly { q: string; a: string }[];
}) {
    return (
        <>
            <PricingHero />
            <PricingPlans
                model={model}
                talk={
                    model.placeholder ? null : (
                        <TalkToUs
                            body={PRICING_COPY.talk}
                            email={SAROH_CONTACT_EMAIL}
                        />
                    )
                }
                faq={
                    <PricingFaq
                        title={PRICING_COPY.faqTitle}
                        items={questions}
                        email={SAROH_CONTACT_EMAIL}
                    />
                }
            />
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
