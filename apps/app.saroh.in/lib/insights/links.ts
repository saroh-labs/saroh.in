/**
 * Where Insights' figures open (DEC-075, DEC-171): the rows each one was
 * counted from. Pure, so the words and the screens build the same links.
 */

/**
 * The paid orders placed between two days, inclusive, on the Orders list,
 * at one location when `storeId` is given. The list filters by the day an
 * order was placed, and Money counts the day it was paid; the two are the
 * same day for almost every order, and the links say "placed" or "orders
 * that week", never more.
 */
export function ordersHref(
    from: string,
    to: string,
    storeId?: string | null,
): string {
    const q = new URLSearchParams();
    if (storeId) q.set("storefront", storeId);
    q.set("date", "custom");
    q.set("from", from);
    q.set("to", to);
    q.set("payment", "paid");
    return `/commerce/orders?${q.toString()}`;
}

/** The paid invoices, on the Invoices list. */
export const PAID_INVOICES_HREF = "/billing/invoices?tab=paid";

/** A place's key, `location:<storeId>`, as its store id; null otherwise. */
export function placeStoreId(key: string): string | null {
    return key.startsWith("location:") ? key.slice("location:".length) : null;
}
