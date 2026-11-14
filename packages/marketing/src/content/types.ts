/**
 * The shape of a site's feature, solution and question content. Words stay per
 * site, and shape is shared, so a test can hold the two sites to the same pages
 * and fields (global edition plan, U3). A type, its slugs and its shot keys, no
 * sentences: this file reaches browser bundles.
 */

/**
 * Every feature page, in the menu's order. What a build shows is
 * `shownFeatures` (`feature-switches.ts`): read the list through it, never
 * directly, so a switched-off feature is never built or linked.
 */
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
    "ai-apps",
    "ask-ai",
    "social",
] as const;
export type FeatureSlug = (typeof FEATURE_SLUGS)[number];

/** A `[slug]` route's props: both sites' feature pages take the same. */
export interface SlugPageProps {
    params: Promise<{ slug: string }>;
}

/** The four solution pages, in the menu's order. */
export const SOLUTION_SLUGS = ["shops", "salons", "gyms", "clinics"] as const;
export type SolutionSlug = (typeof SOLUTION_SLUGS)[number];

/** The screenshots a page can name. Each site keeps its own images of them. */
export const SHOT_KEYS = [
    "s-home",
    "s-orders",
    "r-order",
    "d-order",
    "r-invoice",
    "r-customers",
    "s-customer",
    "g-customer",
    "d-customer",
    "d-customers",
    "g-bookings",
    "g-book",
    "g-courses",
    "g-packs",
    "d-book",
    "r-subdetail",
    "g-site",
    "s-subs",
    "s-billing",
    "d-billing",
    "g-billing",
    "s-insights",
    "i-compare",
    "i-weeks",
    "i-store",
    "p-products",
    "p-editor",
    "p-site",
    "p-stock",
    "p-detail",
    "d-home",
    "g-home",
    "r-calendar",
    "d-site",
    "g-subs",
    "l-home",
    "l-book",
    "l-team",
    "l-bookings",
    "l-order",
    "l-packs",
    "l-customer",
    "l-invoice",
    "l-site",
    // AI apps, Ask AI and Share (plan 2026-11-13-002): placeholders until
    // U3 to U5 capture or draw them; never built while their switch is off.
    "ai-hero",
    "ai-connect",
    "ai-consent",
    "ai-ask",
    "ai-activity",
    "ask-hero",
    "ask-start",
    "ask-answer",
    "ask-confirm",
    "ask-history",
    "sh-sheet",
    "sh-button",
    "sh-cards",
    "sh-phone",
    "sh-post",
] as const;
export type ShotKey = (typeof SHOT_KEYS)[number];

export type PlanId = "free" | "grow" | "pro";

/**
 * A screenshot as one place shows it: the manifest key, and optionally this
 * place's own alt. Leave `alt` out: the frame then reads the manifest's,
 * which for a captured shot describes what the image really shows. A place's
 * own alt would say what the design drew, which the real screen may not show.
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
 * - `phrase`: the category phrase the page owns, in plain words. The title
 *   leads with it, the description opens with it, and the page's first screen
 *   says it (its eyebrow, headline or lead). A feature page owns "X software";
 *   a solution page owns "software for ‹trade›", so the two never ask for the
 *   same search.
 * - `seoTitle`: the `<title>` without the brand, which the site puts last:
 *   52 characters or fewer, so the whole title fits in 60.
 * - `seoDescription`: one sentence, 150 characters or fewer.
 *
 * Both follow the claims ledger like any other line, and name no price and
 * no plan.
 */
export interface SearchWords {
    phrase: string;
    seoTitle: string;
    seoDescription: string;
}

/**
 * What a change asked of an AI app does in Saroh (plan 2026-11-13-002): made
 * at once, left as a website draft to publish, or only answered. The pill's
 * words come from code (`chat-exchange.tsx`), not from each page.
 */
export type ChatOutcome = "at_once" | "draft" | "answer";

/**
 * A chat in another company's AI app, drawn in text because it can't be
 * captured (`ChatExchange`): the ask, the reply and what came of it.
 */
