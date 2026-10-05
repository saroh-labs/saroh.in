import type { Metadata } from "next";

import { Faq } from "@/components/v2/faq";
import { JsonLd } from "@/components/v2/json-ld";
import { LinkPreviewTool } from "@/components/v2/tools/link-preview-tool";
import { SarohSharePreview } from "@/components/v2/tools/saroh-share-preview";
import { linkPreview as copy } from "@/content/link-preview";
import { pageMetadata, SITE_URL } from "@/lib/seo";
import { faqPageLd, toolLd } from "@/lib/structured-data";

/**
 * The link preview checker (resources plan U2; design "Saroh Resources -
 * Link Preview Tool" 1b, the email version): the one Resources page a
 * stranger finds through search. The page itself is static words; the tool
 * is a client component that asks `/api/link-preview`, which asks the API.
 *
 * `?url=` opens a shared report already checked (R13); the canonical is
 * the page without it, so every report is one page to a search engine.
 */
export const metadata: Metadata = pageMetadata({
    title: copy.metaTitle,
    socialTitle: copy.socialTitle,
    description: copy.metaDescription,
    path: copy.path,
});

interface Props {
    searchParams: Promise<{ url?: string | string[] }>;
}

export default async function LinkPreviewPage({ searchParams }: Props) {
    const { url } = await searchParams;
    const initialUrl = (Array.isArray(url) ? url[0] : url)?.slice(0, 2048);

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
                    <h1 className="m-0 font-display text-[clamp(36px,6vw,44px)] font-bold leading-[1.02] tracking-[-0.04em]">
                        {copy.title}
                    </h1>
                    <span className="text-[15px] text-mk-copy">
                        {copy.apps}
                    </span>
                </div>
                <p className="m-0 max-w-[72ch] text-[15px] leading-[1.55] text-mk-copy [text-wrap:pretty]">
                    {copy.definition}
                </p>
            </div>

            <LinkPreviewTool initialUrl={initialUrl} />

            <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,260px),1fr))] gap-8 px-mk-gutter pt-16">
                {copy.notes.map((note) => (
                    <div
                        key={note.t}
                        className="grid content-start gap-1.5 border-t border-border pt-4"
                    >
                        <h2 className="m-0 text-base font-semibold">
                            {note.t}
                        </h2>
                        <p className="m-0 text-[14.5px] leading-[1.55] text-mk-copy">
                            {note.b}
                        </p>
                    </div>
                ))}
            </div>

            <SarohSharePreview />

            <Faq items={copy.faq} className="pt-[72px]" />
        </>
    );
}
