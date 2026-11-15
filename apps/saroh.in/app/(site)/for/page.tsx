import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { CtaClickArea } from "@/components/shared/buttons/cta-click-area";
import { JsonLd } from "@/components/shared/layout/json-ld";
import { ForHub } from "@/components/solution/for-hub";
import { TRADE_DAYS } from "@/content/solutions-days";
import { env } from "@/env";
import { featuresOff } from "@/lib/feature-switches";
import { cta } from "@/lib/links";
import { builtSearchPages, FOR_HUB, liveSearchPages } from "@/lib/search-pages";
import { pageMetadata, pageTitle } from "@/lib/seo";
import { breadcrumbLd } from "@/lib/structured-data";

const HUB_DESCRIPTION =
    "Software for salons, clinics, studios, classes and shops in India: pick your trade to see what Saroh does for a business like yours.";

const CTA_SRC = "for-hub";

/**
 * `/for` (DEC-193): the trade pages this build has, with a search and filters
 * in the browser, each at one moment of its day (DEC-221, `ForHub`). With
 * none (production before the first publish) it is a 404, and nothing
 * links it.
 */
export function generateMetadata(): Metadata {
    return {
        ...pageMetadata({
            title: pageTitle("Find your trade: software for your business"),
            description: HUB_DESCRIPTION,
            path: FOR_HUB.path,
        }),
        // A preview's hub of drafts only is not for search engines.
        ...(liveSearchPages().length === 0 && {
            robots: { index: false, follow: false },
        }),
    };
}

export default function ForHubPage() {
    const pages = builtSearchPages();
    if (pages.length === 0) notFound();
    const start = cta({ src: CTA_SRC });
    return (
        <>
            <JsonLd
                data={[breadcrumbLd([{ name: "Home", path: "/" }, FOR_HUB])]}
            />
            <CtaClickArea src={CTA_SRC} mode={start.mode}>
                <ForHub
                    pages={pages}
                    days={TRADE_DAYS.filter((d) =>
                        pages.some((p) => p.slug === d.slug),
                    )}
                    src={CTA_SRC}
                    templatesOn={!featuresOff(env).includes("templates")}
                />
            </CtaClickArea>
        </>
    );
}
