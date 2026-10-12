import type { Metadata } from "next";
import { cache } from "react";

import { getAccount } from "./account-area";
import { accountPageTitle } from "./account-title";
import { getBookingPage } from "./booking-page";
import { getSiteForHost } from "./publication";
import { getCheckoutOptions } from "./shop-checkout";

/**
 * What the account's pages ask about the site they are on (DEC-142), once
 * per request: the layout, a page and its title all need the same answers.
 */

/** The site this host serves, read once per request for the account. */
export const getAccountSite = cache((domain: string) => getSiteForHost(domain));

/**
 * A page's own title words: its name, or "Sign in" when nobody is signed
 * in (the page then draws the sign-in prompt). The account layout's
 * template adds the business ("Your orders · ‹Business›").
 */
export async function accountTitle(page: string): Promise<Metadata> {
    return { title: accountPageTitle(page, await getAccount()) };
}

/**
 * Where Home's offers lead: the booking page when it would take a booking,
 * the shop while it takes orders — the header's own two questions
 * (`header-action.ts`), so Home never offers a door the site has shut.
 * Each null when it isn't there, or couldn't be asked.
 */
export async function accountDoors(
    siteId: string | null | undefined,
): Promise<{ bookHref: string | null; shopHref: string | null }> {
    if (!siteId) return { bookHref: null, shopHref: null };
    const [booking, checkout] = await Promise.all([
        getBookingPage(siteId).catch(() => null),
        getCheckoutOptions(siteId).catch(() => null),
    ]);
    return {
        bookHref:
            booking?.ok && booking.page.open && booking.page.services.length > 0
                ? "/book"
                : null,
        shopHref: checkout?.canOrder ? "/shop" : null,
    };
}
