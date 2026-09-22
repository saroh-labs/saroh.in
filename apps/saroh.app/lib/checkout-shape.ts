/**
 * The public checkout responses, and the checks that narrow them (#264).
 *
 * Kept apart from `checkout.ts`, which reads the app's env, so the checks can
 * be tested without one.
 */

const PAYMENT_STATUSES = ["UNPAID", "PAID", "FAILED", "REFUNDED"] as const;
export type ReceiptPaymentStatus = (typeof PAYMENT_STATUSES)[number];

/** The buyer-safe receipt returned by the public receipt endpoint. */
export interface CheckoutReceipt {
    orderNumber: string;
    currency: string;
    subtotal: string;
    tax: string;
    shipping: string;
    discount: string;
    total: string;
    paymentStatus: ReceiptPaymentStatus;
    fulfilmentStatus: string;
    latestPayment: {
        provider: string;
        status: string;
        amountCents: number;
        currency: string;
    } | null;
    /**
     * Where the order was placed. Optional: a receipt from an API that
     * predates storefront settings has none, and the page simply omits it.
     */
    storefront?: CheckoutStorefront;
}

/** One day of a shop's week; times are "HH:MM", local to the shop. */
export interface OpeningHoursDay {
    day: string;
    open: string;
    close: string;
    closed: boolean;
}

export interface CheckoutStorefront {
    name: string;
    kind: string;
    address: string | null;
    /** `null` for an online store, or a shop that never saved its hours. */
    openingHours: OpeningHoursDay[] | null;
    /** A paused storefront takes no payments; the page offers no Pay. */
    acceptingPayments: boolean;
}

/** The non-secret handoff returned by the public create-intent endpoint. */
export interface CheckoutIntent {
    paymentIntentId: string;
    provider: string;
    providerIntentId: string;
    amountCents: number;
    currency: string;
    publicKey: string | null;
    clientParams: Record<string, unknown>;
}

/**
 * The response bodies are narrowed rather than cast (#264): the receipt view
 * reads these fields during render, so a 200 in the wrong shape would either
 * throw there and blank the page, or draw "GBP undefined" as a total. Every
 * field the view reads is checked, not just enough to look plausible (code
 * review of #322), and a wrong shape lands in the page's error state.
 */
function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null;
}

const isString = (v: unknown): v is string => typeof v === "string";
const isNumber = (v: unknown): v is number =>
    typeof v === "number" && Number.isFinite(v);

function isLatestPayment(
    value: unknown,
): value is CheckoutReceipt["latestPayment"] {
    if (value === null) return true;
    return (
        isRecord(value) &&
        isString(value.provider) &&
        isString(value.status) &&
        isNumber(value.amountCents) &&
        isString(value.currency)
    );
}

function isOpeningHours(value: unknown): value is OpeningHoursDay[] | null {
    if (value === null) return true;
    return (
        Array.isArray(value) &&
        value.every(
            (d) =>
                isRecord(d) &&
                isString(d.day) &&
                isString(d.open) &&
                isString(d.close) &&
                typeof d.closed === "boolean",
        )
    );
}

function isStorefront(value: unknown): value is CheckoutStorefront | undefined {
    if (value === undefined) return true;
    return (
        isRecord(value) &&
        isString(value.name) &&
        isString(value.kind) &&
        (value.address === null || isString(value.address)) &&
        isOpeningHours(value.openingHours) &&
        typeof value.acceptingPayments === "boolean"
    );
}

export function isReceipt(value: unknown): value is CheckoutReceipt {
    return (
        isRecord(value) &&
        isString(value.orderNumber) &&
        isString(value.currency) &&
        isString(value.subtotal) &&
        isString(value.tax) &&
        isString(value.shipping) &&
        isString(value.discount) &&
        isString(value.total) &&
        (PAYMENT_STATUSES as readonly unknown[]).includes(
            value.paymentStatus,
        ) &&
        isString(value.fulfilmentStatus) &&
        isLatestPayment(value.latestPayment) &&
        isStorefront(value.storefront)
    );
}

export function isIntent(value: unknown): value is CheckoutIntent {
    return (
        isRecord(value) &&
        isString(value.paymentIntentId) &&
        isString(value.provider) &&
        isString(value.providerIntentId) &&
        isNumber(value.amountCents) &&
        isString(value.currency) &&
        (value.publicKey === null || isString(value.publicKey)) &&
        isRecord(value.clientParams)
    );
}
