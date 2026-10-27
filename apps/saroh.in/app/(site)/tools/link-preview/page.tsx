import "@saroh/search-pages/styles.css";

import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { JsonLd } from "@/components/shared/layout/json-ld";
import { Faq } from "@/components/shared/sections/faq";
import { PageTitle } from "@/components/shared/sections/page-title";
import { PointGrid } from "@/components/shared/sections/point-grid";
import { LinkPreviewTool } from "@/components/tools/link-preview/link-preview-tool";
import { SarohSharePreview } from "@/components/tools/link-preview/saroh-share-preview";
import { linkPreview as copy } from "@/content/link-preview";
import { linkShown } from "@/content/resources";
import { resourcesContext } from "@/lib/resources-context";
import { pageMetadata, SITE_URL } from "@/lib/seo";
import { faqPageLd, toolLd } from "@/lib/structured-data";

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
            <div className="grid gap-[18px] px-mk-gutter pt-12">
                <div className="flex flex-wrap items-end justify-between gap-8">
                    <PageTitle size="article">{copy.title}</PageTitle>
                    <span className="text-[15px] text-mk-copy">
                        {copy.apps}
                    </span>
                </div>
                <p className="m-0 max-w-[72ch] text-[15px] leading-[1.55] text-mk-copy [text-wrap:pretty]">
                    {copy.definition}
                </p>
            </div>

            <LinkPreviewTool />

            <PointGrid
                points={copy.notes.map((note) => ({
                    title: note.t,
                    body: note.b,
                }))}
                size="sm"
                titleAs="h2"
                className="px-mk-gutter pt-16"
            />

            <SarohSharePreview />

            <Faq items={copy.faq} className="pt-[72px]" />
        </>
    );
}
