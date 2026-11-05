import type { ReactNode } from "react";

import type { CardItem } from "./content-blocks";
import { LinkCard } from "./content-blocks";
import { ContentLayout } from "./content-layout";
import type { Crumb } from "./page-parts";
import { Crumbs } from "./page-parts";

export interface HubGroup {
    title: string;
    cards: readonly CardItem[];
}

export interface HubChip {
    label: string;
    href?: string;
    current?: boolean;
}

/** Trade filters: links (shareable, findable), the chosen one `aria-current`. */
export function HubChips({
    label,
    chips,
}: {
    label: string;
    chips: readonly HubChip[];
}) {
    return (
        <nav aria-label={label} className="sp-fchips">
            {chips.map((c) => (
                <a
                    key={c.label}
                    className="sp-fchip"
                    href={c.href}
                    aria-current={c.current ? "page" : undefined}
                >
                    {c.label}
                </a>
            ))}
        </nav>
    );
}

/** A hub's groups of cards (an empty group is left out), then its footnote. */
export function HubCards({
    groups,
    footnote,
}: {
    groups: readonly HubGroup[];
    footnote?: ReactNode;
}) {
    return (
        <>
            {groups
                .filter((g) => g.cards.length)
                .map((g) => (
                    <section key={g.title} className="sp-hc">
                        <h2 className="sp-hc-h">{g.title}</h2>
                        <ul className="sp-hc-grid">
                            {g.cards.map((c) => (
                                <li key={c.name}>
                                    <LinkCard item={c} />
                                </li>
                            ))}
                        </ul>
                    </section>
                ))}
            {footnote ? <p className="sp-hc-foot">{footnote}</p> : null}
        </>
    );
}

/** /gst, /guides, /downloads: the trail, title, lead, optional chips, the cards and the band. */
export function HubPage({
    crumbs,
    title,
    lead,
    chips,
    groups,
    footnote,
    band,
    draft,
    home,
}: {
    /** After Home, e.g. `[{ name: "GST guides" }]`; `home` is Home's href. */
    crumbs: Crumb[];
    home?: string;
    title: ReactNode;
    lead: ReactNode;
    chips?: { label: string; chips: readonly HubChip[] };
    groups: readonly HubGroup[];
    footnote?: ReactNode;
    band?: ReactNode;
    draft?: boolean;
}) {
    return (
        <ContentLayout layout="hub" draft={draft} band={band}>
            <section className="sp-hp-top">
                <Crumbs
                    crumbs={crumbs}
                    home={{ href: home }}
                    sep="›"
                    collapse
                />
                <h1 className="sp-hp-h1">{title}</h1>
                <p className="sp-hp-lead">{lead}</p>
                {chips ? <HubChips {...chips} /> : null}
            </section>
            <HubCards groups={groups} footnote={footnote} />
        </ContentLayout>
    );
}
