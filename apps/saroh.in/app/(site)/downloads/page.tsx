import "@saroh/search-pages/styles.css";

import { DownloadsHub } from "@saroh/search-pages/pages";
import { notFound } from "next/navigation";

import { CtaClickArea } from "@/components/shared/buttons/cta-click-area";
import { JsonLd } from "@/components/shared/layout/json-ld";
import { docPages } from "@/lib/docs-pages";
import { hubRoute } from "@/lib/search-page-route";

/** `/downloads`: the free files this build has, by group. None: a 404. */
const hub = hubRoute("downloads", {
    title: "Free templates for small businesses in India",
    description:
        "Free Excel, Word and PDF templates for small businesses in India: invoices, receipts, rate cards and customer lists. Free, no account needed.",
});
export const generateMetadata = hub.generateMetadata;

export default function DownloadsHubRoute() {
    const pages = docPages.list("downloads");
    if (pages.length === 0) notFound();
    return (
        <>
            <JsonLd data={hub.jsonLd()} />
            <CtaClickArea src={hub.src} mode={hub.mode}>
                <DownloadsHub pages={pages} links={hub.links} />
            </CtaClickArea>
        </>
    );
}
