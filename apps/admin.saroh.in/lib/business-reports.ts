import { getJson } from "./control-plane";

/**
 * Customers' reports about a business (saroh.in/customers; Terms rev 46),
 * as the console reads them. Server-only.
 */

export type BusinessReportStatus = "open" | "done" | "all";

export interface BusinessReportRow {
    id: string;
    /** The site's address as the customer gave it, reduced to its host. */
    siteHost: string;
    message: string;
    status: "OPEN" | "DONE";
    createdAt: string;
    doneAt: string | null;
    /** The business the address is a Saroh site of; null when it isn't one. */
    business: { id: string; name: string } | null;
    hasEmail: boolean;
    /** Only for staff who may read personal data; otherwise null. */
    reporterEmail: string | null;
}

export interface BusinessReportPage {
    items: BusinessReportRow[];
    /** Open reports across the instance, whatever the filter. */
    open: number;
    nextCursor?: string;
}

/** The status a query string asks for: open unless it says done or all. */
export function reportStatus(value: string | undefined): BusinessReportStatus {
    return value === "done" || value === "all" ? value : "open";
}

export function listBusinessReports(params: {
    status: BusinessReportStatus;
    cursor?: string;
}): Promise<BusinessReportPage | null> {
    const search = new URLSearchParams({ status: params.status });
    if (params.cursor) search.set("cursor", params.cursor);
    return getJson<BusinessReportPage>(
        `/business-reports?${search.toString()}`,
    );
}
