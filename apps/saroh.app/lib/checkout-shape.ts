/**
 * A payment's start as the public API answers it, and the check that
 * narrows it (#264). Kept apart from the modules that read the app's env
 * (`invoice-pay.ts`, `order-pay.ts`), so the check can be tested without
 * one.
 */

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
 * The response body is narrowed rather than cast (#264): the pay page hands
 * these fields to the provider's window, so a 200 in the wrong shape lands
 * in the page's own "couldn't start the payment", never in a window that
 * can't open. Every field read is checked (code review of #322).
 */
function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null;
}

const isString = (v: unknown): v is string => typeof v === "string";
const isNumber = (v: unknown): v is number =>
    typeof v === "number" && Number.isFinite(v);

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
