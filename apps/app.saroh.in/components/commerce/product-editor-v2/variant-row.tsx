"use client";

import { cn } from "@saroh/ui/lib/utils";
import { Trash2 } from "lucide-react";

import { OptionSelect } from "@/components/shared/option-select";
import { isMoney } from "@/lib/products/editor-sections";
import { soldAtSummary } from "@/lib/products/listing-changes";
import type { ProductImage } from "@/lib/products/service";
import type { VariantRow } from "@/lib/products/variant-rows";
import { isLegacy, legacyNote } from "@/lib/products/variant-rows";

import { boxClass, FieldHelp, MoneyBox } from "./fields";

export const VARIANT_GRID =
    "grid grid-cols-[minmax(0,2fr)_minmax(0,1.4fr)_minmax(0,1fr)_30px] gap-1.5";

/**
 * One variant in the Variants list: its value, SKU and price, and under
 * More the photo it opens on and — with more than one storefront — where it
 * is sold ("Sell it at", #525).
 */
export function VariantRowView({
    row: r,
    index: i,
    title,
    opt,
    values,
    takenIds,
    skuDupe,
    error,
    symbol,
    productPrice,
    photos,
    stores,
    open,
    locked,
    onOpen,
    onChange,
    onRemove,
}: {
    row: VariantRow;
    index: number;
    title: string;
    /** The option's name, lower case: "size". */
    opt: string;
    values: { id: string; value: string }[];
    takenIds: string[];
    skuDupe: boolean;
    error: string;
    symbol: string;
    productPrice: string;
    photos: ProductImage[];
    /** The business's storefronts when there is more than one; else []. */
    stores: { id: string; name: string }[];
    open: boolean;
    locked: boolean;
    onOpen: (open: boolean) => void;
    onChange: (patch: Partial<VariantRow>) => void;
    onRemove: () => void;
}) {
    const photo = photos.find((p) => p.id === r.imageId);
    const several = stores.length > 1;
    const legacy = isLegacy(r);
    const summary = [
        photo ? `Shows photo ${photos.indexOf(photo) + 1}` : "Shows the cover",
        ...(several ? [soldAtSummary(stores, r.stores)] : []),
    ].join(" · ");
    const nowhere = several && r.stores.length === 0;

    return (
        <li>
            <div className={cn(VARIANT_GRID, "items-center")}>
                <OptionSelect
                    value={r.valueId}
                    onValueChange={(id) =>
                        onChange({ valueId: id, legacyTitle: "" })
                    }
                    options={values.map((x) => ({
                        value: x.id,
                        label: x.value,
                        disabled: x.id !== r.valueId && takenIds.includes(x.id),
                    }))}
                    placeholder={title || `Pick a ${opt}`}
                    disabled={locked}
                    aria-label={`Variant ${i + 1} ${opt}`}
                    className={cn(
                        "h-8 rounded-[8px] text-[13px]",
                        !r.valueId && !legacy && "border-destructive",
                    )}
                />
                <input
                    value={r.sku}
                    onChange={(e) => onChange({ sku: e.target.value })}
                    disabled={locked}
                    aria-label={`Variant ${i + 1} SKU`}
                    className={boxClass({
                        small: true,
                        mono: true,
                        bad: !r.sku.trim() || skuDupe,
                    })}
                />
                <MoneyBox symbol={symbol} small>
                    <input
                        value={r.price}
                        onChange={(e) => onChange({ price: e.target.value })}
                        inputMode="decimal"
                        disabled={locked}
                        placeholder={productPrice}
                        aria-label={`Variant ${i + 1} price, blank uses the product's`}
                        className={cn(
                            boxClass({
                                small: true,
                                bad: r.price.trim() !== "" && !isMoney(r.price),
                            }),
                            "pl-[22px]",
                        )}
                    />
                </MoneyBox>
                <button
                    type="button"
                    disabled={locked}
                    onClick={onRemove}
                    aria-label={`Remove ${title || "this variant"}`}
                    title={`Remove ${title || "this variant"}`}
                    className="flex h-8 w-[30px] items-center justify-center rounded-[7px] text-muted-foreground hover:bg-destructive-subtle disabled:cursor-not-allowed coarse:size-11"
                >
                    <Trash2
                        aria-hidden
                        className="size-[15px]"
                        strokeWidth={1.9}
                    />
                </button>
            </div>
            <div className="mt-[5px] flex flex-wrap items-center gap-2">
                <button
                    type="button"
                    aria-expanded={open}
                    onClick={() => onOpen(!open)}
                    className="text-[12px] font-semibold text-brand hover:text-foreground coarse:min-h-11"
                >
                    {open ? "Less" : "More"}
                </button>
                <span
                    className={cn(
                        "min-w-0 text-pretty text-[11.5px]",
                        nowhere
                            ? "text-brand-subtle-foreground"
                            : "text-muted-foreground",
                    )}
                >
                    {summary}
                </span>
            </div>
            {open ? (
                <div className="mt-[7px] rounded-[9px] bg-muted/50 px-3 py-[11px]">
                    <PhotoChoice
                        title={title}
                        photos={photos}
                        imageId={r.imageId}
                        locked={locked}
                        onPick={(imageId) => onChange({ imageId })}
                    />
                    {several ? (
                        <SellItAt
                            title={title}
                            opt={opt}
                            stores={stores}
                            chosen={r.stores}
                            locked={locked}
                            onChange={(ids) => onChange({ stores: ids })}
                        />
                    ) : null}
                </div>
            ) : null}
            {error ? (
                <p
                    role="alert"
                    className="mt-1 text-[11.5px] leading-[1.45] text-destructive"
                >
                    {error}
                </p>
            ) : legacy ? (
                <FieldHelp className="mt-1">
                    {legacyNote(r.legacyTitle, opt)}
                </FieldHelp>
            ) : null}
        </li>
    );
}

