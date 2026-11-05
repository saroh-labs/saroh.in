import "./download-page.css";

import type { ReactNode } from "react";

import type { DownloadPage as DownloadPageData } from "../docs-load";
import type { CardItem } from "./content-blocks";
import { Byline, Figure, Related } from "./content-blocks";
import { ContentLayout } from "./content-layout";
import type { ContentLinks } from "./page-links";
import { PageBand } from "./page-links";
import { Crumbs, Questions } from "./page-parts";
import { Prose } from "./prose";

/*
 * A download (#1206, boards project/downloads/Sample*): only the shared
 * blocks, in the board's order. The gate is a slot (`gate`): a
 * `DownloadGate`, under saroh.in's provider on the site and in `preview`
 * in admin. Every link is a prop; absent, it goes nowhere.
 */

const BAND = {
    title: "Done with spreadsheets?",
    line: "Saroh keeps the bills, bookings and customer list for you.",
};

export type DownloadPageLinks = ContentLinks;

/** preview.webp is 1920 wide, with narrower copies beside it (scripts/make-download-previews.mjs). */
const PREVIEW_WIDTHS = [640, 960, 1280];

/** The srcset for a made preview; any other picture is drawn as it is. */
export function previewSources(src: string) {
    if (!src.endsWith("/preview.webp")) return {};
    const base = src.slice(0, -".webp".length);
    return {
        srcSet: [
            ...PREVIEW_WIDTHS.map((w) => `${base}-${w}.webp ${w}w`),
            `${src} 1920w`,
        ].join(", "),
        // The full-width column below the hero: 1280 less its side padding.
        sizes: "(min-width: 1280px) 1168px, 100vw",
        width: 1920,
        height: 840,
    };
}

export function DownloadPage({
    page: p,
    draft = false,
    links = {},
    related = [],
    gate,
}: {
    page: DownloadPageData;
    draft?: boolean;
    links?: DownloadPageLinks;
    /** Other downloads for "More downloads" (three are drawn). */
    related?: readonly CardItem[];
    /** The form that gives the files, beside the title. */
    gate?: ReactNode;
}) {
    const band = p.band ?? BAND;
    return (
        <ContentLayout
            layout="hero"
            draft={draft}
            aside={gate}
            below={
                <>
                    <Prose blocks={p.body} resolve={links.resolve} />
                    {p.preview ? (
                        <Figure
                            src={p.preview.src}
                            alt={p.preview.alt}
                            ratio="16/7"
                            {...previewSources(p.preview.src)}
                        />
                    ) : null}
                    {p.questions.length ? (
                        <Questions
                            questions={p.questions}
                            headingClass="sp-h2c"
                        />
                    ) : null}
                    <Related
                        variant="cards"
                        title="More free downloads"
                        current={{ search: p.search }}
                        items={related}
                    />
                    <PageBand look="wide" band={band} links={links} />
                    <Byline
                        variant="line"
                        verb="Made by"
                        author={p.author}
                        updated={p.updated}
                    />
                </>
            }
        >
            <div className="sp-dl-copy">
                <Crumbs
                    crumbs={[
                        { name: "Free downloads", href: links.hub },
                        { name: p.name },
                    ]}
                    home={{ href: links.home }}
                    sep="›"
                    collapse
                />
                <h1 className="sp-dl-h1">{p.h1}</h1>
                <p className="sp-dl-lead">{p.lead}</p>
                <ul className="sp-dl-ben">
                    {p.benefits.map((b) => (
                        <li key={b}>{b}</li>
                    ))}
                </ul>
            </div>
        </ContentLayout>
    );
}
