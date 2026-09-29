import type { OrderConfirmationLookup } from "@saroh/site-blocks";

import { accountSitesFetch } from "./customer-session";
import { confirmationLookup, isOrderRef } from "./shop-confirmation-shape";

/**
 * The order confirmation page's read (round-2 P4), server to server with
 * the signed relay and the customer's session from its host-only cookie:
 *
 *   GET /public/sites/:siteId/checkout/orders/:orderId/confirmation
 *
 * Only the account that placed the order reads it, and only once it is
 * placed; every other answer is "missing". No session cookie at all is
 * "signed-out". Never cached.
 */
export async function getOrderConfirmation(
    siteId: string,
    orderId: string,
): Promise<OrderConfirmationLookup> {
    if (!isOrderRef(orderId)) return { ok: false, reason: "missing" };
    const call = await accountSitesFetch(
        `${encodeURIComponent(siteId)}/checkout/orders/${orderId}/confirmation`,
    );
    if (!call) return { ok: false, reason: "signed-out" };
    if (!call.ok) return { ok: false, reason: "unavailable" };
    return confirmationLookup(
        call.res.status,
        await call.res.json().catch(() => null),
    );
}
