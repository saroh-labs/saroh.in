import type { FaqItem, FeatureSlug } from "@saroh/marketing/content-types";
import type { HubWay } from "@saroh/marketing/solutions/hub-finder";
import type { HomeMoment } from "@saroh/marketing/solutions/moment-types";

/** The hub's groups (`solutions-hub.ts`), which also head the menu's and footer's columns. */
export type TradeGroup =
    "food" | "beauty" | "fitness" | "health" | "home" | "work";

/** One problem on a trade page: words alone, as no Global screen of this trade is captured yet. */
export interface TradeProblemWords {
    feature: FeatureSlug;
    /** Above the quote, when it says more than the feature's name. */
    label?: string;
    /** The quoted problem, with its curly quotes. */
    pain: string;
    title: string;
    body: string;
}

/**
 * A trade page beyond the four lead ones (owner, 16 Nov 2026): each in its
 * own words, problems and questions, for a business outside India, held
 * `unreviewed` (noindex) until the owner has read it.
 */
export interface TradePage {
    /** Plural, as the lead ones: `plumbers`, `dental-clinics`. */
    slug: string;
    /** Menu, hub tile, crumb: "Plumbers". */
    name: string;
    /** The trade bar's one word: "Plumber". */
    bar: string;
    /** "Questions {longName} ask.", "Pricing for {longName}". */
    longName: string;
    group: TradeGroup;
    way: HubWay;
    /** The hub tile's moment: its hour ("HH:MM") and its line. */
    at: string;
    moment: string;
    /** More words the hub's search matches: "plumbing boiler leak". */
    searchWords: string;
    /** The search phrase: in the sub, and the title's first word. */
    phrase: string;
    seoTitle: string;
    seoDescription: string;
    headline: string;
    sub: string;
    /** The hero's drawing: this trade's Home on an ordinary morning, an example. */
    home: Pick<HomeMoment, "label" | "clock" | "place" | "needs" | "today">;
    changeTitle: string;
    problems: TradeProblemWords[];
    /** What to add first: how a list might start, with no prices. */
    starter: {
        kind: "services" | "products" | "classes";
        rows: { name: string; detail: string }[];
    };
    /** The trade's slug in the templates gallery (`content/templates/trades`). */
    templates?: string;
    /** Its own questions, asked before the general ones. */
    faq: FaqItem[];
    closer: string;
    /** Near trades, for "Saroh for other trades". */
    related: string[];
}
