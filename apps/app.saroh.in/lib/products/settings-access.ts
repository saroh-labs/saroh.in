import "server-only";

import type { ServerRead } from "@/lib/query/route";

import type {
    CategoriesAsk,
    CategoriesRead,
    ProductSettingsAsk,
    ProductSettingsRead,
} from "./queries";
import { categoriesRead, productSettingsRead } from "./queries";
import { listCategories } from "./service";
import {
    getCatalogue,
    getSkuPreview,
    getSkuSettings,
    listAllergens,
    listFields,
    listOptionNames,
} from "./settings";

/**
 * The categories (`/api/products/categories`): only what the screens draw
 * (id, name, parent). A failed read throws (a 503); the option names,
 * asked beside them, are null when they fail, as the list always had them.
 */
async function readCategories(ask: CategoriesAsk): Promise<CategoriesRead> {
    const [categories, options] = await Promise.all([
        listCategories(),
        ask.options ? listOptionNames().catch(() => null) : undefined,
    ]);
    return {
        categories: categories.map(({ id, name, parentId }) => ({
            id,
            name,
            parentId,
        })),
        ...(options === undefined
            ? {}
            : {
                  options:
                      options?.map(({ id, name }) => ({ id, name })) ?? null,
              }),
    };
}

/**
 * Product settings (`/api/products/settings`): the catalogue (null is a
 * 404, said as the page's failed state), its fields and allergens (each
 * null when unread), and on the SKU tab its pattern and preview.
 */
async function readProductSettings(
    ask: ProductSettingsAsk,
): Promise<ProductSettingsRead | null> {
    const [catalogue, fields, allergens, settings] = await Promise.all([
        getCatalogue(),
        listFields().catch(() => null),
        listAllergens().catch(() => null),
        ask.sku ? getSkuSettings().catch(() => null) : null,
    ]);
    if (!catalogue) return null;
    if (!ask.sku) return { catalogue, fields, allergens };
    const preview = settings
        ? await getSkuPreview(settings.pattern).catch(() => null)
        : null;
    return { catalogue, fields, allergens, sku: { settings, preview } };
}

export const categoriesServer: ServerRead<CategoriesAsk, CategoriesRead> = {
    read: categoriesRead,
    service: readCategories,
};

export const productSettingsServer: ServerRead<
    ProductSettingsAsk,
    ProductSettingsRead
> = {
    read: productSettingsRead,
    service: readProductSettings,
};
