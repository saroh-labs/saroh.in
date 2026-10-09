/**
 * The storefront a page that works at one storefront should use: the one
 * `?storefront=` names, else the business's only one. `undefined` means
 * there are several and none is named — the page asks which, with a short
 * list, rather than guessing. A business with one storefront never sees that
 * question (ADR-010).
 */
export function pickStorefront<T extends { id: string }>(
    stores: readonly T[],
    named: string | undefined,
): T | undefined {
    return (
        stores.find((s) => s.id === named) ??
        (stores.length === 1 ? stores[0] : undefined)
    );
}

/**
 * Sell's row for its locations, named by how many there are: "Location"
 * for one (or none), "Locations" for several. The rail, the page's title
 * and every breadcrumb say the same (DEC-069, `saroh-product.md`).
 */
export function locationsWord(count: number | null | undefined): string {
    return (count ?? 0) > 1 ? "Locations" : "Location";
}
