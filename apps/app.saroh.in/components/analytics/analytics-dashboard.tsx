import { ChevronRight } from "lucide-react";
import Link from "next/link";

import type {
    AnalyticsView,
    DailyPoint,
    TopPage,
} from "@/lib/analytics/service";
import {
    dayReadout,
    dayTick,
    pageTitle,
    tickEvery,
} from "@/lib/analytics/website-words";
import { NUMBER_LOCALE } from "@/lib/format/locale";

import type { ReadoutBar } from "./readout-bars";
import { ReadoutBars } from "./readout-bars";

/**
 * The website's analytics (S7-003), under Insights' takings, rendered purely
 * from the org-safe daily aggregates. Every number here is scoped to the
 * active organization by the API (`analytics:read`); this component only
 * presents — in the takings' own language (audit F6): the same tiles, the
 * same tappable bars, days written "4 Sep".
 */

const CARD = "rounded-[14px] border border-border bg-card px-[19px] py-[18px]";

/** One figure, the takings' tile, compact enough for three across a phone. */
function Tile({
    label,
    value,
    href,
}: {
    label: string;
    value: number;
    href?: string;
}) {
    const body = (
        <>
            <span className="flex items-center justify-between gap-1 text-[10.5px] font-semibold uppercase tracking-[0.09em] text-muted-foreground sm:text-[11px]">
                {label}
                {href ? (
                    <ChevronRight
                        aria-hidden
                        className="size-3.5 shrink-0 opacity-60 transition-opacity group-hover:opacity-100"
                    />
                ) : null}
            </span>
            <span className="mt-1.5 font-display text-[19px] font-semibold tabular-nums tracking-[-0.03em] text-foreground sm:text-[22px]">
                {value.toLocaleString(NUMBER_LOCALE)}
            </span>
        </>
    );
    const shape =
        "flex h-full min-w-0 flex-col rounded-[11px] border border-border bg-card px-[11px] py-3 sm:px-[13px]";
    return href ? (
        <Link
            href={href}
            className={`group ${shape} transition-colors duration-150 hover:border-border-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring`}
        >
            {body}
        </Link>
    ) : (
        <div className={shape}>{body}</div>
    );
}

/** Visits each day: the busiest marked, every day readable by tap or focus. */
function DailyVisits({ daily }: { daily: DailyPoint[] }) {
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
            max > 0 ? Math.max(2, Math.round((d.views / max) * 100)) : 2,
        tone:
            busiest?.date === d.date && d.views > 0
                ? "bg-brand-700 dark:bg-brand-400"
                : "bg-neutral-700 dark:bg-neutral-300",
        readout: dayReadout(d),
        ...(i % wide === 0
            ? {
                  tick: dayTick(d.date),
                  tickWide: i % (wide * 2) !== 0,
              }
            : {}),
    }));
    return (
        <div className={CARD}>
            <h3 className="text-[12.5px] font-semibold">Visits each day</h3>
            <p className="mb-2 mt-0.5 text-xs leading-[1.5] text-muted-foreground">
                Tap a day to read its visits and visitors.
            </p>
            {daily.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                    No visits recorded in this range yet.
                </p>
            ) : (
                <ReadoutBars
                    bars={bars}
                    label={`Visits each day, ${dayTick(daily[0].date)} to ${dayTick(daily[daily.length - 1].date)}${busiest ? `, busiest ${dayReadout(busiest)}` : ""}. Choose a day to read it.`}
                    initial={busiest?.date ?? daily[daily.length - 1].date}
                    tall
                />
            )}
        </div>
    );
}

/** The pages opened most, by the name they read as, the address beside it. */
function TopPages({ pages }: { pages: TopPage[] }) {
    return (
        <div className={CARD}>
            <h3 className="mb-2 text-[12.5px] font-semibold">
                Pages people opened most
            </h3>
            {pages.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                    No page visits yet.
                </p>
            ) : (
                <ol className="divide-y divide-foreground/10">
                    {pages.map((p) => (
                        <li
                            key={p.path}
                            className="flex items-center justify-between gap-4 py-2.5"
                        >
                            <span className="min-w-0">
                                <span className="block truncate text-sm font-medium">
                                    {pageTitle(p.path)}
                                </span>
                                <span className="block truncate text-xs text-muted-foreground">
                                    {p.path}
                                </span>
                            </span>
                            <span className="shrink-0 text-sm font-medium tabular-nums">
                                {p.views.toLocaleString(NUMBER_LOCALE)}
                                <span className="sr-only"> visits</span>
                            </span>
                        </li>
                    ))}
                </ol>
            )}
        </div>
    );
}

export function AnalyticsDashboard({ view }: { view: AnalyticsView }) {
    const { summary, daily, topPages } = view;
    return (
        // One column that may shrink: a grid item's min-content (thirty
        // day columns, a long page path) otherwise widened the page at 320px.
        <div className="grid grid-cols-[minmax(0,1fr)] gap-4">
            {/*
             * No "Orders" tile here any more (DEC-075): it counted
             * `order.paid` events, which nothing emits, so it read 0 beside
             * the real orders the takings above count from Orders itself.
             * Three across on a phone too (F11): three numbers, one row.
             */}
            <div className="grid grid-cols-3 gap-2 sm:gap-[11px]">
                <Tile label="Visits" value={summary.siteViews} />
                <Tile label="Visitors" value={summary.uniqueVisitors} />
                <Tile
                    label="Enquiries"
                    value={summary.enquiries}
                    href="/leads"
                />
            </div>
            <DailyVisits daily={daily} />
            <TopPages pages={topPages} />
        </div>
    );
}
