"use client";

import { cn } from "@saroh/ui/lib/utils";
import { showError, showUndo } from "@saroh/ui/toast";
import { Plus } from "lucide-react";
import { useRef, useState } from "react";

import { isMoney, LIMITS, trimMoney } from "@/lib/products/editor-sections";
import type { ProductListingView } from "@/lib/products/listing-changes";
import { newVariantStores, soldAtFrom } from "@/lib/products/listing-changes";
import type { ProductDetail, ProductOptionView } from "@/lib/products/service";
import { skuFrom } from "@/lib/products/sku-pattern";
import type { VariantRow } from "@/lib/products/variant-rows";
import {
    rowsFrom,
    sameRows,
    variantProblem,
} from "@/lib/products/variant-rows";

import { useEditor, useSection } from "./editor-state";
import { FieldHelp } from "./fields";
import { SectionCard } from "./section-card";
import { OptionChoice, VariantAddRow } from "./variant-add-row";
import { VARIANT_GRID, VariantRowView } from "./variant-row";
import { DROPPED, saveVariantList } from "./variant-save";

/**
 * Variants: one per size, shade or colour — the same product, the same
 * description and category. A variant's value comes from Settings → Options,
 * so a size is spelled one way everywhere; its SKU, price and photo can
 * differ, and with more than one storefront, where it is sold ("Sell it at",
 * #525). Rows are staged and edited in place, and saved together.
 */
