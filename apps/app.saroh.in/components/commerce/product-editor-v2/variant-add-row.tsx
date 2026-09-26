"use client";

import { cn } from "@saroh/ui/lib/utils";
import Link from "next/link";

import { OptionSelect } from "@/components/shared/option-select";
import { productSettingsHref } from "@/lib/products/links";

import { boxClass, MoneyBox } from "./fields";

/**
 * "Add a variant": a value, a SKU (the store's pattern suggests one) and a
 * price, staged into the list with **Add to list** — kept from the first
 * build rather than the design's "Add variant", because the product-editor
 * film says it (a deliberate difference, #525). Its own gate, so Save is
 * never blamed for a row that isn't in the list yet.
 */
export function VariantAddRow({
    opt,
    values,
    takenIds,
    value,
    sku,
    suggested,
    price,
    symbol,
    productPrice,
    skuBad,
    priceBad,
    addOff,
    locked,
    note,
    noteBad,
    onValue,
    onSku,
    onPrice,
    onAdd,
}: {
    opt: string;
    values: { id: string; value: string }[];
    takenIds: string[];
    value: string;
    sku: string;
    suggested: string;
    price: string;
    symbol: string;
    productPrice: string;
    skuBad: boolean;
    priceBad: boolean;
    addOff: boolean;
    locked: boolean;
    note: string;
    noteBad: boolean;
    onValue: (id: string) => void;
    onSku: (sku: string) => void;
    onPrice: (price: string) => void;
    onAdd: () => void;
}) {
    return (
        <div className="rounded-[10px] bg-muted/50 px-[13px] py-3">
            <p className="mb-2 text-[12px] font-semibold">Add a variant</p>
            <div className="grid grid-cols-[minmax(0,2fr)_minmax(0,1.4fr)_minmax(0,1fr)] gap-1.5">
                <OptionSelect
                    value={value}
                    onValueChange={onValue}
                    options={values.map((x) => ({
                        value: x.id,
                        label: takenIds.includes(x.id)
                            ? `${x.value} — already a variant`
                            : x.value,
                        disabled: takenIds.includes(x.id),
                    }))}
                    placeholder={`Pick a ${opt}`}
                    disabled={locked || values.length === 0}
                    aria-label={`New variant ${opt}`}
                    className="h-8 rounded-[8px] text-[13px]"
                />
                <input
                    value={sku}
                    onChange={(e) => onSku(e.target.value)}
                    disabled={locked}
                    aria-label="New variant SKU"
                    placeholder={suggested || "SKU"}
                    className={boxClass({
                        small: true,
                        mono: true,
                        bad: skuBad,
                    })}
                />
                <MoneyBox symbol={symbol} small>
                    <input
                        value={price}
                        onChange={(e) => onPrice(e.target.value)}
                        inputMode="decimal"
                        disabled={locked}
                        placeholder={productPrice}
                        aria-label="New variant price, blank uses the product's"
                        className={cn(
                            boxClass({ small: true, bad: priceBad }),
                            "pl-[22px]",
                        )}
                    />
                </MoneyBox>
            </div>
            <div className="mt-[9px] flex flex-wrap items-center gap-2.5">
                <button
                    type="button"
                    disabled={addOff}
                    onClick={onAdd}
                    className="h-8 shrink-0 rounded-[8px] bg-foreground px-[13px] text-[12.5px] font-semibold text-background hover:bg-foreground/90 disabled:bg-muted disabled:text-muted-foreground coarse:h-11"
                >
                    Add to list
                </button>
                <span
                    className={cn(
                        "min-w-0 flex-1 text-pretty text-[11.5px] leading-[1.45]",
                        noteBad ? "text-destructive" : "text-muted-foreground",
                    )}
                >
                    {note}
                </span>
            </div>
        </div>
    );
}

/**
 * "Customers choose by": the option the product's variants take their
 * values from (Settings → Options), and the way to manage them.
 */
export function OptionChoice({
    options,
    optionId,
    locked,
    onPick,
}: {
    options: { id: string; name: string }[];
    optionId: string;
    locked: boolean;
    /** A different option was picked; the caller decides if it can be. */
    onPick: (option: { id: string; name: string }) => void;
}) {
    return (
        <div className="mb-2.5 flex flex-wrap items-center gap-2">
            <span className="text-[12px] font-medium">Customers choose by</span>
            <div
                role="radiogroup"
                aria-label="Option name"
                className="flex flex-wrap gap-[5px]"
            >
                {options.map((o) => {
                    const on = o.id === optionId;
                    return (
                        <button
                            key={o.id}
                            type="button"
                            role="radio"
                            aria-checked={on}
                            disabled={locked}
                            onClick={() => {
                                if (!on) onPick(o);
                            }}
                            className={cn(
                                "h-7 rounded-full border px-2.5 text-[12px] disabled:cursor-not-allowed coarse:h-11",
                                on
                                    ? "border-foreground bg-foreground font-semibold text-background"
                                    : "border-border bg-card font-medium text-foreground/75 hover:bg-muted/50",
                            )}
                        >
                            {o.name}
                        </button>
                    );
                })}
            </div>
            <Link
                href={productSettingsHref("options")}
                className="text-[12px] text-brand hover:text-foreground"
            >
                Manage options
            </Link>
        </div>
    );
}
