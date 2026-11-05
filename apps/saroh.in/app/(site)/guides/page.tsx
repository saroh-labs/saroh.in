import "@saroh/search-pages/styles.css";

import { notFound } from "next/navigation";

import { GuidesHubFilter } from "@/components/search-pages/guides-hub-filter";
import { CtaClickArea } from "@/components/shared/buttons/cta-click-area";
import { JsonLd } from "@/components/shared/layout/json-ld";
import { docPages } from "@/lib/docs-pages";
import { hubRoute } from "@/lib/search-page-route";

/**
 * `/guides`: the guides this build has, by group, with trade chips
 * (`?for=salons`, read in the browser: the page is static). None: a 404.
 */
const hub = hubRoute("guides", {
    title: "Guides for running a small business in India",
    description:
        "Plain guides for salons, studios, clinics and shops in India: fewer no-shows, getting paid on time, and customers who come back.",
});
export const generateMetadata = hub.generateMetadata;

export default function GuidesHubRoute() {
    const pages = docPages.list("guides");
    if (pages.length === 0) notFound();
    return (
        <>
            <JsonLd data={hub.jsonLd()} />
            <CtaClickArea src={hub.src} mode={hub.mode}>
                <GuidesHubFilter
                    // Only what a card shows reaches the browser.
                    pages={pages.map((p) => ({
                        slug: p.slug,
                        h1: p.h1,
                        line: p.line,
                        group: p.group,
                        trades: p.trades,
                        readMinutes: p.readMinutes,
                        published: p.published,
                    }))}
                    startFree={hub.links.startFree}
                    startFreeLabel={hub.links.startFreeLabel}
                    src={hub.src}
                />
            </CtaClickArea>
        </>
    );
}