export function VariantsSection({
    product,
    storeId,
    symbol,
    options,
    sku,
    stores,
    listings,
}: {
    product: ProductDetail;
    storeId: string;
    symbol: string;
    options: ProductOptionView[];
    /** Settings → SKUs, and this product's number for {N}. */
    sku: { pattern: string; suggest: boolean; n: number };
    /** The business's open storefronts. */
    stores: { id: string; name: string }[];
    /** Where it is sold; null with one storefront or when unread. */
    listings: ProductListingView[] | null;
}) {
    const { canWrite, saving } = useEditor();
    // While its save runs, the list is what is being sent: typing into it
    // then would be overwritten by what comes back.
    const busy = saving.includes("variants");
    const locked = !canWrite || busy;
    // "Sell it at" only where there is a choice, and only once it is known.
    const sellAt = stores.length > 1 && listings ? stores : [];
    const soldAt = listings ? soldAtFrom(listings) : {};
    const savedOptionId = product.optionId ?? options.at(0)?.id ?? "";
    const savedOption = options.find((o) => o.id === savedOptionId) ?? null;
    const fromProduct = rowsFrom(product.variants, savedOption, soldAt);
    const loadedKey = JSON.stringify([
        savedOptionId,
        product.variants.map((v) => [
            v.id,
            v.sku,
            v.title,
            v.price,
            v.imageId,
            v.optionValueId,
            v.position,
        ]),
        soldAt,
    ]);
    const [base, setBase] = useState<VariantRow[]>(fromProduct);
    const [rows, setRows] = useState<VariantRow[]>(fromProduct);
    const [optionId, setOptionId] = useState(savedOptionId);
    const [seen, setSeen] = useState(loadedKey);
    // Why the last save stopped: the API's refusal, or the connection.
    const [failed, setFailed] = useState<string | null>(null);
    const [adding, setAdding] = useState(false);
    const [open, setOpen] = useState<string | null>(null);
    const [newValue, setNewValue] = useState("");
    const [newSku, setNewSku] = useState("");
    const [newPrice, setNewPrice] = useState("");
    // Keys for rows not saved yet; ids arrive when they are.
    const nextKey = useRef(0);
    if (seen !== loadedKey) {
        setSeen(loadedKey);
        setBase(fromProduct);
        setRows(fromProduct);
        setOptionId(savedOptionId);
        setFailed(null);
    }

    const option = options.find((o) => o.id === optionId) ?? null;
    const optName = option?.name ?? "Size";
    const opt = optName.toLowerCase();
    const values = option?.values ?? [];
    const titleOf = (r: VariantRow) =>
        values.find((x) => x.id === r.valueId)?.value ?? r.legacyTitle;
    const takenIds = rows.map((r) => r.valueId).filter(Boolean);
    const productPrice = isMoney(product.price) ? trimMoney(product.price) : "";
    const cents = (m: string) => Math.round(Number(m) * 100);
    // The API refuses a price over the MRP customers see struck through;
    // said here first, beside the price, rather than after a Save.
    const mrpNote = (mrp: string | null) =>
        `Above the MRP of ${symbol}${trimMoney(mrp ?? product.mrp ?? "")}. Lower it, or raise the MRP in Basics.`;
    const overMrp = (price: string, mrp: string | null) => {
        const cap = mrp ?? product.mrp;
        return (
            !!price.trim() &&
            isMoney(price) &&
            !!cap &&
            isMoney(cap) &&
            cents(price) > cents(cap)
        );
    };
    // A variant shows a photo of its own, never a video.
    const photos = product.images.filter((i) => i.kind !== "video");
    const skuKey = (r: VariantRow) => r.sku.trim().toLowerCase();
    const errOf = (r: VariantRow) =>
        variantProblem(r, rows, {
            opt,
            title: titleOf,
            overMrp: (x) => (overMrp(x.price, x.mrp) ? mrpNote(x.mrp) : ""),
        });
    const bad = rows.some((r) => errOf(r));
    const dirty = optionId !== savedOptionId || !sameRows(rows, base);
    // Added or removed rows change what Stock counts; an edit in place doesn't.
    const changesList =
        rows.some((r) => !r.id) ||
        base.some((b) => !rows.some((r) => r.id === b.id));

    // The row being added: its own gate, so Save is never blamed for it.
    const newTitle = values.find((x) => x.id === newValue)?.value ?? "";
    // The store's pattern (Settings → SKUs); off, the field starts empty.
    const suggested =
        sku.suggest && newTitle
            ? skuFrom(sku.pattern, {
                  name: product.name,
                  category: product.category?.name ?? "",
                  value: newTitle,
                  n: sku.n,
              })
            : "";
    const newSkuValue = newSku.trim() || suggested;
    const dupSku =
        newSkuValue !== "" &&
        rows.some((r) => skuKey(r) === newSkuValue.toLowerCase());
    const newOverMrp = overMrp(newPrice, null);
    const newPriceBad =
        (newPrice.trim() !== "" && !isMoney(newPrice)) || newOverMrp;
    const allTaken =
        values.length > 0 && values.every((x) => takenIds.includes(x.id));
    const addOff =
        locked ||
        !newValue ||
        takenIds.includes(newValue) ||
        dupSku ||
        newPriceBad ||
        newSkuValue === "" ||
        newSkuValue.length > LIMITS.sku;

    async function save(): Promise<boolean> {
        const out = await saveVariantList({
            product,
            storeId,
            rows,
            base,
            optionId,
            titleOf,
            listings,
            sellAt,
        });
        if (out.toast) showError(out.toast);
        setRows(out.next);
        // On success the rows as saved are the baseline, so the section is
        // clean at once; on a failure it is what did save, so the retry
        // skips it.
        setBase(out.why ? out.saved : out.next);
        setFailed(out.failed);
        return !out.why;
    }

    useSection(
        "variants",
        {
            dirty,
            problem: bad
                ? "A variant needs a fix — see the row marked in red."
                : "",
            note: failed ? `${failed} Your changes are still here.` : undefined,
            noteIsError: !!failed,
            saveLabel: failed === DROPPED ? "Try again" : undefined,
            changesList,
        },
        {
            save,
            discard: () => {
                setRows(base);
                setOptionId(savedOptionId);
                setFailed(null);
                setNewValue("");
                setNewSku("");
                setNewPrice("");
                setAdding(false);
            },
        },
    );

    function add() {
        if (addOff) return;
        setRows([
            ...rows,
            {
                key: `new-${(nextKey.current += 1)}`,
                valueId: newValue,
                legacyTitle: "",
                sku: newSkuValue,
                price: newPrice.trim(),
                mrp: null,
                image: null,
                imageId: "",
                stores: listings ? newVariantStores(listings) : [],
            },
        ]);
        setNewValue("");
        setNewSku("");
        setNewPrice("");
    }

    function remove(r: VariantRow) {
        const kept = rows;
        setRows(rows.filter((x) => x.key !== r.key));
        showUndo(`${titleOf(r) || "Variant"} removed from the list`, () =>
            setRows(kept),
        );
    }

    const set = (key: string, patch: Partial<VariantRow>) =>
        setRows(rows.map((r) => (r.key === key ? { ...r, ...patch } : r)));

    const collapsed = rows.length === 0 && !adding && !dirty;

    return (
        <SectionCard k="variants" title="Variants">
            {collapsed ? (
                <>
                    <p className="mb-3 text-pretty text-[12.5px] leading-[1.55] text-foreground/75">
                        Sold as itself
                        {productPrice ? ` at ${symbol}${productPrice}` : ""}.
                        Add variants if it comes in sizes, shades or colours —
                        each keeps the product&apos;s description and category,
                        and gets its own stock count.
                    </p>
                    <button
                        type="button"
                        disabled={locked}
                        onClick={() => setAdding(true)}
                        className="inline-flex h-[38px] items-center gap-[7px] rounded-[9px] border border-border bg-card px-4 text-[12.5px] font-semibold hover:bg-muted/50 disabled:cursor-not-allowed disabled:opacity-60 coarse:h-11"
                    >
                        <Plus
                            aria-hidden
                            className="size-3.5"
                            strokeWidth={2.2}
                        />
                        Add variants
                    </button>
                </>
            ) : (
                <>
                    <FieldHelp className="mb-[11px]">
                        Each variant is the same product — same description and
                        category. Its value comes from Settings → Options; SKU,
                        price and photo can differ; a grey price is the
                        product&apos;s {symbol}
                        {productPrice}.
                    </FieldHelp>
                    <OptionChoice
                        options={options}
                        optionId={optionId}
                        locked={locked}
                        onPick={(o) => {
                            // Values belong to one option; switching would
                            // orphan them all.
                            if (rows.length > 0) {
                                showError(
                                    `Remove the variants first to sell it by ${o.name.toLowerCase()} instead.`,
                                );
                                return;
                            }
                            setOptionId(o.id);
                            setNewValue("");
                        }}
                    />

                    {rows.length > 0 ? (
                        <>
                            <div
                                className={cn(
                                    VARIANT_GRID,
                                    "pb-[5px] text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground/80",
                                )}
                            >
                                <span>{optName}</span>
                                <span>SKU</span>
                                <span>Price</span>
                                <span />
                            </div>
                            <ol className="mb-3.5 flex flex-col gap-2">
                                {rows.map((r, i) => (
                                    <VariantRowView
                                        key={r.key}
                                        row={r}
                                        index={i}
                                        title={titleOf(r)}
                                        opt={opt}
                                        values={values}
                                        takenIds={takenIds}
                                        skuDupe={rows.some(
                                            (x) =>
                                                x.key !== r.key &&
                                                !!skuKey(r) &&
                                                skuKey(x) === skuKey(r),
                                        )}
                                        error={errOf(r)}
                                        symbol={symbol}
                                        productPrice={productPrice}
                                        photos={photos}
                                        stores={sellAt}
                                        open={open === r.key}
                                        locked={locked}
                                        onOpen={(on) =>
                                            setOpen(on ? r.key : null)
                                        }
                                        onChange={(patch) => set(r.key, patch)}
                                        onRemove={() => remove(r)}
                                    />
                                ))}
                            </ol>
                        </>
                    ) : (
                        <div className="mb-3 text-pretty rounded-[10px] border border-dashed border-border-strong p-3.5 text-[12px] leading-[1.5] text-foreground/75">
                            No variants. It is sold as itself, at the price in
                            Basics. Add one for each {opt}.
                        </div>
                    )}

                    <VariantAddRow
                        opt={opt}
                        values={values}
                        takenIds={takenIds}
                        value={newValue}
                        sku={newSku}
                        suggested={suggested}
                        price={newPrice}
                        symbol={symbol}
                        productPrice={productPrice}
                        skuBad={dupSku || newSkuValue.length > LIMITS.sku}
                        priceBad={newPriceBad}
                        addOff={addOff}
                        locked={locked}
                        noteBad={dupSku || newPriceBad}
                        note={
                            values.length === 0
                                ? `No values for ${opt} yet — add them in Settings → Options.`
                                : allTaken
                                  ? `Every ${opt} is already a variant. Add another value in Settings → Options.`
                                  : dupSku
                                    ? "That SKU is already on this product."
                                    : newOverMrp
                                      ? mrpNote(null)
                                      : newPriceBad
                                        ? "A number with at most two decimal places."
                                        : `Blank price uses the product's ${symbol}${productPrice}. Save variants to keep it.`
                        }
                        onValue={setNewValue}
                        onSku={setNewSku}
                        onPrice={setNewPrice}
                        onAdd={add}
                    />
                </>
            )}
        </SectionCard>
    );
}
