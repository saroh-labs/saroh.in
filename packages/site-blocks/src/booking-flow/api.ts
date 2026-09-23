import type { BookingDays, BookResult, HoldView } from "./model";
import { isBookingDays, isBookResult, isHoldView } from "./model";

/**
 * The booking page's calls, made from the visitor's browser straight to the
 * public API (U19) — the booking block's way — so the API's per-visitor rate
 * limit sees the visitor, not the site's server. Every answer is narrowed; a
 * wrong shape is a failure, never a crash.
 *
 * A failure carries words for the booker: the API's own message for a 4xx,
 * where it is written for visitors (the slot was just taken, the hold ran
 * out), and a plain line of ours for anything else — a 5xx body never
 * reaches the page.
 */

export type Result<T> =
    { ok: true; value: T } | { ok: false; status: number; message: string };

const TROUBLE = "Something went wrong on our side. Please try again.";
const OFFLINE =
    "We couldn't reach the booking system. Check your connection and try again.";

async function call<T>(
    url: string,
    init: RequestInit,
    narrow: (v: unknown) => v is T,
): Promise<Result<T>> {
    let res: Response;
    try {
        res = await fetch(url, {
            ...init,
            headers: {
                accept: "application/json",
                ...(init.body ? { "content-type": "application/json" } : {}),
            },
        });
    } catch {
        return { ok: false, status: 0, message: OFFLINE };
    }
    const body: unknown = await res.json().catch(() => null);
    if (res.ok) {
        return narrow(body)
            ? { ok: true, value: body }
            : { ok: false, status: res.status, message: TROUBLE };
    }
    return {
        ok: false,
        status: res.status,
        message: messageOf(res.status, body),
    };
}

/** The API's envelope is `{ error: { message } }`; older answers `{ message }`. */
function messageOf(status: number, body: unknown): string {
    if (status === 429) {
        return "That's a lot of tries at once. Wait a minute and try again.";
    }
    if (status >= 500 || typeof body !== "object" || body === null) {
        return TROUBLE;
    }
    const b = body as { message?: unknown; error?: { message?: unknown } };
    const message = b.error?.message ?? b.message;
    if (typeof message === "string" && message.trim()) return message;
    if (Array.isArray(message) && typeof message[0] === "string") {
        return message[0];
    }
    return TROUBLE;
}

export function fetchDays(
    apiUrl: string,
    serviceId: string,
): Promise<Result<BookingDays>> {
    return call(
        `${apiUrl}/public/services/${encodeURIComponent(serviceId)}/days`,
        { cache: "no-store" },
        isBookingDays,
    );
}

export interface BookRequest {
    startAt: string;
    bookerName: string;
    bookerEmail: string;
    bookerPhone?: string;
    idempotencyKey: string;
    staffId?: string;
    pay: "NOW" | "DESK";
}

/** Book it. No amount is ever sent: the price is the service's, on the server. */
export function book(
    apiUrl: string,
    serviceId: string,
    request: BookRequest,
): Promise<Result<BookResult>> {
    return call(
        `${apiUrl}/public/services/${encodeURIComponent(serviceId)}/book`,
        { method: "POST", body: JSON.stringify(request) },
        isBookResult,
    );
}

export function fetchHold(
    apiUrl: string,
    token: string,
): Promise<Result<HoldView>> {
    return call(
        `${apiUrl}/public/services/holds/${encodeURIComponent(token)}`,
        { cache: "no-store", referrerPolicy: "no-referrer" },
        isHoldView,
    );
}

export function releaseHold(
    apiUrl: string,
    token: string,
): Promise<Result<HoldView>> {
    return call(
        `${apiUrl}/public/services/holds/${encodeURIComponent(token)}/release`,
        { method: "POST", referrerPolicy: "no-referrer" },
        isHoldView,
    );
}

/** The non-secret handoff the provider's checkout opens with. */
export interface PaymentHandoff {
    provider: string;
    amountCents: number;
    currency: string;
    providerIntentId: string | null;
    publicKey: string | null;
    clientParams: Record<string, unknown>;
}

function isHandoff(v: unknown): v is PaymentHandoff {
    if (typeof v !== "object" || v === null) return false;
    const h = v as Record<string, unknown>;
    return (
        typeof h.provider === "string" &&
        typeof h.amountCents === "number" &&
        typeof h.currency === "string" &&
        typeof h.clientParams === "object" &&
        h.clientParams !== null
    );
}

/**
 * Start paying the hold's invoice through the invoice payment path. The
 * body names only an idempotency key; the amount is the invoice's.
 */
export async function startPayment(
    apiUrl: string,
    token: string,
    idempotencyKey: string,
): Promise<Result<PaymentHandoff>> {
    const result = await call(
        `${apiUrl}/public/invoices/${encodeURIComponent(token)}/payment-intent`,
        {
            method: "POST",
            body: JSON.stringify({ idempotencyKey }),
            referrerPolicy: "no-referrer",
        },
        isHandoff,
    );
    if (result.ok || result.status === 409 || result.status === 429) {
        return result;
    }
    // Anything else — no provider that works, a provider refusing — is the
    // business not taking money online right now, whatever the cause.
    return {
        ok: false,
        status: result.status,
        message: "The business can't take payment online right now.",
    };
}
