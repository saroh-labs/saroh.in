import { getList, orgBase } from "@/lib/api/http";

import { listCategories } from "./service";

/**
 * What the Products list's Filter can narrow to (#519): the business's
 * categories and collections, by name. Server-only. A read that fails
 * leaves that section out of the menu rather than failing the list — the
 * list itself still loads, and the chips still work.
 *
 * TODO(#524): the collections screens bring `lib/collections/service.ts`;
 * this read moves there then.
 */
export interface FilterChoice {
    id: string;
    name: string;
}

export interface FilterChoices {
    categories: FilterChoice[] | null;
    collections: FilterChoice[] | null;
}

export async function filterChoices(): Promise<FilterChoices> {
    const base = await orgBase();
    const [categories, collections] = await Promise.all([
        listCategories()
            .then((rows) => rows.map((c) => ({ id: c.id, name: c.name })))
            .catch(() => null),
        base
            ? getList<FilterChoice>(`${base}/collections`)
                  .then((rows) => rows.map((c) => ({ id: c.id, name: c.name })))
                  .catch(() => null)
            : Promise.resolve([]),
    ]);
    return { categories, collections };
}
