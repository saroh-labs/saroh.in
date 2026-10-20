import { apiFetch, getActiveOrgId } from "@/lib/api/http";

import type { InsightsPeriod } from "@/lib/insights/period";
import type {
    MoneyRead,
    SellsRead,
    SuggestionsRead,
} from "@/lib/insights/reads";

import type { AnalyticsAggregateRow } from "./summary";
import type { SourceRead } from "./takings";

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
 * Insights' Money for one period (DEC-171, #1079): money in against the
 * same number of days before, the twelve weeks marked by window, and each
 * day of the period. `payment:read`: a role without it reads `denied`.
 */
export async function readMoney(
    period: InsightsPeriod,
): Promise<SourceRead<MoneyRead> | null> {
    const orgId = await getActiveOrgId();
    if (!orgId) return null;
    return readSource<MoneyRead>(
        `/organizations/${orgId}/analytics/money?period=${period}`,
    );
}

/**
 * Insights' What sells for one period (DEC-171, #1080): best sellers and
 * what is booked most, counts for anyone with Insights, amounts only with
 * `payment:read` (`money` says which).
 */
export async function readSells(
    period: InsightsPeriod,
): Promise<SourceRead<SellsRead> | null> {
    const orgId = await getActiveOrgId();
    if (!orgId) return null;
    return readSource<SellsRead>(
        `/organizations/${orgId}/analytics/sells?period=${period}`,
    );
}

/**
 * Insights' suggestions for the person asking (DEC-171, #1087): ranked,
 * less what they put off with Not now. A failure is `failed`, said on the
 * card by name; the rest of the Overview still shows.
 */
export async function readSuggestions(
    period: InsightsPeriod,
): Promise<SourceRead<SuggestionsRead> | null> {
    const orgId = await getActiveOrgId();
    if (!orgId) return null;
    return readSource<SuggestionsRead>(
        `/organizations/${orgId}/analytics/suggestions?period=${period}`,
    );
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
