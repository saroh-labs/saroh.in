import { z } from "zod";

import { SAROH_CONTACT_EMAIL } from "./contact";
import type { IsoDay, PublishContext } from "./resources";
import { isLive } from "./resources";

/**
 * Help (Resources plan U5, design "Saroh Resources - Help" 1a and 2a): the
 * product areas the article's side nav lists, the task groups the home
 * page lists, and the typed frontmatter every article's MDX
 * (`content/help/<slug>.mdx`) must carry. The words live in the MDX; this
 * file holds the shape and the rules, and is safe to import in the browser
 * (no file reading here: `lib/help-docs.ts` reads the files).
 *
 * Rules the design is overridden by (plan U5, R7, R17, R20, KTD-6, DEC-078):
 *
 * - only published articles are listed (KTD-2); a group or area with none
 *   is not drawn, and nothing shows a count;
 * - every step's picture is a real capture (`shots.captured.ts`), never a
 *   drawn panel: an article whose step has none fails validation;
 * - "Updated" is the article's own `updated` day, set by hand when its
 *   words or shots change (R20);
 * - no price, plan limit or plan contents anywhere (DEC-078);
 * - every label an article names is checked against the app's screen
 *   before it merges (R7, `content/help/README.md`).
 */

/** The product areas, in the side nav's order (design 2a). */
export const HELP_AREAS = [
    "Getting started",
    "Products",
    "Orders",
    "Customers",
    "Bookings",
    "Subscriptions",
    "Billing",
    "Payments",
    "Website",
    "Team and roles",
] as const;
export type HelpArea = (typeof HELP_AREAS)[number];

/** The task groups under "What are you trying to do?", in the home's order (design 1a). */
export const HELP_GROUPS = [
    "Get set up",
    "Sell products",
    "Take orders",
    "Take bookings",
    "Get paid",
    "Monthly plans",
    "Your website",
    "Invoices and GST",
] as const;
export type HelpGroup = (typeof HELP_GROUPS)[number];

/** Help goes live with early access, not before (decided 3 Oct). */
export const HELP_PUBLISH_ON: IsoDay = "2026-10-17";

export const HELP_PATH = "/help";
export const helpHref = (slug: string) => `${HELP_PATH}/${slug}`;

/** The one address a person answers (the home's footer row, the article's foot). */
export const HELP_EMAIL = SAROH_CONTACT_EMAIL;

export const helpHome = {
    title: "How can we help?",
    searchLabel: "Search help",
    searchPlaceholder:
        "Search, e.g. add a product, take a deposit, connect a domain",
    groupsTitle: "What are you trying to do?",
    seo: {
        title: "Help · Saroh",
        socialTitle: "Saroh help",
        description:
            "Step-by-step answers for the first things you set up in Saroh, each with a picture of the screen you'll see.",
    },
} as const;

/* ── An article's frontmatter ───────────────────────────────────────── */

const text = z.string().trim().min(1);
const day = z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "is not a day (YYYY-MM-DD)");
const slug = z
    .string()
    .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "is not a lowercase-hyphen slug");

const step = z
    .object({
        title: text,
        body: text,
        /**
         * The captured screenshot's key in `shots.captured.ts`, `help-…`
         * (`e2e/marketing-shots/shots.config.ts`). Required: a step without
         * its real screen fails the build (KTD-6).
         */
        shot: text,
        /** Under the picture; names the demo business it was taken in. */
        caption: text,
        /** Only where it's needed (design 2a). */
        tip: text.optional(),
        /**
         * The control the step names, which the picture rings in Saffron.
         * The ring's place comes from the capture (`mark` in the manifest),
         * so a step with a marker needs a shot captured with one.
         */
        marker: text.optional(),
    })
    .strict();

export const helpFrontmatter = z
    .object({
        title: text,
        slug,
        area: z.enum(HELP_AREAS),
        group: z.enum(HELP_GROUPS),
        /** The first paragraph: what this is and how long it takes. */
        intro: text,
        /** The meta and share description. */
        description: text.max(170),
        readMinutes: z.number().int().min(1).max(30),
        /** The day its words or shots last changed (R20). */
        updated: day,
        /** The day it goes live, in India (KTD-2). */
        publishOn: day.default(HELP_PUBLISH_ON),
        /** Its place in its group and area: lower first, then by title. */
        order: z.number().int().default(100),
        steps: z.array(step).min(1),
        /** Up to three articles to read next, by slug. */
        next: z.array(slug).max(3).default([]),
    })
    .strict();

