import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { LegalText } from "@/components/v2/legal/legal-text";
import { entryDayLong } from "@/content/changelog";
import { PRIVACY } from "@/content/privacy";
import { LEGAL_PAGES, isLive } from "@/content/resources";
import { parseLegal } from "@/lib/legal-markdown";
import { resourcesContext } from "@/lib/resources-context";
import { pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata({
    title: "Privacy Policy · Saroh",
    socialTitle: "Saroh's Privacy Policy",
    description: PRIVACY.description,
    path: PRIVACY.href,
});

const page = LEGAL_PAGES.find((p) => p.id === "privacy");

/**
 * The Privacy Policy (plan U1, R6): the owner's text, verbatim
 * (`content/privacy.ts`), in a 720px reading column. Served from its
 * `publishOn` day in India; before that it is a 404 and is linked nowhere
 * (KTD-2). "Last updated" is that day.
 */
export default function PrivacyPage() {
    if (!page || !isLive(page, resourcesContext())) notFound();
    const year = page.publishOn.slice(0, 4);
    return (
        <article className="mx-auto grid w-full max-w-[768px] gap-5 px-6 pt-[72px]">
            <h1 className="m-0 font-display text-[clamp(36px,6vw,56px)] font-bold leading-none tracking-[-0.045em]">
                {PRIVACY.title}
            </h1>
            <p className="m-0 text-[14px] text-muted-foreground">
                Last updated{" "}
                <time dateTime={page.publishOn}>
                    {entryDayLong(page.publishOn)} {year}
                </time>
            </p>
            <LegalText blocks={parseLegal(PRIVACY.body)} />
        </article>
    );
}
