"use client";

import type { ButtonProps } from "@saroh/ui/button";
import { Button } from "@saroh/ui/button";
import { cn } from "@saroh/ui/lib/utils";
import { showError, showSuccess } from "@saroh/ui/toast";
import { Pencil, Plus } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { productEditHref } from "@/lib/products/links";
import type { ProductOverview } from "@/lib/products/overview-rules";
import { optionNoun } from "@/lib/products/overview-words";
import type { SheetSize, SheetValues } from "@/lib/products/stock-sheet";
import {
    foldSaved,
    planIsEmpty,
    planSave,
    sheetProblem,
    sheetValues,
} from "@/lib/products/stock-sheet";
import type { ProductStock } from "@/lib/stock/product-stock";

import { Field } from "@saroh/ui/field";
import { MoneyInput } from "@saroh/ui/money-input";
import { QuickSheet } from "../quick-sheet";
import { MoveStock } from "./move-stock";
import { PRICE_ROW, ROW, SheetSizeRow } from "./stock-sheet-row";
import { saveStockSheet } from "./stock-sheet-save";

/** The address's mark that opens the stock sheet on arrival (Track stock). */
export const STOCK_SHEET_PARAM = "sheet";

/** The sheet's title, and its button's words: one name for one act. */
export function stockSheetTitle(counts: boolean, canWrite: boolean): string {
    if (!counts) return "Edit prices";
    return canWrite ? "Edit stock and prices" : "Edit stock";
}

/**
 * "Edit stock and prices" (#523): the design's sheet over the product
 * page. Each variant's name and price (for someone who may change the
 * product), what is on hand — per storefront when there is more than one —
 * and when to warn. Promised comes from open orders, so it is shown and
 * never edited. Saving counts only the shelves that changed (a stock-log
 * Counted entry each), and a count may go below what is promised. With
 * several storefronts, stock can be moved between them below. It never
 * removes a variant: that is the editor's, which asks first.
 *
 * A stock-only role (Count and move stock, #510) sees prices read-only;
 * an untracked product's sheet edits prices only. `first` lists the
 * variants the Overview named (out, then low) at the top. With
 * `openFromAddress`, `?sheet=stock` opens it — Track stock lands there.
 */
