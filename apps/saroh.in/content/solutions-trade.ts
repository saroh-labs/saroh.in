import { NAV_WORDS } from "./nav";

/**
 * The words every /for/<trade> page shares (boards SOTradeDesk and
 * SLFloristDesk, desk and Phone2). A page's own words are its MDX, read
 * through `searchPages`; its day, where one is written, is
 * `solutions-days.ts`.
 */
export const TRADE_WORDS = {
    crumb: "Solutions",
    draft: "Draft — not published yet",
    noCard: "No card needed to start.",
    /** The problems' heading: every trade's week. */
    problems: "What goes wrong in a busy week.",
    problemsLine:
        "If you run a business like this, you’ll know most of these. Each one is something Saroh takes off your hands.",
    problemHow: "How Saroh helps",
    seeHour: "See",
    used: "Used here",
    how: "how it works",
    /** A day trade's "What changes" tiles, folded after its day. */
    moreTitle: (plural: string) => `Everything else Saroh does for ${plural}`,
    also: "Also in Saroh",
    tiles: "Every part, in one place",
    questions: (plural: string) => `Questions ${plural} ask.`,
    pricing: (plural: string) => `Pricing for ${plural}`,
    template: (name: string) =>
        `Start from the ${name.toLowerCase()} template.`,
    seeTemplate: (name: string) => `See the ${name.toLowerCase()} template`,
    allTemplates: "Browse all templates",
    others: "Same day, other trades.",
    othersLine:
        "The day runs the same way in other trades, with bookings and classes instead of orders.",
    followDay: (kind: string) => `Follow a day at a ${kind}`,
    exampleOf: (name: string, kind: string) => `${name}, an example ${kind}`,
    related: (plural: string) => `Also for ${plural}`,
    allTrades: (n: number) => `All ${n} trades`,
    allTradesLine:
        "From the bakery at 7 to the tuition at 5, each at one moment of its day",
    /** The closing band's link to /features (owner, 17 Nov: "Features"). */
    howItWorks: NAV_WORDS.howItWorks,
    tradeBar: "A day at a",
    allTradesShort: "All trades",
} as const;
