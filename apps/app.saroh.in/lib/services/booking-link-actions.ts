"use server";

import type { CrmResult } from "@/lib/api/http";
import { mutate } from "@/lib/api/http";

import type { BookingLinkView } from "./booking-link";
import { decodeBookingLink } from "./booking-link";

/**
 * The booking page's two writes (DEC-175). Each answers the read as it is
 * now, so the row and its sheet draw what is true without a second trip.
 */

/** The answer a write gave, read as the row reads it. */
function asView(
    result: CrmResult<unknown>,
    fallback: string,
): CrmResult<BookingLinkView> {
    if (!result.ok) return result;
    const view = decodeBookingLink(result.data);
    return view ? { ok: true, data: view } : { ok: false, error: fallback };
}

/**
 * Publish booking page: publishes the business's website, which the
 * booking page is on. Website › Publish's rules hold (who may, "Publishing
 * needs approval"); a refusal comes back in the API's words.
 */
export async function publishBookingPage(): Promise<
    CrmResult<BookingLinkView>
> {
    const fallback = "Couldn't publish your booking page. Try again.";
    return asView(
        await mutate("/booking-page/publish", "POST", {}, fallback),
        fallback,
    );
}

/** Make my booking page: the starter site on the business's address. */
export async function makeBookingPage(): Promise<CrmResult<BookingLinkView>> {
    const fallback = "Couldn't make your booking page. Try again.";
    return asView(
        await mutate("/booking-page", "POST", {}, fallback),
        fallback,
    );
}
