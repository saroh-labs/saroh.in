import { cache } from "react";

import { shopFetch } from "./catalogue";
import type { CheckoutOptions } from "./shop-checkout-shape";
import { isCheckoutOptions } from "./shop-checkout-shape";

export type { CheckoutOptions } from "./shop-checkout-shape";

/**
 * Whether this site takes an online order now (round-2 G13), read server to
 * server and never cached:
 *
 *   GET /public/sites/:siteId/checkout/options
 *
 * Yes only when the shop is open (the API's `SITE_SHOP` flag, Commerce on,
 * a sells-from storefront), a payment provider can take the payment, and
 * the storefront isn't paused. The header's bag and the product page's Add
 * to bag follow it; otherwise the product page offers "Ask about ordering".
 * Null when the API can't say, which the page treats as no bag.
 *
 * `cache` shares one read within a request: the layout's header and the
 * product page ask the same question.
 */
export const getCheckoutOptions = cache(async function getCheckoutOptions(
    siteId: string,
): Promise<CheckoutOptions | null> {
    const res = await shopFetch(
        `${encodeURIComponent(siteId)}/checkout/options`,
    );
    if (!res?.ok) return null;
    const body: unknown = await res.json().catch(() => null);
    return isCheckoutOptions(body) ? body : null;
});
