"use client";

import { Button } from "@saroh/ui/button";
import { Input } from "@saroh/ui/input";
import { cn } from "@saroh/ui/lib/utils";
import { X } from "lucide-react";
import { useId } from "react";

import type { SheetSize } from "@/lib/products/stock-sheet";
import { canSellNote } from "@/lib/products/stock-sheet";

/**
 * The sheet's column heads on the desk: size · price · on hand · warn at ·
 * remove. A phone has no heads; each row labels its own boxes (T7).
 */
export const ROW =
    "hidden grid-cols-[minmax(0,1.4fr)_84px_64px_64px_26px] items-center gap-1.5 sm:grid";
/** Untracked: size · price · remove. */
export const PRICE_ROW =
    "hidden grid-cols-[minmax(0,1.4fr)_96px_26px] items-center gap-1.5 sm:grid";

/*
 * A size's own row. On a phone (below `sm`) the size has the first line
 * beside its 44px remove button, and its boxes share the second, each
 * labelled; the desk keeps one row under the heads above.
 */
const SIZE_ROW =
    "grid grid-cols-[repeat(3,minmax(0,1fr))_44px] items-end gap-1.5 sm:grid-cols-[minmax(0,1.4fr)_84px_64px_64px_26px] sm:items-center";
const SIZE_PRICE_ROW =
    "grid grid-cols-[minmax(0,1fr)_44px] items-end gap-1.5 sm:grid-cols-[minmax(0,1.4fr)_96px_26px] sm:items-center";
/** A box and, on a phone, its label above it. */
const FIELD = "grid min-w-0 gap-1 sm:contents";
const PHONE_LABEL = "text-[11.5px] text-muted-foreground sm:hidden";

const LOCKED = "bg-muted text-muted-foreground";

/**
 * One size in the stock sheet (#523): its name and price (read-only
 * without `store:write`), what is on hand — the sum of its storefronts,
 * each with its own box, when there is more than one — and when to warn.
 * A size with open orders can't be removed, and says why.
 */
