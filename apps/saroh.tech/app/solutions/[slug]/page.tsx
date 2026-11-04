import type { FeatureSlug, SolutionSlug } from "@saroh/marketing/content-types";
import { SOLUTION_SLUGS } from "@saroh/marketing/content-types";
import { CtaBand } from "@saroh/marketing/cta-band";
import { Faq } from "@saroh/marketing/faq";
import { ProductHero } from "@saroh/marketing/product-hero";
import { SolutionChanges } from "@saroh/marketing/solution-changes";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { HeroActions } from "@/components/shared/hero-actions";
import { JsonLd } from "@/components/shared/json-ld";
import { PricingTeaser } from "@/components/shared/pricing-teaser";
import { solutionFaq } from "@/content/faq";
import { featureHref, features } from "@/content/features";
import { CTA_BAND } from "@/content/home";
import { shotView } from "@/content/shots";
import { solutions } from "@/content/solutions";
import { faqWithPlans, freePlanLine, readCatalog } from "@/lib/plans";
import { faqSchema, pageSchema } from "@/lib/schema";
import { pageMetadata } from "@/lib/seo";
import { pageAt } from "@/lib/site-map";

export const dynamicParams = false;

export function generateStaticParams() {
    return SOLUTION_SLUGS.map((slug) => ({ slug }));
}

interface Props {
    params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
    const { slug } = await params;
    const page = pageAt(`/solutions/${slug}`);
    return page ? pageMetadata(page) : {};
}

/** saroh.in's solution template, section for section, with no live demo: its demos are India's. */
export default async function SolutionPage({ params }: Props) {
    const { slug } = await params;
    const page = pageAt(`/solutions/${slug}`);
    if (!page) notFound();
    const s = solutions[slug as SolutionSlug];
    const catalog = await readCatalog();
    const faq = faqWithPlans(catalog, solutionFaq(s.faq));
    // "See {feature} →" on the first segment of each area only.
    const linked = new Set<FeatureSlug>();
    // A lone screen leaves the other rows half empty: two columns of words
    // until most of the trade's segments have their own screens (the package's
    // no-shot layout).
    const drawShots =
        s.segments.filter((seg) => shotView(seg.shot)).length >
        s.segments.length / 2;

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
            <ProductHero
                section={{ name: "Solutions", href: "/#solutions" }}
                name={s.name}
                headline={s.headline}
                sub={s.sub}
                actions={<HeroActions src={`solutions-${slug}-hero`} />}
                freeLine={freePlanLine(catalog)}
                shot={s.hero && shotView(s.hero.shot, s.hero.alt)}
                note={s.heroNote}
            />
            <SolutionChanges
                title={s.changeTitle}
                segments={s.segments.map((seg) => {
                    const name = features[seg.feature].name;
                    const first = !linked.has(seg.feature);
                    linked.add(seg.feature);
                    return {
                        label: seg.label ?? name,
                        pain: seg.pain,
                        title: seg.title,
                        body: seg.body,
                        see: first
                            ? {
                                  href: featureHref(seg.feature),
                                  label: <>See {name}</>,
                              }
                            : undefined,
                        shot: drawShots
                            ? shotView(seg.shot, seg.alt)
                            : undefined,
                    };
                })}
            />
            <PricingTeaser
                title={s.pricing.title}
                className="pt-[130px]"
                catalog={catalog}
                src={`solutions-${slug}-pricing`}
            />
            <Faq items={faq} className="pt-[120px]" />
            <CtaBand
                title={s.closer}
                body={CTA_BAND.body}
                note={CTA_BAND.note}
                actions={<HeroActions src={`solutions-${slug}-band`} onInk />}
                className="pt-[120px]"
            />
        </div>
    );
}
