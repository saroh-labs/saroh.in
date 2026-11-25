import { z } from "zod";

import type { CategoryNode } from "@/lib/collections/rules";
import type { ProductOverview } from "@/lib/products/overview-rules";
import { defineRead } from "@/lib/query/define-read";
import type { DomainKey } from "@/lib/query/keys";
import { domainKey } from "@/lib/query/keys";
import type { ProductStock } from "@/lib/stock/product-stock";

import type { FilterChoice } from "./filter-choices";
import { CATALOGUE_SORTS } from "./list-sort";
import type { CataloguePage } from "./service";
import type {
    AllergenView,
    CatalogueView,
    FieldView,
    SkuPreview,
    SkuSettings,
} from "./settings";

/**
 * Products' reads (DEC-259): the list and one product's page. Client-safe:
 * the keys and the routes; the services are paired in `access.ts`.
 */

/** Every Products read of a business: what a save invalidates. */
export const productsKeys = (orgId: string): DomainKey =>
    domainKey("products", orgId);

/** Every cached page of the list, whatever its filter. */
export const productsListKeys = (orgId: string): DomainKey =>
    domainKey("products", orgId, "list");

/** Every product's page this business holds (a review shown on one changed). */
export const productPagesKeys = (orgId: string): DomainKey =>
    domainKey("products", orgId, "product");

/** Every cached read of one product, whatever storefront or tab asked. */
export const productKeys = (orgId: string, productId: string): DomainKey =>
    domainKey("products", orgId, "product", productId);

// As `route.ts` bounds them; that module is server-only.
const searchText = z.string().max(100).optional();
const pageSize = z.coerce.number().int().min(1).max(100).optional();

// A storefront, category, option or collection, as the address names it.
const id = z.string().min(1).max(100).optional();

/** A page of the catalogue, as the address narrows it (`catalogueFilter`). */
export const productsListRead = defineRead<CataloguePage>()({
    key: (orgId, filter) => domainKey("products", orgId, "list", filter),
    route: {
        path: "/api/products",
        params: {
            view: z
                .enum(["all", "collections", "inventory", "needs"])
                .optional(),
            q: searchText,
            storefront: id,
            status: z.enum(["PUBLISHED", "DRAFT", "ARCHIVED"]).optional(),
            category: id,
            option: id,
            collection: id,
            page: z.coerce.number().int().min(1).max(10_000).optional(),
            size: pageSize,
            sort: z.enum(CATALOGUE_SORTS).optional(),
        },
    },
    tier: "records",
});

/** A product's page: its overview, and its shelves where the view shows them. */
export interface ProductRead {
    overview: ProductOverview;
    /** Its stock at every storefront; null when not asked, untracked or unread. */
    stock: ProductStock | null;
}

/** What the list's read is asked: `catalogueFilter(query)`. */
export type CatalogueAsk = Parameters<typeof productsListRead.options>[1];

export const productRead = defineRead<ProductRead>()({
    key: (orgId, { productId, ...ask }) =>
        domainKey("products", orgId, "product", productId, ask),
    route: {
        path: "/api/products/[productId]",
        params: {
            productId: z.string().regex(/^[\w-]{1,64}$/),
            storefront: id,
            shelves: z.literal("1").optional(),
        },
    },
    tier: "records",
});

export type ProductAsk = Parameters<typeof productRead.options>[1];

/**
 * What the product page asks for, from its address: the shelves only on
 * Overview, Stock and the customer view, where they are drawn.
 */
export function productAsk(
    productId: string,
    at: { storefront?: string; tab: string; view: "team" | "customer" },
): ProductAsk {
    return {
        productId,
        // An empty `?storefront=` is none.
        storefront: at.storefront === "" ? undefined : at.storefront,
        shelves:
            at.view === "customer" ||
            at.tab === "overview" ||
            at.tab === "stock"
                ? "1"
                : undefined,
    };
}

/**
 * Product settings' reads (DEC-259): the business's categories (the
 * Products Filter, a product's details sheet and Collections tab, a
 * collection's category) and the Product settings page. They change only
 * in Product settings, so they are `settings`-tier: kept for the visit and
 * read again by their own saves (`useProductSettingsSave`). Client-safe;
 * the services are paired in `settings-access.ts`.
 */

/** Every product-settings read of a business: what a settings save invalidates. */
export const productSettingsKeys = (orgId: string): DomainKey =>
    domainKey("product-settings", orgId);

/** The categories, and the options by name when the list is narrowed to one. */
export interface CategoriesRead {
    categories: CategoryNode[];
    /** Asked only with `options=1`; null when they couldn't be read. */
    options?: FilterChoice[] | null;
}

export const categoriesRead = defineRead<CategoriesRead>()({
    key: (orgId, ask) =>
        domainKey("product-settings", orgId, "categories", ask),
    route: {
        path: "/api/products/categories",
        params: { options: z.literal("1").optional() },
    },
    tier: "settings",
});

export type CategoriesAsk = Parameters<typeof categoriesRead.key>[1];

/** The Product settings page: its lists, and the SKU tab's pattern when shown. */
export interface ProductSettingsRead {
    catalogue: CatalogueView;
    /** Null: couldn't be read (said as "—", never 0). */
    fields: FieldView[] | null;
    allergens: AllergenView[] | null;
    /** Asked only on the SKU tab (`sku=1`). */
    sku?: { settings: SkuSettings | null; preview: SkuPreview | null };
}

export const productSettingsRead = defineRead<ProductSettingsRead>()({
    key: (orgId, ask) => domainKey("product-settings", orgId, "page", ask),
    route: {
        path: "/api/products/settings",
        params: { sku: z.literal("1").optional() },
    },
    tier: "settings",
});

export type ProductSettingsAsk = Parameters<typeof productSettingsRead.key>[1];
