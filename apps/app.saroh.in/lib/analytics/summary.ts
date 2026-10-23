/**
 * The website and funnel figures Insights reads from the analytics daily
 * aggregates (S7-003), folded into the dashboard's view-model. Pure, so it is
 * tested without the API; `service.ts` reads the rows and re-exports this.
 */

/** A pre-computed daily aggregate row as returned by the analytics API. */
export interface AnalyticsAggregateRow {
    siteId: string;
    date: string;
    type: string;
    dimension: string;
    dimensionValue: string;
    count: number;
    uniqueCount: number;
}

/** A single headline metric shown as a stat card. */
export interface AnalyticsSummary {
    siteViews: number;
    uniqueVisitors: number;
    enquiries: number;
    orders: number;
}

/** A point in the site-view time series (one UTC day). */
export interface DailyPoint {
    date: string;
    views: number;
    uniques: number;
}

/** A row in the top-pages table (site.view, dimension = "path"). */
export interface TopPage {
    path: string;
    views: number;
}

/** The dashboard view-model derived purely from the aggregate rows. */
export interface AnalyticsView {
    summary: AnalyticsSummary;
    daily: DailyPoint[];
    topPages: TopPage[];
}

/** What a fold is for: one website (or all of them), and its days. */
export interface SummarizeOptions {
    /**
     * One website's figures: its visits, people, enquiries and pages. Paid
     * orders are written for the whole business (`order.paid` names no
     * site), so they stay the business's own whichever site is chosen.
     * Null or left out: every website together.
     */
    siteId?: string | null;
    /**
     * The period's first and last day (`YYYY-MM-DD`): with both, every day
     * between them is in `daily`, a day nobody visited as a 0, so the
     * chart draws it (DEC-171, plan U14) instead of leaving it out.
     */
    from?: string;
    to?: string;
}

const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** The longest run of days filled in, a guard on a bad range. */
const MOST_DAYS = 400;

/**
 * Every day from `from` to `to`, a day missing from `daily` as no visits,
 * in order. Days outside the range are kept where they fall. Pure.
 */
export function everyDay(
    daily: readonly DailyPoint[],
    from: string,
    to: string,
): DailyPoint[] {
    if (!DAY.test(from) || !DAY.test(to) || from > to) {
        return [...daily].sort((a, b) => a.date.localeCompare(b.date));
    }
    const byDate = new Map(daily.map((d) => [d.date, d]));
    const at = new Date(`${from}T00:00:00.000Z`);
    for (let i = 0; i < MOST_DAYS; i++) {
        const day = at.toISOString().slice(0, 10);
        if (day > to) break;
        if (!byDate.has(day))
            byDate.set(day, { date: day, views: 0, uniques: 0 });
        at.setUTCDate(at.getUTCDate() + 1);
    }
    return Array.from(byDate.values()).sort((a, b) =>
        a.date.localeCompare(b.date),
    );
}

/**
 * Fold the flat aggregate rows into the dashboard view-model. Headline totals
 * use the undimensioned rows of the website asked for (`siteId === ""`, the
 * org-wide ones, for all of them; `dimension === ""`) so per-site and
 * per-path rows are never double-counted into the totals. The
 * time series is the same undimensioned `site.view` rows by day; top pages come
 * from the `dimension === "path"` `site.view` rows. Orders are the paid ones
 * (`order.paid`) less those refunded in full (`order.refunded`, #867).
 */
export function summarizeAnalytics(
    rows: AnalyticsAggregateRow[],
    options: SummarizeOptions = {},
): AnalyticsView {
    // The rows for the website asked for: the org-wide ones ("") for all.
    const site = options.siteId ?? "";
    const isTotal = (r: AnalyticsAggregateRow, siteId: string): boolean =>
        r.siteId === siteId && r.dimension === "";

    const summary: AnalyticsSummary = {
        siteViews: 0,
        uniqueVisitors: 0,
        enquiries: 0,
        orders: 0,
    };
    // Orders refunded in full (#867), dated at the sale they reverse.
    let refunded = 0;
    const dailyByDate = new Map<string, DailyPoint>();
    const pathTotals = new Map<string, number>();

    for (const r of rows) {
        // Paid orders are the business's, never one site's (`order.paid`
        // names none), so they are read from the org-wide rows always.
        if (isTotal(r, "")) {
            if (r.type === "order.paid") {
                summary.orders += r.count;
            } else if (r.type === "order.refunded") {
                refunded += r.count;
            }
        }
        if (isTotal(r, site)) {
            if (r.type === "site.view") {
                summary.siteViews += r.count;
                summary.uniqueVisitors += r.uniqueCount;
                const day = r.date.slice(0, 10);
                const point = dailyByDate.get(day) ?? {
                    date: day,
                    views: 0,
                    uniques: 0,
                };
                point.views += r.count;
                point.uniques += r.uniqueCount;
                dailyByDate.set(day, point);
            } else if (r.type === "enquiry.submitted") {
                summary.enquiries += r.count;
            }
        } else if (
            r.siteId === site &&
            r.type === "site.view" &&
            r.dimension === "path"
        ) {
            pathTotals.set(
                r.dimensionValue,
                (pathTotals.get(r.dimensionValue) ?? 0) + r.count,
            );
        }
    }

    // Net, as Sales is: an order refunded in full counts nothing. A refund
    // is dated at its sale, so a range holds the two together.
    summary.orders = Math.max(0, summary.orders - refunded);

    const daily =
        options.from && options.to
            ? everyDay(
                  Array.from(dailyByDate.values()),
                  options.from,
                  options.to,
              )
            : Array.from(dailyByDate.values()).sort((a, b) =>
                  a.date.localeCompare(b.date),
              );
    const topPages: TopPage[] = Array.from(pathTotals.entries())
        .map(([path, views]) => ({ path, views }))
        .sort((a, b) => b.views - a.views)
        .slice(0, 10);

    return { summary, daily, topPages };
}
