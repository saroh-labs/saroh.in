import { ButtonLink } from "@saroh/marketing/button";
import type {
    FaqItem,
    FeatureSlug,
    Solution,
    SolutionSlug,
} from "@saroh/marketing/content-types";
import { SOLUTION_SLUGS } from "@saroh/marketing/content-types";
import { ScreenshotFrame } from "@saroh/marketing/screenshot-frame";
import { HomePhone } from "@saroh/marketing/solutions/moments";
import type { TradePageLayoutProps } from "@saroh/marketing/solutions/trade-page";
import { TradePageLayout } from "@saroh/marketing/solutions/trade-page";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { Plans } from "@/components/pricing/plans";
import { JsonLd } from "@/components/shared/json-ld";
import { StartFree } from "@/components/solution/start-free";
import { solutionFaq, TRADE_FAQ } from "@/content/faq";
import { featureHref, featureList, features } from "@/content/features";
import { CTA_BAND, FREE_PLAN_LINE, home } from "@/content/home";
import { shotView } from "@/content/shots";
import { solutionHref, solutionList, solutions } from "@/content/solutions";
import {
    ALL_TRADES,
    BAR_LABELS,
    HUB_PATH,
    TRADE_WORDS as W,
} from "@/content/solutions-hub";
import { TRADES as TEMPLATE_TRADES } from "@/content/templates";
import type { TradePage } from "@/content/trades";
import { HOME_WORDS, tradePage } from "@/content/trades";
import { claimsOff, featuresOff } from "@/lib/feature-switches";
import type { readCatalog } from "@/lib/plans";
import {
    faqWithPlans,
    freePlanLine,
    paidPlansOn,
    pricingModel,
    readPricing,
} from "@/lib/plans";
import { faqSchema, pageSchema } from "@/lib/schema";
import { pageMetadata } from "@/lib/seo";
import { pageAt } from "@/lib/site-map";

export const dynamicParams = false;

export function generateStaticParams() {
    return ALL_TRADES.map((t) => ({ slug: t.slug }));
}

interface Props {
    params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
    const { slug } = await params;
    const page = pageAt(`/solutions/${slug}`);
    return page ? pageMetadata(page) : {};
}

type Catalog = Awaited<ReturnType<typeof readCatalog>>;

/** What a page gives the layout of its own; the rest every trade page shares. */
type OwnProps = Pick<
    TradePageLayoutProps,
    "name" | "h1" | "lead" | "picture" | "problems" | "starter"
> & {
    faq: FaqItem[];
    pricingTitle: string;
    questionsTitle: string;
    related: TradePageLayoutProps["related"]["items"];
    closer: string;
};

const isLead = (slug: string): slug is SolutionSlug =>
    (SOLUTION_SLUGS as readonly string[]).includes(slug);

/** A lead trade's page: every word of `solutions.ts`, with its screens. */
function leadPage(
    s: Solution,
    catalog: Catalog,
    cardOnline: boolean,
    plansOn: boolean,
): OwnProps {
    const hero = s.hero && shotView(s.hero.shot, s.hero.alt);
    return {
        name: s.name,
        h1: s.headline,
        lead: s.sub,
        picture: hero ? (
            <figure className="m-0 grid w-full gap-3">
                <ScreenshotFrame shot={hero} priority />
                <figcaption className="text-[13px] text-mk-copy">
                    {s.heroNote}
                </figcaption>
            </figure>
        ) : null,
        problems: {
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
                    picture: shot ? <ScreenshotFrame shot={shot} /> : undefined,
                };
            }),
        },
        faq: faqWithPlans(catalog, solutionFaq(s.faq), cardOnline, plansOn),
        pricingTitle: s.pricing.title,
        questionsTitle: W.questions(s.longName),
        related: solutionList
            .filter((o) => o.slug !== s.slug)
            .map((o) => ({
                slug: o.slug,
                name: o.longName,
                href: solutionHref(o.slug),
            })),
        closer: s.closer,
    };
}

/**
 * One of the other trades' pages (`content/trades/`): its own words and
 * questions, and its Home drawn on an ordinary morning, as no Global screen
 * of the trade is captured yet. Its problems are words alone.
 */
