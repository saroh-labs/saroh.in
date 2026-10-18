/**
 * How Admin › Billing reads its query string and says money, dates and
 * states (DEC-163). Client-safe: no server imports, so a client component
 * may take values from here. Every amount comes from the API in paise; no
 * price is ever written here (the repo is public).
 */

// ── What the API sends ───────────────────────────────────────────────────

export interface SarohInvoiceRow {
    id: string;
    number: string;
    issuedAt: string;
    organization: { id: string; name: string; slug: string };
    source: string;
    planName: string;
    cycle: string;
    currency: string;
    taxType: string;
    placeOfSupply: string | null;
    taxablePaise: number;
    cgstPaise: number;
    sgstPaise: number;
    igstPaise: number;
    taxPaise: number;
    totalPaise: number;
    billToName: string;
    billToGstin: string | null;
    provider: string;
    providerPaymentId: string | null;
    /** The provider's subscription (or a yearly plan's order), DEC-166. */
    providerSubscriptionId: string | null;
    providerCustomerId: string | null;
    /** What the provider says it took; null: it hasn't said. */
    providerAmountPaise: number | null;
    /** The provider took another amount than the invoice's total. */
    amountMismatch: boolean;
    /** Refunds and disputes recorded on it. */
    refunds: SarohRefundRow[];
}

/** A refund or dispute on a Saroh payment (DEC-166). */
export interface SarohRefundRow {
    id: string;
    kind: string;
    provider: string;
    providerRefundId: string;
    providerPaymentId: string;
    invoiceId: string | null;
    amountPaise: number | null;
    status: string;
    reason: string | null;
    source: string;
    createdAt: string;
}

export interface SarohInvoicePage {
    items: SarohInvoiceRow[];
    page: number;
    limit: number;
    totals: {
        count: number;
        taxablePaise: number;
        taxPaise: number;
        totalPaise: number;
    };
}

export interface PlanBrief {
    key: string;
    name: string;
    version: number;
    interval: string;
}

export interface SarohSubscriptionRow {
    id: string;
    organization: { id: string; name: string; slug: string };
    plan: PlanBrief;
    status: string;
    billingCycle: string;
    currentPeriodEnd: string | null;
    cancelAtPeriodEnd: boolean;
    freeChosenAt: string | null;
    pending: { plan: PlanBrief; from: string | null } | null;
    provider: string | null;
    providerSubscriptionId: string | null;
    providerCustomerId: string | null;
    termEndsAt: string | null;
    termPayment: "AUTOPAY" | "ONE_TIME" | null;
    lastInvoice: {
        id: string;
        number: string;
        issuedAt: string;
        totalPaise: number;
    } | null;
}

export interface SarohSubscriptionPage {
    items: SarohSubscriptionRow[];
    page: number;
    limit: number;
    total: number;
    summary: {
        byStatus: { status: string; count: number }[];
        byPlan: { key: string; name: string; count: number }[];
        mrrPaise: number;
        currency: string;
    };
    plans: { key: string; name: string }[];
}

export interface SarohSubscriptionDetail {
    subscription: SarohSubscriptionRow;
    /**
     * Who Saroh bills the business to (DEC-167): its billing profile, the
     * profile's customer at the provider and its last sync, and the other
     * businesses on the same profile. Null: it hasn't chosen one yet.
     */
    billingProfile: {
        id: string;
        legalName: string;
        billingEmail: string;
        gstin: string | null;
        provider: string;
        providerCustomerId: string | null;
        syncedAt: string | null;
        lastError: string | null;
        contactWithheld: boolean;
        otherBusinesses: { id: string; name: string }[];
    } | null;
    /** Its last 12 invoices, with their refunds. */
    invoices: SarohInvoiceRow[];
    refunds: SarohRefundRow[];
    doubleCharges: {
        providerPaymentId: string;
        provider: string;
        amountPaise: number | null;
        reason: string | null;
        claimedAt: string;
        refundedAt: string | null;
        providerRefundId: string | null;
    }[];
    openActions: {
        id: string;
        code: string;
        note: string;
        refs: Record<string, string>;
        createdAt: string;
    }[];
    checkouts: {
        id: string;
        kind: string;
        status: string;
        cycle: string;
        planName: string;
        pricePaise: number;
        chargeNowPaise: number;
        provider: string;
        providerSubscriptionId: string;
        startAt: string | null;
        expiresAt: string;
        completedAt: string | null;
        endedReason: string | null;
        billToGstin: string | null;
        createdAt: string;
    }[];
    events: {
        id: string;
        provider: string;
        providerEventId: string;
        type: string;
        receivedAt: string;
        processedAt: string | null;
    }[];
}

