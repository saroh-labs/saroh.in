import { MODULE_MAP } from "./module-map";

/**
 * A notice's own first way out, ahead of a higher plan (connecting
 * something of the business's own, say). A limit with one offers no add-on.
 * No limit carries one now: the only one was Saroh's booking emails
 * (DEC-086), removed in #1134.
 */
export interface LimitAction {
    /** The button: "Connect your email", say. */
    label: string;
    /** Where it goes, in the merchant app. */
    href: string;
    /** The sentence the notice says it in. */
    sentence: string;
    /**
     * The catalogue row the action adds to (connecting an email would be
     * one more `integrations` connection): with no room there, it is
     * closed.
     */
    room: string;
    /**
     * Said instead when the business can't take the action now (its plan
     * has no room in `room`): upgrading leads, and the button is the plan
     * picker's.
     */
    closed: {
        /** The button: "See plans". */
        label: string;
        /** Said after the higher plan, only when there is one. */
        sentence: string;
    };
}

/** How a metered limit reads to the merchant, for `limitNotice`'s sentences. */
export interface LimitWords {
    /** The counted thing, after a number: "5 products". */
    what: string;
    /** After the number one: "1 product", never "1 products" (UX-041). */
    one: string;
    /** What stops at the limit, the notice's first sentence. */
    paused: string;
    /** Counted per month (billing period, else calendar month: DEC-219), not in total. */
    monthly: boolean;
    /** The notice's primary action, before an upgrade; none offers an add-on. */
    action?: LimitAction;
}

/**
 * The words for each limit key (`MODULE_MAP.limitKey`), once: the
 * API's refusals and inbox notices (U13) and the merchant app's notices
 * (U14) read the same sentences, so a screen and the 403 behind it never
 * disagree. The team's is the design's ("Saroh Settings", Team).
 */
export const LIMIT_WORDS: Readonly<Record<string, LimitWords>> = {
    products: {
        what: "products",
        one: "product",
        paused: "You can't add more products.",
        monthly: false,
    },
    // Counted inside one product, never across the business (DEC-158):
    // `itemLimitNotice` says it, and no screen shows a total.
    variantsPerProduct: {
        what: "variants a product",
        one: "variant a product",
        paused: "No more can be added to this one.",
        monthly: false,
    },
    ordersPerMonth: {
        what: "orders a month",
        one: "order a month",
        paused: "New orders at the counter are paused until next month; your site keeps taking them.",
        monthly: true,
    },
    // Only bookings customers make on the site count (DEC-095): the team's
    // own are never capped, so the notice says the desk still books.
    bookingsPerMonth: {
        what: "online bookings a month",
        one: "online booking a month",
        paused: "Online booking on your site is paused until next month; you can still book customers in yourself.",
        monthly: true,
    },
    blogPosts: {
        what: "blog posts",
        one: "blog post",
        paused: "You can't put more posts live.",
        monthly: false,
    },
    teamMembers: {
        what: "team members",
        one: "team member",
        paused: "New invites, and new people taking bookings, are paused. Everyone already on the team keeps access.",
        monthly: false,
    },
    shopLocations: {
        what: "places customers visit",
        one: "place customers visit",
        paused: "You can't add another place customers visit.",
        monthly: false,
    },
    sites: {
        what: "websites",
        one: "website",
        paused: "You can't add another website.",
        monthly: false,
    },
    storageGb: {
        what: "GB of photos and videos",
        one: "GB of photos and videos",
        paused: "Nothing is blocked: your uploads keep working, and we'll be in touch about the space you need.",
        monthly: false,
    },
    visitsPerMonth: {
        what: "site visits a month",
        one: "site visit a month",
        paused: "Nothing is blocked: your site keeps working, and we'll be in touch about your traffic.",
        monthly: true,
    },
    integrations: {
        what: "connections",
        one: "connection",
        paused: "You can't connect more tools.",
        monthly: false,
    }, // The public API (plan 2026-11-10-001): rates a minute are refused with a
    // 429 and never metered, so their words only name the limit.
    "api.mcp.rpm": {
        what: "AI assistant requests a minute",
        one: "AI assistant request a minute",
        paused: "AI assistant requests wait until the next minute.",
        monthly: false,
    },
    "api.secret.rpm": {
        what: "API requests a minute",
        one: "API request a minute",
        paused: "API requests wait until the next minute.",
        monthly: false,
    },
    "api.storefront.rpm": {
        what: "storefront API requests a minute",
        one: "storefront API request a minute",
        paused: "Storefront API requests wait until the next minute.",
        monthly: false,
    },
    "api.keys.max": {
        what: "API keys",
        one: "API key",
        paused: "You can't make more API keys.",
        monthly: false,
    },
    "webhooks.max": {
        what: "webhook endpoints",
        one: "webhook endpoint",
        paused: "You can't add more webhook endpoints.",
        monthly: false,
    },
    // Ask AI (DEC-220): only questions that got an answer count.
    aiQuestionsPerMonth: {
        what: "Ask AI questions a month",
        one: "Ask AI question a month",
        paused: "You've used all of this period's Ask AI questions. Ready-made questions and drafts you already have still work.",
        monthly: true,
    },
};

/**
 * The counted thing after `count`: `one` for exactly one ("1 website"),
 * else `what` ("2 websites"). A `what` no limit uses comes back as given.
 */
export function countedWhat(what: string, count: number): string {
    if (count !== 1) return what;
    const words = Object.values(LIMIT_WORDS).find((w) => w.what === what);
    return words?.one ?? what;
}

/**
 * A total limit of one says nothing at 80% or at the cap (UX-041): the one
 * thing a plan comes with (its website, its owner) is filled by setting the
 * business up, so "you've reached your 1 website" on day one is noise. A
 * monthly one still warns: reaching this month's one booking is news.
 */
export function quietAtLimit(words: LimitWords, limit: number): boolean {
    return limit <= 1 && !words.monthly;
}

/** The words for a catalogue row's limit, or null for a row nothing counts. */
export function limitWordsFor(moduleId: string): LimitWords | null {
    const key = Object.prototype.hasOwnProperty.call(MODULE_MAP, moduleId)
        ? MODULE_MAP[moduleId].limitKey
        : null;
    return key && Object.prototype.hasOwnProperty.call(LIMIT_WORDS, key)
        ? LIMIT_WORDS[key]
        : null;
}
