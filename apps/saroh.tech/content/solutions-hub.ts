import type { SolutionSlug } from "@saroh/marketing/content-types";
import type { SolutionsHubWords } from "@saroh/marketing/solutions/hub";
import type { HubWay } from "@saroh/marketing/solutions/hub-finder";
import type { TradePageWords } from "@saroh/marketing/solutions/trade-page";

import { solutionHref, solutionList } from "./solutions";
import type { TradeGroup } from "./trades";
import { TRADE_PAGES } from "./trades";

/**
 * saroh.tech's Solutions, in saroh.in's hub and trade-page layout (DEC-221):
 * the hub at /solutions and every page at /solutions/<trade>, the four lead
 * ones (`solutions.ts`) and the rest (`trades/`, owner, 16 Nov 2026). This
 * file holds the words they share and where each trade sits on the hub. No Global trade has a written day yet,
 * so no page tells one (saroh.in's rule: a day only where one is written).
 */

export const HUB_PATH = "/solutions";

export const HUB_WORDS: SolutionsHubWords = {
    crumb: "Solutions",
    h1Before: "A day in your",
    h1Mark: "trade.",
    lead: (n) =>
        `${n} kinds of small business, each shown at one ordinary moment of its day. Find yours and see what Saroh takes off your hands.`,
    phoneLead: (n) =>
        `${n} kinds of small business, each at one ordinary moment. Find yours.`,
    searchLabel: "Search trades",
    searchPlaceholder: "Search your trade, like bakery, plumber or yoga",
    what: "What you do",
    all: "All",
    howShort: "Customers come to you by",
    ways: {
        appointments: "Booking a time",
        classes: "Joining a class",
        orders: "Placing an order",
    },
    /** Filled in the browser: {every}, {shown}. */
    count: { all: "All {every} trades", some: "{shown} of {every} trades" },
    reset: "Reset all",
    trades: "{n} trades",
    trade: "{n} trade",
    flagship: "A whole day, told in full",
    door: (n, example) =>
        `${n === 1 ? "One trade has" : `${n} trades have`} a whole day told in full. Start with ${example}.`,
    doorTime: "7 am to 9 pm",
    az: "All trades, A to Z",
    azLine: "One tap to each page",
    find: "Find your trade",
    none: 'No page for "{q}" yet',
    tellTitle: "Don't see your trade? Tell us.",
    tellBody:
        "Saroh runs on three things: bookings, classes and orders. Tell us what you do. If your customers book a time, join a class or place an order, you can start today.",
    tellLink: "Tell us your trade",
    templates: "Invoice and quote templates",
    note: "Free to start. No card needed.",
    doors: [
        {
            title: "Features",
            body: "Every moment on these pages uses a part of Saroh. See how each one works: your site, orders, bookings, customers and invoices.",
            link: "All features",
            href: "/features",
        },
        {
            title: "New to Saroh?",
            body: "Start at the beginning: what Saroh is, and what you can do on Free.",
            link: "What Saroh is",
            href: "/",
        },
    ],
};

/**
 * The hub's groups, in order: they also head the Solutions menu's columns
 * and the footer's trade groups.
 */
export const HUB_GROUPS: readonly {
    id: TradeGroup;
    title: string;
    how: string;
}[] = [
    {
        id: "food",
        title: "Food and shops",
        // Not "on your site": ordering from the site waits on SITE_SHOP.
        how: "They place an order at the counter, or by phone or message.",
    },
    { id: "beauty", title: "Beauty", how: "They book a time with you." },
    {
        id: "fitness",
        title: "Fitness and lessons",
        how: "They join a class or book a session.",
    },
    {
        id: "health",
        title: "Health",
        how: "They book an appointment, at your practice or by video.",
    },
    {
        id: "home",
        title: "Home services",
        how: "They book a visit to their home.",
    },
    {
        id: "work",
        title: "Creative and professional",
        how: "They book a shoot, a call or a meeting.",
    },
];

/** Where each lead trade sits: the hour its demo business opens on the world's Tuesday (`world.ts`, the seed's hours). */
export const HUB_PLACES: Record<
    SolutionSlug,
    { group: TradeGroup; at: string; way: HubWay }
> = {
    // Thistlewick Bakery: Tuesday to Sunday, from 7 am.
    shops: { group: "food", at: "07:00", way: "orders" },
    // Larkspur & Vane: Tuesdays from 9:30 am.
    salons: { group: "beauty", at: "09:30", way: "appointments" },
    // Ironvale Fitness: Tuesdays from 6:30 am.
    gyms: { group: "fitness", at: "06:30", way: "classes" },
    // Wrenfield Dental: weekdays from 8 am.
    clinics: { group: "health", at: "08:00", way: "appointments" },
};

