import "@saroh/search-pages/styles.css";

import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PageHero, toolsCrumb } from "@/components/resources/page-hero";
import { JsonLd } from "@/components/shared/layout/json-ld";
import { LinkPreviewTool } from "@/components/tools/link-preview/link-preview-tool";
import { SarohSharePreview } from "@/components/tools/link-preview/saroh-share-preview";
import { linkPreview as copy } from "@/content/link-preview";
import { linkShown } from "@/content/resources";
import { resourcesContext } from "@/lib/resources-context";
import { builtTools } from "@/lib/search-pages";
import { pageMetadata, SITE_URL } from "@/lib/seo";
import { faqPageLd, toolLd } from "@/lib/structured-data";
import { Faq } from "@saroh/marketing/faq";
import { PointGrid } from "@saroh/marketing/point-grid";

/**
 * The link preview checker (resources plan U2; design "Saroh Resources -
 * Link Preview Tool" 1b, the email version): the one Resources page a
 * stranger finds through search. The page itself is static words; the tool
 * is a client component that asks `/api/link-preview`, which asks the API.
 *
 * `?url=` opens a shared report already checked (R13). The tool reads it in
 * the browser, as the waitlist form reads its own query, so this page takes
 * no `searchParams` and is built once as a file like every other content
 * page (it was the one page rendered on each request). The canonical is the
 * page without the query, so every report is one page to a search engine.
 *
 * Published from the admin like every free tool (#1253): a build whose
 * publish list doesn't have it live draws a 404 here and links it nowhere.
 */
export const metadata: Metadata = pageMetadata({
    title: copy.metaTitle,
    socialTitle: copy.socialTitle,
    description: copy.metaDescription,
    path: copy.path,
});

export default function LinkPreviewPage() {
    if (!linkShown(copy.path, resourcesContext())) notFound();
    return (
        <>
            <JsonLd
                data={[
                    toolLd({
                        name: copy.title,
                        description: copy.definition,
                        url: `${SITE_URL}${copy.path}`,
                    }),
                    faqPageLd(copy.faq),
                ]}
            />
            <PageHero
                crumbs={[
                    toolsCrumb(builtTools().length > 0),
                    { name: copy.title },
                ]}
                title={copy.title}
                lead={copy.definition}
                className="pb-6 min-[760px]:pb-8"
            >
                <p className="m-0 -mt-2 text-[15px] text-muted-foreground">
                    {copy.apps}
                </p>
            </PageHero>

            <LinkPreviewTool />

            <PointGrid
                points={copy.notes.map((note) => ({
                    title: note.t,
                    body: note.b,
                }))}
                size="sm"
                titleAs="h2"
                className="mx-auto max-w-mk-page px-mk-gutter pt-16"
            />

            <SarohSharePreview />

            <div className="mx-auto max-w-mk-page">
                <Faq items={copy.faq} className="pb-[72px] pt-[72px]" />
            </div>
        </>
    );
}
