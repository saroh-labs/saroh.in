"use client";

import { Input } from "@saroh/ui/input";
import { cn } from "@saroh/ui/lib/utils";
import { useId } from "react";

import type { SheetSize } from "@/lib/products/stock-sheet";
import { canSellNote } from "@/lib/products/stock-sheet";
import { Label } from "@saroh/ui/label";
import { MoneyInput } from "@saroh/ui/money-input";

/**
 * The sheet's column heads on the desk: variant · price · on hand · warn
 * at. A phone has no heads; each row labels its own boxes (T7). There is
 * no remove: a sheet for typing counts never deletes a variant (Products
 * audit, 16 Oct 2026). That is the editor's Variants section, which asks.
 */
export const ROW =
    "hidden grid-cols-[minmax(0,1.4fr)_84px_64px_64px] items-center gap-1.5 sm:grid";
/** Untracked: variant · price. */
export const PRICE_ROW =
    "hidden grid-cols-[minmax(0,1.4fr)_96px] items-center gap-1.5 sm:grid";

/*
 * A variant's own row. On a phone (below `sm`) its name has the first
 * line and its boxes share the second, each labelled; the desk keeps one
 * row under the heads above.
 */
const SIZE_ROW =
    "grid grid-cols-[repeat(3,minmax(0,1fr))] items-end gap-1.5 sm:grid-cols-[minmax(0,1.4fr)_84px_64px_64px] sm:items-center";
const SIZE_PRICE_ROW =
    "grid grid-cols-1 items-end gap-1.5 sm:grid-cols-[minmax(0,1.4fr)_96px] sm:items-center";
/** A box and, on a phone, its label above it. */
const FIELD = "grid min-w-0 gap-1 sm:contents";
const PHONE_LABEL = "text-[11.5px] text-muted-foreground sm:hidden";

const LOCKED = "bg-muted text-muted-foreground";

/**
 * One variant in the stock sheet (#523): its name and price (read-only
 * without `store:write`), what is on hand — the sum of its storefronts,
 * each with its own box, when there is more than one — and when to warn.
 * Named by the product's own option ("Shade 1 name").
 */
export function SheetSizeRow({
    size: s,
    index: i,
    counts,
    split,
    canWrite,
    hasVariants,
    productPrice,
    currency,
    optionName,
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
    /** The product's price, as edited: a variant's blank price. */
    productPrice: string;
    /** The product's currency, for the price box. */
    currency: string;
    /** The product's option ("Shade"); "Variant" when it has none. */
    optionName?: string | null;
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
    const nameLocked = !canWrite || s.variantId === null;
    const id = useId();
    const word = optionName?.trim() ? optionName.trim() : "Variant";
    const label = s.title || word;

    return (
        <div>
            <div className={counts ? SIZE_ROW : SIZE_PRICE_ROW}>
                <Input
                    value={s.title}
                    onChange={(e) => onSize({ title: e.target.value })}
                    readOnly={nameLocked}
                    aria-label={`${word} ${i + 1} name`}
                    className={cn(
                        counts && "col-span-3 sm:col-span-1",
                        nameLocked && LOCKED,
                    )}
                />
                {s.variantId === null && hasVariants ? (
                    // Counted as a whole: each size keeps its own price.
                    <span />
                ) : (
                    <div className={FIELD}>
                        <Label htmlFor={`${id}-price`} className={PHONE_LABEL}>
                            Price
                        </Label>
                        <MoneyInput
                            id={`${id}-price`}
                            currency={currency}
                            value={s.variantId ? s.price : productPrice}
                            onValueChange={(price) =>
                                s.variantId ? onSize({ price }) : onPrice(price)
                            }
                            readOnly={!canWrite}
                            placeholder={s.variantId ? productPrice : undefined}
                            aria-label={`${label} price${s.variantId ? ", blank for the product's" : ""}`}
                            className={cn(!canWrite && LOCKED)}
                        />
                    </div>
                )}
                {counts ? (
                    <>
                        <div className={FIELD}>
                            <Label
                                htmlFor={`${id}-on-hand`}
                                className={PHONE_LABEL}
                            >
                                On hand
                            </Label>
                            <Input
                                id={`${id}-on-hand`}
                                data-on-hand={split ? undefined : ""}
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
                            <Label
                                htmlFor={`${id}-warn`}
                                className={PHONE_LABEL}
                            >
                                Low stock at
                            </Label>
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
                              data-on-hand=""
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
