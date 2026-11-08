import type { PaymentReturnView } from "@saroh/site-blocks";
import { paymentReturnOf } from "@saroh/site-blocks";

import { serverApiUrl, serverReadSignal } from "./api-url";
import { withRelay } from "./relay-headers";

/**
 * The `/paid` page's two calls after Stripe's hosted Checkout (plan
 * 2026-11-07-002, U7/U8), made from this server with the signed visitor
 * relay, never from the browser:
 *
 *   GET  ${API_URL}/public/payments/checkout/:sessionId
 *   POST ${API_URL}/public/payments/checkout/cancel   { intent, token }
 *
 * Both answer the buyer's view of the payment. The session id and the
 * cancel token are credentials: checked by shape here, never logged.
 */

const API_URL = serverApiUrl();

/** A Stripe Checkout Session id, as the API takes it. */
const SESSION_ID = /^cs_[A-Za-z0-9_]{1,250}$/;
/** Saroh's intent id and the cancel token, as the cancel URL carries them. */
const INTENT_ID = /^[A-Za-z0-9_-]{1,100}$/;
const CANCEL_TOKEN = /^[A-Za-z0-9_-]{1,128}$/;

/** The page's address, read: a session to show, or a cancel to make. */
export type PaidQuery =
    | { kind: "session"; sessionId: string }
    | { kind: "cancel"; intent: string; token: string };

const one = (v: string | string[] | undefined): string | null =>
    typeof v === "string" ? v : null;

/** What the address asks for, or null (the page is then a 404). */
export function paidQueryOf(query: {
    session_id?: string | string[];
    cancelled?: string | string[];
    intent?: string | string[];
    token?: string | string[];
}): PaidQuery | null {
    const intent = one(query.intent);
    const token = one(query.token);
    if (one(query.cancelled) === "1") {
        return intent &&
            token &&
            INTENT_ID.test(intent) &&
            CANCEL_TOKEN.test(token)
            ? { kind: "cancel", intent, token }
            : null;
    }
    const sessionId = one(query.session_id);
    return sessionId && SESSION_ID.test(sessionId)
        ? { kind: "session", sessionId }
        : null;
}

/**
 * The payment of a session. "missing": the API knows no such session (the
 * page is a 404); null: it couldn't say just now.
 */
export async function readCheckoutSession(
    sessionId: string,
): Promise<PaymentReturnView | "missing" | null> {
    if (!SESSION_ID.test(sessionId)) return "missing";
    return answerOf(
        `${API_URL}/public/payments/checkout/${encodeURIComponent(sessionId)}`,
        { method: "GET", signal: serverReadSignal() },
    );
}

/**
 * Stripe's Back link: the session is expired and a booking hold lets its
 * place go (KTD-8). Answers as the read does.
 */
export async function cancelCheckout(
    intent: string,
    token: string,
): Promise<PaymentReturnView | "missing" | null> {
    return answerOf(`${API_URL}/public/payments/checkout/cancel`, {
        method: "POST",
        body: JSON.stringify({ intent, token }),
    });
}

/**
 * What the page shows when the first read couldn't say: confirming, under
 * the business's name, until its own ask again answers.
 */
export function provisionalView(businessName: string): PaymentReturnView {
    return {
        status: "open",
        kind: "order",
        businessName,
        amountCents: 0,
        currency: "USD",
        booking: null,
        returnPath: null,
    };
}

async function answerOf(
    url: string,
    init: RequestInit,
): Promise<PaymentReturnView | "missing" | null> {
    let res: Response;
    try {
        res = await fetch(url, {
            ...init,
            cache: "no-store",
            headers: await withRelay({
                accept: "application/json",
                ...(init.body ? { "content-type": "application/json" } : {}),
            }),
        });
    } catch {
        return null;
    }
    if (res.status === 404) return "missing";
    if (!res.ok) return null;
    return paymentReturnOf(await res.json().catch(() => null));
}
