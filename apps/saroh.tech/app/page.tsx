import { CardLink } from "@saroh/marketing/card-link";
import { CtaBand } from "@saroh/marketing/cta-band";
import { Faq } from "@saroh/marketing/faq";
import { FeatureCards } from "@saroh/marketing/feature-cards";
import { HomeHero } from "@saroh/marketing/home-hero";
import { Section } from "@saroh/marketing/section";
import { SolutionCards } from "@saroh/marketing/solution-cards";
import { TextLink } from "@saroh/marketing/text-link";
import { WorksFor } from "@saroh/marketing/works-for";

import { HeroActions } from "@/components/shared/hero-actions";
import { JsonLd } from "@/components/shared/json-ld";
import { PricingTeaser } from "@/components/shared/pricing-teaser";
import { faqItems, HOME_FAQ } from "@/content/faq";
import { featureHref, featureList } from "@/content/features";
import { CTA_BAND, FREE_PLAN_LINE, home } from "@/content/home";
import { shotView } from "@/content/shots";
import { solutionHref, solutionList } from "@/content/solutions";
import { ALL_TOOLS } from "@/lib/nav";
import { faqSchema, pageSchema } from "@/lib/schema";
import { pageMetadata } from "@/lib/seo";
import { pageOf } from "@/lib/site-map";

const page = pageOf("/");

export const metadata = pageMetadata(page);

/**
 * saroh.in's Home, section for section (`apps/saroh.in/app/(site)/page.tsx`).
 * The one addition is the free tools, because tools are how people arrive.
 */
export default function HomePage() {
    const faq = faqItems(HOME_FAQ);
    return (
        <div data-page-type={page.type}>
            <JsonLd
                data={[
                    ...pageSchema(page),
                    faqSchema(
                        faq.map(({ q, a }) => ({ question: q, answer: a })),
                    ),
                ]}
            />
            <HomeHero
                eyebrow={home.eyebrow}
                headlineLabel={home.headlineLabel}
                headline={home.headline}
                sub={home.sub}
                actions={<HeroActions src="home-hero" />}
                freeLine={FREE_PLAN_LINE.fallback}
                chips={home.chips}
                shot={shotView(home.hero.shot)}
            />
            <WorksFor
                label={home.worksFor}
                items={solutionList.map((s) => ({
                    href: solutionHref(s.slug),
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
                }))}
            />
            <SolutionCards
                title={home.solutionsTitle}
                items={solutionList.map((s) => ({
                    href: solutionHref(s.slug),
                    title: s.card.name,
                    body: s.card.body,
                    meta: s.card.uses,
                    action: s.card.link,
                }))}
            />
            <Section
                id="tools"
                titleId="tools-title"
                title={home.toolsTitle}
                lead={home.toolsLead}
                className="grid scroll-mt-6 gap-[18px] pt-[110px]"
            >
                <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,320px),1fr))] gap-4">
                    {home.tools.map((tool) => (
                        <CardLink
                            key={tool.href}
                            href={tool.href}
                            title={tool.title}
                            body={tool.line}
                            className={
                                "desk" in tool ? "hidden md:grid" : undefined
                            }
                        />
                    ))}
                </div>
                <TextLink
                    href={ALL_TOOLS.href}
                    arrow
                    className="justify-self-start text-[15px] font-semibold"
                >
                    {ALL_TOOLS.name}
                </TextLink>
            </Section>
            <PricingTeaser
                id="pricing"
                title={home.pricingTitle}
                className="scroll-mt-6 pt-[110px]"
            />
            <Faq items={faq} title={home.faqTitle} />
            <CtaBand
                title={home.closer}
                body={CTA_BAND.body}
                note={CTA_BAND.note}
                actions={<HeroActions src="home-band" onInk />}
            />
        </div>
    );
}