export function SheetSizeRow({
    size: s,
    index: i,
    counts,
    split,
    canWrite,
    hasVariants,
    productPrice,
    symbol,
    onSize,
    onPrice,
    onShelf,
}: {
    size: SheetSize;
    index: number;
    counts: boolean;
    split: boolean;
    canWrite: boolean;
    hasVariants: boolean;
    /** The product's price, as edited: a size's blank price. */
    productPrice: string;
    symbol: string;
    onSize: (patch: Partial<SheetSize>) => void;
    /** The product's own price, for a product sold as itself. */
    onPrice: (price: string) => void;
    onShelf: (storeId: string, onHand: string) => void;
}) {
    const promised = s.shelves.reduce((n, x) => n + x.promised, 0);
    const sum = s.shelves.reduce(
        (n, x) => n + (/^\d+$/.test(x.onHand.trim()) ? Number(x.onHand) : 0),
        0,
    );
    const first = s.shelves.at(0);
    const canRemove = canWrite && s.variantId !== null && promised === 0;
    const nameLocked = !canWrite || s.variantId === null;
    const id = useId();
    const label = s.title || "Size";
    // Drawn twice, one per layout, so the tab order follows the eye: on a
    // phone it sits beside the name, on the desk at the row's end.
    const remove = (className: string) => (
        <Button
            type="button"
            variant="outline"
            disabled={!canRemove}
            onClick={() => onSize({ removed: true })}
            aria-label={
                promised > 0
                    ? `${s.title} has open orders, so it can't be removed`
                    : `Remove ${s.title || "this size"}`
            }
            className={cn(
                "rounded-md p-0 text-destructive-subtle-foreground",
                className,
            )}
        >
            <X aria-hidden className="size-3" strokeWidth={2.2} />
        </Button>
    );

    return (
        <div>
            <div className={counts ? SIZE_ROW : SIZE_PRICE_ROW}>
                <Input
                    value={s.title}
                    onChange={(e) => onSize({ title: e.target.value })}
                    readOnly={nameLocked}
                    aria-label={`Size ${i + 1} name`}
                    className={cn(
                        counts && "col-span-3 sm:col-span-1",
                        nameLocked && LOCKED,
                    )}
                />
                {remove("size-11 sm:hidden")}
                {s.variantId === null && hasVariants ? (
                    // Counted as a whole: each size keeps its own price.
                    <span />
                ) : (
                    <div className={FIELD}>
                        <label htmlFor={`${id}-price`} className={PHONE_LABEL}>
                            Price
                        </label>
                        <div className="relative">
                            <span
                                aria-hidden
                                className="pointer-events-none absolute inset-y-0 left-[9px] flex items-center text-[12.5px] text-muted-foreground"
                            >
                                {symbol}
                            </span>
                            <Input
                                id={`${id}-price`}
                                value={s.variantId ? s.price : productPrice}
                                onChange={(e) =>
                                    s.variantId
                                        ? onSize({ price: e.target.value })
                                        : onPrice(e.target.value)
                                }
                                readOnly={!canWrite}
                                inputMode="decimal"
                                placeholder={
                                    s.variantId ? productPrice : undefined
                                }
                                aria-label={`${s.title || "Size"} price${s.variantId ? ", blank for the product's" : ""}`}
                                className={cn("pl-5", !canWrite && LOCKED)}
                            />
                        </div>
                    </div>
                )}
                {counts ? (
                    <>
                        <div className={FIELD}>
                            <label
                                htmlFor={`${id}-on-hand`}
                                className={PHONE_LABEL}
                            >
                                On hand
                            </label>
                            <Input
                                id={`${id}-on-hand`}
                                value={
                                    split ? String(sum) : (first?.onHand ?? "0")
                                }
                                onChange={(e) =>
                                    first
                                        ? onShelf(first.storeId, e.target.value)
                                        : undefined
                                }
                                readOnly={split || !first}
                                inputMode="numeric"
                                title={
                                    split
                                        ? "The sum of the locations below"
                                        : undefined
                                }
                                aria-label={`${label} on hand${split ? ", the sum of the locations below" : ""}`}
                                className={cn(split && LOCKED)}
                            />
                        </div>
                        <div className={FIELD}>
                            <label
                                htmlFor={`${id}-warn`}
                                className={PHONE_LABEL}
                            >
                                Warn at
                            </label>
                            <Input
                                id={`${id}-warn`}
                                value={s.warn}
                                onChange={(e) =>
                                    onSize({ warn: e.target.value })
                                }
                                inputMode="numeric"
                                aria-label={`${label} warn when on hand reaches`}
                            />
                        </div>
                    </>
                ) : null}
                {remove("hidden size-[26px] coarse:size-11 sm:inline-flex")}
            </div>
            {counts && split
                ? s.shelves.map((x) => (
                      <div
                          key={x.storeId}
                          className={cn(SIZE_ROW, "mt-1.5 items-center")}
                      >
                          <span className="col-span-2 flex min-w-0 items-center gap-[7px] pl-3 text-[12.5px] text-neutral-700 dark:text-muted-foreground">
                              <span
                                  aria-hidden
                                  className="size-1.5 shrink-0 rounded-full bg-border-strong"
                              />
                              <span className="truncate">{x.name}</span>
                              <span className="shrink-0 text-muted-foreground">
                                  · {x.promised} promised
                              </span>
                          </span>
                          <Input
                              value={x.onHand}
                              onChange={(e) =>
                                  onShelf(x.storeId, e.target.value)
                              }
                              inputMode="numeric"
                              aria-label={`${label} on hand at ${x.name}`}
                              aria-invalid={!/^\d+$/.test(x.onHand.trim())}
                          />
                      </div>
                  ))
                : null}
            <p className="mt-1 text-[11.5px] text-muted-foreground">
                {[
                    s.sku,
                    counts ? `${promised} promised` : null,
                    counts ? `${canSellNote(s)} can sell` : null,
                ]
                    .filter(Boolean)
                    .join(" · ")}
            </p>
        </div>
    );
}
