/**
 * The Keep template's words (DEC-221 "Keep" feature pages; saroh.in's boards
 * FODesk and FOPhone2, in Global's words): what a record feature's page
 * draws beyond its entry in `content/features.ts`, which keeps every word
 * the page had before. Same shape as apps/saroh.in/content/feature-keep.ts.
 *
 * Facts (names, orders, money) come from `content/world.ts`. The plan
 * line's link follows the paid-plans switch (`plan-words.ts`). Each page's
 * Help links are Global's own articles (`content/help.ts`).
 */
import type { FeatureSlug } from "@saroh/marketing/content-types";
import type { KeepTemplateWords } from "@saroh/marketing/feature-pages/keep-page";

/** The day these words last changed. */
export const UPDATED = "2026-11-15";

/** The Keep pages: every record feature. Website, Share, Ask AI and AI apps have their own. */
export const KEEP_SLUGS = [
    "dashboard",
    "products",
    "orders",
    "customers",
    "bookings",
    "subscriptions",
    "billing",
    "insights",
] as const satisfies readonly FeatureSlug[];
export type KeepSlug = (typeof KEEP_SLUGS)[number];

export const isKeep = (slug: string): slug is KeepSlug =>
    (KEEP_SLUGS as readonly string[]).includes(slug);

export interface KeepWords {
    /** The word of the headline the Saffron mark sits under. */
    mark: string;
    /** The time-stamped scene above the hero shot. */
    scene?: { at: string; line: string };
    ask?: {
        title: string;
        body: string;
        link: string;
        exchanges: readonly {
            q: string;
            a: string;
            /** An order the answer points at, from the world, and its note. */
            order?: { id: string; note: string };
            sources: readonly string[];
        }[];
    };
    faq?: readonly { q: string; a: string }[];
    /** The page's "How to …" links: Global Help articles, by slug. */
    help: readonly { slug: string; label: string }[];
}

/** Words every Keep page shares; its plan link is the page's (`compare` in `plan-words.ts`). */
export const KEEP: Omit<KeepTemplateWords, "compare"> = {
    crumb: "Features",
    secondary: (hour, business) => `See ${hour} at ${business}`,
    heroNote: "Free to start. No card needed.",
    chapters: "On this page",
    chapterNames: {
        how: "How it works",
        points: "What it does",
        ask: "Ask",
        faq: "Questions",
    },
    pointsTitle: "What it does",
    morePoints: (n) => `${n} more things it does`,
    faqTitle: "Questions",
    faqAsk: { lead: "Something else?", label: "Ask us", href: "/contact" },
    allQuestions: "All questions",
    readFrom: "Read from",
    of: "of",
};

export const KEEP_WORDS: Record<KeepSlug, KeepWords> = {
    dashboard: { mark: "needs", help: [] },
    products: {
        mark: "everywhere",
        help: [
            { slug: "add-your-first-product", label: "How to add a product" },
            { slug: "add-sizes-and-options", label: "How to add sizes" },
            { slug: "count-and-move-stock", label: "How to count stock" },
        ],
    },
    orders: {
        mark: "slip",
        scene: {
            at: "09:14",
            line: "Flour still on the counter, Ben phones in: a focaccia and two cinnamon buns for lunchtime. Clara writes it in once.",
        },
        ask: {
            title: "Ask about your orders.",
            body: "Type a question the way you'd say it at the counter. The answer shows the rows behind it and which parts of the business it read.",
            link: "Ask AI",
            exchanges: [
                {
                    q: "Which order is due next?",
                    a: "Maya's, for pick-up at 11 am. She pays at pick-up, and she's allergic to sesame.",
                    order: { id: "ORD-041", note: "11 am" },
                    sources: ["Orders", "Customers"],
                },
            ],
        },
        faq: [
            {
                q: "Can I add an order that came by phone?",
                a: "Yes. Press New order, pick the customer and the items, and say how it's paid: at the counter now, or at pick-up.",
            },
            {
                q: "Are cancelled orders deleted?",
                a: "Never. Cancelled orders stay on the record, with their timeline.",
            },
        ],
        help: [
            { slug: "take-your-first-order", label: "How to take an order" },
        ],
    },
    customers: { mark: "person", help: [] },
    bookings: {
        mark: "themselves",
        help: [
            { slug: "add-a-service", label: "How to add a service" },
            { slug: "set-your-hours", label: "How to set your hours" },
        ],
    },
    subscriptions: { mark: "plan", help: [] },
    billing: {
        mark: "currency",
        help: [
            { slug: "write-an-invoice", label: "How to write an invoice" },
            { slug: "add-your-tax-line", label: "How to add your tax line" },
            { slug: "record-a-payment", label: "How to record a payment" },
        ],
    },
    insights: { mark: "doing", help: [] },
};
