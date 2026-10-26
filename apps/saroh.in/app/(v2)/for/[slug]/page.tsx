import "@saroh/search-pages/styles.css";

import type { SearchPageData } from "@saroh/search-pages";
import { loadSearchPage, SearchPage } from "@saroh/search-pages";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { JsonLd } from "@/components/v2/json-ld";
import { PlanTeaserGrid } from "@/components/v2/solution/solution-pricing";
import type { DemoTrade } from "@/content/demos";
import { FREE_PLAN_LINE } from "@/content/home";
import { demoHref } from "@/lib/demos";
import { cta, LAUNCH_MODE } from "@/lib/links";
import {
    freePlanLine,
    homePlanTeasers,
    planTeaserFootnote,
} from "@/lib/plan-teasers";
import { readLivePricing } from "@/lib/pricing";
import { builtSearchPages, FOR_HUB, publishList } from "@/lib/search-pages";
import { pageMetadata, pageTitle } from "@/lib/seo";
import { breadcrumbLd, faqPageLd } from "@/lib/structured-data";

/**
 * `/for/<trade>` (DEC-193): one page per file in `@saroh/search-pages`,
 * drawn by its `<SearchPage>`. Production builds the live pages only; a
 * preview builds them all, a page not live with a Draft label and
 * `noindex` (`lib/search-pages.ts`). Any other slug is a 404.
 */
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
        ? loadSearchPage(slug)
        : null;
}

const isLive = (path: string) => publishList().live.includes(path);

/** The live demo its words name, when the demo button is on. */
function demoTradeOf(words: string | undefined): DemoTrade | null {
    if (!words) return null;
    if (/\bgym\b/i.test(words)) return "gym";
    if (/\bsalon\b/i.test(words)) return "salon";
    return null;
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
        ...(!isLive(p.path) && { robots: { index: false, follow: false } }),
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

    return (
        <>
            <JsonLd
                data={[
                    breadcrumbLd([FOR_HUB, { name: p.name, path: p.path }]),
                    faqPageLd(
                        p.questions.map((q) => ({
                            q: q.question,
                            a: q.answer.join("\n\n"),
                        })),
                    ),
                ]}
            />
            <SearchPage
                // No button for a demo that isn't on: the words go too.
                page={demo ? p : { ...p, demo: undefined }}
                draft={!isLive(p.path)}
                links={{
                    startFree: cta({ src: `for-${slug}` }).href,
                    demo: demo ?? undefined,
                    hub: FOR_HUB.path,
                    page: (s) => (built.has(s) ? `/for/${s}` : undefined),
                }}
                freeLine={
                    free && free !== FREE_PLAN_LINE.fallback ? free : undefined
                }
                pricing={
                    catalog ? (
                        <PlanTeaserGrid
                            plans={homePlanTeasers(catalog)}
                            footnote={planTeaserFootnote(catalog)}
                            src={`for-${slug}-pricing`}
                        />
                    ) : undefined
                }
            />
        </>
    );
}
