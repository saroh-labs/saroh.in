/**
 * Admin › Billing's Needs action, Provider events and controls (DEC-166):
 * what the API sends and how the console says it. Client-safe: no server
 * imports. Amounts come in paise; no price is ever written here.
 */

// ── What the API sends ───────────────────────────────────────────────────

export interface OrgBrief {
    id: string;
    name: string;
    slug: string;
}

export interface BillingActionRow {
    id: string;
    organization: OrgBrief | null;
    code: string;
    refs: Record<string, string>;
    note: string;
    createdAt: string;
    resolvedAt: string | null;
    resolvedBy: string | null;
    resolution: string | null;
}

export interface FailedBillingJob {
    id: string;
    type: string;
    organization: OrgBrief | null;
    attempts: number;
    maxAttempts: number;
    lastError: string | null;
    failedAt: string;
}

export interface BillingActionPage {
    items: BillingActionRow[];
    page: number;
    limit: number;
    total: number;
    openCount: number;
    failedJobs: FailedBillingJob[];
}

export interface ProviderEventRow {
    id: string;
    provider: string;
    providerEventId: string;
    type: string;
    organization: OrgBrief | null;
    receivedAt: string;
    processedAt: string | null;
    refs: Record<string, string>;
}

export interface ProviderEventPage {
    items: ProviderEventRow[];
    page: number;
    limit: number;
    total: number;
}

// ── The query string ─────────────────────────────────────────────────────

export const ACTION_STATES = ["open", "resolved"] as const;
export type ActionState = (typeof ACTION_STATES)[number];

export function readActionState(value: string | undefined): ActionState {
    return value === "resolved" ? "resolved" : "open";
}

export const EVENT_FILTERS = ["not-applied", "no-business"] as const;
export type EventFilter = (typeof EVENT_FILTERS)[number];

export const EVENT_FILTER_LABEL: Record<EventFilter, string> = {
    "not-applied": "Not applied",
    "no-business": "No business",
};

export function readEventFilter(
    value: string | undefined,
): EventFilter | undefined {
    return EVENT_FILTERS.find((f) => f === value);
}

// ── Razorpay's dashboard ─────────────────────────────────────────────────

const DASHBOARD = "https://dashboard.razorpay.com/app";

/** Razorpay id prefix → the dashboard's section for it. */
const SECTION: Partial<Record<string, string>> = {
    pay: "payments",
    sub: "subscriptions",
    cust: "customers",
    order: "orders",
    rfnd: "refunds",
    disp: "disputes",
};

const RAZORPAY_ID = /^([a-z]+)_[A-Za-z0-9]{4,40}$/;

/**
 * Where a Razorpay id opens in its dashboard, or null for anything that
 * isn't one (another provider, a Saroh id). Test-mode ids open at the same
 * address once the dashboard is switched to Test mode.
 */
export function razorpayDashboardUrl(
    id: string | null | undefined,
    provider: string | null = "RAZORPAY",
): string | null {
    if (!id || (provider ?? "").toUpperCase() !== "RAZORPAY") return null;
    const match = RAZORPAY_ID.exec(id);
    const section = match ? SECTION[match[1]] : undefined;
    return section ? `${DASHBOARD}/${section}/${encodeURIComponent(id)}` : null;
}

/** The one line said once per screen where Razorpay links appear. */
export const RAZORPAY_LINK_HINT =
    "Ids open in Razorpay's dashboard; switch it to Test mode for test payments.";

// ── Words ────────────────────────────────────────────────────────────────

const ACTION_LABEL: Record<string, string> = {
    billing_double_charge_refund_given_up: "Refund a double charge by hand",
    billing_double_charge_refund_owed: "Double charge to find and refund",
    billing_provider_cancel_stuck: "Provider won't cancel a subscription",
    billing_provider_cancel_given_up: "Cancel a subscription by hand",
    billing_paid_on_dropped_checkout: "Paid on a dropped checkout",
    billing_webhook_unmatched: "Provider event matches no business",
    billing_reconcile_payment_unmatched: "Payment with no Saroh invoice",
    saroh_invoice_amount_mismatch: "Invoice total differs from payment",
    billing_credit_note_may_be_needed: "Credit note may be needed",
    billing_refund_failed: "Refund failed",
    billing_dispute_open: "Payment disputed",
};

/** What a billing action is about, in a few words. */
export function actionLabel(code: string): string {
    return ACTION_LABEL[code] ?? "Billing needs a look";
}

/** Whether "Check the refund again" fits this action. */
export function canRecheckRefund(action: {
    code: string;
    refs: Record<string, string>;
}): boolean {
    return (
        action.code.startsWith("billing_double_charge_refund") &&
        Boolean(action.refs.payment)
    );
}

/** How a ref's key reads beside its id. */
const REF_LABEL: Record<string, string> = {
    payment: "Payment",
    subscription: "Subscription",
    providerSubscription: "Subscription",
    customer: "Customer",
    order: "Order",
    refund: "Refund",
    dispute: "Dispute",
    invoice: "Invoice",
    event: "Event",
    checkout: "Checkout",
    provider: "Provider",
    standing: "At the provider",
    tries: "Tries",
};

export function refLabel(key: string): string {
    return REF_LABEL[key] ?? key;
}

const REFUND_STATUS: Record<string, string> = {
    PENDING: "Refund pending",
    PROCESSED: "Refunded",
    FAILED: "Refund failed",
    OPEN: "Dispute open",
    UNDER_REVIEW: "Dispute under review",
    ACTION_REQUIRED: "Dispute needs an answer",
    WON: "Dispute won",
    LOST: "Dispute lost",
    CLOSED: "Dispute closed",
};

export function refundStatusLabel(status: string): string {
    return REFUND_STATUS[status] ?? status;
}

const REFUND_SOURCE: Record<string, string> = {
    AUTO: "by Saroh, automatically",
    MANUAL: "recorded by an operator",
    PROVIDER: "told by the provider",
};

export function refundSourceLabel(source: string): string {
    return REFUND_SOURCE[source] ?? source;
}

/**
 * Rupees as an operator types them ("1,180", "1180.5", "₹99.00") into
 * paise, or null when it isn't a positive amount with at most two decimals.
 */
export function rupeesToPaise(value: string | undefined): number | null {
    const text = (value ?? "").replace(/[₹,\s]/g, "");
    const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(text);
    if (!match) return null;
    const paise =
        Number(match[1]) * 100 + Number((match[2] || "").padEnd(2, "0"));
    return Number.isSafeInteger(paise) && paise > 0 ? paise : null;
}

/** Whether "End autopay" fits this subscription. */
export function canEndAutopay(sub: {
    provider: string | null;
    providerSubscriptionId: string | null;
    status: string;
    freeChosenAt: string | null;
}): boolean {
    return (
        Boolean(sub.provider && sub.providerSubscriptionId) &&
        sub.status !== "CANCELLED" &&
        !sub.freeChosenAt
    );
}
