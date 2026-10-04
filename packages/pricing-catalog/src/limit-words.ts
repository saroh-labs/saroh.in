import { MODULE_MAP } from "./module-map";

/** How a metered limit reads to the merchant, for `limitNotice`'s sentences. */
export interface LimitWords {
    /** The counted thing, after a number: "5 products". */
    what: string;
    /** What stops at the limit, the notice's first sentence. */
    paused: string;
    /** Counted per calendar month in the business's zone, not in total. */
    monthly: boolean;
}

/**
 * The words for each metered limit key (`MODULE_MAP.limitKey`), once: the
 * API's refusals and inbox notices (U13) and the merchant app's notices
 * (U14) read the same sentences, so a screen and the 403 behind it never
 * disagree. The team's is the design's ("Saroh Settings", Team).
 */
export const LIMIT_WORDS: Readonly<Record<string, LimitWords>> = {
    products: {
        what: "products",
        paused: "You can't add more products.",
        monthly: false,
    },
    ordersPerMonth: {
        what: "orders a month",
        paused: "New orders at the counter are paused until next month; your site keeps taking them.",
        monthly: true,
    },
    bookingsPerMonth: {
        what: "bookings a month",
        paused: "New bookings are paused until next month.",
        monthly: true,
    },
    blogPosts: {
        what: "blog posts",
        paused: "You can't put more posts live.",
        monthly: false,
    },
    teamMembers: {
        what: "team members",
        paused: "New invites are paused. Everyone already on the team keeps access.",
        monthly: false,
    },
    integrations: {
        what: "connections",
        paused: "You can't connect more tools.",
        monthly: false,
    },
};

/** The words for a catalogue row's limit, or null for a row nothing counts. */
export function limitWordsFor(moduleId: string): LimitWords | null {
    const key = Object.prototype.hasOwnProperty.call(MODULE_MAP, moduleId)
        ? MODULE_MAP[moduleId].limitKey
        : null;
    return key && Object.prototype.hasOwnProperty.call(LIMIT_WORDS, key)
        ? LIMIT_WORDS[key]
        : null;
}
