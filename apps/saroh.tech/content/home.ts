/**
 * Home, the redesign's landing (DEC-221; saroh.in's boards LAHomeDesk and
 * LAHomePhone2, in Global's words): the same sections and fields as
 * apps/saroh.in/content/home.ts (`HomeWords`), with Global's truths: one
 * person runs the business, customers pay at the counter or by card into
 * the business's own account, the site lives on saroh.app, and every
 * business is on Free for now (DEC-211; no paid plan is named, U16). Names, numbers and
 * times come from `world.ts`. No prices, no limits, and no line says what
 * Free leaves out. `tools` is the one section saroh.in's home doesn't have.
 *
 * Kept from the page before (rule 15): the SAROH acronym headline is the
 * share card's title (`headlineLabel`), the old sub is the lead and the
 * orders chapter, the feature grid folds under "Everything in Saroh", the
 * solution cards under the door, the plan cards are /pricing's.
 */
import type { PlanTeaser, ShotRef } from "@saroh/marketing/content-types";
import { countWord } from "@saroh/marketing/feature-switches";
import type { HomeWords } from "@saroh/marketing/home/words";

import { featureList } from "./features";

/** The day this module's words last changed: Home's `updated`. */
export const UPDATED = "2026-11-15";

export interface HeroWord {
    /** The saffron initial. */
    initial: string;
    rest: string;
}

