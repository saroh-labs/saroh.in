import type { SolutionSlug } from "@saroh/marketing/content-types";
import type { SolutionsHubWords } from "@saroh/marketing/solutions/hub";
import type { HubWay } from "@saroh/marketing/solutions/hub-finder";
import type { TradePageWords } from "@saroh/marketing/solutions/trade-page";

/**
 * saroh.tech's Solutions, in saroh.in's hub and trade-page layout (DEC-221):
 * the hub at /solutions and the four pages at /solutions/<trade>. A page's
 * own words stay in `solutions.ts`; this file holds the words they share and
 * where each trade sits on the hub. No Global trade has a written day yet,
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
    searchPlaceholder: "Search your trade, like bakery, salon or clinic",
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

/** The hub's groups, and each trade's place: the hour its business opens on the world's Tuesday (`world.ts`, the seed's hours). */
export const HUB_GROUPS = [
    {
        id: "food",
        title: "Food and shops",
        how: "They place an order, at the counter or on your site.",
    },
    { id: "beauty", title: "Beauty", how: "They book a time with you." },
    {
        id: "fitness",
        title: "Fitness and classes",
        how: "They join a class or book a session.",
    },
    {
        id: "health",
        title: "Health",
        how: "They book an appointment, at the clinic or by video.",
    },
] as const;

export const HUB_PLACES: Record<
    SolutionSlug,
    { group: (typeof HUB_GROUPS)[number]["id"]; at: string; way: HubWay }
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
    related: string;
    allTrades: (n: number) => string;
    allTradesLine: string;
    features: string;
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
    wholePicture: "See all of it",
    questions: (longName) => `Questions ${longName.toLowerCase()} ask.`,
    related: "Saroh for other trades",
    allTrades: (n) => `All ${n} trades`,
    allTradesLine: "Each at one moment of its day",
    features: "Features",
};
