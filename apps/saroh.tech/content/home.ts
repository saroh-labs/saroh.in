/**
 * Home, after apps/saroh.in/content/home.ts. The feature grid and the questions
 * read `features.ts` and `faq.ts`; this file holds only what is Home's own, plus
 * the copy every page's CTA band shares. No prices, no limits, and no line says
 * what Free leaves out. `tools` is the one section saroh.in's home doesn't have.
 */
import type { PlanTeaser, ShotRef } from "@saroh/marketing/content-types";

/** The day this module's words last changed: Home's `updated`. */
export const UPDATED = "2026-11-04";

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
    sub: "Your site, bookings, orders and invoices in one place, set up in your country and in your currency. Add a product, a service or a customer once, and your orders and invoices use it. And every morning, one screen shows you what needs you.",
    hero: { shot: "s-home" } satisfies ShotRef,
    chips: ["Nine currencies", "Your own tax line", "No card to start"],
    worksFor: "Works for",
    featuresEyebrow: "Everything in Saroh",
    featuresTitle: "Nine parts, one workspace.",
    solutionsTitle: "Solutions",
    pricingTitle: "Pricing",
    pricingCompare: "See pricing",
    faqTitle: "Questions",
    /** The dark CTA band's title. */
    closer: "Every morning, know what needs you.",
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
} as const;

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
