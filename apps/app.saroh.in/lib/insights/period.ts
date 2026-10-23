import type { ComparePeriod } from "./compare-words";
import { daysLabel } from "./compare-words";

/**
 * Insights' one period and its tabs, kept in the address (DEC-171, plan
 * U10, #1089): `/analytics?period=7d|4w|3m&tab=overview|money|sells|from`.
 * The page opens on the Overview for the last 4 weeks (A10), and an
 * address says only what differs from that, so `/analytics` is the
 * Overview for 4 weeks and Home's link reads `/analytics?period=4w`.
 *
 * The windows are the API's (`modules/analytics/period.ts`), worked out the
 * same way from the business's own today, so the line under the title and
 * the website's figures name the same days the money and the sales count.
 * Pure: tested in `period.test.ts`.
 */

export type InsightsPeriod = ComparePeriod;
export type InsightsTab = "overview" | "money" | "sells" | "from";

export const INSIGHTS_PERIODS: readonly InsightsPeriod[] = ["7d", "4w", "3m"];
export const INSIGHTS_TABS: readonly InsightsTab[] = [
    "overview",
    "money",
    "sells",
    "from",
];

/** Insights opens on the last 4 weeks (A10). */
export const DEFAULT_PERIOD: InsightsPeriod = "4w";
export const DEFAULT_TAB: InsightsTab = "overview";

/** The control's words for each period. */
export const PERIOD_LABEL: Record<InsightsPeriod, string> = {
    "7d": "Last 7 days",
    "4w": "Last 4 weeks",
    "3m": "Last 3 months",
};

/** The tabs' names, as the strip says them. */
export const TAB_LABEL: Record<InsightsTab, string> = {
    overview: "Overview",
    money: "Money",
    sells: "What sells",
    from: "Where customers come from",
};

/**
 * The website's old ranges (`?range=7d|30d|90d`, before DEC-171): a saved
 * link still opens the website's figures, for the nearest period.
 */
const OLD_RANGES: Record<string, InsightsPeriod> = {
    "7d": "7d",
    "30d": "4w",
    "90d": "3m",
};

export interface InsightsAddress {
    period: InsightsPeriod;
    tab: InsightsTab;
    /** The website the "Where customers come from" figures are for. */
    siteId: string | null;
}

const one = (value: string | string[] | undefined): string | undefined =>
    Array.isArray(value) ? value[0] : value;

/** What the address asks for; anything it doesn't know reads the default. */
export function readAddress(params: {
    period?: string | string[];
    tab?: string | string[];
    range?: string | string[];
    siteId?: string | string[];
}): InsightsAddress {
    const period = one(params.period);
    const tab = one(params.tab);
    const range = one(params.range);
    const old = range ? OLD_RANGES[range] : undefined;
    const site = one(params.siteId)?.trim() ?? "";
    const siteId = site.length > 0 ? site : null;
    return {
        period: INSIGHTS_PERIODS.includes(period as InsightsPeriod)
            ? (period as InsightsPeriod)
            : (old ?? DEFAULT_PERIOD),
        tab: INSIGHTS_TABS.includes(tab as InsightsTab)
            ? (tab as InsightsTab)
            : old
              ? "from"
              : DEFAULT_TAB,
        siteId,
    };
}

/**
 * The address of a tab for a period: only what differs from the defaults,
 * and the website kept wherever it was chosen.
 */
export function insightsHref(to: Partial<InsightsAddress>): string {
    const q = new URLSearchParams();
    if (to.tab && to.tab !== DEFAULT_TAB) q.set("tab", to.tab);
    if (to.period && to.period !== DEFAULT_PERIOD) q.set("period", to.period);
    if (to.siteId) q.set("siteId", to.siteId);
    const query = q.toString();
    return query ? `/analytics?${query}` : "/analytics";
}

/** The days a period covers, and the same number just before it. */
export interface PeriodWindow {
    days: number;
    from: string;
    to: string;
    beforeFrom: string;
    beforeTo: string;
}

const DAY = /^\d{4}-\d{2}-\d{2}$/;

function utc(day: string): Date {
    return new Date(`${day}T00:00:00.000Z`);
}

function iso(at: Date): string {
    return at.toISOString().slice(0, 10);
}

function plusDays(day: string, n: number): string {
    const at = utc(day);
    at.setUTCDate(at.getUTCDate() + n);
    return iso(at);
}

/**
 * Three calendar months back, kept inside the month: 31 Oct is 31 Jul,
 * 31 May is 28 Feb (or 29), as the API's calendar counts it.
 */
function minusMonths(day: string, months: number): string {
    const [y, m, d] = day.split("-").map(Number) as [number, number, number];
    const month = m - 1 - months;
    const year = y + Math.floor(month / 12);
    const inYear = ((month % 12) + 12) % 12;
    const last = new Date(Date.UTC(year, inYear + 1, 0)).getUTCDate();
    return iso(new Date(Date.UTC(year, inYear, Math.min(d, last))));
}

/**
 * The period ending `today` (the business's own date, `YYYY-MM-DD`) and
 * the one before it, exactly as the API counts them: 7 days is today and
 * the six before; 4 weeks is 28 days; 3 months runs from the day after
 * this date three months ago, and the period before is as many days.
 */
export function periodWindow(
    period: InsightsPeriod,
    today: string,
): PeriodWindow {
    if (!DAY.test(today)) {
        throw new Error(`periodWindow: "${today}" is not a day`);
    }
    const from =
        period === "7d"
            ? plusDays(today, -6)
            : period === "4w"
              ? plusDays(today, -27)
              : plusDays(minusMonths(today, 3), 1);
    const days =
        Math.round((utc(today).getTime() - utc(from).getTime()) / 86_400_000) +
        1;
    return {
        days,
        from,
        to: today,
        beforeFrom: plusDays(from, -days),
        beforeTo: plusDays(from, -1),
    };
}

const BEFORE: Record<InsightsPeriod, string> = {
    "7d": "the 7 days before",
    "4w": "the 4 weeks before",
    "3m": "the 3 months before",
};

/**
 * The line under the title: "22 Sep to 19 Oct, compared with the 4 weeks
 * before".
 */
export function periodLine(period: InsightsPeriod, w: PeriodWindow): string {
    return `${daysLabel(w.from, w.to)}, compared with ${BEFORE[period]}`;
}

/**
 * A period's line in the phone's sheet: the last 7 days name both weeks
 * ("13 to 19 Oct, against 6 to 12 Oct"); the longer ones name their own
 * days and "the 4 weeks before".
 */
export function periodChoiceLine(
    period: InsightsPeriod,
    w: PeriodWindow,
): string {
    const against =
        period === "7d" ? daysLabel(w.beforeFrom, w.beforeTo) : BEFORE[period];
    return `${daysLabel(w.from, w.to)}, against ${against}`;
}
