/**
 * Customers' "Ask to remove my data" requests, in the workspace's words
 * (DEC-172, #1107; site templates v2 plan, U14): the Requests tab on Sell ›
 * Customers, its rows and sheet, the list's banner while requests are
 * open, and the one banner on the customer's own page.
 *
 * The API's row is `customer-workspace/data-requests.service.ts`'s
 * `DataRequestRow`; this is the same shape. Pure and client-safe.
 */

export type DataRequestStatus = "OPEN" | "DONE" | "CLOSED_WITHOUT_REMOVAL";

export interface DataRequestRow {
    id: string;
    kind: "REMOVAL";
    status: DataRequestStatus;
    askedAt: string;
    handledAt: string | null;
    /** Why it was closed without removal; null otherwise. */
    reason: string | null;
    /** The customer to open; null once removed, or when none is linked. */
    contactId: string | null;
    /** Their name now, else as they gave it when they asked. */
    name: string | null;
    /** The email they asked from; null once done. */
    email: string | null;
}

/** `?status=` on the Requests tab: open when left out. */
export const REQUEST_FILTERS = ["open", "done", "closed", "all"] as const;
export type RequestFilter = (typeof REQUEST_FILTERS)[number];

export const FILTER_LABEL: Record<RequestFilter, string> = {
    open: "Open",
    done: "Done",
    closed: "Closed",
    all: "All requests",
};

export function readRequestFilter(value: unknown): RequestFilter {
    return typeof value === "string" &&
        (REQUEST_FILTERS as readonly string[]).includes(value)
        ? (value as RequestFilter)
        : "open";
}

/** The Requests tab's address, with its filter when it isn't Open. */
export function requestsHref(filter: RequestFilter = "open"): string {
    return filter === "open"
        ? "/commerce/customers?tab=requests"
        : `/commerce/customers?tab=requests&status=${filter}`;
}

/** The tab's status words, and the badge each wears. */
export const STATUS_WORDS: Record<
    DataRequestStatus,
    { label: string; tone: "warning" | "success" | "neutral" }
> = {
    OPEN: { label: "Open", tone: "warning" },
    DONE: { label: "Done", tone: "success" },
    CLOSED_WITHOUT_REMOVAL: { label: "Closed", tone: "neutral" },
};

/**
 * Who asked, as a row names them: their name, else their email. A done
 * request names nobody: their details were removed (review #19).
 */
export function requesterLabel(row: DataRequestRow): string {
    if (row.status === "DONE") return "A removed customer";
    const name = row.name?.trim();
    if (name) return name;
    return row.email ?? "A customer";
}

/** The row's second line: how to find them, or what became of it. */
export function requestSub(row: DataRequestRow): string {
    if (row.status === "DONE") return "Their details were removed.";
    if (row.status === "CLOSED_WITHOUT_REMOVAL") {
        return row.reason
            ? `Closed without removal: ${row.reason}`
            : "Closed without removal.";
    }
    const how = row.name?.trim() && row.email ? row.email : null;
    const linked = row.contactId
        ? null
        : "Not linked to a customer yet. Find them by their email.";
    return [how, linked].filter(Boolean).join(" · ");
}

/** "1 customer asked to remove their data", for the list's banner. */
export function openRequestsText(count: number): string {
    return count === 1
        ? "1 customer asked to remove their data"
        : `${count} customers asked to remove their data`;
}

/** What the empty Requests tab says, by its filter. */
export function emptyRequestsText(filter: RequestFilter): {
    title: string;
    description: string;
} {
    switch (filter) {
        case "open":
            return {
                title: "No open requests",
                description:
                    "When a customer asks to remove their data from your website's account page, it shows up here.",
            };
        case "done":
            return {
                title: "No requests done yet",
                description:
                    "A request is marked done when you remove that customer's details.",
            };
        case "closed":
            return {
                title: "No closed requests",
                description:
                    "A request you close without removing their details shows up here.",
            };
        default:
            return {
                title: "No requests yet",
                description:
                    "When a customer asks to remove their data from your website's account page, it shows up here.",
            };
    }
}

/** The close dialog's reason, as the API takes it (1 to 500 characters). */
export const MAX_CLOSE_REASON = 500;

/**
 * The open request on this customer's page, if there is one: the newest,
 * for this contact. Requests are rare, so the open list is read whole.
 */
export function openRequestFor(
    rows: DataRequestRow[] | null,
    contactId: string,
): DataRequestRow | null {
    return (
        rows?.find((r) => r.status === "OPEN" && r.contactId === contactId) ??
        null
    );
}
