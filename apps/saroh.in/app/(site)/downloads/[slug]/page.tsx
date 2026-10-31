import "@saroh/search-pages/styles.css";

import { DownloadPage } from "@saroh/search-pages/pages";
import { notFound } from "next/navigation";

import { CtaClickArea } from "@/components/shared/buttons/cta-click-area";
import { JsonLd } from "@/components/shared/layout/json-ld";
import { searchPageRoute } from "@/lib/search-page-route";

/**
 * `/downloads/<file>` (#1206): one page per file in `content/downloads/`,
 * drawn by the package's `<DownloadPage>`; live pages only in production,
 * every page on a preview (Draft, `noindex`). The gate beside the title is
 * U9's DownloadGate. Any other slug is a 404.
 */
export const dynamicParams = false;

const route = searchPageRoute("downloads");
export const generateStaticParams = route.generateStaticParams;
export const generateMetadata = route.generateMetadata;

export default async function DownloadRoute({
    params,
}: {
    params: Promise<{ slug: string }>;
}) {
    const p = route.page((await params).slug);
    if (p?.kind !== "downloads") notFound();
    const { mode, links } = route.links(p);
    return (
        <>
            <JsonLd data={route.jsonLd(p)} />
            <CtaClickArea src={links.src} mode={mode}>
                <DownloadPage
                    page={p}
                    draft={route.draft(p)}
                    related={route.related(p)}
                    links={links}
                />
            </CtaClickArea>
        </>
    );
}