export type HelpFrontmatter = z.infer<typeof helpFrontmatter>;
export type HelpStep = HelpFrontmatter["steps"][number];

/** What lists, search and nav need of an article: no step text. */
export interface HelpSummary {
    slug: string;
    title: string;
    area: HelpArea;
    group: HelpGroup;
    order: number;
    publishOn: IsoDay;
}

export function summarise(fm: HelpFrontmatter): HelpSummary {
    return {
        slug: fm.slug,
        title: fm.title,
        area: fm.area,
        group: fm.group,
        order: fm.order,
        publishOn: fm.publishOn,
    };
}

const byOrder = (a: HelpSummary, b: HelpSummary) =>
    a.order - b.order || a.title.localeCompare(b.title);

/** The articles live at `ctx`, in order. */
export function liveArticles<T extends HelpSummary>(
    articles: readonly T[],
    ctx: PublishContext,
): T[] {
    return articles.filter((a) => isLive(a, ctx)).sort(byOrder);
}

/** The home's groups, each with its articles; a group with none is left out (R17). */
export function groupsWithArticles(
    articles: readonly HelpSummary[],
): { group: HelpGroup; articles: HelpSummary[] }[] {
    return HELP_GROUPS.map((group) => ({
        group,
        articles: articles.filter((a) => a.group === group).sort(byOrder),
    })).filter((g) => g.articles.length > 0);
}

/** The side nav's areas, each with its articles; an area with none is left out. */
export function areasWithArticles(
    articles: readonly HelpSummary[],
): { area: HelpArea; articles: HelpSummary[] }[] {
    return HELP_AREAS.map((area) => ({
        area,
        articles: articles.filter((a) => a.area === area).sort(byOrder),
    })).filter((g) => g.articles.length > 0);
}

/** How many results the search shows (design 1a). */
export const SEARCH_LIMIT = 6;

const words = (s: string) =>
    s
        .toLowerCase()
        .normalize("NFKD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9\s]/g, " ")
        .split(/\s+/)
        .filter(Boolean);

/**
 * The home's search, in the browser, over the published articles' titles,
 * areas and groups (design 1a): an article matches when every word typed
 * begins a word of it ("prod" finds "product"). Title matches come first,
 * then the rest in order; at most `SEARCH_LIMIT`.
 */
export function searchArticles(
    query: string,
    articles: readonly HelpSummary[],
): HelpSummary[] {
    const typed = words(query);
    if (typed.length === 0) return [];
    const hits = (haystack: string[]) =>
        typed.every((t) => haystack.some((w) => w.startsWith(t)));
    const scored = articles
        .map((a) => {
            const title = words(a.title);
            const all = [...title, ...words(a.area), ...words(a.group)];
            if (!hits(all)) return null;
            return { a, rank: hits(title) ? 0 : 1 };
        })
        .filter((x): x is { a: HelpSummary; rank: number } => x !== null)
        .sort((x, y) => x.rank - y.rank || byOrder(x.a, y.a));
    return scored.slice(0, SEARCH_LIMIT).map((x) => x.a);
}

/** "6 Oct 2026", as the article's Updated line says it. */
export function helpDate(day: IsoDay): string {
    const [y, m, d] = day.split("-").map(Number);
    const month = new Date(Date.UTC(y, m - 1, d)).toLocaleString("en-GB", {
        month: "short",
        timeZone: "UTC",
    });
    return `${d} ${month} ${y}`;
}

/** "01", as the step's number is set (design 2a). */
export const stepNumber = (i: number) => String(i + 1).padStart(2, "0");

/** A step's heading id, for "On this page". */
export const stepId = (i: number) => `step-${i + 1}`;

/**
 * What names a price, a plan limit or what a plan contains (DEC-078): a
 * rupee amount, "up to 5 products", "5 products a month", "Free plan".
 * Help never says any of it; plans are set in the admin.
 */
const PRICE_OR_LIMIT = [
    /₹/,
    /\bRs\.?\s?\d/i,
    /\bINR\b/,
    /\bup to \d/i,
    /\b\d[\d,]*\s+(products?|orders?|bookings?|sites?|locations?|invoices?|customers?|members?|people)\s+(a|per)\s+(month|year|plan)\b/i,
    /\b(free|grow|pro)\s+plan\b/i,
    /\bper month\b|\/\s?month\b|\/\s?mo\b/i,
];

/** The price or limit a piece of text names, or null. */
export function namesPriceOrLimit(s: string): string | null {
    for (const re of PRICE_OR_LIMIT) {
        const m = re.exec(s);
        if (m) return m[0];
    }
    return null;
}
