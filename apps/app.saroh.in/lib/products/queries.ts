import { z } from "zod";

import type { ProductOverview } from "@/lib/products/overview-rules";
import { defineRead } from "@/lib/query/define-read";
import type { DomainKey } from "@/lib/query/keys";
import { domainKey } from "@/lib/query/keys";
import type { ProductStock } from "@/lib/stock/product-stock";

import { CATALOGUE_SORTS } from "./list-sort";
import type { CataloguePage } from "./service";

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
