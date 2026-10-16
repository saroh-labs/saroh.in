import { notFound } from "next/navigation";

import { ProductEditorV2 } from "@/components/commerce/product-editor-v2/editor-shell";
import { NoProductAccess } from "@/components/commerce/product-editor-v2/no-access";
import { activeCut, pausedByCut } from "@/lib/billing/paused";
import { resolveActiveOrganization } from "@/lib/organizations/service";
import { loadEditorContext } from "@/lib/products/editor-data";
import { getProductAt } from "@/lib/products/overview";
import { pausedOrNull } from "@/lib/saroh-billing/service";
import { requireSession } from "@/lib/session";
import { readBusinessStores } from "@/lib/stores/service";
import { getStorefront } from "@/lib/stores/storefronts";

export const metadata = { title: "Edit product" };

/**
 * Sell → Products → one product → Edit. The full editor (#468, #469): every
 * part of the product, each saved on its own. The product page links here,
 * to the section it names. The product is the business's (#531); the
 * storefront in the address is whose shelf the Stock section counts.
 *
 * Anyone who may see products opens it (16 Oct audit, SEV 4): someone with
 * `store:write` edits; anyone else gets the editor read-only, with the
 * line saying who they are and who can change it. Whether the person OWNS
 * a location never decides it — a product that exists is never "not
 * found" here.
 */
export default async function EditProductPage({
    params,
    searchParams,
}: {
    params: Promise<{ productId: string }>;
    searchParams: Promise<{ storefront?: string }>;
}) {
    await requireSession();
    const [{ productId }, { storefront }, organization] = await Promise.all([
        params,
        searchParams,
        resolveActiveOrganization(),
    ]);

    // A role that can't see products is told so and who can change it, not
    // shown a "not found" that reads like a broken link (#525).
    if (organization?.actions && !organization.actions.includes("store:read")) {
        return <NoProductAccess organization={organization} />;
    }

    const [product, read] = await Promise.all([
        getProductAt(storefront, productId),
        readBusinessStores(),
    ]);
    if (!product) notFound();
    // The business's locations, for where each variant is sold. Unread,
    // the product's own location stands in, and the editor leaves "Sell it
    // at" out rather than guessing.
    const stores = read ?? [];
    const store =
        stores.find((s) => s.id === product.storeId) ??
        (await locationOf(product.storeId));

    const [context, paused] = await Promise.all([
        loadEditorContext(store, product, stores.length ? stores : [store]),
        // Past the plan's products limit (#800): read-only, and why.
        pausedOrNull(),
    ]);
    const isPaused = pausedByCut(product, activeCut(paused, "products"));
    return (
        <ProductEditorV2
            // A different product starts from its own saved values rather
            // than the last one's edits.
            key={product.id}
            {...context}
            canWrite={context.canWrite && !isPaused}
            paused={isPaused}
            product={product}
        />
    );
}

/** The product's location by itself, when the list didn't hold it. */
async function locationOf(
    storeId: string,
): Promise<{ id: string; name: string }> {
    const settings = await getStorefront(storeId).catch(() => null);
    return { id: storeId, name: settings?.name ?? "this location" };
}
