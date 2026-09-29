"use client";

/**
 * A checkout whose payment was made but not yet confirmed when its sheet
 * closed (round-2 G13): its order id, per site, in `localStorage`, so the
 * bag keeps asking how it stands — now, and on the next page — and empties
 * once the order is placed. Only the id is kept; how it stands is always
 * the server's answer. Every read and write is wrapped, as the bag's are: a
 * storage that refuses leaves this visit's memory only.
 */

const keyOf = (site: string) => `saroh.checkout.${site}`;

/** The id a checkout's order has: letters, digits, `_` and `-`. */
const ORDER_ID = /^[A-Za-z0-9_-]{1,64}$/;

export function readPendingCheckout(site: string): string | null {
    try {
        const raw = window.localStorage.getItem(keyOf(site));
        return raw && ORDER_ID.test(raw) ? raw : null;
    } catch {
        return null;
    }
}

export function writePendingCheckout(
    site: string,
    orderId: string | null,
): void {
    try {
        if (orderId) window.localStorage.setItem(keyOf(site), orderId);
        else window.localStorage.removeItem(keyOf(site));
    } catch {
        // Kept in the bag's state for this visit only.
    }
}