// ── The query string ─────────────────────────────────────────────────────

export type GstinFilter = "yes" | "no";

export const SUBSCRIPTION_STATUSES = [
    "TRIALING",
    "ACTIVE",
    "PAST_DUE",
    "CANCELLED",
] as const;
export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number];

export const SUBSCRIPTION_VIEWS = [
    "ending-soon",
    "first-month",
    "past-due",
] as const;
export type SubscriptionView = (typeof SUBSCRIPTION_VIEWS)[number];

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;

/** "2026-10", else undefined. */
export function readMonth(value: string | undefined): string | undefined {
    const trimmed = value?.trim();
    return trimmed && MONTH.test(trimmed) ? trimmed : undefined;
}

export function readGstin(value: string | undefined): GstinFilter | undefined {
    return value === "yes" || value === "no" ? value : undefined;
}

export function readStatus(
    value: string | undefined,
): SubscriptionStatus | undefined {
    return SUBSCRIPTION_STATUSES.find((s) => s === value);
}

export function readView(
    value: string | undefined,
): SubscriptionView | undefined {
    return SUBSCRIPTION_VIEWS.find((v) => v === value);
}

/** A whole number from 1, else 1. */
export function readPage(value: string | undefined): number {
    const n = Number(value);
    return Number.isInteger(n) && n >= 1 ? n : 1;
}

/** This month in India, "2026-10", for the export's default. */
export function currentIstMonth(now: Date = new Date()): string {
    return new Date(now.getTime() + IST_OFFSET_MS).toISOString().slice(0, 7);
}

/** The last `count` months in India, newest first, for the month filter. */
export function recentMonths(count: number, now: Date = new Date()): string[] {
    const [year, month] = currentIstMonth(now).split("-").map(Number) as [
        number,
        number,
    ];
    const months: string[] = [];
    for (let i = 0; i < count; i++) {
        const d = new Date(Date.UTC(year, month - 1 - i, 1));
        months.push(d.toISOString().slice(0, 7));
    }
    return months;
}

/** "October 2026" for "2026-10". */
export function monthLabel(month: string): string {
    const [year, m] = month.split("-").map(Number) as [number, number];
    return new Intl.DateTimeFormat("en-IN", {
        month: "long",
        year: "numeric",
        timeZone: "UTC",
    }).format(new Date(Date.UTC(year, m - 1, 1)));
}

/** A screen's address with only the filters that say something. */
export function billingHref(
    base: string,
    params: Record<string, string | number | undefined>,
): string {
    const search = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
        if (value === undefined || value === "") continue;
        if (key === "page" && Number(value) <= 1) continue;
        search.set(key, String(value));
    }
    return search.size > 0 ? `${base}?${search.toString()}` : base;
}

// ── Money and dates ──────────────────────────────────────────────────────

const IST_OFFSET_MS = (5 * 60 + 30) * 60 * 1000;

/** "₹1,234.50" from paise: integer arithmetic, then the rupee format. */
export function formatPaise(paise: number, currency = "INR"): string {
    const sign = paise < 0 ? "-" : "";
    const abs = Math.abs(Math.trunc(paise));
    const rupees = Math.floor(abs / 100);
    const rest = String(abs % 100).padStart(2, "0");
    const whole = new Intl.NumberFormat("en-IN").format(rupees);
    const symbol = currency === "INR" ? "₹" : `${currency} `;
    return `${sign}${symbol}${whole}.${rest}`;
}

