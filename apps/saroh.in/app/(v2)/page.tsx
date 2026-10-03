import type { Metadata } from "next";

import { CardLink } from "@/components/v2/card-link";
import { Container } from "@/components/v2/container";
import { CtaBand } from "@/components/v2/cta-band";
import { Eyebrow } from "@/components/v2/eyebrow";
import { Faq } from "@/components/v2/faq";
import { HomeHero } from "@/components/v2/home/home-hero";
import { HomePricing } from "@/components/v2/home/home-pricing";
import { TourVideo } from "@/components/v2/home/tour-video";
import { JsonLd } from "@/components/v2/json-ld";
import { PillLink } from "@/components/v2/pill";
import { SectionHeading } from "@/components/v2/section-heading";
import { faqItems, HOME_FAQ } from "@/content/faq";
import { featureHref, featureList } from "@/content/features";
import { home } from "@/content/home";
import { solutionHref, solutionList } from "@/content/solutions";
import { HOME_OG_ALT } from "@/lib/og-card";
import {
    freePlanLine,
    homePlanTeasers,
    planTeaserFootnote,
    startFreeFaq,
} from "@/lib/plan-teasers";
import { readLivePricing } from "@/lib/pricing";
import { pageMetadata } from "@/lib/seo";
import { organizationLd, softwareApplicationLd } from "@/lib/structured-data";

/**
 * `/` (plan U21): the Home design, "saroh" hero and "band" closer. The hero,
 * then "Works for", the eight features (`#features`, Dashboard first), the
 * tour video once there is one (`#video`), Solutions (`#solutions`), the
 * pricing teaser (`#pricing`), Questions (`#faq`) and the dark CTA band.
 *
 * Prices, plan lines and the free-plan line come from the published pricing
 * catalogue, refreshed every five minutes and at once on publish (KTD-10);
 * with none, the "announced at launch" placeholders.
 */
export const revalidate = 300;

export const metadata: Metadata = pageMetadata({
    title: home.metaTitle,
    description: home.sub,
    path: "/",
    image: { url: "/opengraph-image", alt: HOME_OG_ALT },
});

export default async function HomePage() {
    const catalog = await readLivePricing();
    const faq = faqItems(HOME_FAQ).map((item, i) =>
        HOME_FAQ[i] === "start-free" ? startFreeFaq(catalog, item) : item,
    );

    return (
        <>
            <JsonLd
                data={[
                    organizationLd(),
                    softwareApplicationLd(catalog, home.sub),
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
                    <PillLink key={s.slug} href={solutionHref(s.slug)}>
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

            <Container
                as="section"
                id="solutions"
                aria-labelledby="solutions-title"
                className="grid scroll-mt-6 gap-[18px] pt-[110px]"
            >
                <h2
                    id="solutions-title"
                    className="m-0 font-display text-mk-h2-sm font-bold"
                >
                    {home.solutionsTitle}
                </h2>
                <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,280px),1fr))] gap-4">
                    {solutionList.map((s) => (
                        <CardLink
                            key={s.slug}
                            href={solutionHref(s.slug)}
                            title={s.card.name}
                            body={s.card.body}
                            meta={s.card.uses}
                            action={s.card.link}
                            size="lg"
                        />
                    ))}
                </div>
            </Container>

            <HomePricing
                plans={homePlanTeasers(catalog)}
                footnote={planTeaserFootnote(catalog)}
            />

            <Faq items={faq} title={home.faqTitle} />

            <CtaBand title={home.closer} src="home-band" />
        </>
    );
}
