import "./guide-page.css";

import type { GuidePage as GuidePageData } from "../docs-load";
import type { CardItem } from "./content-blocks";
import { Byline, Figure, OnThisPage, Related } from "./content-blocks";
import { ContentLayout } from "./content-layout";
import type { ContentLinks } from "./page-links";
import { PageBand } from "./page-links";
import { Crumbs, Questions } from "./page-parts";
import { Prose } from "./prose";

/*
 * A guide (#1205, boards project/guides/Sample*): only the shared blocks,
 * in the board's order, plus Related (#1201 asks for it; the board has
 * none). Every link is a prop; absent (the admin preview), it goes nowhere.
 */

const BAND = {
    title: "Less reading, more doing.",
    line: "Saroh takes deposits when people book and sends the pay links, so you chase less.",
};

export type GuidePageLinks = ContentLinks;

export function GuidePage({
    page: p,
    draft = false,
    links = {},
    related = [],
}: {
    page: GuidePageData;
    draft?: boolean;
    links?: GuidePageLinks;
    /** Other guides for "More guides" (three are drawn). */
    related?: readonly CardItem[];
}) {
    const band = p.band ?? BAND;
    return (
        <ContentLayout
            layout="solo"
            draft={draft}
            band={<PageBand look="stack" band={band} links={links} />}
        >
            <div className="sp-gd-top">
                <Crumbs
                    crumbs={[
                        { name: "Guides", href: links.hub },
                        { name: p.name },
                    ]}
                    home={{ href: links.home }}
                    sep="›"
                    collapse
                />
                <h1 className="sp-gd-h1">{p.h1}</h1>
                <p className="sp-gd-lead">{p.lead}</p>
                <Byline
                    variant="block"
                    author={p.author}
                    published={p.published}
                    updated={p.updated}
                    readMinutes={p.readMinutes}
                />
            </div>
            {p.hero ? <Figure src={p.hero.src} alt={p.hero.alt} /> : null}
            <OnThisPage items={p.outline} />
            <Prose blocks={p.body} resolve={links.resolve} />
            {p.questions.length ? (
                <Questions questions={p.questions} headingClass="sp-h2c" />
            ) : null}
            <Related
                variant="cards"
                title="More guides"
                current={{ search: p.search }}
                items={related}
            />
        </ContentLayout>
    );
}
