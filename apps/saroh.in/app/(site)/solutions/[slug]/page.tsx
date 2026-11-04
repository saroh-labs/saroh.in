import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PricingSection } from "@/components/pricing/pricing-section";
import { JsonLd } from "@/components/shared/layout/json-ld";
import { CtaBand } from "@/components/shared/sections/cta-band";
import { SolutionChanges } from "@/components/solution/solution-changes";
import { SolutionHero } from "@/components/solution/solution-hero";
import { solutionFaq } from "@/content/faq";
import { isSolutionSlug, solutionHref, solutions } from "@/content/solutions";
import { SOLUTION_SLUGS } from "@/content/types";
import { LAUNCH_MODE } from "@/lib/links";
import { faqWithPlans, freePlanLine } from "@/lib/plan-teasers";
import { readLivePricing } from "@/lib/pricing";
import { placeholderPricingModel, pricingPageModel } from "@/lib/pricing-view";
import { pageMetadata, pageTitle } from "@/lib/seo";
import { breadcrumbLd, faqPageLd } from "@/lib/structured-data";
import { Faq } from "@saroh/marketing/faq";

/**
 * `/solutions/shops`, `/solutions/salons`, `/solutions/gyms`,
 * `/solutions/clinics` (plan U23): ONE template, the Solutions design, fed
 * by `content/solutions.ts`. Any other
 * slug is a 404. Prices and the free-plan line come from the published
 * pricing catalogue, read when the site is built (a publish starts a build,
 * KTD-10), and only once the launch switch is open (DEC-136).
 */
export const dynamicParams = false;

export function generateStaticParams() {
    return SOLUTION_SLUGS.map((slug) => ({ slug }));
}

interface Props {
    params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
    const { slug } = await params;
    if (!isSolutionSlug(slug)) return {};
    const s = solutions[slug];
    // The search title leads with the trade's software; the share card
    // keeps "Saroh for ‹trade›".
    return pageMetadata({
        title: pageTitle(s.seoTitle),
        socialTitle: `Saroh for ${s.longName.toLowerCase()}`,
        description: s.seoDescription,
        path: solutionHref(slug),
    });
}

export default async function SolutionPage({ params }: Props) {
    const { slug } = await params;
    if (!isSolutionSlug(slug)) notFound();
    const s = solutions[slug];
    // Not read before the launch switch opens (DEC-136), as on a feature
    // page: the line under the hero then names no plan's contents.
    const catalog = LAUNCH_MODE === "open" ? await readLivePricing() : null;
    const faq = faqWithPlans(catalog, solutionFaq(s.faq));

    return (
        <>
            {/* The trail the hero draws: Solutions / {name}; then the
                very answers drawn below, so the two never drift. */}
            <JsonLd
                data={[
                    breadcrumbLd([
                        { name: "Solutions", path: "/#solutions" },
                        { name: s.name, path: solutionHref(slug) },
                    ]),
                    faqPageLd(faq),
                ]}
            />
            <SolutionHero solution={s} freeLine={freePlanLine(catalog)} />

            <SolutionChanges solution={s} />

            {/* Plans show once the launch switch opens (Gate W). */}
            {LAUNCH_MODE === "open" ? (
                <PricingSection
                    className="pt-[130px]"
                    title={s.pricing.title}
                    model={
                        catalog
                            ? pricingPageModel(catalog)
                            : placeholderPricingModel()
                    }
                    src={`solutions-${slug}-pricing`}
                />
            ) : null}

            <Faq items={faq} className="pt-[120px]" />

            <CtaBand
                title={s.closer}
                src={`solutions-${slug}-band`}
                className="pt-[120px]"
            />
        </>
    );
}
