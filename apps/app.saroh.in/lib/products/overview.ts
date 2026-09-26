import { getJson, orgBase } from "@/lib/api/http";
import type { ProductDetail } from "@/lib/products/service";
import { getProduct } from "@/lib/products/service";

import type { ProductOverview } from "./overview-rules";

/**
 * The product page's one read (`GET …/products/:id/overview`, #461). Server
 * only; the shapes and display rules live in `overview-rules.ts`.
 */

export type * from "./overview-rules";

/**
 * The product page as a storefront sees it (#531): the one named in the
 * address, or the first that sells it. Null when it is not this business's.
 */
export async function getProductOverview(
    storeId: string | null | undefined,
    productId: string,
): Promise<ProductOverview | null> {
    const base = await orgBase();
    if (!base) return null;
    const q = storeId ? `?storefront=${encodeURIComponent(storeId)}` : "";
    return getJson<ProductOverview>(
        `${base}/products/${encodeURIComponent(productId)}/overview${q}`,
    );
}

/**
 * A read that names a storefront no longer the business's — a link from an
 * older screen, or a storefront since closed — still opens the product, at
 * the first storefront that sells it.
 */
export async function withStorefrontFallback<T>(
    storefront: string | undefined,
    read: (storeId: string | undefined) => Promise<T | null>,
): Promise<T | null> {
    const named = await read(storefront);
    if (named !== null || !storefront) return named;
    return read(undefined);
}

/** The product for the editor, with the same fallback. */
export function getProductAt(
    storefront: string | undefined,
    productId: string,
): Promise<ProductDetail | null> {
    return withStorefrontFallback(storefront, (storeId) =>
        getProduct(storeId, productId),
    );
}
