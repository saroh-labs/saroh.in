/**
 * Home, the redesign's landing (DEC-221; boards LAHomeDesk and
 * LAHomePhone2): what Saroh is, the money promise, the one home for what's
 * new, and doors to the rest. Every name, number and time it draws is the
 * example world's (`world.ts`); this file holds only words, so it carries
 * no price (`content.test.ts`).
 *
 * The free-plan line and the plan line follow the public-repo rule: no
 * prices, no limits. Their figures come from the pricing catalogue
 * (`lib/plan-teasers.ts`), with the placeholders as the fallback.
 */
import { countWord } from "@saroh/marketing/feature-switches";

import { featureList } from "./features";
import type { PlanTeaser } from "./types";

/**
 * The day this module's words last changed, the sitemap's `lastmod` for its
 * pages (`lib/site-pages.ts`). Change it with the words:
 * `pnpm check:content-dates` fails a batch that doesn't.
 */
export const UPDATED = "2026-11-15";

export const home = {
    /**
     * What Home says to a search engine (`SearchWords`, `types.ts`): the
     * plain category first, the brand last. The hero's lead opens with
     * `eyebrow`, so the first screen says the phrase.
     */
    phrase: "small business software",
    seoTitle: "Small business software for bookings and GST billing",
    seoDescription:
        "Small business software for India: your website, bookings, orders and GST invoices in one place, for shops, studios, salons and clinics.",
    eyebrow: "Small business software for shops, studios and clinics in India",
    /**
     * The acronym line (Services, Appointments, Retail, Orders. Handled.):
     * the share card's title, and the waitlist's.
     */
    headlineLabel: "Services, Appointments, Retail, Orders. Handled.",
    /** The h1, desk and phone: one word under the Saffron mark. */
    title: {
        before: "Your ",
        mark: "website",
        after: " and orders, sorted before you open.",
    },
    titleLabel: "Your website and orders, sorted before you open.",
    lede: "Saroh gives your business its own site, takes orders and bookings on it, sends the money to your own account, and shows you each morning what needs you.",
    /** A phone's one line of lead. */
    phoneLede:
        "Orders, bookings and payments into your own account, in one place.",
    how: { label: "See how it works", short: "How it works" },
    /** Once a page, under the hero's start button (KIT.md). */
    freeNote: "Free to start. No card needed.",
    trade: { legend: "Show it for a", phones: "The example, screen by screen" },
    /** The app's own words on the middle phone. */
    appTabs: ["Home", "Orders", "Bookings", "Site"],
    chapters: {
        label: "Chapters",
        items: [
            { href: "#online", label: "Your website" },
            { href: "#orders", label: "Orders" },
            { href: "#money", label: "Payments" },
            { href: "#new", label: "New in Saroh" },
            { href: "#faq", label: "Questions" },
        ],
    },
    site: {
        title: "A website that looks like your shop, not like a template.",
        lede: "Pick a template, add your menu or services, and go live at yourname.saroh.app or your own domain. The shop, the booking page and being found on search come built in.",
        short: "Go live at yourname.saroh.app or your own domain. Shop, booking page and search come built in.",
        builder: "How the website builder works",
        templates: "Browse all templates",
        sites: "Example sites",
        example: "Example",
        live: "Live",
        /** Each example's line, by the world's business key. */
        captions: {
            rye: "Own domain, connected",
            neel: "A salon, booking page built in",
            pulse: "A gym, classes and packs",
        } as Record<string, string>,
    },
    orders: {
        title: "Orders and bookings, without a notebook.",
        body: "Pick-ups, deliveries, visits and classes land in one list, sorted by what's due first. Each one makes its own invoice, and stock follows every order. Add a product, a service or a customer once, and your site, orders and invoices use it.",
        short: "Pick-ups, visits and classes land in one list, due first. Each one makes its own invoice.",
        link: "How orders and bookings work",
        list: "Orders",
        due: "Due today",
        toPack: "to pack",
        status: { pickup: "At pick-up", paid: "Paid", unpaid: "Not paid" },
        more: "See the whole list",
        placesBooked: "places booked",
        aPlace: "a place",
    },
    money: {
        title: "Get paid into your own account. Saroh never holds the money.",
        lede: "Customers pay by UPI or card straight into your own Razorpay or Cashfree account. The GST invoice goes out by itself.",
        link: "How payments work",
        label: "How a payment moves: customer, your payment account, your bank. Saroh only records it.",
        customer: {
            title: "Your customer",
            line: "Pays {amount} by UPI or card, on your site or a payment link",
        },
        account: {
            title: "Your Razorpay or Cashfree",
            line: "Your own account, in your name.",
        },
        bank: {
            title: "Your bank account",
            line: "Paid out on your payment provider's usual schedule",
        },
        saroh: {
            title: "Saroh",
            line: "Sees the order is paid, marks it done and sends the GST invoice. Never in the money's path.",
        },
        wire: "payment status only",
    },
    /**
     * "UPI Autopay" is the merchant's choice on their own Razorpay account
     * (DEC-075, D1). "English and हिंदी" is gone until a business's own
     * content can be in more than one language (D13).
     */
    chips: ["UPI Autopay", "GST invoices", "Bills of supply"],
    day: {
        title: "See a whole day in your trade.",
        line: "Follow one business from the first order at 7 am to the last question at night.",
        legend: "A day at a",
        spend: "Spend a day at",
    },
    worksFor: "Works for",
    solutionsMore: "What Saroh does for each trade",
    news: {
        title: "New in Saroh",
        lede: "Ask your business a question, post in your own look, run it from your own AI assistant, and connect your own tools.",
        row: "New in Saroh",
        askAi: {
            title: "Ask AI",
            plans: "Grow and Pro",
            languages: "Ask about your business in English, Hinglish or Hindi.",
            plain: "Ask about your business in your own words.",
            rows: "Every answer shows the rows behind it.",
            change: "It can add or change things after you confirm, and you can undo all day.",
            /** The 9 pm question, in Hinglish once that claim is on. */
            askHi: "Is hafte sabse zyada kya bika?",
            askEn: "What sold most this week?",
            next: "comes next.",
            sold: "sold",
            sources: ["Orders", "Products"],
            soldThisWeek: "sold this week.",
            /** "Bun box ₹380 kar do": the price comes from the world. */
            changeHi: ["Bun box", "kar do"],
            changeEn: ["Make the bun box", ""],
            proposal: [
                "Change",
                "from",
                "to",
                "Your site shows the new price straight away.",
            ],
            confirm: "Confirm",
            notNow: "Not now",
            undo: "Undo all day",
            more: "It can change things too",
            link: "How Ask AI works",
        },
        share: {
            title: "Share, in your own look",
            body: "Any product, service or post becomes a ready post. Share it to Instagram, WhatsApp or Facebook",
            free: "for free",
            social: "or let Saroh Social post and schedule it for you",
            scheduled: "Scheduled",
            noteFree: "Sharing is free.",
            noteSocial: "Scheduling is Saroh Social, an add-on.",
            posts: ["Photo post", "Simple post", "Price tag post"],
            link: "How sharing works",
        },
        aiApps: {
            title: "AI apps",
            body: "Connect Claude or ChatGPT and run the shop from the assistant you already use. It works as you, and nothing goes live until you publish.",
            connected: "Claude · connected to",
            ask: [
                "Add the Christmas menu:",
                "and the",
                "Put them on a Christmas page.",
            ],
            answer: "Added both as drafts, on a new page at",
            draft: "Draft",
            request:
                "I sent you a publish request. Approve it in Saroh and the page goes live.",
            link: "How AI apps work",
        },
        api: {
            title: "API keys and webhooks",
            body: "Make a key for your own tools, or for the developer who helps you. Webhooks tell your other apps the moment an order is paid.",
            readOnly: "read only",
            active: "Active",
            delivered: "Delivered",
            link: "For developers",
        },
    },
    yours: {
        line: "Your site, your customers and your money stay yours, wherever you take them.",
        link: "See how it stays yours",
    },
    featuresEyebrow: "Everything in Saroh",
    /** "Nine parts, one workspace.": counts the features this build shows. */
    featuresTitle: `${countWord(featureList.length)} parts, one workspace.`,
    newTag: "New",
    plans: {
        title: "Free to start.",
        lede: "Set up free. Move up when you need more.",
        /** The plan line; the Ask AI half names plans behind its claim. */
        start: "Start on Free.",
        askAi: "Ask AI comes with Grow and Pro.",
        compare: "Compare plans",
    },
    faqTitle: "Questions",
    allQuestions: "All questions",
    askUs: { lead: "Something else?", link: "Ask us" },
    closer: "Open tomorrow knowing what needs you.",
    templates: "Browse templates",
    // The same section as saroh.tech's (owner, 16 Nov 2026, #15).
    toolsTitle: "Free tools. No sign-up.",
    toolsLead:
        "GST, invoices, QR codes and WhatsApp links. Use them as long as you like.",
} as const;

