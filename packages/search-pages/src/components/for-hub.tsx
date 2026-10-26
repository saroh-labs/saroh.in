import type { SearchPageEntry } from "../schema";
import { FAMILIES } from "../schema";

export interface ForHubProps {
    /** The pages to list: on saroh.in the live ones, in admin all of them. */
    pages: SearchPageEntry[];
    /** A page's address; undefined draws the row without one (the admin preview). */
    href?: (page: SearchPageEntry) => string | undefined;
}

/**
 * The /for/ list: every trade page, grouped by family, each with the search
 * it answers. Kept simple on purpose; its design comes later.
 */
export function ForHub({ pages, href = (p) => p.path }: ForHubProps) {
    const groups = FAMILIES.map((f) => ({
        family: f,
        pages: pages.filter((p) => p.family === f),
    })).filter((g) => g.pages.length);
    return (
        <div className="sp">
            <div className="sp-wrap">
                <section className="sp-hub-head">
                    <h1 className="vc-h sp-h1">
                        Saroh for your kind of business
                    </h1>
                    <p className="sp-lead">
                        Pick your trade to see what Saroh does for a business
                        like yours.
                    </p>
                </section>
                {groups.map((g) => (
                    <section key={g.family} className="sp-hub-group sp-sec">
                        <h2 className="sp-h2">{g.family}</h2>
                        <ul className="sp-hub-list">
                            {g.pages.map((p) => (
                                <li key={p.slug}>
                                    <a href={href(p)}>
                                        <span className="sp-hub-name">
                                            {p.name}
                                        </span>
                                        <span className="sp-hub-search">
                                            {p.search}
                                        </span>
                                    </a>
                                </li>
                            ))}
                        </ul>
                    </section>
                ))}
            </div>
        </div>
    );
}
