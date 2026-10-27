import "@saroh/search-pages/styles.css";

import { ForHub } from "@saroh/search-pages";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { builtSearchPages, FOR_HUB, liveSearchPages } from "@/lib/search-pages";
import { pageMetadata, pageTitle } from "@/lib/seo";

const HUB_DESCRIPTION =
    "Software for salons, clinics, studios, classes and shops in India: pick your trade to see what Saroh does for a business like yours.";

/**
 * `/for` (DEC-193): the trade pages this build has, by family. With none
 * (production before the first publish) it is a 404, and nothing links it.
 */
export function generateMetadata(): Metadata {
    return {
        ...pageMetadata({
            title: pageTitle("Software for your kind of business"),
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
    return <ForHub pages={pages} />;
}
