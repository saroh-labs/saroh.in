"use client";

import { Button } from "@saroh/ui/button";
import { Input } from "@saroh/ui/input";
import { cn } from "@saroh/ui/lib/utils";
import { showError, showSuccess } from "@saroh/ui/toast";
import { Pencil, Plus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { currencySymbol } from "@/lib/format/money";
import {
    deleteVariant,
    patchProduct,
    setInventory,
    setVariantStock,
    updateVariant,
} from "@/lib/products/actions";
import { productEditHref } from "@/lib/products/links";
import type { ProductOverview } from "@/lib/products/overview-rules";
import { countProductStock } from "@/lib/products/stock-actions";
import type { SheetSize, SheetValues } from "@/lib/products/stock-sheet";
import {
    planIsEmpty,
    planSave,
    sheetProblem,
    sheetValues,
} from "@/lib/products/stock-sheet";
import type { ProductStock } from "@/lib/stock/product-stock";

import { QuickSheet } from "../quick-sheet";
import { MoveStock } from "./move-stock";
import { PRICE_ROW, ROW, SheetSizeRow } from "./stock-sheet-row";

/**
 * "Change stock or prices" (#523): the design's sheet over the product
 * page. Each size's name and price (for someone who may change the
 * product), what is on hand — per storefront when there is more than one —
 * and when to warn. Promised comes from open orders, so it is shown and
 * never edited. Saving counts only the shelves that changed (a stock-log
 * Counted entry each), and a count may go below what is promised. With
 * several storefronts, stock can be moved between them below.
 *
 * A stock-only role (Count and move stock, #510) sees prices read-only;
 * an untracked product's sheet edits prices only.
 */
export function StockSheetButton({
    overview,
    storeId,
    stock,
    counts,
    label,
}: {
    overview: ProductOverview;
    storeId: string;
    stock: ProductStock | null;
    counts: boolean;
    label: string;
}) {
    const [open, setOpen] = useState(false);
    return (
        <>
            <Button
                type="button"
                variant="outline"
                onClick={() => setOpen(true)}
                className="h-[26px] gap-[5px] rounded-[7px] px-[9px] text-[12px] coarse:h-11"
            >
                <Pencil className="size-3" strokeWidth={2} aria-hidden />
                {label}
            </Button>
            {open ? (
                <StockSheet
                    open={open}
                    onOpenChange={setOpen}
                    overview={overview}
                    storeId={storeId}
                    stock={stock}
                    counts={counts}
                />
            ) : null}
        </>
    );
}

export function StockSheet({
    open,
    onOpenChange,
    overview,
    storeId,
    stock,
    counts,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    overview: ProductOverview;
    storeId: string;
    stock: ProductStock | null;
    counts: boolean;
}) {
    const { product } = overview;
    const router = useRouter();
    const may = {
        canWrite: overview.canWrite,
        canStock: counts && overview.canStock,
    };
    const counted =
        overview.stock.mode === "variant" || overview.stock.product !== null;
    const [was] = useState(() => sheetValues(product, stock));
    const [draft, setDraft] = useState<SheetValues>(was);
    const [saving, setSaving] = useState(false);
    const symbol = currencySymbol(product.currency);
    const split = counts && (stock?.split ?? false);
    const problem = sheetProblem(draft);
    const dirty =
        JSON.stringify(draft) !== JSON.stringify(was) || (counts && !counted);

    const setSize = (i: number, patch: Partial<SheetSize>) =>
        setDraft((d) => ({
            ...d,
            sizes: d.sizes.map((s, j) => (j === i ? { ...s, ...patch } : s)),
        }));
    const setShelf = (i: number, storeId: string, onHand: string) =>
        setDraft((d) => ({
            ...d,
            sizes: d.sizes.map((s, j) =>
                j === i
                    ? {
                          ...s,
                          shelves: s.shelves.map((x) =>
                              x.storeId === storeId ? { ...x, onHand } : x,
                          ),
                      }
                    : s,
            ),
        }));

    async function save() {
        if (problem) return;
        const plan = planSave(was, draft, may, counted || !counts);
        if (planIsEmpty(plan)) {
            onOpenChange(false);
            return;
        }
        setSaving(true);
        const failed: string[] = [];
        try {
            if (plan.product) {
                const res = await patchProduct(
                    storeId,
                    product.id,
                    plan.product,
                );
                if (!res.ok) {
                    showError("Nothing was saved", res.error);
                    return;
                }
            }
            for (const v of plan.variants) {
                const variant = product.variants.find(
                    (x) => x.id === v.variantId,
                );
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
                if (!res.ok) failed.push(`${variant.title}'s price`);
            }
            for (const id of plan.remove) {
                const res = await deleteVariant(product.id, id);
                if (!res.ok) {
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
                if (!res.ok) failed.push(`the stock (${res.error})`);
            }
            if (plan.count.length > 0) {
                const res = await countProductStock({
                    productId: product.id,
                    counts: plan.count,
                    idempotencyKey: crypto.randomUUID(),
                });
                if (!res.ok) failed.push(`the counts (${res.error})`);
            }
            router.refresh();
            if (failed.length > 0) {
                showError(
                    `Saved, except ${failed.join(" and ")}. Try those again.`,
                );
                return;
            }
            onOpenChange(false);
            showSuccess(
                !counts
                    ? "Prices saved."
                    : may.canWrite
                      ? "Prices and stock saved."
                      : "Stock saved.",
            );
        } finally {
            setSaving(false);
        }
    }

    return (
        <QuickSheet
            open={open}
            onOpenChange={(o) => {
                if (!o) setDraft(was);
                onOpenChange(o);
            }}
            productName={product.name}
            title={
                !counts
                    ? "Edit prices"
                    : may.canWrite
                      ? "Edit prices and stock"
                      : "Change stock"
            }
            fullEditorHref={productEditHref(
                storeId,
                product.id,
                product.variants.length ? "variants" : "stock",
            )}
            dirty={dirty}
            saving={saving}
            saveDisabled={Boolean(problem)}
            note={problem ?? (dirty ? undefined : "No changes yet")}
            onSave={() => void save()}
        >
            <div
                aria-hidden
                className={cn(
                    counts ? ROW : PRICE_ROW,
                    "pb-1.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground",
                )}
            >
                <span>{product.option?.name ?? "Size"}</span>
                <span>Price</span>
                {counts ? (
                    <>
                        <span>On hand</span>
                        <span>Warn at</span>
                    </>
                ) : null}
                <span />
            </div>
            <div className="flex flex-col gap-2">
                {draft.sizes.map((s, i) =>
                    s.removed ? null : (
                        <SheetSizeRow
                            key={s.variantId ?? "product"}
                            size={s}
                            index={i}
                            counts={counts}
                            split={split}
                            canWrite={may.canWrite}
                            hasVariants={product.variants.length > 0}
                            productPrice={draft.price}
                            symbol={symbol}
                            onSize={(patch) => setSize(i, patch)}
                            onPrice={(price) =>
                                setDraft((d) => ({ ...d, price }))
                            }
                            onShelf={(storeId, onHand) =>
                                setShelf(i, storeId, onHand)
                            }
                        />
                    ),
                )}
            </div>
            {may.canWrite && product.variants.length > 0 ? (
                <Link
                    href={productEditHref(storeId, product.id, "variants")}
                    className="mt-2.5 inline-flex h-8 items-center gap-1 rounded-lg border border-dashed border-border-strong px-3 text-[12.5px] font-semibold text-neutral-700 hover:bg-muted coarse:min-h-11 dark:text-muted-foreground"
                >
                    <Plus aria-hidden className="size-3.5" strokeWidth={2.2} />
                    Add a size
                </Link>
            ) : null}
            {may.canWrite && product.variants.length > 0 ? (
                <div className="mt-4 grid grid-cols-2 gap-3">
                    <label className="flex flex-col gap-1.5">
                        <span>The product&apos;s price</span>
                        <Input
                            value={draft.price}
                            onChange={(e) =>
                                setDraft((d) => ({
                                    ...d,
                                    price: e.target.value,
                                }))
                            }
                            inputMode="decimal"
                        />
                    </label>
                    <label className="flex flex-col gap-1.5">
                        <span>MRP</span>
                        <Input
                            value={draft.mrp}
                            onChange={(e) =>
                                setDraft((d) => ({ ...d, mrp: e.target.value }))
                            }
                            inputMode="decimal"
                            placeholder="Optional"
                        />
                    </label>
                </div>
            ) : may.canWrite ? (
                <label className="mt-4 flex max-w-[50%] flex-col gap-1.5">
                    <span>MRP</span>
                    <Input
                        value={draft.mrp}
                        onChange={(e) =>
                            setDraft((d) => ({ ...d, mrp: e.target.value }))
                        }
                        inputMode="decimal"
                        placeholder="Optional"
                    />
                </label>
            ) : null}
            <p className="mt-3 text-pretty text-[11.5px] leading-[1.5] text-muted-foreground">
                {product.variants.length > 0
                    ? "A new size gets a SKU from the product and its name. "
                    : ""}
                {counts
                    ? "Promised stock comes from open orders, so it cannot be changed here. A count below it shows as short."
                    : "Not tracked, so there is no count. Track stock is in the editor's Stock section."}
            </p>
            {counts && may.canStock && stock && stock.split && counted ? (
                <MoveStock
                    product={product}
                    stock={stock}
                    blocked={
                        dirty ? "Save or discard your changes first." : null
                    }
                />
            ) : null}
        </QuickSheet>
    );
}
