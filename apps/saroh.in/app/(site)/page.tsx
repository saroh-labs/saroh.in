import type { Metadata } from "next";

import { HomeHero } from "@/components/home/home-hero";
import { TourVideo } from "@/components/home/tour-video";
import { PricingSection } from "@/components/pricing/pricing-section";
import { Container } from "@/components/shared/layout/container";
import { JsonLd } from "@/components/shared/layout/json-ld";
import { CardLink } from "@/components/shared/links/card-link";
import { PillLink } from "@/components/shared/links/pill";
import { CtaBand } from "@/components/shared/sections/cta-band";
import { Eyebrow } from "@/components/shared/sections/eyebrow";
import { Faq } from "@/components/shared/sections/faq";
import { Section } from "@/components/shared/sections/section";
import { SectionHeading } from "@/components/shared/sections/section-heading";
import { HOME_FAQ } from "@/content/faq";
import { featureHref, featureList } from "@/content/features";
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

            <Container
                as="nav"
                aria-label={home.worksFor}
                className="flex flex-wrap items-center gap-3.5 pt-24"
            >
                <Eyebrow>{home.worksFor}</Eyebrow>
                {solutionList.map((s) => (
                    <PillLink key={s.slug} href={solutionLink(s.slug)}>
                        {s.card.name}
                    </PillLink>
                ))}
            </Container>

            <Container
                as="section"
                id="features"
                aria-labelledby="features-title"
                className="scroll-mt-6 pt-24"
            >
                <SectionHeading
                    id="features-title"
                    eyebrow={home.featuresEyebrow}
                    title={home.featuresTitle}
                />
                <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,max(200px,calc((100%-48px)/4))),1fr))] gap-4 pb-14 pt-10">
                    {featureList.map((f) => (
                        <CardLink
                            key={f.slug}
                            href={featureHref(f.slug)}
                            title={f.name}
                            body={f.homeBody}
                        />
                    ))}
                </div>
            </Container>

            <TourVideo />

            <Section
                id="solutions"
                titleId="solutions-title"
                title={home.solutionsTitle}
                className="grid scroll-mt-6 gap-[18px] pt-[110px]"
            >
                <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,280px),1fr))] gap-4">
                    {solutionList.map((s) => (
                        <CardLink
                            key={s.slug}
                            href={solutionLink(s.slug)}
                            title={s.card.name}
                            body={s.card.body}
                            meta={s.card.uses}
                            action={s.card.link}
                            size="lg"
                        />
                    ))}
                </div>
            </Section>

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
