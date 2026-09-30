import type { ProductFulfilmentType } from "@/lib/products/service";

/**
 * A product's fulfilment types (B12, DEC-045) as the editor and the product
 * page show them. Pure and client-safe; tested in `fulfilment-types.test.ts`.
 * The API decides what an order offers; this only names the choices.
 */

/**
 * The ways a product can be fulfilled (B12), in the API's table order, with
 * the words the Orders screens use for them.
 */
export const FULFILMENT_CHOICES: readonly {
    value: ProductFulfilmentType;
    label: string;
}[] = [
    { value: "PICKUP", label: "Pick-up" },
    { value: "LOCAL_DELIVERY", label: "Local delivery" },
    { value: "SHIPPING", label: "Shipping" },
    { value: "DIGITAL", label: "Digital" },
];

/** Picked ways, in table order, each once. */
export function inTableOrder(
    types: readonly ProductFulfilmentType[],
): ProductFulfilmentType[] {
    return FULFILMENT_CHOICES.map((c) => c.value).filter((t) =>
        types.includes(t),
    );
}

/**
 * How the product page says it is fulfilled: the ways picked, or — none
 * picked — whatever its storefronts offer.
 */
export function fulfilmentLine(
    types: readonly ProductFulfilmentType[] | undefined,
): string {
    const picked = inTableOrder(types ?? []);
    if (picked.length === 0) return "Every way its locations offer";
    return FULFILMENT_CHOICES.filter((c) => picked.includes(c.value))
        .map((c) => c.label)
        .join(", ");
}
