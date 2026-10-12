import { ApiError } from "@/lib/api/errors";
import { apiFetch, orgBase } from "@/lib/api/http";

import type { PriceHistoryPage } from "./words";

/**
 * An item's price history, newest first, from the API's
 * `/organizations/:id/{products|services|courses}/:itemId/price-history`
 * (the permission each item's own page already asks for). Server-only.
 *
 * A read that fails throws. The section is one part of a page whose rest
 * has arrived, so its page reads it with `.catch(() => null)` and the
 * section says it couldn't load, with Try again. That is not the same as
 * an item with no history yet: an empty list, and nothing is drawn.
 */

export type PricedItems = "products" | "services" | "courses";

/** As many as the section draws; older ones are said, not drawn. */
export const PRICE_HISTORY_LIMIT = 50;

export async function readPriceHistory(
    items: PricedItems,
    id: string,
): Promise<PriceHistoryPage> {
    const base = await orgBase();
    if (!base) return { entries: [], nextCursor: null };
    const path = `${base}/${items}/${encodeURIComponent(id)}/price-history?limit=${PRICE_HISTORY_LIMIT}`;
    const res = await apiFetch(path);
    if (!res.ok) throw new ApiError(res.status, `GET ${path}`);
    const body = (await res.json()) as Partial<PriceHistoryPage> | null;
    return {
        entries: Array.isArray(body?.entries) ? body.entries : [],
        nextCursor: body?.nextCursor ?? null,
    };
}
