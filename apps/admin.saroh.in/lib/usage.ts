import { getJson } from "./control-plane";
import type { StorageOrder, StorageUsagePage } from "./usage-words";

/**
 * What each business uses of the instance, as the console reads it (#798).
 * Server-only: the read forwards the operator's session to the API, which
 * decides what they may see.
 */
export function listStorageUsage(query: {
    order: StorageOrder;
    page: number;
}): Promise<StorageUsagePage | null> {
    const search = new URLSearchParams({
        order: query.order,
        page: String(query.page),
    });
    return getJson<StorageUsagePage>(`/usage/storage?${search.toString()}`);
}
