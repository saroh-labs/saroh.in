"use server";

import type {
    BookingResult,
    BookResult,
    SignedInBookRequest,
} from "@saroh/site-blocks";
import { isBookResult, OFFLINE_RESULT, resultOf } from "@saroh/site-blocks";

import { accountBookingBody } from "@/lib/account-booking";
import { accountFetch } from "@/lib/customer-session";
import { siteOrigin } from "@/lib/origin";

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

export async function bookSignedIn(
    request: SignedInBookRequest,
): Promise<BookingResult<BookResult>> {
    if (!(await siteOrigin())) {
        return { ok: false, status: 403, message: TROUBLE };
    }
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
