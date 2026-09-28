import type {
    BookingDays,
    BookingWhere,
    BookPay,
    BookResult,
    HoldView,
} from "./model";
import { isBookingDays, isHoldView } from "./model";

/**
 * The booking page's calls, made from the visitor's browser straight to the
 * public API (U19) — the booking block's way — so the API's per-visitor rate
 * limit sees the visitor, not the site's server. Every answer is narrowed; a
 * wrong shape is a failure, never a crash.
 *
 * The booking itself is the exception (A9): it needs the customer's session,
 * which lives in a host-only cookie a browser script can't read, so the site's
 * server makes it (`SignedInBookRequest`, `BookSignedIn`) and answers through
 * {@link resultOf}.
 *
 * A failure carries words for the booker: the API's own message for a 4xx,
 * where it is written for visitors (the slot was just taken, the hold ran
 * out), and a plain line of ours for anything else — a 5xx body never
 * reaches the page.
 */

export type Result<T> =
    | { ok: true; value: T }
    | {
          ok: false;
          status: number;
          message: string;
          /**
           * The API's reason, where it gives one a page branches on: e.g.
           * "already-booked" (A9), "signed-out".
           */
          reason?: string;
      };

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
    return resultOf(res.status, body, narrow);
}

/**
 * An API answer as the page takes it: the narrowed value, or a failure in
 * words for the booker with the API's reason. Shared with the site's server
 * actions, which call the API for the page when the call needs its session
 * (A9, `apps/saroh.app/app/[domain]/book/actions.ts`).
 */
export function resultOf<T>(
    status: number,
    body: unknown,
    narrow: (v: unknown) => v is T,
): Result<T> {
    if (status >= 200 && status < 300) {
        return narrow(body)
            ? { ok: true, value: body }
            : { ok: false, status, message: TROUBLE };
    }
    const reason = reasonOf(body);
    return {
        ok: false,
        status,
        message: messageOf(status, body),
        ...(reason ? { reason } : {}),
    };
}

/** `error.details.reason` in the API's envelope, when it names one. */
function reasonOf(body: unknown): string | undefined {
    if (typeof body !== "object" || body === null) return undefined;
    const b = body as {
        details?: { reason?: unknown };
        error?: { details?: { reason?: unknown } };
    };
    const reason = b.error?.details?.reason ?? b.details?.reason;
    return typeof reason === "string" ? reason : undefined;
}

/** A failure from the page's own side: the site's server couldn't be reached. */
export const OFFLINE_RESULT = {
    ok: false as const,
    status: 0,
    message: OFFLINE,
};

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

/**
 * A booking a signed-in customer makes (A9). There is no email and no
 * phone: the booker is their account's. `bookerName` only names a contact
 * that has no name yet. The site's server sends it with the session
 * (`POST public/site-accounts/bookings`); the anonymous route the page used
 * before sign-in (U19) is called by nothing any more.
 *
 * No amount is ever sent: the price is the service's, on the server.
 */
export interface SignedInBookRequest {
    serviceId: string;
    startAt: string;
    bookerName?: string;
    idempotencyKey: string;
    staffId?: string;
    /** Pay it all now, only the deposit now (E8), or at the desk. */
    pay: BookPay;
    /** The answer to Where, for a service offered either way (E7). */
    locationType?: BookingWhere;
    /** "Anything we should know?" (E7), when they wrote something. */
    intakeNote?: string;
}

/** Book it, signed in: the site's server action that does. */
export type BookSignedIn = (
    request: SignedInBookRequest,
) => Promise<Result<BookResult>>;

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

/**
 * The non-secret handoff the provider's checkout opens with (E11,
 * `checkout.ts`): Razorpay's order id and the business's public key, or
 * Cashfree's payment session. Never a secret, never an amount of the page's.
 */
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
        (h.providerIntentId == null ||
            typeof h.providerIntentId === "string") &&
        (h.publicKey == null || typeof h.publicKey === "string") &&
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
