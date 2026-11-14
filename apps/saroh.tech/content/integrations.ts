import {
    COMING,
    COMING_INTRO,
    COMING_TITLE,
    NOT_AVAILABLE_YET,
} from "./coming";

/**
 * The AI apps whose sign-in has been walked on dev (saroh.in's `liveOnDev`,
 * ticket 11): Integrations lists them and the AI apps page draws them as
 * cards, both only while `NEXT_PUBLIC_AI_APPS` is on. Each card opens its
 * help article here: this site has no provider pages.
 */
export const AI_APP_CARDS = [
    {
        name: "Claude",
        kind: "AI assistant",
        line: "Ask Claude to add a product, move a booking or draft a page on your site. Website changes wait for you to publish them in Saroh.",
        cta: "Connect Claude",
        href: "/help/connect-claude",
    },
    {
        name: "ChatGPT",
        kind: "AI assistant",
        line: "The same from ChatGPT: your products, bookings, orders and customers, and your site as a draft, in your own words.",
        cta: "Connect ChatGPT",
        href: "/help/connect-chatgpt",
    },
] as const;

/**
 * /integrations: only what works for a business outside India today, then the
 * one list of what's coming, marked as saroh.in marks its own, with no dates.
 */
export const INTEGRATIONS = {
    title: "Integrations",
    intro: "What Saroh works with today, and what isn't built yet.",
    available: "Available",
    live: [
        {
            name: "WhatsApp",
            category: "Sharing",
            line: "Share an invoice from Saroh. It opens WhatsApp with the words typed, and you press send.",
            where: "Find it on an invoice",
        },
        {
            name: "CSV import",
            category: "Import",
            line: "Bring in products and customers from a CSV file. It imports those two only.",
            where: "Find it in Products and Customers",
        },
        {
            name: "Orders CSV",
            category: "Export",
            line: "Download your orders as a CSV file.",
            where: "Find it in Orders",
        },
        {
            name: "Your data",
            category: "Export",
            line: "Export your data, one CSV per table, invoices included. The business's owner can do this.",
            where: "Find it in Settings › Your data",
        },
    ],
    /** Drawn first, only while `NEXT_PUBLIC_AI_APPS` is on. */
    aiApps: AI_APP_CARDS.map((app) => ({
        name: app.name,
        category: "AI apps",
        line: app.line,
        where: "Find it in Settings › API and AI apps",
    })),
    plannedTitle: COMING_TITLE,
    plannedIntro: COMING_INTRO,
    notYet: NOT_AVAILABLE_YET,
    planned: COMING,
    ask: {
        before: "Need something else?",
        link: "Tell us what you use",
        after: "It's how we decide what comes next.",
    },
} as const;
