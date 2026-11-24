import "server-only";

import { cache } from "react";

import { moduleAccess } from "@/lib/modules/guard";
import type { resolveActiveOrganization } from "@/lib/organizations/service";
import { activeOrganizationOnce } from "@/lib/organizations/service";
import type { ServerRead } from "@/lib/query/route";
import { productStock } from "@/lib/stock/product-stock";
import { getStockLevels, stockTrackingOnce } from "@/lib/stock/service";

import { getProductOverview, withStorefrontFallback } from "./overview";
import type { CatalogueAsk, ProductAsk, ProductRead } from "./queries";
import { productRead, productsListRead } from "./queries";
import type { CataloguePage } from "./service";
import { listCataloguePage } from "./service";
import { countsStock } from "./tracking";

type Org = Awaited<ReturnType<typeof resolveActiveOrganization>>;

/**
 * `store:write` — change products. The same answer the API gives; it stays
 * the authority, and refuses a write this lets through.
 */
export function canWriteProducts(organization: Org): boolean {
    return organization?.actions
        ? organization.actions.includes("store:write")
        : organization?.role === "OWNER" || organization?.role === "ADMIN";
}

/**
 * Count and move stock (`inventory:write`, which `store:write` implies,
 * #518). A stock-only role sees the Track stock switch, locked (#515).
 */
export function canStockProducts(organization: Org): boolean {
    if (canWriteProducts(organization)) return true;
    return organization?.actions?.includes("inventory:write") ?? false;
}

/**
 * See the orders (`order:read`): the stock quick look links a short
 * product's open orders, where each customer can be told (U5).
 */
export function canReadOrders(organization: Org): boolean {
    return organization?.actions
        ? organization.actions.includes("order:read")
        : organization?.role === "OWNER" || organization?.role === "ADMIN";
}

/**
 * Who reads Products (DEC-259), asked by the pages and by `/api/products`
 * alike: a role that may open products (`store:read`) while Sell is on, as
 * the section's layout and the product page decide; anyone else a 403.
 */
export async function mayReadProducts(): Promise<boolean> {
    const organization = await activeOrganizationOnce();
    if (!organization) return false;
    if (organization.actions && !organization.actions.includes("store:read")) {
        return false;
    }
    const access = await moduleAccess("COMMERCE");
    return access.state === "available" || access.state === "unknown";
}

/** A page of the catalogue; throws when it can't be read, never an empty one. */
export function readCatalogue(
    ask: CatalogueAsk,
): Promise<CataloguePage | null> {
    return listCataloguePage(ask);
}

/**
 * The product page's one read, as the storefront in the address sees it
 * or the first that sells it; once per render, shared with the tab's
 * title (`generateMetadata`). Null: not this business's (a 404).
 */
export const readOverview = cache(
    (storefront: string | undefined, productId: string) =>
        withStorefrontFallback(storefront, (at) =>
            getProductOverview(at, productId),
        ),
);

/**
 * A product as its page draws it: the overview, and its shelves at every
 * storefront when the view shows them and its stock is counted. A shelf
 * read that fails is null, said where it would have been.
 */
export async function readProduct(
    ask: ProductAsk,
): Promise<ProductRead | null> {
    const overview = await readOverview(ask.storefront, ask.productId);
    if (!overview) return null;
    if (!ask.shelves) return { overview, stock: null };
    const business = await stockTrackingOnce();
    if (
        !countsStock(overview.product.stockTracked, business?.tracked ?? null)
    ) {
        return { overview, stock: null };
    }
    const levels = await getStockLevels({ product: ask.productId }).catch(
        () => null,
    );
    return {
        overview,
        stock: levels ? productStock(levels, ask.productId) : null,
    };
}

export const productsListServer: ServerRead<CatalogueAsk, CataloguePage> = {
    read: productsListRead,
    service: readCatalogue,
};

export const productServer: ServerRead<ProductAsk, ProductRead> = {
    read: productRead,
    service: readProduct,
};
