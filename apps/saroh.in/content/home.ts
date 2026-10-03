/**
 * Home, from the Home design ("saroh" hero copy, "band" closer). The feature
 * grid, the Solutions cards and the questions read `features.ts`,
 * `solutions.ts` and `faq.ts`; this file holds only what is Home's own, plus
 * the copy every page's CTA band shares.
 *
 * No page names a price, a plan limit or what a plan includes (Gate W:
 * Pricing isn't published yet). The free-plan line is a fixed, neutral
 * sentence.
 */
import type { ShotRef } from "./types";

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
    sub: "Your site, bookings, orders and GST invoices in one place. Add a product, a service or a customer once, and your site, orders and invoices use it. And every morning, one screen shows you what needs you.",
    hero: { shot: "s-home" } satisfies ShotRef,
    /**
     * "UPI Autopay" is the merchant's choice on their own Razorpay account
     * (DEC-075, D1). "English and हिंदी" is gone until a business's own
     * content can be in more than one language (D13).
     */
    chips: ["UPI Autopay", "GST invoices", "Bills of supply"],
    worksFor: "Works for",
    featuresEyebrow: "Everything in Saroh",
    featuresTitle: "Eight parts, one workspace.",
    solutionsTitle: "Solutions",
    faqTitle: "Questions",
    /** The dark CTA band's title (the design's "band" closer). */
    closer: "Every morning, know what needs you.",
    metaTitle: "Saroh — Services, Appointments, Retail, Orders. Handled.",
} as const;

/**
 * The line under every hero's buttons (Home, the feature and solution
 * pages). Neutral on purpose: it names no plan's limits or contents.
 */
export const FREE_PLAN_LINE = "Free to start. Move up when you need more.";

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
