import type { Family, ForPageEntry, Scene } from "../schema";
import type { HubFamily, HubLinks, HubTrade } from "./for-hub-finder";
import { ForHubFinder } from "./for-hub-finder";
import { Crumbs } from "./page-parts";

export interface ForHubProps {
    /** The pages to list: on saroh.in the ones this build has. */
    pages: ForPageEntry[];
    /** A page's address; undefined draws the row without one (a preview). */
    href?: (page: ForPageEntry) => string | undefined;
    links?: HubLinks;
}

/** The header menu's order, so a family is in the same place in both. */
const ORDER: Family[] = [
    "Shops and food",
    "Beauty",
    "Fitness and classes",
    "Health",
    "Learning",
];
/** Each family's main trade, first in it; the first four lead the All view. */
const MAIN = ["salons", "gyms", "clinics", "shops", "coaching-centres"];

const mainFirst = (a: ForPageEntry, b: ForPageEntry) => {
    const rank = (p: ForPageEntry) => {
        const at = MAIN.indexOf(p.slug);
        return at === -1 ? MAIN.length : at;
    };
    return rank(a) - rank(b) || a.name.localeCompare(b.name);
};

/**
 * The /for list (owner, 1 Nov): the trades under a search and two filters,
 * the lead ones in a bento with a real example day. Every trade's link is in
 * the page's HTML; the filters only hide them, in the browser. A family's
 * tile shows its main trade's day, so a page's words reach the browser only
 * for the pages this build carries.
 */
export function ForHub({
    pages,
    href = (p) => p.path,
    links = {},
}: ForHubProps) {
    const row = (p: ForPageEntry): HubTrade => ({
        slug: p.slug,
        name: p.name,
        line: p.h1,
        href: href(p),
        family: p.familySlug,
        shape: p.shape,
        words: `${p.name} ${p.family} ${p.search} ${p.searchWords}`.toLowerCase(),
    });
    const families: HubFamily[] = ORDER.map((name) => {
        const inIt = pages.filter((p) => p.family === name).sort(mainFirst);
        return { name, slug: inIt[0]?.familySlug ?? "", trades: inIt.map(row) };
    }).filter((f) => f.trades.length > 0);
    const everyTrade = families.flatMap((f) => f.trades);
    const leads = [
        ...MAIN.flatMap((slug) => everyTrade.filter((t) => t.slug === slug)),
        ...everyTrade.filter((t) => !MAIN.includes(t.slug)),
    ].slice(0, 4);
    // Only the days a tile can show: each family's first trade and the All view's.
    const heroSlugs = new Set([
        ...families.map((f) => f.trades[0]?.slug),
        leads[0]?.slug,
    ]);
    const heroes: Record<string, Scene["hero"]> = Object.fromEntries(
        pages.filter((p) => heroSlugs.has(p.slug)).map((p) => [p.slug, p.hero]),
    );
    return (
        <div className="sp">
            <div className="sp-fh">
                <header className="sp-fh-head">
                    <Crumbs
                        home={{ href: links.home }}
                        crumbs={[{ name: "Solutions" }]}
                    />
                    <h1 className="sp-fh-h1">Find your trade</h1>
                    <p className="sp-fh-lead">
                        See what a normal day looks like in Saroh, for a
                        business like yours.
                    </p>
                </header>
                <ForHubFinder
                    families={families}
                    leads={leads}
                    heroes={heroes}
                    links={links}
                />
            </div>
        </div>
    );
}
