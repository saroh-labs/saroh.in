/**
 * The Keep template's words (DEC-221 "Keep" feature pages; boards FODesk and
 * FOPhone2): what a record feature's page draws beyond its entry in
 * `content/features.ts`, which keeps every word the page had before.
 *
 * Per feature, all optional but the mark: the h1 word the Saffron mark sits
 * under; a time-stamped scene above the hero shot; the one "Seen in a day"
 * moment (else the world's hour for the feature, if its day has one); the
 * Ask extender band; questions. Facts (names, orders, money) come from
 * `content/world.ts`, never from here. The template never claims one
 * customer record across an order and a booking (PRODUCT.md).
 */
import type { ClaimSwitch } from "@saroh/marketing/feature-switches";

import type { FeatureSlug } from "./types";

/** The day these words last changed (`pnpm check:content-dates`). */
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

export interface AskExchange {
    q: string;
    a: string;
    /** An order the answer points at, from the world, and its note ("30 min"). */
    order?: { id: string; note: string };
    sources: readonly string[];
    /** Drawn only while every one of these claims is on. */
    claims?: readonly ClaimSwitch[];
}

export interface KeepWords {
    /** The word of the headline the Saffron mark sits under. */
    mark: string;
    /** "9:14 am, phone propped on the flour bin…": the scene above the shot. */
    scene?: { at: string; line: string };
    /** The page's one moment; without it, the world's hour for the feature. */
    moment?: { at: string; line: string };
    ask?: {
        title: string;
        body: string;
        link: { label: string; claim?: ClaimSwitch; fallback: string };
        exchanges: readonly AskExchange[];
    };
    faq?: readonly { q: string; a: string }[];
}

/** Words every Keep page shares. */
export const KEEP = {
    crumb: "How it works",
    secondary: (hour: string, business: string) => `See ${hour} at ${business}`,
    heroNote: "Free to start. No card needed.",
    chapters: "On this page",
    chapterNames: {
        how: "How it works",
        points: "What it does",
        around: "Around it",
        ask: "Ask",
        faq: "Questions",
    },
    pointsTitle: "What it does",
    morePoints: (n: number) => `${n} more things it does`,
    seeWhole: (name: string) => `See the whole ${name.toLowerCase()} screen`,
    aroundTitle: "What happens around it.",
    usedBy: "Used by",
    compare: "Compare plans",
    faqTitle: "Questions",
    faqAsk: { lead: "Something else?", label: "Ask us", href: "/contact" },
    allQuestions: "All questions",
    readFrom: "Read from",
    of: "of",
} as const;

export const KEEP_WORDS: Record<KeepSlug, KeepWords> = {
    dashboard: { mark: "needs" },
    products: { mark: "everywhere" },
    orders: {
        mark: "slip",
        scene: {
            at: "09:14",
            line: "Phone propped on the flour bin, Neha's WhatsApp comes in: a black forest cake for this afternoon, and no nuts. Asha writes it in once.",
        },
        moment: {
            at: "10:14",
            line: "Kavya orders a birthday cake for Saturday on Rye & Co.'s own site. It lands at the top of the list, already paid.",
        },
        ask: {
            title: "Ask about your orders.",
            body: "Type a question the way you'd ask Ravi at the counter. The answer shows the rows behind it and which parts of the business it read.",
            link: {
                label: "Ask AI, on Grow and Pro",
                claim: "ask-ai-plans",
                fallback: "Ask AI",
            },
            exchanges: [
                {
                    q: "Which orders are late right now?",
                    a: "One. Arjun's two bun boxes were ready for 9:45 am and haven't been collected.",
                    order: { id: "ORD-1046", note: "30 min" },
                    sources: ["Orders", "Customers"],
                },
                {
                    q: "Aaj ke liye bun box kaafi hain?",
                    a: "Haan. Hill Road par 38 hain, aaj ke orders mein 2 chahiye. Cakes order par bante hain, unki ginti nahi hoti.",
                    sources: ["Orders", "Stock", "Products"],
                    claims: ["ask-ai-languages", "ask-ai-stock"],
                },
            ],
        },
        faq: [
            {
                q: "Can I add an order that came on WhatsApp?",
                a: "Yes. Press New order, pick the customer and the items, and choose how it's paid: cash, UPI at the counter, the card machine, a payment link or pay on collection.",
            },
            {
                q: "Can I change an order after it's placed?",
                a: "Edit items and the address until preparing starts, and how it's fulfilled until it's handed over. After that, refund.",
            },
            {
                q: "When is an order late?",
                a: "It depends on how it leaves: a pick-up is late sooner than a parcel. You can set what suits your counter.",
            },
            {
                q: "Are cancelled orders deleted?",
                a: "Never. Cancelled and refunded orders stay on the record, with their timeline.",
            },
        ],
    },
    customers: { mark: "person" },
    bookings: { mark: "themselves" },
    subscriptions: { mark: "time" },
    billing: { mark: "write" },
    insights: { mark: "doing" },
};
