import type { PayInstructions } from "@saroh/site-blocks";

/**
 * The public order an order pay link shows (plan B, B11), and the check that
 * narrows it. Kept apart from `order-pay.ts`, which reads the app's env, so
 * it can be tested without one — the invoice pay page's pattern.
 */

export const ORDER_PAY_STATUSES = ["DUE", "PAID", "CLOSED"] as const;
export type OrderPayStatus = (typeof ORDER_PAY_STATUSES)[number];

export interface PayOrderLine {
    name: string;
    quantity: number;
    unitPrice: string;
    amount: string;
}

/** Exactly what the API's allow-list sends; nothing else is read. */
export interface PayOrder {
    businessName: string;
    orderNumber: string;
    firstName: string | null;
    lines: PayOrderLine[];
    total: string;
    /** What paying now charges. */
    due: string;
    currency: string;
    status: OrderPayStatus;
    /** `--site-*` variables for the business's theme, or null for defaults. */
    theme: Record<string, string> | null;
    /**
     * Where this link lives (DEC-069, L6): the business's own address, or
     * the apex. Null or absent (an older API): served wherever opened.
     */
    payUrl?: string | null;
    /**
     * "How to pay us" (R32): the business's UPI ID, bank details and note,
     * while the order is due. Null or absent: none set.
     */
    payInstructions?: PayInstructions | null;
}

function isRecord(v: unknown): v is Record<string, unknown> {
    return typeof v === "object" && v !== null;
}
const isString = (v: unknown): v is string => typeof v === "string";

function isLine(v: unknown): v is PayOrderLine {
    return (
        isRecord(v) &&
        isString(v.name) &&
        typeof v.quantity === "number" &&
        isString(v.unitPrice) &&
        isString(v.amount)
    );
}

function isTheme(v: unknown): v is Record<string, string> | null {
    return v === null || (isRecord(v) && Object.values(v).every(isString));
}

export function isPayOrder(v: unknown): v is PayOrder {
    return (
        isRecord(v) &&
        isString(v.businessName) &&
        isString(v.orderNumber) &&
        (v.firstName === null || isString(v.firstName)) &&
        Array.isArray(v.lines) &&
        v.lines.every(isLine) &&
        isString(v.total) &&
        isString(v.due) &&
        isString(v.currency) &&
        (ORDER_PAY_STATUSES as readonly unknown[]).includes(v.status) &&
        isTheme(v.theme)
    );
}
