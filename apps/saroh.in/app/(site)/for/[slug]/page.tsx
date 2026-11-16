import "@saroh/search-pages/styles.css";

import type { SearchPageData } from "@saroh/search-pages";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { SITE_FONTS } from "@/components/feature-pages/reach/site-fonts";
import { PricingCards } from "@/components/pricing/pricing-cards";
import { CtaClickArea } from "@/components/shared/buttons/cta-click-area";
import { JsonLd } from "@/components/shared/layout/json-ld";
import { TradePage } from "@/components/solution/trade-page";
import { featureHref, featureList, features } from "@/content/features";
import { FREE_PLAN_LINE } from "@/content/home";
import { tradeDay } from "@/content/solutions-days";
import { galleryTemplate, templateHref } from "@/content/templates";
import type { FeatureSlug } from "@/content/types";
import { env } from "@/env";
import { demoHref, demoTradeOf } from "@/lib/demos";
import { claimOn, featuresOff } from "@/lib/feature-switches";
import { cta, LAUNCH_MODE } from "@/lib/links";
import { freePlanLine } from "@/lib/plan-teasers";
import { readLivePricing } from "@/lib/pricing";
import { pricingPageModel } from "@/lib/pricing-view";
import {
    builtSearchPages,
    FOR_HUB,
    isPublished,
    questionsLd,
    searchPages,
} from "@/lib/search-pages";
import { pageMetadata, pageTitle } from "@/lib/seo";
import { breadcrumbLd } from "@/lib/structured-data";

/**
 * `/for/<trade>` (DEC-193): one page per file in `@saroh/search-pages`,
 * drawn in the redesign's trade-page layout (`TradePage`, DEC-221) with
 * every word of its MDX. Where `content/solutions-days.ts` writes the
 * trade's day, the day is told hour by hour. Production builds the live
 * pages only; a preview builds them all, a page not live with a Draft label
 * and `noindex` (`lib/search-pages.ts`). Any other slug is a 404. (The admin
 * preview still draws the package's own `<SearchPage>`.)
 */

/** The trade bar's trades: the lead four, as the boards name them. */
const BAR = [
    { slug: "home-bakers", label: "Bakery" },
    { slug: "salons", label: "Salon" },
    { slug: "gyms", label: "Gym" },
    { slug: "florists", label: "Florist" },
];

/** A trade's gallery template, by the templates' own slugs. */
const TEMPLATE_OF: Readonly<Record<string, string>> = {
    "home-bakers": "bakery",
    salons: "salon",
    gyms: "gym",
    clinics: "clinic",
    shops: "store",
    dieticians: "dietician",
};
export const dynamicParams = false;

export function generateStaticParams() {
    return builtSearchPages().map((p) => ({ slug: p.slug }));
}

interface Props {
    params: Promise<{ slug: string }>;
}

/** The page, when this build has it. */
function builtPage(slug: string): SearchPageData | null {
    return builtSearchPages().some((p) => p.slug === slug)
        ? searchPages.loadSearchPage(slug)
        : null;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
    const { slug } = await params;
    const p = builtPage(slug);
    if (!p) return {};
    return {
        ...pageMetadata({
            title: pageTitle(p.title),
            socialTitle: `Saroh for ${p.plural}`,
            description: p.description,
            path: p.path,
        }),
        ...(!isPublished(p.path) && {
            robots: { index: false, follow: false },
        }),
    };
}

export default async function ForPage({ params }: Props) {
    const { slug } = await params;
    const p = builtPage(slug);
    if (!p) notFound();
    const built = new Set(builtSearchPages().map((x) => x.slug));
    const trade = demoTradeOf(p.demo);
    const demo = trade ? demoHref(trade) : null;
    // Only once the launch switch is open (DEC-136), as a solution page.
    const catalog = LAUNCH_MODE === "open" ? await readLivePricing() : null;
    const free = catalog ? freePlanLine(catalog) : null;

    const start = cta({ src: `for-${slug}` });
    const off = featuresOff(env);
    const shown = new Set(featureList.map((f) => f.slug));
    const tpl = off.includes("templates")
        ? undefined
        : galleryTemplate(TEMPLATE_OF[slug] ?? "");
    const day = tradeDay(slug);
    return (
        <>
            <JsonLd
                data={[
                    breadcrumbLd([FOR_HUB, { name: p.name, path: p.path }]),
                    questionsLd(p.questions),
                ]}
            />
            <CtaClickArea src={`for-${slug}`} mode={start.mode}>
                <div className={SITE_FONTS}>
                    <TradePage
                        // No link for a demo that isn't on: the words go too.
                        page={demo ? p : { ...p, demo: undefined }}
                        draft={!isPublished(p.path)}
                        day={day}
                        src={`for-${slug}`}
                        demo={demo ?? undefined}
                        pageHref={(s) =>
                            built.has(s) ? `/for/${s}` : undefined
                        }
                        // Only switched-on features are linked, and their pages follow the same switches.
                        feature={(f) =>
                            shown.has(f as FeatureSlug)
                                ? {
                                      label: features[f as FeatureSlug].name,
                                      href: featureHref(f as FeatureSlug),
                                  }
                                : undefined
                        }
                        off={off}
                        claimOn={(c) => claimOn(c)}
                        freeLine={
                            free && free !== FREE_PLAN_LINE.fallback
                                ? free
                                : undefined
                        }
                        pricing={
                            catalog ? (
                                <PricingCards
                                    model={pricingPageModel(catalog)}
                                    src={`for-${slug}-pricing`}
                                    compare
                                />
                            ) : undefined
                        }
                        template={
                            tpl
                                ? {
                                      slug: tpl.slug,
                                      name: tpl.name,
                                      href: templateHref(tpl.slug),
                                      description: tpl.description,
                                  }
                                : undefined
                        }
                        tradeCount={built.size}
                        bar={BAR.filter((b) => built.has(b.slug))}
                    />
                </div>
            </CtaClickArea>
        </>
    );
}
