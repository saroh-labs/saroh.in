import type {
    AutopayChecks,
    AutopayMethod,
    PayInstructions,
} from "@saroh/site-blocks";
import {
    autopayChecksOf,
    autopayMethodsOf,
    isAutopayMethod,
} from "@saroh/site-blocks";

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
    /**
     * A GST-registered business's paper whose every line is exempt (D15).
     * Absent from an API older than it: read as false.
     */
    billOfSupply?: boolean;
    /** `--site-*` variables for the business's theme, or null for defaults. */
    theme: Record<string, string> | null;
    /**
     * Autopay for the plan this invoice is for (D12): every method the
     * business's provider offers, and whether it is on already. Absent or
     * null: not a plan's invoice, or no autopay with this business.
     */
    autopay?: PayAutopay | null;
    /**
     * An autopay charge is under way on this invoice (D13): the page says so
     * with the day their bank is asked, and offers no payment (the API
     * would refuse it). Null or absent: none.
     */
    autopayCharging?: { at: string } | null;
    /**
     * When autopay next takes money (D13B): a charge queued on this invoice
     * for a later day ("Next autopay charge: ‹date›" instead of "in
     * progress"), or, the invoice paid and autopay on, the next renewal's.
     * Null or absent: none to say.
     */
    autopayNextCharge?: { at: string } | null;
    /**
     * Where this link lives (DEC-069, L6): the business's own address, or
     * the apex. A pay page opened on another host is sent here. Null or
     * absent (an older API): the page is served wherever it was opened.
     */
    payUrl?: string | null;
    /**
     * The business takes payment online (DEC-070): Payments is on and its
     * provider can open the checkout window. False: the page shows the
     * invoice and a copy to save, with no Pay button, and says to pay the
     * business the way they've asked. Absent (an older API, or the account
     * area's receipt): as before, Pay is offered.
     */
    payOnline?: boolean;
    /**
     * "How to pay us" (R32): the business's UPI ID, bank details and note,
     * sent with an owed invoice the business doesn't take payment for
     * online. Null or absent: none set, or not that page — the generic
     * "pay them the way they've asked" line stands.
     */
    payInstructions?: PayInstructions | null;
}

/** `payOnline` from the API, checked: only a real `false` turns Pay off. */
export function payOnlineOf(v: unknown): boolean | undefined {
    return typeof v === "boolean" ? v : undefined;
}

/**
 * What the page offers under the invoice:
 * - `pay`: it's owed and the business takes payment online — Pay (or
 *   autopay's choice) and "Check again";
 * - `charging`: an autopay charge is under way (D13), so nothing to pay
 *   (said whatever its status, as before);
 * - `elsewhere`: it's owed, but the business doesn't take payment online
 *   (DEC-070) — the invoice, a copy to save, and "Pay ‹business› the way
 *   they've asked you to";
 * - `settled`: paid, void or credited — nothing to do.
 */
export type PayOffer = "pay" | "charging" | "elsewhere" | "settled";

export function payOffer(
    invoice: Pick<PayInvoice, "status" | "autopayCharging" | "payOnline">,
): PayOffer {
    if (invoice.autopayCharging) return "charging";
    const owed = invoice.status === "ISSUED" || invoice.status === "OVERDUE";
    if (!owed) return "settled";
    return invoice.payOnline === false ? "elsewhere" : "pay";
}

/** The link's own address from the API, checked; anything strange is none. */
export function payUrlOf(v: unknown): string | null {
    return isString(v) && /^https?:\/\//.test(v) ? v : null;
}

export interface PayAutopay {
    plan: string;
    methods: AutopayMethod[];
    on: { method: AutopayMethod | null; hint: string | null } | null;
    /**
     * The check each method takes when the invoice is already paid (D12B,
     * DEC-064: UPI and card ₹1, refunded). Empty from an older API.
     */
    checks: AutopayChecks;
}

/** The invoice's autopay, checked; null when it has none or it is strange. */
export function payAutopayOf(v: unknown): PayAutopay | null {
    if (!isRecord(v) || !isString(v.plan)) return null;
    const on = v.on;
    return {
        plan: v.plan,
        methods: autopayMethodsOf(v.methods),
        on: isRecord(on)
            ? {
                  method: isAutopayMethod(on.method) ? on.method : null,
                  hint: isString(on.hint) ? on.hint : null,
              }
            : null,
        checks: autopayChecksOf(v.checks),
    };
}

/** A charge under way (D13), checked; anything strange reads as none. */
export function payChargingOf(v: unknown): { at: string } | null {
    return isRecord(v) && isString(v.at) && !Number.isNaN(Date.parse(v.at))
        ? { at: v.at }
        : null;
}

/** What the page calls the paper: "Bill of supply" when it is one (D15). */
export function payTitle(
    invoice: Pick<PayInvoice, "billOfSupply">,
): "Bill of supply" | "Invoice" {
    return invoice.billOfSupply ? "Bill of supply" : "Invoice";
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
        (v.billOfSupply === undefined || typeof v.billOfSupply === "boolean") &&
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
