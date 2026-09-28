/**
 * Where a customer record is read and changed. A customer is stored per
 * storefront, so the storefront travels in the address, as it does for
 * products and orders.
 */
export function customerHref(storeId: string, customerId: string): string {
    return `/commerce/customers/${encodeURIComponent(customerId)}?storefront=${encodeURIComponent(storeId)}`;
}

/**
 * Add customer (DEC-056, C14): a contact, added to the business rather than
 * one storefront. The storefront an old link names is no longer asked.
 */
export function newCustomerHref(): string {
    return "/commerce/customers/new";
}

/** A spreadsheet of customers, brought in at one storefront. */
export function importCustomersHref(storeId?: string): string {
    return storeId
        ? `/commerce/customers/import?storefront=${encodeURIComponent(storeId)}`
        : "/commerce/customers/import";
}
