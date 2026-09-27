/**
 * The ways a storefront's orders leave (B17), as its settings offer them.
 * Pure: client components import it, and must never reach `lib/api/http`.
 */
export const STOREFRONT_FULFILMENT_TYPES = [
    "PICKUP",
    "LOCAL_DELIVERY",
    "SHIPPING",
] as const;
export type StorefrontFulfilmentType =
    (typeof STOREFRONT_FULFILMENT_TYPES)[number];
