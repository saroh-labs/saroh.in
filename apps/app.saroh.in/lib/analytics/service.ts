import { getActiveOrgId, getList } from "@/lib/api/http";

/**
 * Analytics dashboard data access for app.saroh.in (S7-003). Backed by the
 * org-safe daily aggregates on api.saroh.in (S7-002): the aggregate job rolls
 * raw AnalyticsEvents into per-(day, type, site, dimension) rows, and this
 * module reads them for the owner dashboard.
 *
 * Org-scoped exactly like `lib/notifications/service.ts`: the active org id
 * (from the `active_org` cookie) goes both in the path
 * (`/organizations/:organizationId/analytics`) and the `x-organization-id`
 * header, and the session cookie is forwarded so api.saroh.in derives the user
 * and enforces membership + `analytics:read`. Server-only (imports next/headers
 * via the shared HTTP plumbing).
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

/** Filters accepted by the dashboard read (all optional). */
export interface AnalyticsFilter {
    siteId?: string;
    type?: string;
    from?: string;
    to?: string;
}

/**
 * The active org's daily aggregate rows for the given filter. Empty when there
 * is no active org or the org genuinely has no aggregates yet; throws on a real
 * API/network failure (#101) so an outage renders the route error boundary
 * rather than an empty dashboard indistinguishable from "no data yet".
 */
export async function getAnalyticsDashboard(
    filter: AnalyticsFilter = {},
): Promise<AnalyticsAggregateRow[]> {
    const orgId = await getActiveOrgId();
    if (!orgId) return [];

    const qs = new URLSearchParams();
    if (filter.siteId) qs.set("siteId", filter.siteId);
    if (filter.type) qs.set("type", filter.type);
    if (filter.from) qs.set("from", filter.from);
    if (filter.to) qs.set("to", filter.to);
    const query = qs.toString();

    return getList<AnalyticsAggregateRow>(
        `/organizations/${orgId}/analytics${query ? `?${query}` : ""}`,
    );
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
 * from the `dimension === "path"` `site.view` rows.
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

    const daily = Array.from(dailyByDate.values()).sort((a, b) =>
        a.date.localeCompare(b.date),
    );
    const topPages: TopPage[] = Array.from(pathTotals.entries())
        .map(([path, views]) => ({ path, views }))
        .sort((a, b) => b.views - a.views)
        .slice(0, 10);

    return { summary, daily, topPages };
}
