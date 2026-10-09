import { listCataloguePage } from "@/lib/products/service";

/**
 * Whether the business sells things a counter takes (B13): New order is for
 * a business with a product in its catalogue — one whose catalogue is only
 * appointments books them in Bookings. Server-only. A read that fails, or a
 * business with no catalogue to ask, keeps New order: the API decides.
 * The Orders list and the person page (#247) ask it the same way.
 */
export function sellsProducts(): Promise<boolean> {
    return listCataloguePage({ limit: 1 })
        .then((p) => p === null || p.total > 0)
        .catch(() => true);
}
