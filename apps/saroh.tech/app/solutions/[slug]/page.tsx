import { ButtonLink } from "@saroh/marketing/button";
import type { FeatureSlug, SolutionSlug } from "@saroh/marketing/content-types";
import { SOLUTION_SLUGS } from "@saroh/marketing/content-types";
import { ScreenshotFrame } from "@saroh/marketing/screenshot-frame";
import { TradePageLayout } from "@saroh/marketing/solutions/trade-page";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { Plans } from "@/components/pricing/plans";
import { JsonLd } from "@/components/shared/json-ld";
import { StartFree } from "@/components/solution/start-free";
import { solutionFaq } from "@/content/faq";
import { featureHref, featureList, features } from "@/content/features";
import { CTA_BAND, FREE_PLAN_LINE, home } from "@/content/home";
import { shotView } from "@/content/shots";
import { solutionHref, solutionList, solutions } from "@/content/solutions";
import {
    BAR_LABELS,
    HUB_PATH,
    TRADE_WORDS as W,
} from "@/content/solutions-hub";
import { claimsOff, featuresOff } from "@/lib/feature-switches";
import {
    faqWithPlans,
    freeCardModel,
    freePlanLine,
    readCatalog,
} from "@/lib/plans";
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

/**
 * A solution page in saroh.in's trade-page layout (DEC-221,
 * `TradePageLayout`), over saroh.tech's own words: each problem with its
 * answer and screen folded under it, Free's card, the questions and the
 * other trades. No Global trade has a written day yet, so none is told.
 * No live demo: saroh.in's demos are India's.
 */
export default async function SolutionPage({ params }: Props) {
    const { slug } = await params;
    const page = pageAt(`/solutions/${slug}`);
    if (!page) notFound();
    const s = solutions[slug as SolutionSlug];
    const catalog = await readCatalog();
    const faq = faqWithPlans(catalog, solutionFaq(s.faq));
    const shown = new Set<string>(featureList.map((f) => f.slug));
    const off = claimsOff();
    const src = `solutions-${slug}`;
    const free = freePlanLine(catalog);
    const hero = s.hero && shotView(s.hero.shot, s.hero.alt);

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
            <TradePageLayout
                slug={s.slug}
                name={s.name}
                h1={s.headline}
                lead={s.sub}
                words={W}
                hubHref={HUB_PATH}
                tradeHref={(t) => solutionHref(t as SolutionSlug)}
                otherDays={[]}
                cta={(place) =>
                    place === "hero" ? (
                        <StartFree src={`${src}-hero`} from="start-free-page" />
                    ) : place === "closing" ? (
                        <StartFree src={`${src}-band`} from="start-free-band" />
                    ) : (
                        <StartFree
                            src={`${src}-${place}`}
                            from="start-free-page"
                            className={
                                place === "sticky" ? "w-full" : undefined
                            }
                        />
                    )
                }
                picture={
                    hero ? (
                        <figure className="m-0 grid w-full gap-3">
                            <ScreenshotFrame shot={hero} priority />
                            <figcaption className="text-[13px] text-mk-copy">
                                {s.heroNote}
                            </figcaption>
                        </figure>
                    ) : null
                }
                feature={(f) =>
                    shown.has(f)
                        ? {
                              label: features[f as FeatureSlug].name,
                              href: featureHref(f as FeatureSlug),
                          }
                        : undefined
                }
                claimOn={(c) => !off.includes(c)}
                templatesOn={!featuresOff().includes("templates")}
                // As saroh.in: the fallback only repeats "No card needed".
                freeLine={free !== FREE_PLAN_LINE.fallback ? free : undefined}
                problems={{
                    line: s.changeTitle,
                    items: s.segments.map((seg) => {
                        const name = features[seg.feature].name;
                        const shot = shotView(seg.shot, seg.alt);
                        return {
                            quote: seg.pain,
                            area: seg.label ?? name,
                            title: seg.title,
                            body: seg.body,
                            feature: seg.feature,
                            link: `See ${name}`,
                            picture: shot ? (
                                <ScreenshotFrame shot={shot} />
                            ) : undefined,
                        };
                    }),
                }}
                pricing={{
                    title: s.pricing.title,
                    children: (
                        // One card would stretch across the page.
                        <div className="max-w-[420px]">
                            <Plans
                                model={freeCardModel(catalog)}
                                src={`${src}-pricing`}
                                compare={{
                                    href: "/pricing",
                                    label: home.pricingCompare,
                                }}
                            />
                        </div>
                    ),
                }}
                faq={{ title: W.questions(s.longName), items: faq }}
                related={{
                    title: W.related,
                    items: solutionList
                        .filter((o) => o.slug !== s.slug)
                        .map((o) => ({
                            slug: o.slug,
                            name: o.longName,
                            href: solutionHref(o.slug),
                        })),
                }}
                allTrades={{
                    label: W.allTrades(solutionList.length),
                    line: W.allTradesLine,
                }}
                closing={{
                    title: s.closer,
                    secondary: (
                        <ButtonLink
                            href="/features"
                            variant="secondary"
                            size="kit"
                        >
                            {W.features}
                        </ButtonLink>
                    ),
                    note: `${CTA_BAND.body} ${CTA_BAND.note}`,
                }}
                bar={solutionList.map((o) => ({
                    slug: o.slug,
                    label: BAR_LABELS[o.slug],
                }))}
            />
        </div>
    );
}
