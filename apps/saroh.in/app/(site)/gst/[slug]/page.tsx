import "@saroh/search-pages/styles.css";

import { loadSearchPage } from "@saroh/search-pages";
import { GstPage } from "@saroh/search-pages/pages";
import { notFound } from "next/navigation";

import { CtaClickArea } from "@/components/shared/buttons/cta-click-area";
import { JsonLd } from "@/components/shared/layout/json-ld";
import { searchPageRoute } from "@/lib/search-page-route";
import { builtSearchPages, builtTools } from "@/lib/search-pages";

/**
 * `/gst/<topic>` (#1204): one page per file in `content/gst/`, drawn by
 * the package's `<GstPage>`. Production builds the live pages only; a
 * preview builds every page, one not live with a Draft label and `noindex`
 * (`lib/search-page-route.ts`). Any other slug is a 404.
 */
export const dynamicParams = false;

const route = searchPageRoute("gst");
export const generateStaticParams = route.generateStaticParams;
export const generateMetadata = route.generateMetadata;

/** A free tool's link, only when this build has its page. */
const tool = (slug: string) =>
    builtTools().some((t) => t.slug === slug && !t.inApp)
        ? { href: `/tools/${slug}` }
        : undefined;

export default async function GstRoute({
    params,
}: {
    params: Promise<{ slug: string }>;
}) {
    const p = route.page((await params).slug);
    if (p?.kind !== "gst") notFound();
    const { mode, links } = route.links(p);
    const trade =
        p.forPage && builtSearchPages().some((f) => f.slug === p.forPage)
            ? loadSearchPage(p.forPage)
            : null;
    return (
        <>
            <JsonLd data={route.jsonLd(p)} />
            <CtaClickArea src={links.src} mode={mode}>
                <GstPage
                    page={p}
                    draft={route.draft(p)}
                    related={route.related(p)}
                    links={{
                        ...links,
                        calculator: tool("gst-calculator"),
                        invoiceGenerator: tool("gst-invoice-generator"),
                        forPage: trade
                            ? { href: trade.path, plural: trade.plural }
                            : undefined,
                    }}
                />
            </CtaClickArea>
        </>
    );
}
