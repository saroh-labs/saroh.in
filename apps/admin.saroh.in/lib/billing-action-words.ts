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

/**
 * Every code the API raises a billing action with, in its order. Mirrors
 * `BILLING_ACTION_CODES` in
 * `apps/api.saroh.in/src/modules/billing/billing-actions.ts`;
 * `billing-event-words.test.ts` reads that list and fails when the two
 * differ, so a new code can't reach Needs action without words.
 */
export const BILLING_ACTION_CODES = [
    "billing_double_charge_refund_owed",
    "billing_double_charge_refund_given_up",
    "billing_provider_cancel_stuck",
    "billing_provider_cancel_given_up",
    "billing_webhook_unmatched",
    "billing_reconcile_payment_unmatched",
    "saroh_invoice_amount_mismatch",
    "billing_credit_note_may_be_needed",
    "billing_refund_failed",
    "billing_dispute_open",
    "billing_customer_refused",
    "billing_payment_notes_given_up",
    "billing_profile_owner_left",
    "billing_profile_gone",
    "commission_line_failed",
    "commission_refund_after_payout",
    "merchant_webhook_failed",
] as const;
export type BillingActionCode = (typeof BILLING_ACTION_CODES)[number];

/**
 * The one fix a row offers (R28):
 * - `recheck`: Check the refund again (needs the payment's id);
 * - `razorpay`: open the id at `ref` in Razorpay's dashboard;
 * - `subscription`: open the business's subscription in Billing;
 * - `invoice`: find the invoice in Billing › Invoices;
 * - `resolve`: nothing to open; do it, then Mark resolved.
 */
export type ActionFix =
    | { kind: "recheck"; label: string }
    | { kind: "razorpay"; label: string; ref: string }
    | { kind: "subscription"; label: string }
    | { kind: "invoice"; label: string }
    | { kind: "resolve"; label: string };

export type ActionTone = "danger" | "warning" | "neutral";

export interface ActionWords {
    /** What it is about, in a few words: the row's title. */
    label: string;
    /** What happened, in one sentence. */
    what: string;
    tone: ActionTone;
    fix: ActionFix;
}

const OPEN_SUBSCRIPTION: ActionFix = {
    kind: "subscription",
    label: "Open the subscription",
};

