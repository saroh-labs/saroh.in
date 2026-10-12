import type { Metadata } from "next";

import type { SignInOptions } from "@saroh/site-blocks";
import { AccountBookingPage } from "@saroh/site-blocks";

import { getAccount, getBooking } from "@/lib/account-area";
import { accountPageTitle } from "@/lib/account-title";
import { getSignInOptions } from "@/lib/sign-in";

import {
    bookVisit,
    cancelBooking,
    moveBooking,
    moveTimes,
    visitTimes,
} from "../actions";

/**
 * One booking on a page of its own (DEC-142), so an email can link
 * straight to it: `/account/bookings/‹ref›`. What it is, when and with
 * whom, and Move and Cancel in the Bookings tab's own sheets, opened here.
 *
 * The layout has already checked the switch and the session: signed out,
 * it asks the visitor to sign in and the sheet leaves them here, on the
 * booking. Another customer's booking, or one that isn't there, is said as
 * "not found" inside the account, with the way back — the API answers 404
 * for both, and never says which.
 */

/** A booking's ref is an opaque id; anything else isn't asked for. */
function refOf(value: string): string | null {
    const ref = value.trim();
    return ref && ref.length <= 64 ? ref : null;
}

export async function generateMetadata(): Promise<Metadata> {
    // "Your booking · ‹Business›"; signed out, "Sign in". Never what was
    // booked or when: a title is seen over a shoulder.
    return { title: accountPageTitle("Your booking", await getAccount()) };
}

export default async function AccountBookingRoute({
    params,
}: {
    params: Promise<{ bookingRef: string }>;
}) {
    const [{ bookingRef }, lookup] = await Promise.all([params, getAccount()]);
    if (!lookup.ok) return null; // The layout drew the signed-out state.
    const { account } = lookup;
    const ref = refOf(bookingRef);
    const [booking, options] = await Promise.all([
        ref
            ? getBooking(ref)
            : Promise.resolve({ ok: false, reason: "missing" } as const),
        // The business's public phone, for "Call"; never blocks the page.
        getSignInOptions().catch((): SignInOptions | null => null),
    ]);
    return (
        <AccountBookingPage
            lookup={booking}
            businessName={account.businessName}
            phone={options?.phone ?? null}
            api={{
                moveTimes,
                move: moveBooking,
                cancel: cancelBooking,
                visitTimes,
                bookVisit,
            }}
            bookingsTab={account.tabs.some((t) => t.key === "bookings")}
            now={new Date().toISOString()}
        />
    );
}
