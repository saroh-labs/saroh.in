import { formatNumber } from "@/lib/format/money";
import { cn } from "@saroh/ui/lib/utils";
import { ChevronRight, ChevronUp } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import type {
    AnalyticsSummary,
    AnalyticsView,
    DailyPoint,
    TopPage,
} from "@/lib/analytics/service";
import {
    dayReadout,
    dayTick,
    figureChange,
    ordersLine,
    pageTitle,
    tickEvery,
    visitsLine,
    WEBSITE_FIGURE,
} from "@/lib/analytics/website-words";
import type { ComparePeriod } from "@/lib/insights/compare-words";
import { ordersHref } from "@/lib/insights/links";
import { EmptyState } from "@saroh/ui/data-state";

import type { ReadoutBar } from "./readout-bars";
import { ReadoutBars } from "./readout-bars";

/**
 * The website's figures (S7-003), on Insights' "Where customers come from"
 * tab (DEC-171, plan U14, #1097; `IBFromD`, `IBFromP`), for the page's one
 * period, rendered purely from the org-safe daily aggregates. Every number
 * here is scoped to the active organization by the API (`analytics:read`);
 * this component only presents:
 *
 * 1. four figures, each with how it moved on the period before: Visits,
 *    Visitors, Enquiries (opening Leads) and Paid orders and bookings
 *    (opening those days' paid orders), with the orders' counted-from note;
 * 2. what the tab puts between (`between`): the path from visit to paid
 *    and where visitors come from (U16, #1101);
 * 3. visits every day of the period, a day nobody came drawn as a
 *    baseline mark, every day readable by tap, focus or pointer;
 * 4. which pages people open, by the name they read as, the address kept
 *    under it.
 */

const CARD =
    "flex min-w-0 flex-col gap-2.5 rounded-[14px] border border-border bg-card px-5 py-[18px]";

/** One figure: its name, the number, and how it moved. */
function Figure({
    label,
    value,
    before,
    period,
    href,
    testId,
}: {
    label: string;
    value: number;
    /** The period before's figure; null when it couldn't be read. */
    before: number | null;
    period: ComparePeriod;
    href?: string;
    testId: string;
}) {
    const change = figureChange(value, before, period);
    const body = (
        <>
            <span
                data-ph-unmask=""
                className="flex items-center justify-between gap-1 text-[12.5px] text-muted-foreground"
            >
                {label}
                {href ? (
                    <ChevronRight
                        aria-hidden
                        className="size-3.5 shrink-0 opacity-60 transition-opacity duration-fast group-hover:opacity-100"
                    />
                ) : null}
            </span>
            <span
                data-ph-mask=""
                className="font-display text-[21px] font-semibold tabular-nums tracking-[-0.02em] [overflow-wrap:anywhere]"
            >
                {formatNumber(value)}
            </span>
            {change ? (
                <span
                    data-ph-mask=""
                    data-tone={change.up ? "up" : undefined}
                    className={cn(
                        "inline-flex items-start gap-[3px] text-pretty text-xs leading-[1.4]",
                        change.up
                            ? "text-success-subtle-foreground"
                            : "text-neutral-700 dark:text-muted-foreground",
                    )}
                >
                    {change.up ? (
                        <ChevronUp
                            aria-hidden
                            className="mt-px size-3.5 shrink-0"
                        />
                    ) : null}
                    {change.line}
                </span>
            ) : null}
        </>
    );
    const shape =
        "flex h-full min-w-0 flex-col gap-[3px] rounded-xl border border-border bg-card px-[15px] py-[13px] text-foreground";
    return (
        <li className="min-w-0" data-figure={testId}>
            {href ? (
                <Link
                    href={href}
                    className={`group ${shape} transition-colors duration-fast hover:border-border-strong hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 active:bg-muted`}
                >
                    {body}
                </Link>
            ) : (
                <div className={shape}>{body}</div>
            )}
        </li>
    );
}

