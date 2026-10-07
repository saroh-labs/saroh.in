import { MODULE_MAP } from "./module-map";

/**
 * A notice's own first way out, ahead of a higher plan: for Saroh's emails
 * (DEC-086), connecting the business's own email, which is never counted.
 * A limit with one offers no add-on.
 */
export interface LimitAction {
    /** The button: "Connect your email". */
    label: string;
    /** Where it goes, in the merchant app. */
    href: string;
    /** The sentence the notice says it in. */
    sentence: string;
    /**
     * The catalogue row the action adds to (connecting an email is one
     * more `integrations` connection): with no room there, it is closed.
     */
    room: string;
    /**
     * Said instead when the business can't take the action now (its plan
     * has no room to connect its own email, DEC-086): upgrading leads, and
     * the button is the plan picker's.
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
    /** Counted per calendar month in the business's zone, not in total. */
    monthly: boolean;
    /** The notice's primary action, before an upgrade; none offers an add-on. */
    action?: LimitAction;
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
        one: "product",
        paused: "You can't add more products.",
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
        paused: "New invites are paused. Everyone already on the team keeps access.",
        monthly: false,
    },
    reviewers: {
        what: "reviewers",
        one: "reviewer",
        paused: "New reviewer invites are paused. Reviewers you have keep access.",
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
    },
    /**
     * Booking emails Saroh sends for a business with no email of its own
     * (DEC-086). A hard cap: past it, the customer sees the notice in their
     * account on the site, and the email waits for the business's own.
     */
    sarohEmailsPerMonth: {
        what: "emails Saroh sends for you a month",
        one: "email Saroh sends for you a month",
        paused: "Saroh has stopped sending your booking emails for this month.",
        monthly: true,
        action: {
            label: "Connect your email",
            href: "/settings/providers",
            room: "integrations",
            sentence:
                "Connect your own email and your booking emails go through it, with no monthly limit.",
            // Free has no room to connect one; Grow and Pro do, the
            // catalogue's `integrations` row decides (DEC-086).
            closed: {
                label: "See plans",
                sentence:
                    "A higher plan lets you connect your own email, and then your booking emails go through it with no monthly limit.",
            },
        },
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

/** The words for a catalogue row's limit, or null for a row nothing counts. */
export function limitWordsFor(moduleId: string): LimitWords | null {
    const key = Object.prototype.hasOwnProperty.call(MODULE_MAP, moduleId)
        ? MODULE_MAP[moduleId].limitKey
        : null;
    return key && Object.prototype.hasOwnProperty.call(LIMIT_WORDS, key)
        ? LIMIT_WORDS[key]
        : null;
}