export interface ChatWords {
    /** What the drawing shows, for its caption: "Drawing of a chat in …". */
    caption: string;
    ask: string;
    /** The Saroh tools the app called, as the app lists them. */
    tools?: string;
    reply: string;
    outcome: ChatOutcome;
    /** The record it made or changed, as a small card under the reply. */
    result?: { title: string; line: string };
}

export interface FeatureStep extends ShotRef {
    title: string;
    body: string;
    /** The demo business it is shown at, e.g. "Rye & Co. (demo bakery)". */
    who: string;
    /** A part of a feature that can't be used yet: the page marks it. */
    notYet?: boolean;
    /** A step in another company's app: drawn as this chat, not `shot`. */
    chat?: ChatWords;
}

/** AI apps' "Apps you can use": the cards come from the site's Integrations list. */
export interface FeatureAppList {
    title: string;
    lead: string;
    /** The apps named in one line, without cards. */
    also: string;
}

export interface Point {
    title: string;
    body: string;
    /**
     * A sentence added once the launch switch is open: what a plan has to
     * do with it. Never drawn in waitlist mode (DEC-136, DEC-137).
     */
    openNote?: string;
    /** A part of a feature that can't be used yet: the page marks it. */
    notYet?: boolean;
}

/**
 * The Website page's "Pick a template for your trade" (DEC-216, board
 * VSWebsite): drawn between How it works and What it does, only while the
 * site's templates switch is on.
 */
export interface FeatureTemplates {
    title: string;
    lead: string;
    /** Gallery template slugs the drawn picker shows; the first is suggested. */
    picks: string[];
    /** The picker's first chip and the suggested card's line ("Suggested for salons"). */
    suggested: string;
    points: Point[];
    /** The link to the gallery's words ("See every template"). */
    linkLabel: string;
}

export interface Feature extends SearchWords {
    slug: FeatureSlug;
    /** "Dashboard", "Products"…: menu, breadcrumb, cards, "See {name} →". */
    name: string;
    /** The nav menu's line under the name. */
    navLine: string;
    /** The short line on a "Works with" card. */
    cardLine: string;
    /** The longer body on Home's feature card. */
    homeBody: string;
    headline: string;
    sub: string;
    hero: ShotRef;
    /** A hero in another company's app: drawn as this chat, not `hero`'s shot. */
    heroChat?: ChatWords;
    howTitle: string;
    steps: FeatureStep[];
    /** Website only: the templates section, while templates are on. */
    templates?: FeatureTemplates;
    points: Point[];
    /** AI apps only: "Apps you can use", after What it does. */
    apps?: FeatureAppList;
    worksLead: string;
    /** Other features, by slug; the test fails on a missing one. */
    worksWith: FeatureSlug[];
    /** Solution pages, by slug; the test fails on a missing one. */
    usedBy: SolutionSlug[];
    /** The CTA band's headline. */
    closer: string;
}

/**
 * How much of a feature is true for an edition's businesses. Full: as written.
 * Limited: the page says plainly what works today. Coming soon: the page and
 * its place stay, with its parts marked `notYet`.
 */
export type StatedFeature = Feature &
    (
        | { state: "full" }
        | { state: "limited" | "coming-soon"; worksToday: string }
    );

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

/** The question only one solution's page asks. */
export const SOLUTION_FAQ_IDS = [
    "shops-counter-online",
    "gyms-pack-and-membership",
    "clinics-medical-notes",
    "salons-choose-stylist",
] as const;
export type SolutionFaqId = (typeof SOLUTION_FAQ_IDS)[number];

export interface Solution extends SearchWords {
    slug: SolutionSlug;
    /** "Shops", "Gyms & studios", "Clinics": menu, breadcrumb. */
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
    };
    faq: SolutionFaqId;
    closer: string;
}

export interface FaqItem {
    q: string;
    a: string;
}

/**
 * A plan as the site names it when there is no catalogue to read. Prices and
 * limits are not content: they come from the published pricing catalogue.
 */
export interface PlanTeaser {
    plan: PlanId;
    name: string;
    featured: boolean;
}
