import type { ComponentProps, ReactNode } from "react";

import { ClosingCTA } from "../kit/closing-cta";
import { Container } from "../layout/container";
import { PageHero } from "../sections/page-hero";

import type { GalleryTemplate } from "./gallery";
import { galleryChips } from "./gallery";
import { TemplatesGallery } from "./templates-gallery";

/**
 * The website templates gallery page, saroh.in's `/templates` and
 * saroh.tech's `/website-templates`: the head, the chips and cards, the note
 * that every business shown is a sample, and the band. Each edition passes
 * its words and its start button.
 */
export function TemplatesIndex({
    crumbs,
    words,
    templates,
    bandTitle,
    start,
}: {
    crumbs?: ComponentProps<typeof PageHero>["crumbs"];
    /** The edition's gallery words (`content/`). */
    words: {
        title: string;
        intro: (templates: readonly GalleryTemplate[]) => string;
        allChip: string;
        preview: string;
        sampleNote: string;
        band: { body: string };
    };
    templates: GalleryTemplate[];
    bandTitle: string;
    start: ReactNode;
}) {
    return (
        <>
            <PageHero
                crumbs={crumbs}
                title={words.title}
                lead={words.intro(templates)}
                className="pb-8 min-[760px]:pb-10"
            />
            <Container>
                <TemplatesGallery
                    templates={templates}
                    chips={galleryChips(templates)}
                    allLabel={words.allChip}
                    previewLabel={words.preview}
                />
                <p className="m-0 pt-8 text-[13px] text-muted-foreground">
                    {words.sampleNote}
                </p>
            </Container>
            <ClosingCTA
                visual={null}
                id="templates-start"
                className="mt-[72px] min-[760px]:mt-[120px]"
                title={bandTitle}
                primary={start}
                note={words.band.body}
            />
        </>
    );
}
