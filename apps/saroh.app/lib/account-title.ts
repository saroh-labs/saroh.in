import type { Metadata } from "next";

import { titled } from "./site-meta";

/**
 * What an account page calls itself in the browser's tab and in a pasted
 * link (DEC-142): the page, then whose site it is — "Your orders · Rye &
 * Co." — and never the customer. Signed out, every account page is "Sign
 * in · ‹Business›", since that is what it shows.
 *
 * Pure, so each state's title is tested without a server. The account's
 * layout turns {@link accountMetadata} into the title template its pages
 * fill; a page gives only its own words ({@link accountPageTitle}).
 */

/** The account's pages, by what each is called. */
export const ACCOUNT_PAGE_TITLES = {
    home: "Your account",
    orders: "Your orders",
    bookings: "Your bookings",
    plan: "Your plan",
    messages: "Messages",
    me: "Your details",
} as const;

/** How a read of the signed-in customer came back, as far as a title cares. */
export type AccountTitleState =
    | { ok: true }
    | { ok: false; reason: "signed-out" | "missing" | "unavailable" };

/**
 * A page's own words for its title. Signed out, "Sign in": the page draws
 * the sign-in prompt, whatever was asked for. A read that failed keeps the
 * page's name: nobody has been signed out.
 */
export function accountPageTitle(
    page: string,
    state: AccountTitleState,
): string {
    return !state.ok && state.reason === "signed-out" ? "Sign in" : page;
}

/** "Receipt RC-0042", or "Receipt" when it couldn't be read. */
export function receiptTitle(number: string | null | undefined): string {
    const n = number?.trim();
    return n ? `Receipt ${n}` : "Receipt";
}

/** "Order #1019", or "Your order" when it couldn't be read. */
export function orderPageTitle(number: string | null | undefined): string {
    const n = number?.trim();
    return n ? `Order #${n}` : "Your order";
}

/**
 * The account layout's metadata: the title template every account page
 * fills, never indexed, and a share card that names the business alone.
 *
 * Without the `openGraph` and `twitter` here, a private link pasted into a
 * chat would wear the home page's share card (its picture and its
 * description), inherited from the site's layout. This one carries the
 * business's name and nothing else, and says nothing about the page.
 */
export function accountMetadata(business: string): Metadata {
    const name = business.trim();
    return {
        title: {
            // "%s · Rye & Co.": what a page's own title is set into.
            template: titled("%s", name),
            default: titled(ACCOUNT_PAGE_TITLES.home, name),
        },
        description: null,
        robots: { index: false, follow: false },
        openGraph: { title: name, siteName: name, images: [] },
        twitter: { card: "summary", title: name, images: [] },
    };
}