const ACTION_WORDS: Record<BillingActionCode, ActionWords> = {
    billing_double_charge_refund_owed: {
        label: "Double charge to find and refund",
        what: "A business paid twice for one plan, and Saroh couldn't refund the extra payment by itself.",
        tone: "danger",
        fix: { kind: "recheck", label: "Check the refund again" },
    },
    billing_double_charge_refund_given_up: {
        label: "Refund a double charge by hand",
        what: "Saroh stopped trying to refund a second payment for the same plan.",
        tone: "danger",
        fix: { kind: "recheck", label: "Check the refund again" },
    },
    billing_provider_cancel_stuck: {
        label: "Provider won't cancel a subscription",
        what: "Razorpay keeps refusing to cancel a subscription, so it may go on charging.",
        tone: "warning",
        fix: {
            kind: "razorpay",
            label: "Check it in Razorpay",
            ref: "providerSubscription",
        },
    },
    billing_provider_cancel_given_up: {
        label: "Cancel a subscription by hand",
        what: "Saroh stopped asking Razorpay to cancel a subscription after a week of refusals.",
        tone: "danger",
        fix: {
            kind: "razorpay",
            label: "Cancel it in Razorpay",
            ref: "providerSubscription",
        },
    },
    billing_webhook_unmatched: {
        label: "Provider event matches no business",
        what: "Razorpay sent an event Saroh couldn't match to any business.",
        tone: "warning",
        fix: { kind: "razorpay", label: "Find it in Razorpay", ref: "payment" },
    },
    billing_reconcile_payment_unmatched: {
        label: "Payment with no Saroh invoice",
        what: "Razorpay took a payment that no Saroh invoice records.",
        tone: "warning",
        fix: { kind: "razorpay", label: "Find it in Razorpay", ref: "payment" },
    },
    saroh_invoice_amount_mismatch: {
        label: "Invoice total differs from payment",
        what: "Razorpay took a different amount from the invoice's total.",
        tone: "warning",
        fix: { kind: "invoice", label: "Open the invoice" },
    },
    billing_credit_note_may_be_needed: {
        label: "Credit note may be needed",
        what: "Money went back on a paid invoice, so the CA may need a credit note for it.",
        tone: "neutral",
        fix: { kind: "resolve", label: "Ask the CA, then mark it resolved" },
    },
    billing_refund_failed: {
        label: "Refund failed",
        what: "Razorpay couldn't send a refund back to the business.",
        tone: "danger",
        fix: {
            kind: "razorpay",
            label: "Refund it in Razorpay",
            ref: "payment",
        },
    },
    billing_dispute_open: {
        label: "Payment disputed",
        what: "A business's bank disputed a payment to Saroh.",
        tone: "danger",
        fix: {
            kind: "razorpay",
            label: "Answer it in Razorpay",
            ref: "dispute",
        },
    },
    billing_customer_refused: {
        label: "Razorpay refused the customer",
        what: "Razorpay refused the business's billing details for its customer record.",
        tone: "warning",
        fix: OPEN_SUBSCRIPTION,
    },
    billing_payment_notes_given_up: {
        label: "Invoice number missing in Razorpay",
        what: "Saroh couldn't add its invoice number to a payment at Razorpay, though the payment and invoice are fine.",
        tone: "neutral",
        fix: { kind: "razorpay", label: "Add it in Razorpay", ref: "payment" },
    },
    billing_profile_owner_left: {
        label: "Billed to someone no longer an owner",
        what: "The business is billed to the profile of someone who is no longer its owner.",
        tone: "warning",
        fix: OPEN_SUBSCRIPTION,
    },
    billing_profile_gone: {
        label: "Billing profile gone",
        what: "The billing profile a plan change needed was removed before the change ran.",
        tone: "warning",
        fix: OPEN_SUBSCRIPTION,
    },
    commission_line_failed: {
        label: "Commission not worked out",
        what: "A payment and its invoice are recorded, but its account manager's commission couldn't be worked out after several tries, and Saroh tries again every hour.",
        tone: "warning",
        fix: {
            kind: "resolve",
            label: "Mark resolved once it shows on Payouts",
        },
    },
    commission_refund_after_payout: {
        label: "Refund after commission paid",
        what: "A payment was refunded after its account manager's commission on it was paid, and nothing was taken back.",
        tone: "warning",
        fix: { kind: "resolve", label: "Decide with them, then mark resolved" },
    },
    merchant_webhook_failed: {
        label: "Payment event not applied",
        what: "A business's payment provider sent an event Saroh couldn't apply after a day of tries, so a payment, refund or mandate may be out of step.",
        tone: "danger",
        fix: {
            kind: "resolve",
            label: "Replay it in Operations › Webhooks, then mark resolved",
        },
    },
};

/** Words for a code the console doesn't know yet: still a row to act on. */
const UNKNOWN_ACTION: ActionWords = {
    label: "Billing needs a look",
    what: "Saroh's billing met something it couldn't settle by itself.",
    tone: "warning",
    fix: OPEN_SUBSCRIPTION,
};

export function isBillingActionCode(code: string): code is BillingActionCode {
    return (BILLING_ACTION_CODES as readonly string[]).includes(code);
}

/** How Needs action says a code: title, one sentence, tone and fix. */
export function actionWords(code: string): ActionWords {
    return isBillingActionCode(code) ? ACTION_WORDS[code] : UNKNOWN_ACTION;
}

/** What a billing action is about, in a few words. */
export function actionLabel(code: string): string {
    return actionWords(code).label;
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

// ── Failed billing jobs ──────────────────────────────────────────────────

const JOB_LABEL: Record<string, string> = {
    "billing.email": "Send a billing email",
    "billing.customer.sync": "Sync the Razorpay customer",
    "billing.profile.sync": "Sync a billing profile",
    "billing.provider.cancel": "Cancel at Razorpay",
    "billing.refund.double-charge": "Refund a double charge",
    "billing.payment.notes": "Add the invoice number in Razorpay",
    "billing.reconcile": "Check payments against invoices",
    "billing.addons.sync": "Sync add-ons",
    "billing.moves.apply": "Apply plan changes",
    "billing.provider-plans.sync": "Sync plans to Razorpay",
    "billing.free-rows.start": "Start Free plans",
};

/** What a failed billing job was doing, in words; its type if unknown. */
export function jobLabel(type: string): string {
    return JOB_LABEL[type] ?? type;
}

/** Where a job opens in Operations › Jobs, by its type. */
export function jobsHref(type: string): string {
    return `/operations/jobs?status=FAILED&type=${encodeURIComponent(type)}`;
}
