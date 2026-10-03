/**
 * The Marketing Site V2 content model (plan U18, KTD-13). Each file in
 * `content/` mirrors a data block from the designs, typed, so the page
 * templates only render and `content.test.ts` can check every cross-link.
 *
 * Merchant copy rules (saroh-product.md): "location", never "storefront" or
 * "store", even where a design says it; nothing the product cannot back.
 */
import type { PlanId } from "@/lib/links";

import type { ShotKey } from "./shots";

export type { PlanId, ShotKey };

/** The eight feature pages, in the menu's order. */
export const FEATURE_SLUGS = [
    "dashboard",
    "products",
    "orders",
    "customers",
    "bookings",
    "subscriptions",
    "billing",
    "insights",
] as const;
export type FeatureSlug = (typeof FEATURE_SLUGS)[number];

/** The three solution pages, in the menu's order. */
export const SOLUTION_SLUGS = ["shops", "gyms", "clinics"] as const;
export type SolutionSlug = (typeof SOLUTION_SLUGS)[number];

/**
 * A screenshot as one place shows it: the manifest key, and optionally this
 * place's own alt. Leave `alt` out: the frame then reads the manifest's
 * (`shots.ts`), which for a captured shot describes what the image really
 * shows (claims ledger §9). A place's own alt would say what the design
 * drew, which the real screen may not show.
 */
export interface ShotRef {
    shot: ShotKey;
    alt?: string;
}

export interface FeatureStep extends ShotRef {
    title: string;
    body: string;
    /** The demo business it is shown at, e.g. "Rye & Co. (demo bakery)". */
    who: string;
}

export interface Point {
    title: string;
    body: string;
}

export interface Feature {
    slug: FeatureSlug;
    /** "Dashboard", "Products"… — menu, breadcrumb, cards, "See {name} →". */
    name: string;
    /** The nav menu's line under the name. */
    navLine: string;
    /** The short line on a "Works with" card (the design's `LINE`). */
    cardLine: string;
    /** The longer body on Home's "Eight parts" card (the design's `modules`). */
    homeBody: string;
    headline: string;
    sub: string;
    hero: ShotRef;
    howTitle: string;
    steps: FeatureStep[];
    points: Point[];
    worksLead: string;
    /** Other features, by slug; the test fails on a missing one. */
    worksWith: FeatureSlug[];
    /** Solution pages, by slug; the test fails on a missing one. */
    usedBy: SolutionSlug[];
    /** The CTA band's headline. */
    closer: string;
}

export interface SolutionSegment extends ShotRef {
    /** The feature this problem belongs to ("See {feature} →"). */
    feature: FeatureSlug;
    /**
     * The label above the pain, when the design gives one beyond the
     * feature's name ("Bookings · Your booking page").
     */
    label?: string;
    /** The quoted problem, with its curly quotes. */
    pain: string;
    title: string;
    body: string;
}

export interface Solution {
    slug: SolutionSlug;
    /** "Shops", "Gyms & studios", "Clinics" — menu, breadcrumb. */
    name: string;
    /** The nav menu's line under the name. */
    navLine: string;
    /** A feature page's "Used by" chip ("Shops and bakeries", "Clinics"). */
    longName: string;
    /** Home's "Works for" chip and Solutions card ("Clinics and practitioners"). */
    card: {
        name: string;
        body: string;
        day: string;
        uses: string;
        link: string;
    };
    headline: string;
    sub: string;
    hero: ShotRef;
    heroNote: string;
    changeTitle: string;
    segments: SolutionSegment[];
    /** The question only this solution's page asks. */
    faq: FaqId;
    closer: string;
}

/** Every question on the site, by id (`faq.ts` holds the words). */
export const FAQ_IDS = [
    "start-free",
    "gst",
    "gst-solutions",
    "pay",
    "team",
    "medical-notes",
    "shops-counter-online",
    "gyms-pack-and-membership",
    "clinics-medical-notes",
] as const;
export type FaqId = (typeof FAQ_IDS)[number];

export interface FaqItem {
    q: string;
    a: string;
}
