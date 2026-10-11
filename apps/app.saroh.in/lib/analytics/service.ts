import { apiFetch, getActiveOrgId } from "@/lib/api/http";

import type { AnalyticsAggregateRow } from "./summary";
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

// The fold is pure and lives in `summary.ts`, where it is tested; the page
// and the dashboard keep importing it from here.
export { summarizeAnalytics } from "./summary";
export type {
    AnalyticsAggregateRow,
    AnalyticsSummary,
    AnalyticsView,
    DailyPoint,
    TopPage,
} from "./summary";

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
