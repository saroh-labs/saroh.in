import { apiFetch, getActiveOrgId } from "@/lib/api/http";

import type { SourceRead, TakingsRead } from "./takings";

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
 * One of the page's reads, as a {@link SourceRead}: a 403 is `denied` (a
 * role decision, said in words), any other failure `failed` (said as a
 * failure, never as nothing), so one source going wrong costs the page
 * that section only. No try/catch around `forbidden()`: none is called.
 */
async function readSource<T>(path: string): Promise<SourceRead<T>> {
    try {
        const res = await apiFetch(path);
        if (res.status === 403) return { status: "denied" };
        if (!res.ok) return { status: "failed" };
        return { status: "ok", data: (await res.json()) as T };
    } catch {
        // The API could not be reached: this source failed, not the page.
        return { status: "failed" };
    }
}

/**
 * Twelve whole weeks of takings for the active organization (DEC-075),
 * read by the Insights page beside the website's figures.
 */
export async function readTakings(): Promise<SourceRead<TakingsRead> | null> {
    const orgId = await getActiveOrgId();
    if (!orgId) return null;
    return readSource<TakingsRead>(`/organizations/${orgId}/analytics/takings`);
}

/**
 * The active org's daily aggregate rows for the given filter, as a
 * {@link SourceRead}: an outage reads `failed`, never an empty dashboard
 * indistinguishable from "no data yet" (#101).
 */
export async function readTraffic(
    filter: AnalyticsFilter = {},
): Promise<SourceRead<AnalyticsAggregateRow[]>> {
    const orgId = await getActiveOrgId();
    if (!orgId) return { status: "ok", data: [] };
    const qs = new URLSearchParams();
    if (filter.siteId) qs.set("siteId", filter.siteId);
    if (filter.type) qs.set("type", filter.type);
    if (filter.from) qs.set("from", filter.from);
    if (filter.to) qs.set("to", filter.to);
    const query = qs.toString();
    return readSource<AnalyticsAggregateRow[]>(
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
