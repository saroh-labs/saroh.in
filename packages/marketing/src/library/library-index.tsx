import type { ComponentProps, ReactNode } from "react";

import { ClosingCTA } from "../kit/closing-cta";
import { Container } from "../layout/container";
import { TextLink } from "../links/text-link";
import { Faq } from "../sections/faq";
import { PageHero } from "../sections/page-hero";

/**
 * The website library page (DEC-228, plan 2026-11-18-001 U11; board
 * LPHome): the head, the blocks with their toolbar (`blocks`, the edition's
 * `LibraryBlocks`), a way to the templates, the questions and the band.
 * In Saroh's marketing look; only the previews inside are a merchant's.
 */
export function LibraryIndex({
    crumbs,
    words,
    blocks,
    templatesHref,
    start,
}: {
    crumbs?: ComponentProps<typeof PageHero>["crumbs"];
    words: {
        title: string;
        mark?: string;
        lead: string;
        blocksTitle: string;
        blocksLead: string;
        templates: { title: string; body: string; link: string };
        faq: readonly { q: string; a: string }[];
        band: { title: string; note: string };
    };
    blocks: ReactNode;
    start: ReactNode;
    /** The templates gallery, while it is shown. */
    templatesHref?: string;
}) {
    return (
        <>
            <PageHero
                crumbs={crumbs}
                title={words.title}
                mark={words.mark}
                lead={words.lead}
            />
            <Container>
                <section
                    aria-labelledby="library-blocks-title"
                    className="grid gap-8"
                >
                    <div className="grid gap-3">
                        <h2
                            id="library-blocks-title"
                            className="m-0 font-display text-mk-kit-h2 font-bold text-foreground"
                        >
                            {words.blocksTitle}
                        </h2>
                        <p className="m-0 max-w-[60ch] text-[17px] text-mk-copy">
                            {words.blocksLead}
                        </p>
                    </div>
                    {blocks}
                </section>
                {templatesHref ? (
                    <section
                        aria-labelledby="library-templates-title"
                        className="mt-[72px] grid gap-3 rounded-2xl border border-border bg-card p-6 min-[760px]:mt-[120px]"
                    >
                        <h2
                            id="library-templates-title"
                            className="m-0 font-display text-mk-kit-h3 font-bold text-foreground"
                        >
                            {words.templates.title}
                        </h2>
                        <p className="m-0 text-[16px] text-mk-copy">
                            {words.templates.body}
                        </p>
                        <TextLink href={templatesHref} arrow>
                            {words.templates.link}
                        </TextLink>
                    </section>
                ) : null}
                <Faq items={[...words.faq]} className="pb-[72px] pt-[72px]" />
            </Container>
            <ClosingCTA
                visual={null}
                id="library-start"
                title={words.band.title}
                primary={start}
                note={words.band.note}
            />
        </>
    );
}
