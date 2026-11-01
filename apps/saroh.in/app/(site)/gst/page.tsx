import "@saroh/search-pages/styles.css";

import { GstHub } from "@saroh/search-pages/pages";
import { notFound } from "next/navigation";

import { CtaClickArea } from "@/components/shared/buttons/cta-click-area";
import { JsonLd } from "@/components/shared/layout/json-ld";
import { docPages } from "@/lib/docs-pages";
import { hubRoute } from "@/lib/search-page-route";

/** `/gst`: the GST pages this build has, by trade and the basics. None (production before the first publish): a 404. */
const hub = hubRoute("gst", {
    title: "GST for service businesses in India",
    description:
        "GST for salons, gyms, clinics, classes, food and shops in India: the rate, the SAC or HSN code and a sample invoice for your trade, in plain words.",
});
export const generateMetadata = hub.generateMetadata;

export default function GstHubRoute() {
    const pages = docPages.list("gst");
    if (pages.length === 0) notFound();
    return (
        <>
            <JsonLd data={hub.jsonLd()} />
            <CtaClickArea src={hub.src} mode={hub.mode}>
                <GstHub pages={pages} links={hub.links} />
            </CtaClickArea>
        </>
    );
}
