import { apiFetch, getJson, orgBase } from "@/lib/api/http";

import { toFailure } from "@/lib/api/failure";
import type { ProductListingView } from "./listing-changes";
import type { Result } from "./service";
import { resultField } from "./service";

/**
 * Where a catalogue product is sold (#510, #531):
 * `organizations/:org/products/:id/listings`. Reading needs `store:read`;
 * listing, choosing variants and unlisting need `store:write`, and the API
 * decides. Server-only.
 */

export type { ProductListingView } from "./listing-changes";

async function listingsPath(productId: string): Promise<string | null> {
    const base = await orgBase();
    if (!base) return null;
    return `${base}/products/${encodeURIComponent(productId)}/listings`;
}

/** The product at every open storefront; null when it can't be read. */
export async function getProductListings(
    productId: string,
): Promise<ProductListingView[] | null> {
    const path = await listingsPath(productId);
    if (!path) return null;
    return getJson<ProductListingView[]>(path);
}

async function send(
    path: string | null,
    method: "PUT" | "DELETE",
    body?: unknown,
): Promise<Result<ProductListingView>> {
    if (!path)
        return { ok: false, error: "Pick a business first, then try again." };
    const res = await apiFetch(path, {
        method,
        ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const data: unknown = await res.json().catch(() => null);
    if (res.ok) return { ok: true, data: data as ProductListingView };
    const failure = toFailure(data, "Something went wrong");
    return { ...failure, field: resultField(failure.field) };
}

/** Sell it at `storeId`, those variants there. */
export async function listProductAt(
    productId: string,
    storeId: string,
    variantIds: string[],
) {
    const path = await listingsPath(productId);
    return send(path && `${path}/${encodeURIComponent(storeId)}`, "PUT", {
        variantIds,
    });
}

/** Stop selling it at `storeId`; the shelf there keeps its stock. */
export async function unlistProductAt(productId: string, storeId: string) {
    const path = await listingsPath(productId);
    return send(path && `${path}/${encodeURIComponent(storeId)}`, "DELETE");
}
