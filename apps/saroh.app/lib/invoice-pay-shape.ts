/**
 * The public invoice a pay link shows, and the checks that narrow it. Kept
 * apart from `invoice-pay.ts`, which reads the app's env, so they can be
 * tested without one — the checkout-shape pattern.
 */

export const PAY_STATUSES = ["ISSUED", "OVERDUE", "PAID", "VOID"] as const;
export type PayStatus = (typeof PAY_STATUSES)[number];

export interface PayInvoiceLine {
    description: string;
    quantity: number;
    unitPrice: string;
    amount: string;
}

/** Exactly what the API's allow-list sends; nothing else is read. */
export interface PayInvoice {
    businessName: string;
    number: string;
    issuedAt: string | null;
    dueAt: string | null;
    lines: PayInvoiceLine[];
    tax: string;
    total: string;
    currency: string;
    status: PayStatus;
    billedTo: string | null;
    /** `--site-*` variables for the business's theme, or null for defaults. */
    theme: Record<string, string> | null;
}

function isRecord(v: unknown): v is Record<string, unknown> {
    return typeof v === "object" && v !== null;
}
const isString = (v: unknown): v is string => typeof v === "string";
const isNullableString = (v: unknown): v is string | null =>
    v === null || isString(v);

function isLine(v: unknown): v is PayInvoiceLine {
    return (
        isRecord(v) &&
        isString(v.description) &&
        typeof v.quantity === "number" &&
        isString(v.unitPrice) &&
        isString(v.amount)
    );
}

function isTheme(v: unknown): v is Record<string, string> | null {
    return v === null || (isRecord(v) && Object.values(v).every(isString));
}

export function isPayInvoice(v: unknown): v is PayInvoice {
    return (
        isRecord(v) &&
        isString(v.businessName) &&
        isString(v.number) &&
        isNullableString(v.issuedAt) &&
        isNullableString(v.dueAt) &&
        Array.isArray(v.lines) &&
        v.lines.every(isLine) &&
        isString(v.tax) &&
        isString(v.total) &&
        isString(v.currency) &&
        (PAY_STATUSES as readonly unknown[]).includes(v.status) &&
        isNullableString(v.billedTo) &&
        isTheme(v.theme)
    );
}

/** "₹1,400.00" — an invoice is paid from, so it keeps its decimals. */
export function payMoney(amount: string, currency: string): string {
    const value = Number(amount);
    if (!Number.isFinite(value)) return `${currency} ${amount}`;
    try {
        return new Intl.NumberFormat("en-IN", {
            style: "currency",
            currency,
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
        }).format(value);
    } catch {
        return `${currency} ${amount}`;
    }
}

/** "22 September 2026", in the zone the date was written in (UTC). */
export function payDate(iso: string | null): string | null {
    if (!iso) return null;
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return null;
    return new Intl.DateTimeFormat("en-GB", {
        day: "numeric",
        month: "long",
        year: "numeric",
        timeZone: "UTC",
    }).format(d);
}
