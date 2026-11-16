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
    title,
    lead,
    templates,
    allLabel,
    previewLabel,
    sampleNote,
    bandTitle,
    bandNote,
    start,
}: {
    crumbs?: ComponentProps<typeof PageHero>["crumbs"];
    title: string;
    lead: string;
    templates: GalleryTemplate[];
    allLabel: string;
    previewLabel: string;
    sampleNote: string;
    bandTitle: string;
    bandNote: string;
    start: ReactNode;
}) {
    return (
        <>
            <PageHero
                crumbs={crumbs}
                title={title}
                lead={lead}
                className="pb-8 min-[760px]:pb-10"
            />
            <Container>
                <TemplatesGallery
                    templates={templates}
                    chips={galleryChips(templates)}
                    allLabel={allLabel}
                    previewLabel={previewLabel}
                />
                <p className="m-0 pt-8 text-[13px] text-muted-foreground">
                    {sampleNote}
                </p>
            </Container>
            <ClosingCTA
                visual={null}
                id="templates-start"
                className="mt-[72px] min-[760px]:mt-[120px]"
                title={bandTitle}
                primary={start}
                note={bandNote}
            />
        </>
    );
}
