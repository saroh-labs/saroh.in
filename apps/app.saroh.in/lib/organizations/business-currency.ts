import { cache } from "react";

import { businessCurrencyOf } from "@/lib/services/editor-data";
import { listServices } from "@/lib/services/service";
import { getStorefront, listStorefronts } from "@/lib/stores/storefronts";

/** What a business with nothing priced yet is taken to sell in. */
export const DEFAULT_CURRENCY = "INR";

/**
 * The business's currency, for an amount that records none of its own: a
 * lead's Worth (owner, 11 Oct 2026).
 *
 * A business sells in one currency at every location (DEC-030), and the
 * business itself keeps no currency column, so this reads it the way the
 * API's `businessCurrency` does: a location's, else the one its services
 * are priced in, else the default every new price starts from. A read that
 * fails, or that this person may not make, falls through to the next: the
 * amount is still drawn, in the likeliest currency, never unsigned.
 *
 * Server-only (it reads through the API client). One read per request.
 */
export const readBusinessCurrency = cache(async (): Promise<string> => {
    const locations = await listStorefronts().catch(() => []);
    const first = locations.at(0);
    if (first) {
        const settings = await getStorefront(first.id).catch(() => null);
        if (settings?.currency) return settings.currency;
    }
    const services = await listServices().catch(() => []);
    return services.some((s) => s.currency)
        ? businessCurrencyOf(services)
        : DEFAULT_CURRENCY;
});
