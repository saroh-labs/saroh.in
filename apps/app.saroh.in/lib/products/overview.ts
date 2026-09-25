import { getJson } from "@/lib/api/http";
import { getProduct } from "@/lib/products/service";
import type { Store } from "@/lib/stores/service";

import type { ProductOverview } from "./overview-rules";

/**
 * The product page's one read (`GET …/products/:id/overview`, #461). Server
 * only; the shapes and display rules live in `overview-rules.ts`.
 */

export type * from "./overview-rules";

export function getProductOverview(
    storeId: string,
    productId: string,
): Promise<ProductOverview | null> {
    return getJson<ProductOverview>(
        `/stores/${encodeURIComponent(storeId)}/products/${encodeURIComponent(productId)}/overview`,
    );
}

/**
 * Which storefront a product lives in. The address names it (`?storefront=`);
 * a link without it — typed, or shared from an older screen — is still
 * honoured by asking each storefront until one has the product.
 */
export async function findProductStore(
    stores: Store[],
    productId: string,
    storefront: string | undefined,
): Promise<Store | null> {
    const named = stores.find((s) => s.id === storefront);
    if (named && (await getProduct(named.id, productId).catch(() => null))) {
        return named;
    }
    const others = stores.filter((s) => s !== named);
    const hits = await Promise.all(
        others.map((s) => getProduct(s.id, productId).catch(() => null)),
    );
    const i = hits.findIndex(Boolean);
    return i >= 0 ? (others[i] ?? null) : null;
}