/** Many days: from about six weeks, the gaps narrow (`ReadoutBars`). */
const DENSE_FROM = 40;

/**
 * Visits each day: every day of the period, the busiest marked, a day
 * nobody came a baseline mark, every day readable by tap or focus.
 */
export function DailyVisits({
    daily,
    period,
}: {
    daily: DailyPoint[];
    period: ComparePeriod;
}) {
    const max = daily.reduce((m, d) => Math.max(m, d.views), 0);
    const busiest = daily.reduce<DailyPoint | null>(
        (top, d) => (!top || d.views > top.views ? d : top),
        null,
    );
    // About six labels on a wide screen, three on a phone.
    const wide = tickEvery(daily.length, 6);
    const bars: ReadoutBar[] = daily.map((d, i) => ({
        key: d.date,
        heightPercent:
            d.views > 0 && max > 0
                ? Math.max(2, Math.round((d.views / max) * 100))
                : 0,
        tone:
            d.views <= 0
                ? // Nobody came: the baseline, drawn so the day is there.
                  "bg-border-strong"
                : busiest?.date === d.date
                  ? "bg-foreground"
                  : "bg-neutral-700 dark:bg-neutral-300",
        readout: dayReadout(d),
        ...(i % wide === 0
            ? {
                  tick: dayTick(d.date),
                  tickWide: i % (wide * 2) !== 0,
              }
            : {}),
    }));
    const anyVisits = max > 0;
    return (
        <section
            aria-labelledby="website-visits"
            className={CARD}
            data-testid="website-visits"
        >
            <h3
                id="website-visits"
                data-ph-unmask=""
                className="text-[13px] font-semibold text-muted-foreground"
            >
                Visits each day
            </h3>
            {daily.length === 0 ? (
                <EmptyState
                    size="inline"
                    title="No visits in this range yet."
                />
            ) : (
                <>
                    <p
                        data-ph-mask=""
                        className="max-w-[680px] text-pretty text-base font-medium tabular-nums leading-[1.45]"
                    >
                        {visitsLine(daily, period)}
                    </p>
                    <div className="w-full" data-ph-block="">
                        <ReadoutBars
                            bars={bars}
                            label={`Visits each day, ${dayTick(daily[0].date)} to ${dayTick(daily[daily.length - 1].date)}${busiest && anyVisits ? `, busiest ${dayReadout(busiest)}` : ""}. Choose a day to read it.`}
                            initial={
                                anyVisits && busiest
                                    ? busiest.date
                                    : daily[daily.length - 1].date
                            }
                            tall
                            dense={daily.length >= DENSE_FROM}
                        />
                    </div>
                    <p
                        data-ph-unmask=""
                        className="text-xs leading-[1.5] text-muted-foreground"
                    >
                        Tap a day to read its visits and visitors.
                    </p>
                </>
            )}
        </section>
    );
}

/**
 * Which pages people open: by the name they read as, the address kept
 * under it, a bar against the most opened.
 */
export function TopPages({ pages }: { pages: TopPage[] }) {
    const most = pages.reduce((m, p) => Math.max(m, p.views), 0);
    return (
        <section
            aria-labelledby="website-pages"
            className={CARD}
            data-testid="website-pages"
        >
            <h3
                id="website-pages"
                data-ph-unmask=""
                className="text-[13px] font-semibold text-muted-foreground"
            >
                Which pages do people open?
            </h3>
            {pages.length === 0 ? (
                <EmptyState size="inline" title="No page visits yet." />
            ) : (
                <ol className="grid w-full gap-1" data-ph-mask="">
                    {pages.map((p) => (
                        <li
                            key={p.path}
                            className="grid grid-cols-[minmax(0,1fr)_28%_auto] items-center gap-2.5 py-1.5 sm:grid-cols-[minmax(0,1fr)_36%_auto]"
                        >
                            <span className="min-w-0">
                                <span className="block truncate text-[13.5px] font-medium">
                                    {pageTitle(p.path)}
                                </span>
                                <span className="block truncate text-xs text-muted-foreground">
                                    {p.path}
                                </span>
                            </span>
                            <span
                                aria-hidden
                                className="h-2 overflow-hidden rounded bg-muted"
                            >
                                <span
                                    className="block h-full rounded bg-neutral-400 dark:bg-neutral-500"
                                    style={{
                                        width: `${most > 0 ? Math.max(2, Math.round((p.views / most) * 100)) : 0}%`,
                                    }}
                                />
                            </span>
                            <span className="min-w-[2.75rem] text-right text-sm font-medium tabular-nums">
                                {formatNumber(p.views)}
                                <span className="sr-only"> visits</span>
                            </span>
                        </li>
                    ))}
                </ol>
            )}
        </section>
    );
}

