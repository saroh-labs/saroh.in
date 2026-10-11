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

/** The nine feature pages, in the menu's order. */
export const FEATURE_SLUGS = [
    "dashboard",
    "products",
    "orders",
    "customers",
    "bookings",
    "subscriptions",
    "billing",
    "website",
    "insights",
] as const;
export type FeatureSlug = (typeof FEATURE_SLUGS)[number];

/** The four solution pages, in the menu's order. */
export const SOLUTION_SLUGS = ["shops", "salons", "gyms", "clinics"] as const;
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

/**
 * What a page says to a search engine (12 Oct 2026), apart from what it
 * says to a visitor. The headline may keep its voice; these say the plain
 * thing someone types into a search box.
 *
 * - `phrase`: the category phrase the page owns, in plain words ("GST
 *   billing", "salon booking software"). The title leads with it, the
 *   description opens with it, and the page's first screen says it (its
 *   eyebrow, headline or lead). A feature page owns "X software"; a
 *   solution page owns "software for ‹trade›", so the two never ask for the
 *   same search.
 * - `seoTitle`: the `<title>` without the brand, which `pageTitle`
 *   (`lib/seo.ts`) puts last: 52 characters or fewer, so the whole title
 *   fits in 60.
 * - `seoDescription`: one sentence, 150 characters or fewer.
 *
 * Both follow the claims ledger like any other line, and name no price and
 * no plan (`content/seo.test.ts`).
 */
export interface SearchWords {
    phrase: string;
    seoTitle: string;
    seoDescription: string;
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
    /**
     * A sentence added once the launch switch is open: what a plan has to
     * do with it. Never drawn in waitlist mode (DEC-136, DEC-137).
     */
    openNote?: string;
}

export interface Feature extends SearchWords {
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

export interface SolutionSegment {
    /**
     * The screen that shows it, when one has been captured. Without one the
     * segment is drawn as words alone, never beside another trade's screen.
     */
    shot?: ShotKey;
    alt?: string;
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

export interface Solution extends SearchWords {
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
    /**
     * The page's screenshot and the line under it naming the demo business.
     * Both absent until a screen of this trade has been captured: the page
     * then opens on its words (Salons, 12 Oct 2026).
     */
    hero?: ShotRef;
    heroNote?: string;
    changeTitle: string;
    segments: SolutionSegment[];
    pricing: {
        title: string;
        /** The featured plan, with the solution's "fit" line under it. */
        featured: PlanId;
        fit: string;
        second: PlanId;
    };
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
    "salons-choose-stylist",
] as const;
export type FaqId = (typeof FAQ_IDS)[number];

export interface FaqItem {
    q: string;
    a: string;
}

/**
 * A plan as the site names it when there is no catalogue to read. Prices and
 * limits are NOT content: they come from the published pricing catalogue
 * (`lib/pricing.ts`), and without one every price renders
 * `PRICE_PLACEHOLDER` and every summary `PLAN_DETAILS_PLACEHOLDER` (the
 * public-repo rule).
 */
export interface PlanTeaser {
    plan: PlanId;
    name: string;
    featured: boolean;
}

/** The price shown when there is no catalogue to read. */
export const PRICE_PLACEHOLDER = "—";
/** The line beside a placeholder price. */
export const PRICE_NOTE = "Pricing announced at launch";
/** What a plan includes, when there is no catalogue to read. */
export const PLAN_DETAILS_PLACEHOLDER = "Plan details announced at launch";
