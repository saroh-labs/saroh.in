import { notFound } from "next/navigation";

import { LegalText } from "@/components/v2/legal/legal-text";
import { entryDayLong } from "@/content/changelog";
import { LEGAL_PAGES, isLive } from "@/content/resources";
import { parseLegal } from "@/lib/legal-markdown";
import { resourcesContext } from "@/lib/resources-context";

/**
 * A legal page (plan U1, R6): the owner's text, verbatim, in a 720px reading
 * column. Served from its `publishOn` day in India (`LEGAL_PAGES`); before
 * that it is a 404 and is linked nowhere (KTD-2). "Last updated" is that day.
 */
export function LegalPage({
    id,
    title,
    body,
}: {
    id: string;
    title: string;
    body: string;
}) {
    const page = LEGAL_PAGES.find((p) => p.id === id);
    if (!page || !isLive(page, resourcesContext())) notFound();
    const year = page.publishOn.slice(0, 4);
    return (
        <article className="mx-auto grid w-full max-w-[768px] gap-5 px-6 pt-[72px]">
            <h1 className="m-0 font-display text-[clamp(36px,6vw,56px)] font-bold leading-none tracking-[-0.045em]">
                {title}
            </h1>
            <p className="m-0 text-[14px] text-muted-foreground">
                Last updated{" "}
                <time dateTime={page.publishOn}>
                    {entryDayLong(page.publishOn)} {year}
                </time>
            </p>
            <LegalText blocks={parseLegal(body)} />
        </article>
    );
}
