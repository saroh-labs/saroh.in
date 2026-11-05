import "@saroh/search-pages/styles.css";

import { GuidePage } from "@saroh/search-pages/pages";
import { notFound } from "next/navigation";

import { CtaClickArea } from "@/components/shared/buttons/cta-click-area";
import { JsonLd } from "@/components/shared/layout/json-ld";
import { searchPageRoute } from "@/lib/search-page-route";

/**
 * `/guides/<guide>` (#1205): one page per file in `content/guides/`, drawn
 * by the package's `<GuidePage>`; live pages only in production, every
 * page on a preview (Draft, `noindex`). Any other slug is a 404.
 */
export const dynamicParams = false;

const route = searchPageRoute("guides");
export const generateStaticParams = route.generateStaticParams;
export const generateMetadata = route.generateMetadata;

export default async function GuideRoute({
    params,
}: {
    params: Promise<{ slug: string }>;
}) {
    const p = route.page((await params).slug);
    if (p?.kind !== "guides") notFound();
    const { mode, links } = route.links(p);
    return (
        <>
            <JsonLd data={route.jsonLd(p)} />
            <CtaClickArea src={links.src} mode={mode}>
                <GuidePage
                    page={p}
                    draft={route.draft(p)}
                    related={route.related(p)}
                    links={links}
                />
            </CtaClickArea>
        </>
    );
}
