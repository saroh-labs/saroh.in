import type {
    ActionState,
    BillingActionPage,
    EventFilter,
    ProviderEventPage,
} from "./billing-action-words";
import type {
    BillingCounts,
    GstinFilter,
    SarohInvoicePage,
    SarohSubscriptionDetail,
    SarohSubscriptionPage,
    SubscriptionStatus,
    SubscriptionView,
} from "./billing-words";
import { adminFetch, getJson } from "./control-plane";
import type { BillingHistoryPage, HistoryShow } from "./subscription-sheet";

/**
 * Admin › Billing's reads (DEC-163). Server-only: each forwards the
 * operator's session to `/admin/billing/*`, where the API decides, with
 * `saroh-billing:read`, whether they may see it. `null` is the API's
 * refusal (401/403); a throw is an outage.
 */

function query(params: Record<string, string | number | undefined>): string {
    const search = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
        if (value !== undefined && value !== "") search.set(key, String(value));
    }
    return search.size > 0 ? `?${search.toString()}` : "";
}

export function listSarohInvoices(filters: {
    month?: string;
    q?: string;
    gstin?: GstinFilter;
    page?: number;
}): Promise<SarohInvoicePage | null> {
    return getJson<SarohInvoicePage>(`/billing/invoices${query(filters)}`);
}

export function listSarohSubscriptions(filters: {
    q?: string;
    status?: SubscriptionStatus;
    plan?: string;
    view?: SubscriptionView;
    page?: number;
}): Promise<SarohSubscriptionPage | null> {
    return getJson<SarohSubscriptionPage>(
        `/billing/subscriptions${query(filters)}`,
    );
}

/** Each Billing tab's count, for the tabs (R25). */
export function getBillingCounts(): Promise<BillingCounts | null> {
    return getJson<BillingCounts>("/billing/counts");
}

export function getSarohSubscription(
    subscriptionId: string,
): Promise<SarohSubscriptionDetail | null> {
    return getJson<SarohSubscriptionDetail>(
        `/billing/subscriptions/${encodeURIComponent(subscriptionId)}`,
    );
}

/**
 * One subscription's history (admin plan U15): provider events, invoices,
 * billing emails and staff actions, newest first, a page at a time.
 */
export function getSubscriptionHistory(
    subscriptionId: string,
    filters: { show?: HistoryShow; page?: number },
): Promise<BillingHistoryPage | null> {
    return getJson<BillingHistoryPage>(
        `/billing/subscriptions/${encodeURIComponent(subscriptionId)}/history${query(
            {
                show: filters.show === "everything" ? undefined : filters.show,
                page:
                    filters.page && filters.page > 1 ? filters.page : undefined,
            },
        )}`,
    );
}

/** The month's CSV, as the API sent it (the caller passes it on). */
export function fetchInvoicesExport(filters: {
    month: string;
    q?: string;
    gstin?: GstinFilter;
}): Promise<Response> {
    return adminFetch(`/billing/invoices/export${query(filters)}`);
}

/** Billing › Needs action (DEC-166): open or resolved, a page. */
export function listBillingActions(filters: {
    state?: ActionState;
    q?: string;
    page?: number;
}): Promise<BillingActionPage | null> {
    return getJson<BillingActionPage>(`/billing/actions${query(filters)}`);
}

/** Billing › Provider events (DEC-166). */
export function listProviderEvents(filters: {
    filter?: EventFilter;
    q?: string;
    page?: number;
}): Promise<ProviderEventPage | null> {
    return getJson<ProviderEventPage>(`/billing/events${query(filters)}`);
}

/** One invoice's PDF, as the API sent it. */
export function fetchInvoicePdf(invoiceId: string): Promise<Response> {
    return adminFetch(`/billing/invoices/${encodeURIComponent(invoiceId)}/pdf`);
}