const IST_DATE = new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Kolkata",
});

const IST_DATE_TIME = new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Kolkata",
});

/** "17 Oct 2026", as the day is in India; "—" for none. */
export function istDate(value: string | null | undefined): string {
    return value ? IST_DATE.format(new Date(value)) : "—";
}

/** "17 Oct 2026, 08:00 am" in India; "—" for none. */
export function istDateTime(value: string | null | undefined): string {
    return value ? `${IST_DATE_TIME.format(new Date(value))} IST` : "—";
}

// ── Words ────────────────────────────────────────────────────────────────

export const STATUS_LABEL: Record<SubscriptionStatus, string> = {
    TRIALING: "First month",
    ACTIVE: "Active",
    PAST_DUE: "Payment failed",
    CANCELLED: "Ended",
};

export function statusLabel(status: string): string {
    const known = readStatus(status);
    return known ? STATUS_LABEL[known] : status;
}

export const VIEW_LABEL: Record<SubscriptionView, string> = {
    "ending-soon": "Ending or moving in 30 days",
    "first-month": "In their first month",
    "past-due": "Payment failed",
};

const SOURCE_LABEL: Record<string, string> = {
    NEW: "New plan",
    UPGRADE: "Upgrade",
    SCHEDULED: "Plan change",
    RENEWAL: "Renewal",
};

/** What an invoice charged for, in words. */
export function sourceLabel(source: string): string {
    return SOURCE_LABEL[source] ?? source;
}

/** "Monthly" / "Yearly". */
export function cycleLabel(cycle: string): string {
    if (cycle === "month") return "Monthly";
    if (cycle === "year") return "Yearly";
    return cycle;
}

/** The GST an invoice holds: "CGST ₹9.00 + SGST ₹9.00" or "IGST ₹18.00". */
export function gstSplit(row: {
    taxType: string;
    cgstPaise: number;
    sgstPaise: number;
    igstPaise: number;
    currency: string;
}): string {
    if (row.taxType === "INTER") {
        return `IGST ${formatPaise(row.igstPaise, row.currency)}`;
    }
    return `CGST ${formatPaise(row.cgstPaise, row.currency)} + SGST ${formatPaise(row.sgstPaise, row.currency)}`;
}

const CHECKOUT_KIND: Record<string, string> = {
    NEW: "New plan",
    UPGRADE: "Upgrade",
    SCHEDULED: "Scheduled change",
    TRIAL: "First month",
};

export function checkoutKindLabel(kind: string): string {
    return CHECKOUT_KIND[kind] ?? kind;
}

const CHECKOUT_STATUS: Record<string, string> = {
    OPEN: "Waiting for payment",
    SCHEDULED: "Approved, starts later",
    COMPLETED: "Done",
    CANCELLED: "Not finished",
};

export function checkoutStatusLabel(status: string): string {
    return CHECKOUT_STATUS[status] ?? status;
}

/**
 * What is coming for a subscription: "Moves to ‹Plan› on ‹date›" for a
 * pending move, "Ends ‹date›" for one ending at its period's end, else
 * null.
 */
export function endingLine(row: SarohSubscriptionRow): string | null {
    if (row.pending) {
        return `Moves to ${row.pending.plan.name} on ${istDate(row.pending.from)}`;
    }
    if (row.cancelAtPeriodEnd && row.status !== "CANCELLED") {
        return `Ends ${istDate(row.currentPeriodEnd)}`;
    }
    return null;
}

/**
 * What has been given back on an invoice (DEC-166): its refunds that went
 * through or are on their way, never a failed one or a dispute.
 */
export function refundedPaise(row: {
    refunds: { kind: string; status: string; amountPaise: number | null }[];
}): number {
    return row.refunds
        .filter((r) => r.kind === "REFUND" && r.status !== "FAILED")
        .reduce((sum, r) => sum + (r.amountPaise ?? 0), 0);
}

/** Where an invoice's PDF downloads from, through the console. */
export function invoicePdfHref(invoiceId: string): string {
    return `/billing/invoices/${encodeURIComponent(invoiceId)}/pdf`;
}
