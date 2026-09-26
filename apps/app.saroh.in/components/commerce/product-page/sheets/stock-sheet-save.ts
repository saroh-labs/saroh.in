import {
    deleteVariant,
    patchProduct,
    setInventory,
    setVariantStock,
    updateVariant,
} from "@/lib/products/actions";
import type { ProductDetail } from "@/lib/products/service";
import {
    countProductStock,
    setProductWarnings,
} from "@/lib/products/stock-actions";
import type { SheetDone, SheetPlan } from "@/lib/products/stock-sheet";
import { nothingDone } from "@/lib/products/stock-sheet";

export interface SheetSaved {
    /** The product itself didn't save, so nothing after it was tried. */
    stopped: string | null;
    /** What didn't land, in words: "400g's price", "the counts (…)". */
    failed: string[];
    done: SheetDone;
}

/**
 * Run a stock sheet's plan (#523), in order, and say what landed — so the
 * sheet can fold it in and a retry sends only the rest. A write that
 * throws (Saroh unreachable) ends the run; what came before it stands.
 */
export async function saveStockSheet(
    product: ProductDetail,
    storeId: string,
    plan: SheetPlan,
): Promise<SheetSaved> {
    const done = nothingDone();
    const failed: string[] = [];
    try {
        if (plan.product) {
            const res = await patchProduct(storeId, product.id, plan.product);
            if (!res.ok) return { stopped: res.error, failed, done };
            done.product = true;
        }
        for (const v of plan.variants) {
            const variant = product.variants.find((x) => x.id === v.variantId);
            if (!variant) continue;
            const res = await updateVariant(product.id, variant.id, {
                sku: variant.sku,
                title: v.title,
                price: v.price,
                mrp: variant.mrp ?? null,
                // The API's PUT replaces the variant: an omitted image is cleared.
                image: variant.image ?? null,
                optionValueId: variant.optionValueId ?? null,
                imageId: variant.imageId ?? null,
            });
            if (res.ok) done.variants.push(variant.id);
            else failed.push(`${variant.title}'s price`);
        }
        for (const id of plan.remove) {
            const res = await deleteVariant(product.id, id);
            if (res.ok) done.removed.push(id);
            else {
                failed.push(
                    `removing ${product.variants.find((v) => v.id === id)?.title ?? "a size"}`,
                );
            }
        }
        for (const at of plan.setAt) {
            const res = at.perVariant
                ? await setVariantStock(
                      at.storeId,
                      product.id,
                      at.rows.map((r) => ({
                          variantId: r.variantId ?? "",
                          quantity: r.quantity,
                          lowStockAlert: r.lowStockAlert,
                      })),
                  )
                : await setInventory(at.storeId, product.id, {
                      quantity: at.rows[0]?.quantity ?? 0,
                      lowStockAlert: at.rows[0]?.lowStockAlert ?? 10,
                  });
            if (res.ok) done.setAt.push(at.storeId);
            else failed.push(`the stock (${res.error})`);
        }
        if (plan.warn.length > 0) {
            const res = await setProductWarnings({
                productId: product.id,
                warnings: plan.warn,
                idempotencyKey: crypto.randomUUID(),
            });
            if (res.ok) done.warn = true;
            else failed.push(`the warning levels (${res.error})`);
        }
        if (plan.count.length > 0) {
            const res = await countProductStock({
                productId: product.id,
                counts: plan.count,
                idempotencyKey: crypto.randomUUID(),
            });
            if (res.ok) done.count = true;
            else failed.push(`the counts (${res.error})`);
        }
    } catch {
        failed.push("the rest — Saroh couldn't be reached");
    }
    return { stopped: null, failed, done };
}
