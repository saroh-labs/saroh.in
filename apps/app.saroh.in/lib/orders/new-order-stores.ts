import type { OrderPlace } from "@/lib/stores/abilities";

/**
 * Where New order may be taken from the Orders list (UX audit, 10 Oct
 * 2026). Pure.
 *
 * Someone the business role lets take orders takes them at every location,
 * and never from the kitchen's view (a Member, who reaches the list through
 * `order:stage`). Someone it doesn't, and whose location role does (a
 * location Admin, Manager or Editor), takes them at the locations whose own
 * read says so: `places`, which is only sent for them. The kitchen's view
 * is theirs too, so it doesn't close New order to them.
 */
export function newOrderStores<S extends { id: string }>(
    stores: readonly S[],
    kitchen: boolean,
    places: readonly OrderPlace[] | undefined,
): S[] {
    if (places) {
        const here = new Set(places.map((p) => p.id));
        return stores.filter((s) => here.has(s.id));
    }
    return kitchen ? [] : [...stores];
}
