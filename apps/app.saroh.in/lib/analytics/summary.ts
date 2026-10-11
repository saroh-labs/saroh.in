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

/**
 * Fold the flat aggregate rows into the dashboard view-model. Headline totals
 * use the org-wide, undimensioned rows (`siteId === ""` AND `dimension === ""`)
 * so per-site and per-path rows are never double-counted into the totals. The
 * time series is the same undimensioned `site.view` rows by day; top pages come
 * from the `dimension === "path"` `site.view` rows. Orders are the paid ones
 * (`order.paid`) less those refunded in full (`order.refunded`, #867).
 */
export function summarizeAnalytics(
    rows: AnalyticsAggregateRow[],
): AnalyticsView {
    const isOrgWideTotal = (r: AnalyticsAggregateRow): boolean =>
        r.siteId === "" && r.dimension === "";

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
        if (isOrgWideTotal(r)) {
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
            } else if (r.type === "order.paid") {
                summary.orders += r.count;
            } else if (r.type === "order.refunded") {
                refunded += r.count;
            }
        } else if (
            r.siteId === "" &&
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

    const daily = Array.from(dailyByDate.values()).sort((a, b) =>
        a.date.localeCompare(b.date),
    );
    const topPages: TopPage[] = Array.from(pathTotals.entries())
        .map(([path, views]) => ({ path, views }))
        .sort((a, b) => b.views - a.views)
        .slice(0, 10);

    return { summary, daily, topPages };
}
