import type { DownloadPage, GstPage, GuidePage } from "../docs-load";
import { gstCardName } from "../kinds/gst-schema";
import { GUIDE_TRADES } from "../kinds/guide-schema";
import type { CardItem } from "./content-blocks";
import type { HubGroup } from "./hub-page";
import { HubPage } from "./hub-page";
import type { ContentLinks } from "./page-links";
import { PageBand } from "./page-links";

/*
 * /gst, /guides and /downloads (boards gst/Hub*, guides/Hub*,
 * downloads/Hub*): each is HubPage with its words and its pages grouped.
 * A hub lists the pages it is given: the site passes the ones this build
 * has (only live ones in production).
 */

export interface HubLinks extends ContentLinks {
    /** A page's address, or none (the preview). */
    page?: (slug: string) => string | undefined;
}

/** Cards grouped by `groupOf`, in the order each group first appears. */
function grouped<T>(
    pages: readonly T[],
    groupOf: (p: T) => string,
    card: (p: T) => CardItem,
): HubGroup[] {
    const groups = new Map<string, CardItem[]>();
    for (const p of pages) {
        const g = groupOf(p);
        groups.set(g, [...(groups.get(g) ?? []), card(p)]);
    }
    return [...groups].map(([title, cards]) => ({ title, cards }));
}

const band = (links: HubLinks, title: string, line: string) => (
    <PageBand look="wide" band={{ title, line }} links={links} />
);

export type GstHubPage = Pick<
    GstPage,
    | "slug"
    | "type"
    | "topic"
    | "name"
    | "line"
    | "search"
    | "forPage"
    | "hubLabel"
    | "rank"
>;

export function GstHub({
    pages,
    links = {},
    draft,
}: {
    pages: readonly GstHubPage[];
    links?: HubLinks;
    draft?: boolean;
}) {
    const order = [...pages].sort(
        (a, b) =>
            Number(a.type === "concept") - Number(b.type === "concept") ||
            (a.rank ?? Number.MAX_SAFE_INTEGER) -
                (b.rank ?? Number.MAX_SAFE_INTEGER),
    );
    return (
        <HubPage
            draft={draft}
            home={links.home}
            crumbs={[{ name: "GST guides" }]}
            title="GST for service businesses in India, in plain words"
            lead="The rate, the code and a sample invoice for your trade. Checked against the current GST rates, with the date on every page."
            groups={grouped(
                order,
                (p) => (p.type === "trade" ? "By trade" : "The basics"),
                (p) => ({
                    name: gstCardName(p),
                    line: p.line,
                    href: links.page?.(p.slug),
                    eyebrow: p.type === "concept" ? "Basics" : p.hubLabel,
                }),
            )}
            footnote="Each page names the rate in force on the date it was checked. Not tax advice: each says when to ask your CA."
            band={band(
                links,
                "GST worked out on every bill.",
                "Saroh puts the right rate and split on each invoice you send.",
            )}
        />
    );
}

/** The /guides chips' words, in the board's order. */
export const GUIDE_TRADE_LABELS: Record<(typeof GUIDE_TRADES)[number], string> =
    {
        salons: "Salons",
        "gyms-and-studios": "Gyms and studios",
        clinics: "Clinics",
        shops: "Shops",
    };

export type GuidesHubPage = Pick<
    GuidePage,
    "slug" | "h1" | "line" | "group" | "trades" | "readMinutes" | "published"
>;

/** The guides a trade chip shows: those tagged with it; an unknown or no trade is All. */
export function guidesFor(
    pages: readonly GuidesHubPage[],
    trade: string | null | undefined,
): { trade: string | null; pages: GuidesHubPage[] } {
    const known = GUIDE_TRADES.find((t) => t === trade) ?? null;
    return {
        trade: known,
        pages: known
            ? pages.filter((p) => p.trades.includes(known))
            : [...pages],
    };
}

export function GuidesHub({
    pages,
    trade,
    links = {},
    draft,
}: {
    pages: readonly GuidesHubPage[];
    /** `?for=` as the browser has it; the server draws All. */
    trade?: string | null;
    links?: HubLinks;
    draft?: boolean;
}) {
    const shown = guidesFor(pages, trade);
    const chip = (t: string | null) =>
        links.hub === undefined
            ? undefined
            : t
              ? `${links.hub}?for=${t}`
              : links.hub;
    return (
        <HubPage
            draft={draft}
            home={links.home}
            crumbs={[{ name: "Guides" }]}
            title="Guides for running a small business in India"
            lead="Plain answers to the jobs that eat your week: fewer no-shows, getting paid on time, and customers who come back."
            chips={{
                label: "Guides for your trade",
                chips: [
                    { label: "All", href: chip(null), current: !shown.trade },
                    ...GUIDE_TRADES.map((t) => ({
                        label: GUIDE_TRADE_LABELS[t],
                        href: chip(t),
                        current: shown.trade === t,
                    })),
                ],
            }}
            groups={grouped(
                // The first written first: the later ones build on it.
                [...shown.pages].sort((a, b) =>
                    a.published.localeCompare(b.published),
                ),
                (p) => p.group,
                (p) => ({
                    name: p.h1,
                    line: p.line,
                    href: links.page?.(p.slug),
                    eyebrow: `${p.readMinutes} min read`,
                }),
            )}
            band={band(
                links,
                "Less reading, more doing.",
                "Saroh takes deposits when people book and sends the pay links, so you chase less.",
            )}
        />
    );
}

export type DownloadsHubPage = Pick<
    DownloadPage,
    "slug" | "name" | "line" | "group" | "files"
>;

/** The hub's sections in the board's order; pages come sorted by slug, which would put "Running the business" first. */
const DOWNLOAD_GROUPS = ["Bills and invoices", "Running the business"];
/** A group not listed goes last. */
const groupRank = (g: string) => {
    const i = DOWNLOAD_GROUPS.indexOf(g);
    return i === -1 ? DOWNLOAD_GROUPS.length : i;
};

export function DownloadsHub({
    pages,
    links = {},
    draft,
}: {
    pages: readonly DownloadsHubPage[];
    links?: HubLinks;
    draft?: boolean;
}) {
    return (
        <HubPage
            draft={draft}
            home={links.home}
            crumbs={[{ name: "Free downloads" }]}
            title="Free templates for small businesses in India"
            lead="Excel, Word and PDF files you can use today. Free, no account needed."
            groups={grouped(
                [...pages].sort(
                    (a, b) => groupRank(a.group) - groupRank(b.group),
                ),
                (p) => p.group,
                (p) => ({
                    name: p.name,
                    line: p.line,
                    href: links.page?.(p.slug),
                    eyebrow: [...new Set(p.files.map((f) => f.format))].join(
                        " · ",
                    ),
                }),
            )}
            band={band(
                links,
                "Done with spreadsheets?",
                "Saroh keeps the bills, bookings and customer list for you.",
            )}
        />
    );
}