/**
 * The line under every hero's buttons (Home, the feature and solution
 * pages): "Free to start: one website, … and …. Move up when you need
 * more." The middle is the free plan's own card lines for these modules,
 * read from the pricing catalogue (`lib/plan-teasers.ts` `freePlanLine`), so
 * no limit is written here, and the tail names no paid plan's contents: the
 * split is set in the admin (DEC-075, D3). With no catalogue the line is
 * `fallback`.
 */
export const FREE_PLAN_LINE = {
    lead: "Free to start",
    /** Catalogue module ids, in the order the line names them. */
    modules: ["website", "products", "bookings"],
    tail: "Move up when you need more.",
    fallback: "Free to start. Move up when you need more.",
} as const;

/** Home's pricing teaser and the plan order everywhere: Grow is featured. */
export const PLAN_TEASERS: PlanTeaser[] = [
    { plan: "free", name: "Free", featured: false },
    { plan: "grow", name: "Grow", featured: true },
    { plan: "pro", name: "Pro", featured: false },
];

/** The dark CTA band every page closes with; each page brings its title. */
export const CTA_BAND = {
    body: "Set up your site and bookings for free, and move up when you need more.",
    note: "No card needed to start.",
} as const;

/**
 * The 2-minute tour (KTD-12, deviation D-3). Null until there is a video:
 * every "See it in action · 2 min" button and the `#video` section stay
 * hidden rather than showing the design's empty slot.
 */
export const TOUR_VIDEO: {
    src: string;
    poster?: string;
    label: string;
} | null = null;

/** The tour button's words, beside every start button once there is a video. */
export const TOUR_LABEL = "See it in action · 2 min";
