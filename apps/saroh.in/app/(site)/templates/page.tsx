import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { CtaLink } from "@/components/shared/buttons/cta-link";
import {
    earlyAccessOpen,
    galleryTemplates,
    templatesPage as page,
    TEMPLATES_PATH,
} from "@/content/templates";
import { resourcesContext } from "@/lib/resources-context";
import { pageMetadata } from "@/lib/seo";
import { templatesLive } from "@/lib/templates-live";
import { TemplatesIndex } from "@saroh/marketing/templates/templates-index";

export const metadata: Metadata = pageMetadata({
    title: page.seo.title,
    socialTitle: page.seo.socialTitle,
    description: page.seo.description,
    path: TEMPLATES_PATH,
});

/**
 * The Templates gallery (Resources plan U6, industry templates plan U13;
 * design "Saroh Resources - Templates"): the title and what the templates
 * are, chips for the kinds of business that have one, a card per template
 * a merchant can pick, the note that every business shown is a sample, and
 * the band.
 *
 * Published with early access (17 Oct, `content/resources.ts`): before its
 * day the page is a 404 and is linked nowhere (KTD-2); `RESOURCES_PREVIEW`
 * shows it on previews and locally. With its switch off
 * (`NEXT_PUBLIC_TEMPLATES`, DEC-135) it is a 404 whatever the date.
 */
export default function TemplatesPage() {
    const ctx = resourcesContext();
    if (!templatesLive(ctx)) notFound();
    const templates = galleryTemplates();
    const open = earlyAccessOpen(ctx.now);
    return (
        <>
            <TemplatesIndex
                title={page.title}
                lead={page.intro(templates)}
                templates={templates}
                allLabel={page.allChip}
                previewLabel={page.preview}
                sampleNote={page.sampleNote}
                bandTitle={open ? page.band.after : page.band.before}
                bandNote={page.band.body}
                start={<CtaLink src="templates-band" size="kit" />}
            />
        </>
    );
}
