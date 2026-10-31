import "./gst-page.css";

import type { GstPage as GstPageData } from "../docs-load";
import { showDate } from "../tools/_documents/logic";
import type { CardItem } from "./content-blocks";
import {
    AnswerBox,
    Byline,
    FactsStrip,
    NumberedList,
    Related,
    Section,
} from "./content-blocks";
import { ContentLayout } from "./content-layout";
import type { Column } from "./data-table";
import { DataTable } from "./data-table";
import type { ContentLinks } from "./page-links";
import { PageBand } from "./page-links";
import { Crumbs, Questions } from "./page-parts";
import { Prose, Words } from "./prose";

/*
 * A GST page (#1204, boards project/gst/*): only the shared blocks, in the
 * board's order, with the page's data. Every link is a prop; absent (the
 * admin preview), it goes nowhere, and a tool or /for/ page that isn't
 * live is passed as absent and not drawn at all.
 */

/** Every GST page says it, whatever its file holds. */
export const NOT_TAX_ADVICE =
    "A guide, not tax advice: check with your CA for your own case.";

const BAND = {
    title: "GST worked out on every bill.",
    line: "Saroh puts the right rate and split on each invoice you send.",
};

/** A table head's column kind, for the phone layout: codes, money and tax. */
function columnOf(label: string, i: number, last: number): Column {
    if (i === 0) return { label };
    if (/^(SAC|HSN)\b/.test(label)) return { label, kind: "code" };
    if (/^(CGST|SGST|IGST|GST)\b/.test(label)) return { label, kind: "tax" };
    if (i === last && /total/i.test(label)) return { label, kind: "total" };
    if (/value|amount|price|fee/i.test(label)) return { label, kind: "value" };
    return { label };
}

export interface GstPageLinks extends ContentLinks {
    /** The two GST tools, each only when live; `{}` draws it with no link (the preview). */
    calculator?: { href?: string };
    invoiceGenerator?: { href?: string };
    /** The trade's /for/ page, only when live: its name ("salons") and link. */
    forPage?: { href?: string; plural: string };
}

export function GstPage({
    page: p,
    draft = false,
    links = {},
    related = [],
}: {
    page: GstPageData;
    draft?: boolean;
    links?: GstPageLinks;
    /** More GST pages for the rail (three are drawn). */
    related?: readonly CardItem[];
}) {
    const rate = p.codes[0]?.rate;
    const tools: CardItem[] = [];
    if (links.calculator)
        tools.push({
            name: "GST calculator",
            line: `Add or take out ${rate === undefined ? "GST" : `${rate}%`} in a second.`,
            href: links.calculator.href,
        });
    if (links.invoiceGenerator)
        tools.push({
            name: "GST invoice generator",
            line: "A PDF with this split worked out.",
            href: links.invoiceGenerator.href,
        });
    if (links.forPage)
        tools.push({
            eyebrow: "For your trade",
            name: `Saroh for ${links.forPage.plural}`,
            line: "What Saroh does for a business like yours.",
            href: links.forPage.href,
        });
    const { head, rows, foot } = p.table;
    const source = p.sources[0];
    const band = p.band ?? BAND;
    return (
        <ContentLayout
            layout="rail"
            draft={draft}
            aside={
                <Related
                    variant="rail"
                    title="More GST guides"
                    current={{ search: p.search }}
                    tools={tools}
                    items={related}
                />
            }
            band={<PageBand look="stack" band={band} links={links} />}
        >
            <div className="sp-gst-top">
                <Crumbs
                    crumbs={[
                        { name: "GST guides", href: links.hub },
                        { name: p.name },
                    ]}
                    home={{ href: links.home }}
                    sep="›"
                    collapse
                />
                <h1 className="sp-gst-h1">{p.h1}</h1>
                <AnswerBox>
                    <Words inline={p.answer} resolve={links.resolve} />
                </AnswerBox>
                {source ? (
                    <span className="sp-gst-checked">
                        Checked on{" "}
                        <time dateTime={p.checkedOn}>
                            {showDate(p.checkedOn)}
                        </time>{" "}
                        against{" "}
                        <a href={links.resolve?.(source.href)}>
                            {source.label}
                        </a>
                    </span>
                ) : null}
            </div>
            <FactsStrip facts={p.facts} />
            <Section title={p.table.title} note={p.table.note}>
                <DataTable
                    variant={p.table.kind}
                    caption={p.table.title}
                    columns={head.map((h, i) =>
                        columnOf(h, i, head.length - 1),
                    )}
                    rows={rows.map((cells) => {
                        // The phone line ends with the rate of its code, as the boards do.
                        const rate = p.codes.find((c) =>
                            cells.includes(c.code),
                        )?.rate;
                        return {
                            cells,
                            note:
                                rate === undefined ? undefined : `GST ${rate}%`,
                        };
                    })}
                    total={foot}
                />
            </Section>
            <Prose blocks={p.body} resolve={links.resolve} />
            <Section title="Common mistakes" tight>
                <NumberedList
                    items={p.mistakes.map((m) => ({
                        lead: m.title,
                        text: m.body,
                    }))}
                />
            </Section>
            <Questions
                questions={p.questions}
                headingClass="sp-h2c"
                compact
                openFirst
            />
            <Byline
                variant="line"
                author={p.author}
                updated={p.updated}
                note={NOT_TAX_ADVICE}
            />
        </ContentLayout>
    );
}