export const home = {
    phrase: "small business software",
    seoTitle: "Small business software for bookings and invoices",
    seoDescription:
        "Small business software: your website, bookings, orders and invoices in one place, for shops, gyms, clinics and coaches, in your own currency.",
    eyebrow: "Small business software for shops, gyms, clinics and coaches",
    /** "Services, Appointments, Retail, Orders. Handled." with saffron initials. */
    headline: [
        { initial: "S", rest: "ervices, " },
        { initial: "A", rest: "ppointments, " },
        { initial: "R", rest: "etail, " },
        { initial: "O", rest: "rders. " },
        { initial: "H", rest: "andled." },
    ] satisfies HeroWord[],
    headlineLabel: "Services, Appointments, Retail, Orders. Handled.",
    /** The h1, desk and phone: one word under the Saffron mark. */
    title: {
        before: "Your ",
        mark: "website",
        after: " and orders, sorted before you open.",
    },
    titleLabel: "Your website and orders, sorted before you open.",
    lede: "Your site, bookings, orders and invoices in one place, set up in your country and in your currency. And every morning, one screen shows you what needs you.",
    /** A phone's one line of lead. */
    phoneLede: "Your site, bookings, orders and invoices, in one place.",
    how: { label: "See how it works", short: "How it works" },
    /** Once a page, under the hero's start button. */
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
        title: "A website that looks like your place, not like a template.",
        lede: "Pick a template made for your trade, add your services or what you sell, and go live at yourname.saroh.app. Your booking page and being found on search come built in, and prices and hours come from where you keep them.",
        short: "Go live at yourname.saroh.app. Booking page and search come built in.",
        builder: "How the website builder works",
        templates: "Browse all templates",
        sites: "Example sites",
        example: "Example",
        live: "Live",
        /** Each example's line, by the world's business key. */
        captions: {
            thistlewick: "A bakery, orders for pick-up",
            larkspur: "A salon, booking page built in",
            ironvale: "A gym, classes and coaching",
        },
    },
    orders: {
        title: "Orders and bookings, without a notebook.",
        body: "Counter orders, pick-ups, visits and classes land in one list, sorted by what's due first. Make an invoice from any order, and stock follows every order. Add a product, a service or a customer once, and your orders and invoices use it.",
        short: "Pick-ups, visits and classes land in one list, due first. Make an invoice from any order.",
        link: "How orders and bookings work",
        list: "Orders",
        due: "Due today",
        toPack: "to get ready",
        status: { pickup: "At pick-up", paid: "Paid", unpaid: "Not paid" },
        more: "See the whole list",
        placesBooked: "places booked",
        aPlace: "a place",
    },
    money: {
        title: "Get paid into your own account. Saroh never holds the money.",
        // Stripe named, as saroh.in names Razorpay and Cashfree and as /features does (owner, 16 Nov 2026, #11).
        lede: "Customers pay you at the counter, or by card online straight into your own Stripe account. The invoice is marked paid by itself.",
        link: "How payments work",
        label: "How a payment moves: customer, your Stripe account, your bank. Saroh only records it.",
        customer: {
            title: "Your customer",
            line: "Pays {amount} by card, online or at the counter",
        },
        account: {
            title: "Your own Stripe account",
            line: "In your name. Stripe's own fees apply",
        },
        bank: {
            title: "Your bank account",
            line: "Paid out on Stripe's usual schedule",
        },
        saroh: {
            title: "Saroh",
            line: "Sees the order is paid and marks its invoice paid. Never in the money's path.",
        },
        wire: "payment status only",
    },
    sub: "Your site, bookings, orders and invoices in one place, set up in your country and in your currency. Add a product, a service or a customer once, and your orders and invoices use it. And every morning, one screen shows you what needs you.",
    hero: { shot: "s-home" } satisfies ShotRef,
    chips: ["Nine currencies", "Your own tax line", "No card to start"],
    day: {
        title: "See Saroh in your trade.",
        line: "Pick your trade and see what Saroh does for a place like yours.",
        legend: "Show it for a",
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
            plans: "Not on Free",
            languages: "Ask about your business in your own words.",
            plain: "Ask about your business in your own words.",
            rows: "Every answer shows the rows behind it.",
            change: "It can add or change things after you confirm.",
            askHi: "What sold most this week?",
            askEn: "What sold most this week?",
            next: "comes next.",
            sold: "sold",
            sources: ["Orders", "Products"],
            soldThisWeek: "sold this week.",
            changeHi: ["Make the box of six buns", ""],
            changeEn: ["Make the box of six buns", ""],
            proposal: [
                "Change",
                "from",
                "to",
                "Your site shows the new price straight away.",
            ],
            confirm: "Confirm",
            notNow: "Not now",
            undo: "Undo",
            more: "It can change things too",
            link: "How Ask AI works",
        },
        share: {
            title: "Share, in your own look",
            body: "Any product, service or post becomes a ready post. Share it to Instagram, WhatsApp or Facebook yourself",
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
            body: "Connect Claude or ChatGPT and run your business from the assistant you already use. It works as you, and nothing goes live until you publish.",
            connected: "Claude · connected to",
            ask: [
                "Add the holiday menu:",
                "and the",
                "Put them on a holiday page.",
            ],
            answer: "Added both as drafts, on a new page at",
            draft: "Draft",
            request:
                "I sent you a publish request. Approve it in Saroh and the page goes live.",
            link: "How AI apps work",
        },
        api: {
            title: "API keys and webhooks",
            body: "Make a key for your own tools. Webhooks tell your other apps the moment an order is paid. API keys come with paid plans.",
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
    solutionsTitle: "Solutions",
    pricingTitle: "Pricing",
    pricingCompare: "See pricing",
    newTag: "New",
    plans: {
        title: "Free to start.",
        lede: "Every business is on Free for now. No card needed.",
        /** The plan line: Free for now, and Tell me when (`/pricing`). */
        start: "Everyone is on Free for now.",
        askAi: "",
        compare: "Tell me when",
    },
    faqTitle: "Questions",
    allQuestions: "All questions",
    askUs: { lead: "Something else?", link: "Ask us" },
    /** The closing title. */
    // The same close as saroh.in's (owner, 16 Nov 2026, #16).
    closer: "Open tomorrow knowing what needs you.",
    templates: "Browse templates",
    toolsTitle: "Free tools. No sign-up.",
    toolsLead:
        "Use them as long as you like. No watermark on anything you download.",
    tools: [
        {
            title: "Invoice generator",
            line: "A clean PDF in two minutes.",
            href: "/tools/invoice-generator",
        },
        {
            title: "Quote and estimate maker",
            line: "A clear price before you start.",
            href: "/tools/quote-maker",
        },
        {
            title: "Receipt maker",
            line: "Show a customer they've paid.",
            href: "/tools/receipt-maker",
            desk: true,
        },
        {
            title: "Payment reminder writer",
            line: "Friendly, firm or final.",
            href: "/tools/payment-reminder",
        },
        {
            title: "Late fee calculator",
            line: "Work out what to add.",
            href: "/tools/late-fee-calculator",
            desk: true,
        },
        {
            title: "VAT and sales tax calculator",
            line: "Add tax or take it out.",
            href: "/tools/vat-calculator",
            desk: true,
        },
    ],
} as const satisfies HomeWords & Record<string, unknown>;

/**
 * The line under every hero's buttons: "Free to start: one website, … and ….
 * No card needed." The middle is the free plan's own card lines, read from the
 * pricing catalogue, so no limit is written here. With no catalogue the line is
 * `fallback`.
 */
export const FREE_PLAN_LINE = {
    lead: "Free to start",
    /** Catalogue module ids, in the order the line names them. */
    modules: ["website", "products", "bookings"],
    tail: "No card needed.",
    fallback: "Free to start. No card needed.",
} as const;

/** Home's pricing teaser and the plan order everywhere: Grow is featured. */
export const PLAN_TEASERS: PlanTeaser[] = [
    { plan: "free", name: "Free", featured: false },
    { plan: "grow", name: "Grow", featured: true },
    { plan: "pro", name: "Pro", featured: false },
];

/** The dark CTA band every page closes with; each page brings its title. */
export const CTA_BAND = {
    body: "Set up your site and bookings for free.",
    note: "No card needed to start.",
} as const;

/** The 2-minute tour: null until there is a video, and its buttons stay hidden. */
export const TOUR_VIDEO: {
    src: string;
    poster?: string;
    label: string;
} | null = null;

/** The tour button's words, beside every start button once there is a video. */
export const TOUR_LABEL = "See it in action · 2 min";
