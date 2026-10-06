import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { Container } from "@/components/v2/container";
import { TemplatesBand } from "@/components/v2/templates/templates-band";
import { TemplatesGallery } from "@/components/v2/templates/templates-gallery";
import {
    earlyAccessOpen,
    galleryChips,
    galleryTemplates,
    templatesPage as page,
    TEMPLATES_PATH,
} from "@/content/templates";
import { resourcesContext } from "@/lib/resources-context";
import { pageMetadata } from "@/lib/seo";
import { templatesLive } from "@/lib/templates-live";

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
 * shows it on previews and locally.
 */
export default function TemplatesPage() {
    const ctx = resourcesContext();
    if (!templatesLive(ctx)) notFound();
    const templates = galleryTemplates();
    const open = earlyAccessOpen(ctx.now);
    return (
        <>
            <Container
                as="header"
                className="grid justify-items-center gap-4 pt-16 text-center"
            >
                <h1 className="m-0 max-w-[18ch] font-display text-[clamp(36px,6vw,60px)] font-bold leading-[1.02] tracking-[-0.045em] [text-wrap:balance]">
                    {page.title}
                </h1>
                <p className="m-0 max-w-[58ch] text-mk-band-body text-mk-copy [text-wrap:pretty]">
                    {page.intro(templates)}
                </p>
            </Container>

            <Container className="pt-10">
                <TemplatesGallery
                    templates={templates}
                    chips={galleryChips(templates)}
                    allLabel={page.allChip}
                    previewLabel={page.preview}
                />
                <p className="m-0 pt-8 text-center text-mk-note text-muted-foreground">
                    {page.sampleNote}
                </p>
            </Container>

            <TemplatesBand
                title={open ? page.band.after : page.band.before}
                body={page.band.body}
                src="templates-band"
            />
        </>
    );
}
