import "@saroh/search-pages/styles.css";

import { ForHub } from "@saroh/search-pages";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { CtaClickArea } from "@/components/shared/buttons/cta-click-area";
import { JsonLd } from "@/components/shared/layout/json-ld";
import { cta } from "@/lib/links";
import { builtSearchPages, FOR_HUB, liveSearchPages } from "@/lib/search-pages";
import { pageMetadata, pageTitle } from "@/lib/seo";
import { breadcrumbLd } from "@/lib/structured-data";

const HUB_DESCRIPTION =
    "Software for salons, clinics, studios, classes and shops in India: pick your trade to see what Saroh does for a business like yours.";

const CTA_SRC = "for-hub";

/**
 * `/for` (DEC-193): the trade pages this build has, with a search and filters
 * in the browser. With none (production before the first publish) it is a
 * 404, and nothing links it.
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
                    links={{
                        home: "/",
                        startFree: start.href,
                        startFreeLabel: start.label,
                        src: CTA_SRC,
                        note:
                            start.mode === "open"
                                ? "No card needed to start."
                                : undefined,
                    }}
                />
            </CtaClickArea>
        </>
    );
}