function otherPage(
    t: TradePage,
    catalog: Catalog,
    cardOnline: boolean,
    plansOn: boolean,
): OwnProps {
    const [start, ...general] = faqWithPlans(
        catalog,
        ["start-free", ...TRADE_FAQ],
        cardOnline,
        plansOn,
    );
    // The invoice templates gallery is always built, as the nav's Templates
    // menu links it; `templatesOn` is the website templates' switch.
    const template = TEMPLATE_TRADES.find((x) => x.slug === t.templates);
    const plural = t.name.toLowerCase();
    return {
        name: t.name,
        h1: t.headline,
        lead: t.sub,
        picture: (
            <figure className="m-0 grid w-full justify-items-center gap-3 min-[1000px]:justify-items-start">
                <HomePhone
                    m={{
                        kind: "home",
                        ...t.home,
                        greeting: HOME_WORDS.greeting,
                        needsTitle: HOME_WORDS.needsTitle,
                        todayTitle: HOME_WORDS.todayTitle,
                        todayDay: HOME_WORDS.todayDay,
                        more: HOME_WORDS.more,
                    }}
                />
                <figcaption className="text-[13px] text-mk-copy">
                    {HOME_WORDS.note}
                </figcaption>
            </figure>
        ),
        problems: {
            line: t.changeTitle,
            items: t.problems.map((p) => {
                const name = features[p.feature].name;
                return {
                    quote: p.pain,
                    area: p.label ?? name,
                    title: p.title,
                    body: p.body,
                    feature: p.feature,
                    link: `See ${name}`,
                };
            }),
        },
        starter: {
            ...W.starter[t.starter.kind],
            rows: t.starter.rows,
            template: template
                ? {
                      title: W.template(plural),
                      description: W.templateLine(plural),
                      links: [
                          {
                              href: `/templates/for/${template.slug}`,
                              label: W.seeTemplates(plural),
                          },
                      ],
                  }
                : undefined,
        },
        faq: [start, ...t.faq, ...general],
        pricingTitle: W.pricing(t.longName),
        questionsTitle: W.questions(t.longName),
        related: t.related.flatMap((slug) => {
            const o = ALL_TRADES.find((x) => x.slug === slug);
            return o ? [{ slug: o.slug, name: o.longName, href: o.href }] : [];
        }),
        closer: t.closer,
    };
}

/**
 * A solution page in saroh.in's trade-page layout (DEC-221,
 * `TradePageLayout`), over saroh.tech's own words: each problem with its
 * answer (and its screen, where one is captured), Free's card, the
 * questions and the other trades. No Global trade has a written day yet, so
 * none is told. No live demo: saroh.in's demos are India's.
 */
export default async function SolutionPage({ params }: Props) {
    const { slug } = await params;
    const page = pageAt(`/solutions/${slug}`);
    const other = tradePage(slug);
    if (!page || (!isLead(slug) && !other)) notFound();
    const pricing = await readPricing();
    const catalog = pricing?.catalog ?? null;
    const cardOnline = pricing?.cardOnline ?? false;
    const plansOn = await paidPlansOn(pricing);
    const shown = new Set<string>(featureList.map((f) => f.slug));
    const off = claimsOff();
    const templatesOn = !featuresOff().includes("templates");
    const src = `solutions-${slug}`;
    const free = freePlanLine(catalog);
    const own = other
        ? otherPage(other, catalog, cardOnline, plansOn)
        : leadPage(
              solutions[slug as SolutionSlug],
              catalog,
              cardOnline,
              plansOn,
          );
    return (
        <div data-page-type={page.type}>
            <JsonLd
                data={[
                    ...pageSchema(page),
                    faqSchema(
                        own.faq.map(({ q, a }) => ({ question: q, answer: a })),
                    ),
                ]}
            />
            <TradePageLayout
                slug={slug}
                name={own.name}
                h1={own.h1}
                lead={own.lead}
                words={W}
                hubHref={HUB_PATH}
                tradeHref={(t) => `/solutions/${t}`}
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
                picture={own.picture}
                feature={(f) =>
                    shown.has(f)
                        ? {
                              label: features[f as FeatureSlug].name,
                              href: featureHref(f as FeatureSlug),
                          }
                        : undefined
                }
                claimOn={(c) => !off.includes(c)}
                templatesOn={templatesOn}
                // As saroh.in: the fallback only repeats "No card needed".
                freeLine={free !== FREE_PLAN_LINE.fallback ? free : undefined}
                problems={own.problems}
                starter={own.starter}
                pricing={{
                    title: own.pricingTitle,
                    // Every plan, as /pricing shows them (owner, 16 Nov).
                    children: (
                        <Plans
                            model={pricingModel(catalog)}
                            on={plansOn}
                            src={`${src}-pricing`}
                            compare={{
                                href: "/pricing",
                                label: home.pricingCompare,
                            }}
                        />
                    ),
                }}
                faq={{ title: own.questionsTitle, items: own.faq }}
                related={{ title: W.related, items: own.related }}
                allTrades={{
                    label: W.allTrades(ALL_TRADES.length),
                    line: W.allTradesLine,
                }}
                closing={{
                    title: own.closer,
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
