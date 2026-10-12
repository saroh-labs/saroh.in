import type { AccountTab, AccountTabKey } from "./model";

/**
 * Where the account's pages live, and which tab a path is on. A plain
 * module (no "use client"), so the site's server pages, the tab bar and the
 * header read one list: a constant exported from a client file reaches a
 * server component as a reference, not as its value.
 */

export const ACCOUNT_TAB_HREF: Record<AccountTabKey, string> = {
    home: "/account",
    bookings: "/account/bookings",
    orders: "/account/orders",
    plan: "/account/plan",
    messages: "/account/messages",
    me: "/account/me",
};

export const ORDERS_HREF = "/account/orders";

/** Where Track for an order opens as a sheet over the Orders tab. */
export function trackHref(ref: string): string {
    return `${ORDERS_HREF}?order=${encodeURIComponent(ref)}`;
}

/** Which tab a path is on: the longest tab address it starts with. */
export function currentTab(
    pathname: string | null,
    tabs: AccountTab[],
): AccountTabKey | null {
    if (!pathname) return null;
    let best: AccountTabKey | null = null;
    let length = -1;
    for (const tab of tabs) {
        const href = ACCOUNT_TAB_HREF[tab.key];
        const on =
            pathname === href ||
            (href !== "/account" && pathname.startsWith(`${href}/`));
        if (on && href.length > length) {
            best = tab.key;
            length = href.length;
        }
    }
    return best;
}