/** The trade bar's names, one word each, as saroh.in's bar. */
export const BAR_LABELS: Record<SolutionSlug, string> = {
    shops: "Shop",
    salons: "Salon",
    gyms: "Gym",
    clinics: "Clinic",
};

/** The words every trade page shares. */
export const TRADE_WORDS: TradePageWords & {
    questions: (longName: string) => string;
    pricing: (longName: string) => string;
    related: string;
    allTrades: (n: number) => string;
    allTradesLine: string;
    features: string;
    starter: Record<
        "services" | "products" | "classes",
        { title: string; line: string }
    >;
    template: (plural: string) => string;
    templateLine: (plural: string) => string;
    seeTemplates: (plural: string) => string;
} = {
    crumb: "Solutions",
    draft: "Draft, not published yet",
    noCard: "No card needed to start.",
    problems: "What goes wrong in a busy week.",
    problemsLine:
        "If you run a business like this, you'll know most of these. Each one is something Saroh takes off your hands.",
    problemHow: "How Saroh helps",
    used: "Used here",
    how: "how it works",
    seeIt: "see it",
    others: "Same software, other trades.",
    othersLine:
        "Saroh runs the same way in other trades, with bookings and classes instead of orders.",
    followDay: (kind) => `Follow a day at a ${kind}`,
    tradeBar: "A day at a",
    allTradesShort: "All trades",
    wholeHour: "Read the whole hour",
    allQuestions: "All questions",
    wholePicture: "See all of it",
    questions: (longName) => `Questions ${longName.toLowerCase()} ask.`,
    pricing: (longName) => `Pricing for ${longName.toLowerCase()}`,
    related: "Saroh for other trades",
    allTrades: (n) => `All ${n} trades`,
    allTradesLine: "Each at one moment of its day",
    features: "Features",
    starter: {
        services: {
            title: "Add your services in a few minutes",
            line: "Add each one once, with how long it takes and its price. Here is how a list might start.",
        },
        products: {
            title: "Add your products in a few minutes",
            line: "Add each one once, with its price and how many you have. Here is how a list might start.",
        },
        classes: {
            title: "Add your classes in a few minutes",
            line: "Add each one once, with its time, its places and its price. Here is how a list might start.",
        },
    },
    template: (plural) => `Free invoice templates for ${plural}.`,
    templateLine: (plural) =>
        `Invoices laid out for the work ${plural} do, with example lines to change. Download one, or fill it in online.`,
    seeTemplates: (plural) => `See the templates for ${plural}`,
};

/** "Start: see today's classes." → "See today's classes." */
const dayLine = (day: string) => {
    const line = day.replace(/^Start:\s*/, "");
    return line.charAt(0).toUpperCase() + line.slice(1);
};

/** Every trade, as the hub, the menus and the trade bar list it. */
export interface TradeEntry {
    slug: string;
    name: string;
    /** "Shops and bakeries": the related chips. */
    longName: string;
    href: string;
    group: TradeGroup;
    at: string;
    way: HubWay;
    /** The hub tile's moment. */
    line: string;
    /** Lower-case words the hub's search matches. */
    words: string;
}

const lead: TradeEntry[] = solutionList.map((s) => ({
    slug: s.slug,
    name: s.name,
    longName: s.longName,
    href: solutionHref(s.slug),
    line: dayLine(s.card.day),
    words: `${s.name} ${s.longName} ${s.card.name} ${s.phrase} ${s.headline} ${s.sub}`.toLowerCase(),
    ...HUB_PLACES[s.slug],
}));

const rest: TradeEntry[] = TRADE_PAGES.map((t) => ({
    slug: t.slug,
    name: t.name,
    longName: t.name,
    href: `/solutions/${t.slug}`,
    group: t.group,
    at: t.at,
    way: t.way,
    line: t.moment,
    words: `${t.name} ${t.bar} ${t.searchWords} ${t.phrase} ${t.headline}`.toLowerCase(),
}));

/** Every trade, by group in the hub's order, a group's lead trade first. */
export const ALL_TRADES: readonly TradeEntry[] = HUB_GROUPS.flatMap((g) =>
    [...lead, ...rest].filter((t) => t.group === g.id),
);