/** The days the website's figures cover: the page's period. */
export interface WebsiteRange {
    /** First day, `YYYY-MM-DD`. */
    from: string;
    /** Last day (today), `YYYY-MM-DD`. */
    to: string;
    /** "4 weeks". */
    label: string;
    period: ComparePeriod;
}

export function AnalyticsDashboard({
    view,
    before,
    range,
    oneSite = false,
    between = null,
}: {
    view: AnalyticsView;
    /** The period before's figures; null when they couldn't be read. */
    before: AnalyticsSummary | null;
    range: WebsiteRange;
    /** One website is chosen, not all of them. */
    oneSite?: boolean;
    /**
     * Drawn between the figures and the visits each day: the path from
     * visit to paid and where visitors come from (U16, #1101).
     */
    between?: ReactNode;
}) {
    const { summary, daily, topPages } = view;
    const ordersNote = ordersLine({
        orders: summary.orders,
        from: range.from,
        rangeLabel: range.label,
        oneSite,
    });
    return (
        // One column that may shrink: a grid item's min-content (ninety
        // day columns, a long page path) otherwise widened the page at 320px.
        <div className="grid grid-cols-[minmax(0,1fr)] gap-4">
            {/*
             * Orders is back (#919, amending DEC-075): every payment writes
             * `order.paid` since #867, net of full refunds, bookings paid in
             * full among them. It covers the period's days, beside the
             * visits and enquiries of those same days. Two by two on a
             * phone: four labels don't fit across 320px.
             */}
            <ul
                className="grid grid-cols-2 gap-2.5 lg:grid-cols-4 lg:gap-3"
                data-testid="website-figures"
            >
                <Figure
                    testId="visits"
                    label={WEBSITE_FIGURE.visits}
                    value={summary.siteViews}
                    before={before?.siteViews ?? null}
                    period={range.period}
                />
                <Figure
                    testId="visitors"
                    label={WEBSITE_FIGURE.visitors}
                    value={summary.uniqueVisitors}
                    before={before?.uniqueVisitors ?? null}
                    period={range.period}
                />
                <Figure
                    testId="enquiries"
                    label={WEBSITE_FIGURE.enquiries}
                    value={summary.enquiries}
                    before={before?.enquiries ?? null}
                    period={range.period}
                    href="/leads"
                />
                <Figure
                    testId="orders"
                    label={WEBSITE_FIGURE.orders}
                    value={summary.orders}
                    before={before?.orders ?? null}
                    period={range.period}
                    href={ordersHref(range.from, range.to)}
                />
            </ul>
            {ordersNote ? (
                <p
                    data-testid="website-orders-note"
                    data-ph-unmask=""
                    className="-mt-1 max-w-[68ch] text-[13px] leading-[1.5] text-muted-foreground"
                >
                    {ordersNote}
                </p>
            ) : null}
            {between}
            <DailyVisits daily={daily} period={range.period} />
            <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-4 lg:grid-cols-2">
                <TopPages pages={topPages} />
            </div>
        </div>
    );
}
