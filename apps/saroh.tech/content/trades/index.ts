import { BEAUTY } from "./beauty";
import { FITNESS } from "./fitness";
import { FOOD } from "./food";
import { HEALTH } from "./health";
import { HOME_SERVICES } from "./home-services";
import type { TradePage } from "./types";
import { WORK } from "./work";

export type { TradeGroup, TradePage } from "./types";

/** The day these pages' words last changed: their `updated`. */
export const UPDATED = "2026-11-16";

/**
 * The trade pages beyond the four lead ones (owner, 16 Nov 2026): the
 * Global template trades and the saroh.in trades that make sense outside
 * India, by hub group. India-only trades (mehendi, ayurveda, homeopathy,
 * coaching centres, cloud kitchens, pathology labs) are left out.
 */
export const TRADE_PAGES: readonly TradePage[] = [
    ...FOOD,
    ...BEAUTY,
    ...FITNESS,
    ...HEALTH,
    ...HOME_SERVICES,
    ...WORK,
];

export const tradePage = (slug: string) =>
    TRADE_PAGES.find((t) => t.slug === slug);

/** The common words of every drawn Home: the greeting, its two lists and the day. */
export const HOME_WORDS = {
    greeting: "Good morning",
    needsTitle: "Needs you",
    todayTitle: "Today",
    todayDay: "Tue",
    more: "See today's list",
    note: "An example morning, drawn for this page.",
} as const;