function PhotoChoice({
    title,
    photos,
    imageId,
    locked,
    onPick,
}: {
    title: string;
    photos: ProductImage[];
    imageId: string;
    locked: boolean;
    onPick: (imageId: string) => void;
}) {
    const choices = [
        { id: "", url: photos[0]?.url ?? "", label: "The cover" },
        ...photos
            .slice(1)
            .map((p, j) => ({ id: p.id, url: p.url, label: `Photo ${j + 2}` })),
    ];
    return (
        <>
            <p className="mb-[7px] text-[12px] font-semibold">
                Photo shown when someone picks it
            </p>
            <div
                role="radiogroup"
                aria-label={`Photo for ${title || "this variant"}`}
                className="flex flex-wrap gap-1.5"
            >
                {choices.map((p) => {
                    const on = imageId === p.id;
                    return (
                        <button
                            key={p.id || "cover"}
                            type="button"
                            role="radio"
                            aria-checked={on}
                            disabled={locked}
                            onClick={() => onPick(p.id)}
                            className={cn(
                                "inline-flex h-[30px] items-center gap-1.5 rounded-[8px] bg-card pl-1 pr-2.5 disabled:cursor-not-allowed coarse:h-11",
                                on
                                    ? "border-[1.5px] border-foreground"
                                    : "border border-border",
                            )}
                        >
                            {p.url ? (
                                // eslint-disable-next-line @next/next/no-img-element -- a tenant's own photos
                                <img
                                    src={p.url}
                                    alt=""
                                    className="h-[22px] w-[30px] shrink-0 rounded-[5px] object-cover"
                                />
                            ) : (
                                <span className="h-[22px] w-[30px] shrink-0 rounded-[5px] bg-muted" />
                            )}
                            <span className="max-w-[110px] truncate text-[11.5px]">
                                {p.label}
                            </span>
                        </button>
                    );
                })}
            </div>
            <FieldHelp className="mt-1.5">
                Chosen from this product&apos;s photos — nothing new to upload.
            </FieldHelp>
        </>
    );
}

/**
 * "Sell it at": a chip per storefront, on where this variant is sold.
 * Saved with the list; a storefront left selling no variant stops selling
 * the product, and its shelf keeps what is on it.
 */
function SellItAt({
    title,
    opt,
    stores,
    chosen,
    locked,
    onChange,
}: {
    title: string;
    opt: string;
    stores: { id: string; name: string }[];
    chosen: string[];
    locked: boolean;
    onChange: (ids: string[]) => void;
}) {
    return (
        <>
            <p className="mb-[7px] mt-3 text-[12px] font-semibold">
                Sell it at
            </p>
            <div
                role="group"
                aria-label={`Where ${title || "this variant"} is sold`}
                className="flex flex-wrap gap-1.5"
            >
                {stores.map((s) => {
                    const on = chosen.includes(s.id);
                    return (
                        <button
                            key={s.id}
                            type="button"
                            aria-pressed={on}
                            disabled={locked}
                            onClick={() =>
                                onChange(
                                    on
                                        ? chosen.filter((id) => id !== s.id)
                                        : [...chosen, s.id],
                                )
                            }
                            className={cn(
                                "h-[30px] rounded-full border px-3 text-[12.5px] disabled:cursor-not-allowed coarse:h-11",
                                on
                                    ? "border-foreground bg-foreground font-semibold text-background"
                                    : "border-border bg-card font-medium text-foreground/75 hover:bg-muted/50",
                            )}
                        >
                            {s.name}
                        </button>
                    );
                })}
            </div>
            {chosen.length === 0 ? (
                <p
                    role="status"
                    className="mt-[7px] text-[11.5px] text-brand-subtle-foreground"
                >
                    Not sold anywhere — customers will not see this {opt}.
                </p>
            ) : null}
        </>
    );
}
