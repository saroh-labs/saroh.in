/**
 * What the Products list's Filter can narrow to (#519): the business's
 * categories and collections, by name. The page reads them — categories
 * through `lib/products/service.ts`, collections through
 * `lib/collections/service.ts` (#524) — and a read that failed arrives as
 * null, which leaves that section out of the menu rather than failing the
 * list: the list itself still loads, and the chips still work. Pure.
 */
export interface FilterChoice {
    id: string;
    name: string;
}

export interface FilterChoices {
    categories: FilterChoice[] | null;
    collections: FilterChoice[] | null;
}

export function choicesFrom(
    categories: readonly FilterChoice[] | null,
    collections: readonly FilterChoice[] | null,
): FilterChoices {
    const names = (rows: readonly FilterChoice[] | null) =>
        rows?.map((r) => ({ id: r.id, name: r.name })) ?? null;
    return { categories: names(categories), collections: names(collections) };
}
