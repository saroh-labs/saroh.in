import type {
    AccountPackAttempt,
    AccountPackCheckout,
    AccountPackOnSale,
    AccountPacksOnSale,
    PackResult,
} from "@saroh/site-blocks";

/**
 * Buying a class pack from the account (round-2 plan A, A11): the API's
 * answers narrowed, and every refusal turned into the customer's words.
 * Kept apart from the actions, which read the app's env, so they can be
 * tested without one.
 *
 * Only the API's sentences written for the customer are passed on — "buy it
 * at the desk" and the fourth open payment (409), and the account's own
 * "too many tries" (429). The rest are the page's own.
 */

type Rec = Record<string, unknown>;
const isRecord = (v: unknown): v is Rec => typeof v === "object" && v !== null;
const isString = (v: unknown): v is string => typeof v === "string";
const isStringOrNull = (v: unknown): v is string | null =>
    v === null || isString(v);
const isCount = (v: unknown): v is number =>
    typeof v === "number" && Number.isInteger(v) && v > 0;

export const PACK_TROUBLE =
    "We couldn't start the payment. Try again in a moment.";

function isPackOnSale(v: unknown): v is AccountPackOnSale {
    return (
        isRecord(v) &&
        isString(v.ref) &&
        isString(v.name) &&
        isStringOrNull(v.description) &&
        isCount(v.credits) &&
        isCount(v.validityDays) &&
        isString(v.price) &&
        isString(v.currency) &&
        // Classes or one-to-one sessions; an older API leaves it out.
        (v.kind === undefined ||
            v.kind === "CLASSES" ||
            v.kind === "ONE_TO_ONE")
    );
}

/** The packs on sale, or null when the answer isn't one. */
export function packsOnSaleResult(v: unknown): AccountPacksOnSale | null {
    if (
        isRecord(v) &&
        typeof v.payOnline === "boolean" &&
        Array.isArray(v.packs) &&
        v.packs.every(isPackOnSale)
    ) {
        // A website its business's plan paused (#800): nothing sold online.
        const paused = v.notTakingOrders === true;
        return {
            payOnline: v.payOnline && !paused,
            packs: v.packs,
            ...(paused ? { notTakingOrders: true as const } : {}),
        };
    }
    return null;
}

function isCheckout(v: unknown): v is AccountPackCheckout {
    if (!isRecord(v) || !isRecord(v.pack) || !isRecord(v.payment)) {
        return false;
    }
    const p = v.payment;
    return (
        isString(v.ref) &&
        isString(v.pack.name) &&
        isCount(v.pack.credits) &&
        isCount(v.pack.validityDays) &&
        isString(v.total) &&
        isString(v.currency) &&
        isString(p.provider) &&
        typeof p.amountCents === "number" &&
        isString(p.currency) &&
        isStringOrNull(p.providerIntentId) &&
        isStringOrNull(p.publicKey) &&
        isRecord(p.clientParams)
    );
}

const STATES = new Set(["paying", "bought", "closed"]);

function isAttempt(v: unknown): v is AccountPackAttempt {
    return (
        isRecord(v) &&
        isString(v.state) &&
        STATES.has(v.state) &&
        isRecord(v.pack) &&
        isString(v.pack.name) &&
        isCount(v.pack.credits) &&
        isStringOrNull(v.expiresAt)
    );
}

function refusal(status: number, body: unknown): string {
    const error = isRecord(body) && isRecord(body.error) ? body.error : null;
    const message =
        isString(error?.message) && error.message.trim() ? error.message : null;
    if ((status === 409 || status === 429) && message) return message;
    if (status === 401) return "Sign in again to buy a pack.";
    if (status === 404) {
        return "That pack isn't on sale any more. Refresh the page.";
    }
    return PACK_TROUBLE;
}

/** What starting to pay answered: the payment to open, or why not. */
export function packCheckoutAnswer(
    status: number,
    body: unknown,
): PackResult<AccountPackCheckout> {
    if (status >= 200 && status < 300) {
        return isCheckout(body)
            ? { ok: true, data: body }
            : { ok: false, message: PACK_TROUBLE };
    }
    return { ok: false, message: refusal(status, body) };
}

/** How a started payment stands, or why it can't be said. */
export function packAttemptAnswer(
    status: number,
    body: unknown,
): PackResult<AccountPackAttempt> {
    if (status >= 200 && status < 300 && isAttempt(body)) {
        return { ok: true, data: body };
    }
    return {
        ok: false,
        message:
            status === 404
                ? "That payment isn't on your account."
                : "We couldn't check the payment. Try again in a moment.",
    };
}
