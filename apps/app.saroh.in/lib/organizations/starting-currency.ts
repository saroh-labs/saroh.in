import { cache } from "react";

import { activeOrganizationOnce } from "@/lib/organizations/service";

/** What an Indian business with nothing priced yet is taken to sell in. */
export const DEFAULT_CURRENCY = "INR";

/**
 * What a business with nothing priced yet sells in: what it chose at setup, on
 * Global (DEC-204), else {@link DEFAULT_CURRENCY}. Server-only.
 */
export const startingCurrency = cache(
    async (): Promise<string> =>
        (await activeOrganizationOnce())?.currency ?? DEFAULT_CURRENCY,
);