export function StockSheetButton({
    overview,
    storeId,
    stock,
    counts,
    label,
    first = [],
    size = "xs",
    variant = "outline",
    icon = true,
    openFromAddress = false,
}: {
    overview: ProductOverview;
    storeId: string;
    stock: ProductStock | null;
    counts: boolean;
    label?: string;
    first?: readonly string[];
    size?: ButtonProps["size"];
    variant?: ButtonProps["variant"];
    icon?: boolean;
    openFromAddress?: boolean;
}) {
    const params = useSearchParams();
    const router = useRouter();
    const pathname = usePathname();
    const asked = openFromAddress && params.get(STOCK_SHEET_PARAM) === "stock";
    const [open, setOpen] = useState(asked);
    function onOpenChange(next: boolean) {
        setOpen(next);
        if (!next && asked) {
            // Closed: the mark goes, so a refresh doesn't open it again.
            const rest = new URLSearchParams(params.toString());
            rest.delete(STOCK_SHEET_PARAM);
            router.replace(`${pathname}?${rest.toString()}`, {
                scroll: false,
            });
        }
    }
    return (
        <>
            <Button
                size={size}
                type="button"
                variant={variant}
                onClick={() => setOpen(true)}
                data-ph-unmask=""
                className="gap-[5px]"
            >
                {icon ? <Pencil className="size-3" aria-hidden /> : null}
                {label ?? stockSheetTitle(counts, overview.canWrite)}
            </Button>
            {open ? (
                <StockSheet
                    open={open}
                    onOpenChange={onOpenChange}
                    overview={overview}
                    storeId={storeId}
                    stock={stock}
                    counts={counts}
                    first={first}
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
    first = [],
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    overview: ProductOverview;
    storeId: string;
    stock: ProductStock | null;
    counts: boolean;
    /** Variants to list first: the ones the Overview named. */
    first?: readonly string[];
}) {
    const { product } = overview;
    const router = useRouter();
    const body = useRef<HTMLDivElement>(null);
    // The keyboard starts in the first on-hand box: a merchant who came to
    // type a count isn't renaming a variant (audit, 16 Oct 2026). The frame
    // focuses the first field as it opens; this runs after, and moves it.
    useEffect(() => {
        if (!open) return;
        const box = body.current?.querySelector<HTMLInputElement>(
            "input[data-on-hand]:not([readonly])",
        );
        if (!box) return;
        const frame = requestAnimationFrame(() => {
            box.focus();
            box.select();
        });
        return () => cancelAnimationFrame(frame);
    }, [open]);
    const word = product.option?.name ?? null;
    const may = {
        canWrite: overview.canWrite,
        canStock: counts && overview.canStock,
    };
    // What the sheet starts from, and the read it came from. A save that
    // partly failed folds in what landed; a fresh read (after a move, or a
    // sale elsewhere) replaces it while nothing is being edited — so a later
    // save never writes the old numbers back.
    const [base, setBase] = useState(() => ({
        stock,
        values: sheetValues(product, stock),
    }));
    const was = base.values;
    const [draft, setDraft] = useState<SheetValues>(was);
    const [saving, setSaving] = useState(false);
    // A first count that landed at some storefronts: it counts now.
    const [started, setStarted] = useState(false);
    const counted =
        started ||
        overview.stock.mode === "variant" ||
        overview.stock.product !== null;
    const split = counts && (stock?.split ?? false);
    const problem = sheetProblem(draft);
    const dirty =
        JSON.stringify(draft) !== JSON.stringify(was) || (counts && !counted);
    if (base.stock !== stock && !dirty && !saving) {
        const values = sheetValues(product, stock);
        setBase({ stock, values });
        setDraft(values);
    }

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
        try {
            const { stopped, failed, done } = await saveStockSheet(
                product,
                storeId,
                plan,
            );
            if (stopped !== null) {
                showError("Nothing was saved.", stopped);
                return;
            }
            router.refresh();
            if (failed.length > 0) {
                // Keep what landed, so trying again sends only the rest.
                const next = foldSaved(was, draft, plan, done);
                setBase((b) => ({ ...b, values: next.was }));
                setDraft(next.now);
                if (done.setAt.length > 0) setStarted(true);
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
            title={stockSheetTitle(counts, may.canWrite)}
            dirty={dirty}
            saving={saving}
            saveDisabled={Boolean(problem)}
            note={problem ?? undefined}
            onSave={save}
        >
            <div ref={body}>
                <div
                    aria-hidden
                    className={cn(counts ? ROW : PRICE_ROW, "label pb-1.5")}
                >
                    <span>
                        {word ??
                            (product.variants.length ? "Variant" : "Product")}
                    </span>
                    <span>Price</span>
                    {counts ? (
                        <>
                            <span>On hand</span>
                            <span>Warn at</span>
                        </>
                    ) : null}
                </div>
                <div className="flex flex-col gap-2">
                    {order(draft.sizes, first).map((i) => {
                        const s = draft.sizes[i];
                        if (s.removed) return null;
                        return (
                            <SheetSizeRow
                                key={s.variantId ?? "product"}
                                size={s}
                                index={i}
                                counts={counts}
                                split={split}
                                canWrite={may.canWrite}
                                hasVariants={product.variants.length > 0}
                                productPrice={draft.price}
                                currency={product.currency}
                                optionName={word}
                                onSize={(patch) => setSize(i, patch)}
                                onPrice={(price) =>
                                    setDraft((d) => ({ ...d, price }))
                                }
                                onShelf={(storeId, onHand) =>
                                    setShelf(i, storeId, onHand)
                                }
                            />
                        );
                    })}
                </div>
            </div>
            {may.canWrite && product.variants.length > 0 ? (
                dirty ? (
                    // Adding one is the editor's: leaving now would drop
                    // what is typed here.
                    <p className="mt-2.5 text-[12.5px] text-muted-foreground">
                        Save first, then add a {optionNoun(word)} in the editor.
                    </p>
                ) : (
                    <Link
                        href={productEditHref(storeId, product.id, "variants")}
                        className="mt-2.5 inline-flex h-8 items-center gap-1 rounded-lg border border-dashed border-border-strong px-3 text-[12.5px] font-semibold text-neutral-700 hover:bg-muted coarse:min-h-11 dark:text-muted-foreground"
                    >
                        <Plus aria-hidden className="size-3.5" />
                        Add a {optionNoun(word)}
                    </Link>
                )
            ) : null}
            {may.canWrite && product.variants.length > 0 ? (
                <div className="mt-4 grid grid-cols-2 gap-3">
                    <Field label="The product's price">
                        <MoneyInput
                            currency={product.currency}
                            value={draft.price}
                            onValueChange={(price) =>
                                setDraft((d) => ({ ...d, price }))
                            }
                        />
                    </Field>
                    <Field label="MRP" optional>
                        <MoneyInput
                            currency={product.currency}
                            value={draft.mrp}
                            onValueChange={(mrp) =>
                                setDraft((d) => ({ ...d, mrp }))
                            }
                        />
                    </Field>
                </div>
            ) : may.canWrite ? (
                <Field label="MRP" optional className="mt-4 max-w-[50%]">
                    <MoneyInput
                        currency={product.currency}
                        value={draft.mrp}
                        onValueChange={(mrp) =>
                            setDraft((d) => ({ ...d, mrp }))
                        }
                    />
                </Field>
            ) : null}
            <p className="mt-3 text-pretty text-[11.5px] leading-[1.5] text-muted-foreground">
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

/**
 * The rows' order on screen: the variants the Overview named first, in its
 * order, then the rest as they are. Indexes into the draft, which keeps
 * its own order for saving.
 */
export function order(
    sizes: readonly { variantId: string | null }[],
    first: readonly string[],
): number[] {
    const all = sizes.map((_, i) => i);
    if (first.length === 0) return all;
    const rank = (i: number) => {
        const at = first.indexOf(sizes[i]?.variantId ?? "");
        return at === -1 ? first.length : at;
    };
    return all.sort((a, b) => rank(a) - rank(b) || a - b);
}
