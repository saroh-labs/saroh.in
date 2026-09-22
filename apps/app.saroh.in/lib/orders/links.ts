/**
 * Where an order is read. Orders are stored per storefront, so the storefront
 * travels in the address, the way it does for products.
 */
export function orderHref(storeId: string, orderId: string): string {
    return `/commerce/orders/${encodeURIComponent(orderId)}?storefront=${encodeURIComponent(storeId)}`;
}

/** A new order, taken at one storefront. */
export function newOrderHref(storeId?: string): string {
    return storeId
        ? `/commerce/orders/new?storefront=${encodeURIComponent(storeId)}`
        : "/commerce/orders/new";
}
