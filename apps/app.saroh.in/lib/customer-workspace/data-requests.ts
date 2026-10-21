import type { CrmResult } from "@/lib/api/http";
import { apiFetch, mutate, orgBase } from "@/lib/api/http";

import type { DataRequestRow, RequestFilter } from "./data-requests-view";

/**
 * Customers' "Ask to remove my data" requests from api.saroh.in (DEC-172,
 * #1106, #1107): `GET organizations/:org/customer-requests?status=` and
 * `POST …/:id/close`. Both need `customer:remove`, which the API enforces.
 *
 * Server-only: the HTTP plumbing reads the session cookie.
 */

/**
 * The requests with this status, newest first; null when they couldn't be
 * read, so the tab says so rather than showing an empty list.
 */
export async function listDataRequests(
    filter: RequestFilter = "open",
): Promise<DataRequestRow[] | null> {
    const base = await orgBase();
    if (!base) return null;
    const res = await apiFetch(
        `${base}/customer-requests?status=${encodeURIComponent(filter)}`,
    ).catch(() => null);
    if (!res?.ok) return null;
    const body = (await res.json().catch(() => null)) as {
        requests?: unknown;
    } | null;
    return Array.isArray(body?.requests)
        ? (body.requests as DataRequestRow[])
        : null;
}

/** Close one without removal, with the reason (never sent to the customer). */
export function closeDataRequest(
    requestId: string,
    reason: string,
): Promise<CrmResult<DataRequestRow>> {
    return mutate<DataRequestRow>(
        `/customer-requests/${encodeURIComponent(requestId)}/close`,
        "POST",
        { outcome: "CLOSED_WITHOUT_REMOVAL", reason },
        "Couldn't close the request. Nothing has changed.",
    );
}
