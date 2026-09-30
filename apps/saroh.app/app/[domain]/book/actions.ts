"use server";

import type {
    BookingResult,
    BookResult,
    CreditAnswer,
    SignedInBookRequest,
    WaitlistJoined,
    WaitlistPlaces,
} from "@saroh/site-blocks";
import {
    isBookResult,
    isCreditAnswer,
    isWaitlistJoined,
    isWaitlistLeft,
    isWaitlistPlaces,
    OFFLINE_RESULT,
    resultOf,
    TEST_RELEASE_MESSAGE,
    TEST_RELEASE_REASON,
} from "@saroh/site-blocks";

import { accountBookingBody } from "@/lib/account-booking";
import { accountFetch } from "@/lib/customer-session";
import { siteOrigin } from "@/lib/origin";
import { testMode } from "@/lib/test-release";

/**
 * Booking on a merchant's site, signed in (round-2 plan A, A9; ADR-011).
 * Sign-in is always on, so this is how every booking page books: through
 * this server, with the customer's session from its host-only cookie and
 * the signed relay, to `POST public/site-accounts/bookings`. The booker is
 * the account's; the page never sends an email or a phone.
 *
 * It answers the page in the page's own terms (`resultOf`): the booking, or
 * words for the customer with the API's reason ("already-booked",
 * "signed-out"). Checks `Origin` first, like every action here.
 */

const TROUBLE = "Something went wrong on our side. Please try again.";

/**
 * A test release (DEC-071, T6): nothing is booked, held or joined, and
 * nothing is sent. The page shows its stop for this reason.
 */
const TEST_REFUSAL = {
    ok: false as const,
    status: 409,
    message: TEST_RELEASE_MESSAGE,
    reason: TEST_RELEASE_REASON,
};

export async function bookSignedIn(
    request: SignedInBookRequest,
): Promise<BookingResult<BookResult>> {
    if (!(await siteOrigin())) {
        return { ok: false, status: 403, message: TROUBLE };
    }
    if (await testMode()) return TEST_REFUSAL;
    const body = accountBookingBody(request);
    if (!body) return { ok: false, status: 400, message: TROUBLE };
    const call = await accountFetch("bookings", { method: "POST", body });
    // No session cookie at all: sign in first.
    if (!call) {
        return {
            ok: false,
            status: 401,
            message: "Sign in to book.",
            reason: "signed-out",
        };
    }
    if (!call.ok) return OFFLINE_RESULT;
    return resultOf(
        call.res.status,
        await call.res.json().catch(() => null),
        isBookResult,
    );
}

const MAX_ID = 64;

/**
 * The class credit the signed-in customer could pay with (round-2 A10), for
 * the pay step: `GET public/site-accounts/bookings/credit` with the session.
 * The API decides what is on offer; the page books with what this returns.
 * Without a session there is no credit to offer — not an error. Its
 * argument comes from the browser, so it is read as unknown.
 */
export async function creditFor(
    request: unknown,
): Promise<BookingResult<CreditAnswer>> {
    if (!(await siteOrigin())) {
        return { ok: false, status: 403, message: TROUBLE };
    }
    const r = (request && typeof request === "object" ? request : {}) as Record<
        string,
        unknown
    >;
    const serviceId = typeof r.serviceId === "string" ? r.serviceId.trim() : "";
    const startAt = typeof r.startAt === "string" ? r.startAt.trim() : "";
    if (
        !serviceId ||
        serviceId.length > MAX_ID ||
        !startAt ||
        Number.isNaN(Date.parse(startAt))
    ) {
        return { ok: false, status: 400, message: TROUBLE };
    }
    const query = new URLSearchParams({ serviceId, startAt });
    const call = await accountFetch(`bookings/credit?${query}`);
    if (!call) return { ok: true, value: { credit: null } };
    if (!call.ok) return OFFLINE_RESULT;
    return resultOf(
        call.res.status,
        await call.res.json().catch(() => null),
        isCreditAnswer,
    );
}

// ── A full class's waitlist (round-2 A12) ────────────────────────────────

/** A session named by the browser: a service id and an instant. */
function sessionOf(
    request: unknown,
): { serviceId: string; startAt: string } | null {
    const r = (request && typeof request === "object" ? request : {}) as Record<
        string,
        unknown
    >;
    const serviceId = typeof r.serviceId === "string" ? r.serviceId.trim() : "";
    const startAt = typeof r.startAt === "string" ? r.startAt.trim() : "";
    if (
        !serviceId ||
        serviceId.length > MAX_ID ||
        !startAt ||
        Number.isNaN(Date.parse(startAt))
    ) {
        return null;
    }
    return { serviceId, startAt };
}

/**
 * The signed-in customer's places in line for one service's classes:
 * `GET public/site-accounts/waitlist`. Without a session they hold none —
 * not an error.
 */
export async function waitlistFor(
    request: unknown,
): Promise<BookingResult<WaitlistPlaces>> {
    if (!(await siteOrigin())) {
        return { ok: false, status: 403, message: TROUBLE };
    }
    const r = (request && typeof request === "object" ? request : {}) as Record<
        string,
        unknown
    >;
    const serviceId = typeof r.serviceId === "string" ? r.serviceId.trim() : "";
    if (!serviceId || serviceId.length > MAX_ID) {
        return { ok: false, status: 400, message: TROUBLE };
    }
    const query = new URLSearchParams({ serviceId });
    const call = await accountFetch(`waitlist?${query}`);
    if (!call) return { ok: true, value: { places: [] } };
    if (!call.ok) return OFFLINE_RESULT;
    return resultOf(
        call.res.status,
        await call.res.json().catch(() => null),
        isWaitlistPlaces,
    );
}

/** Join a full class's line: `POST public/site-accounts/waitlist`. */
export async function joinWaitlist(
    request: unknown,
): Promise<BookingResult<WaitlistJoined>> {
    if (!(await siteOrigin())) {
        return { ok: false, status: 403, message: TROUBLE };
    }
    if (await testMode()) return TEST_REFUSAL;
    const body = sessionOf(request);
    if (!body) return { ok: false, status: 400, message: TROUBLE };
    const call = await accountFetch("waitlist", { method: "POST", body });
    if (!call) {
        return {
            ok: false,
            status: 401,
            message: "Sign in to join the waitlist.",
            reason: "signed-out",
        };
    }
    if (!call.ok) return OFFLINE_RESULT;
    return resultOf(
        call.res.status,
        await call.res.json().catch(() => null),
        isWaitlistJoined,
    );
}

/** Leave it: `POST public/site-accounts/waitlist/leave`. */
export async function leaveWaitlist(
    request: unknown,
): Promise<BookingResult<{ left: boolean }>> {
    if (!(await siteOrigin())) {
        return { ok: false, status: 403, message: TROUBLE };
    }
    if (await testMode()) return TEST_REFUSAL;
    const body = sessionOf(request);
    if (!body) return { ok: false, status: 400, message: TROUBLE };
    const call = await accountFetch("waitlist/leave", { method: "POST", body });
    if (!call) {
        return {
            ok: false,
            status: 401,
            message: "Sign in again to leave the waitlist.",
            reason: "signed-out",
        };
    }
    if (!call.ok) return OFFLINE_RESULT;
    return resultOf(
        call.res.status,
        await call.res.json().catch(() => null),
        isWaitlistLeft,
    );
}
