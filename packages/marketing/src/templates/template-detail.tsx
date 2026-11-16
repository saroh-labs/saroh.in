import type { ReactNode } from "react";

import { ClosingCTA } from "../kit/closing-cta";
import { StickyBar } from "../kit/sticky-bar";
import { SwipeRow } from "../kit/swipe-row";
import { Container } from "../layout/container";
import { PageHero } from "../sections/page-hero";
import { SectionHeading } from "../sections/section-heading";
import { sentenceList } from "../sentence-list";

import type { GalleryTemplate } from "./gallery";
import { TemplateCard } from "./template-card";
import { TemplateViewer } from "./template-viewer";

interface Note {
    title: string;
    body: string;
}

/** The words a template's page reads from its edition's `content/`. */
export interface TemplateDetailWords {
    crumb: string;
    saveNote: (name: string) => string;
    switcher: string;
    desktop: string;
    phone: string;
    notes: {
        pages: (t: GalleryTemplate) => Note;
        uses: (t: GalleryTemplate) => Note;
        look: (t: GalleryTemplate) => Note;
    };
    facts: { pages: string; uses: string; type: string; colours: string };
    related: string;
}

/**
 * One website template's page, saroh.in's `/templates/[slug]` and
 * saroh.tech's `/website-templates/[slug]`: "{Name}: {idea}.", its pages
 * desktop or phone, three notes and the facts, the related templates, the
 * band and the sticky bar. Each edition passes its words, its start button
 * (`start`, drawn at the hero, the band and the sticky bar) and the band's title.
 */
export function TemplateDetail({
    template: t,
    related,
    words: detail,
    galleryHref,
    sampleNote,
    previewLabel,
    bandTitle,
    bandNote,
    start,
}: {
    template: GalleryTemplate;
    related: readonly GalleryTemplate[];
    words: TemplateDetailWords;
    galleryHref: string;
    sampleNote: string;
    previewLabel: string;
    bandTitle: string;
    bandNote: string;
    start: (where: "hero" | "band" | "sticky") => ReactNode;
}) {
    const notes = [
        detail.notes.pages(t),
        detail.notes.uses(t),
        detail.notes.look(t),
    ];
    const facts: [string, string][] = [
        [detail.facts.pages, sentenceList(t.pages.map((p) => p.title))],
        [
            detail.facts.uses,
            t.uses.length ? sentenceList(t.uses) : "Your website",
        ],
        [detail.facts.type, t.type],
        [detail.facts.colours, sentenceList(t.colourways)],
    ];

    return (
        <>
            <PageHero
                crumbs={[
                    { name: detail.crumb, href: galleryHref },
                    { name: t.name },
                ]}
                title={`${t.name}: ${t.idea}.`}
                mark={`${t.name}:`}
                lead={t.description}
                className="pb-8 min-[760px]:pb-12"
            >
                <div className="grid justify-items-start gap-3">
                    <span id="template-cta">{start("hero")}</span>
                    <span className="max-w-[60ch] text-[13px] text-muted-foreground">
                        {detail.saveNote(t.name)}
                    </span>
                </div>
            </PageHero>

            <Container>
                <TemplateViewer
                    template={t}
                    labels={{
                        pages: detail.switcher,
                        device: "Show it on",
                        desktop: detail.desktop,
                        phone: detail.phone,
                    }}
                />
                <p className="m-0 pt-4 text-[13px] text-muted-foreground">
                    {sampleNote}
                </p>
            </Container>

            <Container
                as="section"
                aria-label="About this template"
                className="pt-[72px] min-[760px]:pt-[96px]"
            >
                <ul className="m-0 grid list-none grid-cols-[repeat(auto-fit,minmax(min(100%,280px),1fr))] gap-x-10 gap-y-8 p-0">
                    {notes.map((n) => (
                        <li
                            key={n.title}
                            className="grid content-start gap-2 border-t border-border pt-5"
                        >
                            <h2 className="m-0 font-display text-mk-kit-h3 font-bold">
                                {n.title}
                            </h2>
                            <p className="m-0 text-[16px] leading-[1.6] text-mk-copy [text-wrap:pretty]">
                                {n.body}
                            </p>
                        </li>
                    ))}
                </ul>
                <dl className="m-0 mt-12 grid grid-cols-[repeat(auto-fit,minmax(min(100%,200px),1fr))] gap-6 rounded-mk-card border border-border bg-card p-6">
                    {facts.map(([term, value]) => (
                        <div key={term} className="grid content-start gap-1">
                            <dt className="text-[13px] text-muted-foreground">
                                {term}
                            </dt>
                            <dd className="m-0 text-[15px] font-medium">
                                {value}
                            </dd>
                        </div>
                    ))}
                </dl>
            </Container>

            {related.length > 0 ? (
                <Container
                    as="section"
                    aria-labelledby="related"
                    className="grid grid-cols-[minmax(0,1fr)] gap-10 pt-[72px] min-[760px]:pt-[120px]"
                >
                    <SectionHeading
                        id="related"
                        title={detail.related}
                        size="kit-h2"
                    />
                    <SwipeRow label={detail.related}>
                        {related.map((r) => (
                            <TemplateCard
                                key={r.slug}
                                template={r}
                                previewLabel={previewLabel}
                                headingLevel={3}
                            />
                        ))}
                    </SwipeRow>
                </Container>
            ) : null}

            <ClosingCTA
                visual={null}
                id="template-start"
                className="mt-[72px] min-[760px]:mt-[120px]"
                title={bandTitle}
                primary={start("band")}
                note={bandNote}
            />

            <StickyBar watch="template-cta">{start("sticky")}</StickyBar>
        </>
    );
}
