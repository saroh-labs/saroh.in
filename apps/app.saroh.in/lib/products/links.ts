/**
 * Where a product is worked on. Products are stored per storefront, so the
 * storefront travels in the address: the editor needs it to read and write,
 * and a link someone shares must still open the right product.
 */
export function productHref(storeId: string, productId: string): string {
    return `/commerce/products/${encodeURIComponent(productId)}?storefront=${encodeURIComponent(storeId)}`;
}

/** A new product, made at one storefront. */
export function newProductHref(storeId?: string): string {
    return storeId
        ? `/commerce/products/new?storefront=${encodeURIComponent(storeId)}`
        : "/commerce/products/new";
}
