import { cache } from "react";

import { shopFetch } from "./catalogue";
import { dontCachePage } from "./page-cache/site-rules";
import type { CheckoutOptions } from "./shop-checkout-shape";
import { isCheckoutOptions } from "./shop-checkout-shape";

export type { CheckoutOptions } from "./shop-checkout-shape";

/**
 * Whether this site takes an order now (round-2 G13), read server to
 * server and never cached:
 *
 *   GET /public/sites/:siteId/checkout/options
 *
 * Yes only when the shop is open (the API's `SITE_SHOP` flag, Commerce on,
 * a sells-from storefront), the storefront isn't paused, and the order can
 * be paid: online through a provider, or at the handover ("Pay when you
 * collect", "Pay on delivery" — always on a plan without online payments).
 * The header's bag and the product page's Add to bag follow it; otherwise
 * the product page offers "Ask about ordering".
 * Null when the API can't say, which the page treats as no bag; unless that
 * is the shop being closed (a 404), that page isn't kept.
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
    if (res?.status === 404) return null;
    const body: unknown = res?.ok ? await res.json().catch(() => null) : null;
    if (isCheckoutOptions(body)) return body;
    dontCachePage("checkout options unavailable");
    return null;
});
