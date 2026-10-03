/**
 * Home, from the Home design ("saroh" hero copy, "band" closer). The feature
 * grid, the Solutions cards and the questions read `features.ts`,
 * `solutions.ts` and `faq.ts`; this file holds only what is Home's own, plus
 * the copy every page's CTA band shares.
 *
 * The free-plan line and the plan teasers follow the public-repo rule: no
 * prices, no limits. They render the placeholders until the catalogue feeds
 * the site (U24).
 */
import type { PlanTeaser, ShotRef } from "./types";
import { PLAN_DETAILS_PLACEHOLDER } from "./types";

export interface HeroWord {
    /** The saffron initial. */
    initial: string;
    rest: string;
}

export const home = {
    eyebrow: "For shops, studios and clinics in India",
    /** "Services, Appointments, Retail, Orders. Handled." with saffron initials. */
    headline: [
        { initial: "S", rest: "ervices, " },
        { initial: "A", rest: "ppointments, " },
        { initial: "R", rest: "etail, " },
        { initial: "O", rest: "rders. " },
        { initial: "H", rest: "andled." },
    ] satisfies HeroWord[],
    headlineLabel: "Services, Appointments, Retail, Orders. Handled.",
    sub: "Your site, bookings, orders and GST invoices in one place. Enter anything once and every part knows. And every morning, one screen shows you what needs you.",
    hero: {
        shot: "s-home",
        alt: "The Saroh dashboard at Rye & Co.: late orders, a failed renewal and what's due today, most urgent first",
    } satisfies ShotRef,
    chips: [
        "UPI Autopay",
        "GST invoices",
        "Bills of supply",
        "English and हिंदी",
    ],
    worksFor: "Works for",
    featuresEyebrow: "Everything in Saroh",
    featuresTitle: "Eight parts that know about each other.",
    solutionsTitle: "Solutions",
    pricingTitle: "Pricing",
    pricingCompare: "Compare every plan",
    faqTitle: "Questions",
} as const;

/**
 * The line under every hero's buttons (Home and the feature pages). The
 * design's line names Free's limits; until the catalogue feeds the site it
 * says only what each plan is for.
 */
export const FREE_PLAN_LINE = `Free to start. Grow adds orders, subscriptions and invoicing. ${PLAN_DETAILS_PLACEHOLDER}.`;

/** Home's pricing teaser and the plan order everywhere: Grow is featured. */
export const PLAN_TEASERS: PlanTeaser[] = [
    { plan: "free", name: "Free", featured: false },
    { plan: "grow", name: "Grow", featured: true },
    { plan: "pro", name: "Pro", featured: false },
];

/** The dark CTA band every page closes with; each page brings its title. */
export const CTA_BAND = {
    body: "Set up your site and bookings tonight, free. Move to Grow when you're ready to take orders and send invoices.",
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
