import type { Metadata } from "next";

import { HomeHero } from "@/components/home/home-hero";
import { TourVideo } from "@/components/home/tour-video";
import { PricingSection } from "@/components/pricing/pricing-section";
import { JsonLd } from "@/components/shared/layout/json-ld";
import { CtaBand } from "@/components/shared/sections/cta-band";
import { HOME_FAQ } from "@/content/faq";
import { featureHref, featureList, NEW_FEATURES } from "@/content/features";
import { home } from "@/content/home";
import { solutionList } from "@/content/solutions";
import { LAUNCH_MODE } from "@/lib/links";
import { HOME_OG_ALT } from "@/lib/og-card";
import { faqWithPlans, freePlanLine } from "@/lib/plan-teasers";
import { readLivePricing } from "@/lib/pricing";
import { placeholderPricingModel, pricingPageModel } from "@/lib/pricing-view";
import { solutionLink } from "@/lib/search-pages";
import { pageMetadata, pageTitle } from "@/lib/seo";
import {
    faqPageLd,
    organizationLd,
    softwareApplicationLd,
    webSiteLd,
} from "@/lib/structured-data";
import { Faq } from "@saroh/marketing/faq";
import { FeatureCards } from "@saroh/marketing/feature-cards";
import { SolutionCards } from "@saroh/marketing/solution-cards";
import { WorksFor } from "@saroh/marketing/works-for";

/**
 * `/` (plan U21): the Home design, "saroh" hero and "band" closer. The hero,
 * then "Works for", the eight features (`#features`, Dashboard first), the
 * tour video once there is one (`#video`), Solutions (`#solutions`), the
 * pricing teaser (`#pricing`), Questions (`#faq`) and the dark CTA band.
 *
 * Prices, plan lines and the free-plan line come from the published pricing
 * catalogue, read when the site is built (a publish starts a build, KTD-10);
 * with none, the placeholders (`PRICE_NOTE`). Before the launch
 * switch opens the catalogue isn't read at all (DEC-136), as on a feature
 * page: one published ahead of launch must not put a plan's name or price
 * in the answers below or in the page's structured data.
 */

export const metadata: Metadata = pageMetadata({
    title: pageTitle(home.seoTitle),
    // The share card keeps the line the page opens with.
    socialTitle: home.headlineLabel,
    description: home.seoDescription,
    path: "/",
    image: { url: "/opengraph-image", alt: HOME_OG_ALT },
});

export default async function HomePage() {
    const catalog = LAUNCH_MODE === "open" ? await readLivePricing() : null;
    const faq = faqWithPlans(catalog, HOME_FAQ);

    return (
        <>
            <JsonLd
                data={[
                    organizationLd(),
                    webSiteLd(),
                    softwareApplicationLd(catalog, home.seoDescription),
                    // The very answers drawn under Questions, so the two never drift.
                    faqPageLd(faq),
                ]}
            />
            <HomeHero freeLine={freePlanLine(catalog)} />

            <WorksFor
                label={home.worksFor}
                items={solutionList.map((s) => ({
                    href: solutionLink(s.slug),
                    name: s.card.name,
                }))}
            />

            <FeatureCards
                eyebrow={home.featuresEyebrow}
                title={home.featuresTitle}
                items={featureList.map((f) => ({
                    href: featureHref(f.slug),
                    title: f.name,
                    body: f.homeBody,
                    isNew: NEW_FEATURES.includes(f.slug),
                }))}
            />

            <TourVideo />

            <SolutionCards
                title={home.solutionsTitle}
                items={solutionList.map((s) => ({
                    href: solutionLink(s.slug),
                    title: s.card.name,
                    body: s.card.body,
                    meta: s.card.uses,
                    action: s.card.link,
                }))}
            />

            {/* Plans show once the site's launch switch opens: before
                that Pricing waits at the waitlist (Gate W), so no page draws
                a plan or links to it. */}
            {LAUNCH_MODE === "open" ? (
                <PricingSection
                    id="pricing"
                    className="scroll-mt-6 pt-[110px]"
                    title={home.pricingTitle}
                    src="home-pricing"
                    model={
                        catalog
                            ? pricingPageModel(catalog)
                            : placeholderPricingModel()
                    }
                />
            ) : null}

            <Faq items={faq} title={home.faqTitle} />

            <CtaBand title={home.closer} src="home-band" />
        </>
    );
}
