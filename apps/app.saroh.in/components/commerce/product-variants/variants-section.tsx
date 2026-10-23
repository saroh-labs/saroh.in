"use client";

import { Button } from "@saroh/ui/button";
import { cn } from "@saroh/ui/lib/utils";
import { showUndo } from "@saroh/ui/toast";
import { Plus } from "lucide-react";
import { useRef, useState } from "react";

import { showPlanRefusal } from "@/components/billing/plan-refusal";
import { PlanWay } from "@/components/billing/plan-way";
import type { VariantCap } from "@/lib/billing/variant-cap";
import { variantCapNote } from "@/lib/billing/variant-cap";
import { formatMoneyMajor } from "@/lib/format/money";
import type { MrpPricing } from "@/lib/gst/mrp";
import { optionOverMrpNote } from "@/lib/gst/mrp";
import type { GstPriceMode } from "@/lib/gst/price-mode";
import {
    isMoney,
    LIMITS,
    optionPlural,
    trimMoney,
} from "@/lib/products/editor-sections";
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
import { EmptyState } from "@saroh/ui/data-state";
import { TextLink } from "@saroh/ui/text-link";

import {
    useEditor,
    useSection,
} from "@/components/commerce/product-editor-v2/editor-state";
import { FieldHelp } from "@/components/commerce/product-editor-v2/fields";
import { SectionCard } from "@/components/commerce/product-editor-v2/section-card";
import { ChangeOption, OptionShown } from "./change-option";
import { FIND_FROM, FindRow, matchesFind } from "./find-row";
import { OptionValuesInline } from "./option-values-inline";
import { OptionChoice, VariantAddRow } from "./variant-add-row";
import { VARIANT_GRID, VariantRowView } from "./variant-row";
import { DROPPED, saveVariantList } from "./variant-save";

/**
 * Variants: one per size, shade or colour — the same product, the same
 * description and category. A variant's value comes from Settings → Options,
 * so a size is spelled one way everywhere; its SKU, price and photo can
 * differ, and with more than one storefront, where it is sold ("Sell it at",
 * #525). Rows are staged and edited in place, and saved together.
 *
 * A plan may cap how many variants one product has (DEC-158). At the cap
 * "Add to list" is off and the line beside it says why and where more is;
 * every row already here stays and can still be edited or removed.
 */
export function VariantsSection({
    product,
    storeId,
    currency,
    options,
    sku,
    stores,
    listings,
    gstRegistered = false,
    businessPriceMode = null,
    variantCap = null,
}: {
    product: ProductDetail;
    storeId: string;
    currency: string;
    options: ProductOptionView[];
    /** Settings → SKUs, and this product's number for {N}. */
    sku: { pattern: string; suggest: boolean; n: number };
    /** The business's open storefronts. */
    stores: { id: string; name: string }[];
    /** Where it is sold; null with one storefront or when unread. */
    listings: ProductListingView[] | null;
    /** Known to be GST-registered: GST may be added to a price. */
    gstRegistered?: boolean;
    /** How the business's prices carry GST; null when it couldn't be told. */
    businessPriceMode?: GstPriceMode | null;
    /** The plan's cap on this product's variants; null when nothing caps them. */
    variantCap?: VariantCap | null;
}) {
    const { canWrite, saving, sayError } = useEditor();
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
    // The API's refusal of a row's SKU (another product has it), shown
    // under that row until its SKU is changed.
    const [skuRefused, setSkuRefused] = useState<
        Partial<Record<string, { sku: string; message: string }>>
    >({});
    const [changing, setChanging] = useState(false);
    const [find, setFind] = useState("");
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
        setSkuRefused({});
    }

    const option = options.find((o) => o.id === optionId) ?? null;
    const optName = option?.name ?? "Size";
    const opt = optName.toLowerCase();
    const values = option?.values ?? [];
    const titleOf = (r: VariantRow) =>
        values.find((x) => x.id === r.valueId)?.value ?? r.legacyTitle;
    const takenIds = rows.map((r) => r.valueId).filter(Boolean);
    const productPrice = isMoney(product.price) ? trimMoney(product.price) : "";
    // Said in a sentence with its separators ("₹1,299", UX-082); the field's
    // placeholder keeps the plain figure it would type.
    const shown = (m: string) => formatMoneyMajor(m, product.currency);
    const shownPrice = productPrice ? shown(productPrice) : "";
    // The API refuses an amount to pay over the MRP customers see struck
    // through; said here first, beside the price, rather than after a
    // Save. GST is part of MRP (`lib/gst/mrp.ts`): where GST is added to
    // the product's prices, the amount to pay is the price with its GST.
    const pricing: MrpPricing = {
        registered: gstRegistered,
        businessMode: businessPriceMode,
        itemMode: product.gstPriceMode ?? "",
        rate: product.gstRate ?? "",
    };
    // Why a variant's own price is over its MRP (its own, else the
    // product's), or "" when it isn't. A blank price is the product's.
    const mrpNote = (price: string, mrp: string | null) =>
        optionOverMrpNote(
            price,
            mrp ?? product.mrp,
            pricing,
            product.currency,
        ) ?? "";
    const overMrp = (price: string, mrp: string | null) =>
        mrpNote(price, mrp) !== "";
    // A variant shows a photo of its own, never a video.
    const photos = product.images.filter((i) => i.kind !== "video");
    const skuKey = (r: VariantRow) => r.sku.trim().toLowerCase();
    const refusedOf = (r: VariantRow) => {
        const said = skuRefused[r.key];
        return said?.sku === r.sku ? said.message : "";
    };
    const errOf = (r: VariantRow) =>
        variantProblem(r, rows, {
            opt,
            title: titleOf,
            overMrp: (x) => mrpNote(x.price, x.mrp),
        }) || refusedOf(r);
    const bad = rows.some((r) => errOf(r));
    const dirty = optionId !== savedOptionId || !sameRows(rows, base);
    // Added or removed rows change what Stock counts; an edit in place doesn't.
    const changesList =
        rows.some((r) => !r.id) ||
        base.some((b) => !rows.some((r) => r.id === b.id));

    // The row being added: its own gate, so Save is never blamed for it.
    const newTitle = values.find((x) => x.id === newValue)?.value ?? "";
    // The store's pattern (Settings → SKUs); off, the field starts empty.
    // Two values that shorten alike ("Hindi · Paperback", "Hindi ·
    // Hardcover") get -2, -3 rather than a SKU this product already has.
    const suggested =
        sku.suggest && newTitle
            ? skuFrom(
                  sku.pattern,
                  {
                      name: product.name,
                      category: product.category?.name ?? "",
                      value: newTitle,
                      n: sku.n,
                  },
                  rows.map((r) => r.sku.trim()).filter(Boolean),
              )
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
    // The list as staged against the plan's cap: removing a row here makes
    // room, as the save removes before it adds.
    const capNote = variantCapNote(variantCap, rows.length);
    const addOff =
        locked ||
        !!capNote ||
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
        if (out.toast) sayError("variants", out.toast);
        // The plan's refusal is its own notice, with the way to more.
        if (out.plan) showPlanRefusal(out.plan);
        setRows(out.next);
        // A SKU another product has is said under its row (16 Oct 2026).
        const rowsRefused = Object.keys(out.rowErrors).length > 0;
        setSkuRefused(out.rowErrors);
        // On success the rows as saved are the baseline, so the section is
        // clean at once; on a failure it is what did save, so the retry
        // skips it.
        setBase(out.why || rowsRefused ? out.saved : out.next);
        setFailed(out.failed);
        return !out.why && !rowsRefused;
    }

    useSection(
        "variants",
        {
            dirty,
            problem: bad
                ? "A variant needs a fix. See the row marked in red."
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
                setSkuRefused({});
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
        showUndo(`${titleOf(r) || "Variant"} removed from the list.`, () =>
            setRows(kept),
        );
    }

    const set = (key: string, patch: Partial<VariantRow>) =>
        setRows(rows.map((r) => (r.key === key ? { ...r, ...patch } : r)));

    const collapsed = rows.length === 0 && !adding && !dirty;
    // Past a dozen, a box finds one by its value or SKU; a row with
    // something to fix is always shown.
    const shownRows = rows
        .map((r, i) => ({ r, i }))
        .filter(
            ({ r }) =>
                rows.length <= FIND_FROM ||
                matchesFind(find, titleOf(r), r.sku) ||
                !!errOf(r),
        );

    return (
        <SectionCard k="variants" title="Variants">
            {collapsed ? (
                <>
                    <p className="mb-3 text-pretty text-[12.5px] leading-[1.55] text-foreground/75">
                        Sold as itself
                        {shownPrice ? ` at ${shownPrice}` : ""}. Add variants if
                        it comes in sizes, shades or colours. Each keeps the
                        product&apos;s description and category, and gets its
                        own stock count.
                    </p>
                    <Button
                        variant="outline"
                        type="button"
                        disabled={locked}
                        onClick={() => setAdding(true)}
                        className="gap-[7px]"
                    >
                        <Plus aria-hidden className="size-3.5" />
                        Add variants
                    </Button>
                </>
            ) : (
                <>
                    <FieldHelp className="mb-[11px]">
                        Each {opt} is the same product, with the same
                        description and category. SKU, price and photo can
                        differ.
                        {shownPrice ? ` A blank price uses ${shownPrice}.` : ""}
                    </FieldHelp>
                    {rows.length === 0 ? (
                        // Nothing listed yet: any option can be chosen.
                        <OptionChoice
                            options={options}
                            optionId={optionId}
                            locked={locked}
                            onPick={(o) => {
                                setOptionId(o.id);
                                setNewValue("");
                            }}
                        />
                    ) : (
                        // Listed under one option: only it is shown, and
                        // changing it says what happens to the list first.
                        <OptionShown
                            name={optName}
                            locked={locked || options.length < 2}
                            onChange={() => setChanging(true)}
                        />
                    )}
                    <ChangeOption
                        open={changing}
                        current={optionId}
                        options={options}
                        listed={rows.length}
                        opt={opt}
                        onClose={() => setChanging(false)}
                        onChoose={(id) => {
                            // Staged, as every change here is: Discard
                            // brings the list back until Variants is saved.
                            setRows([]);
                            setOptionId(id);
                            setNewValue("");
                            setChanging(false);
                        }}
                    />
                    {canWrite && (values.length === 0 || allTaken) ? (
                        <OptionValuesInline
                            optionId={option?.id ?? null}
                            optName={optName}
                            existing={values.map((v) => v.value)}
                            locked={locked}
                            onOption={setOptionId}
                        />
                    ) : null}

                    {rows.length > 0 ? (
                        <>
                            <div
                                className={cn(
                                    VARIANT_GRID,
                                    "label pb-[5px] text-muted-foreground/80",
                                )}
                            >
                                <span>{optName}</span>
                                <span>SKU</span>
                                <span>Price</span>
                                <span />
                            </div>
                            {rows.length > FIND_FROM ? (
                                <FindRow
                                    label={`Search ${optionPlural(optName)}`}
                                    value={find}
                                    onChange={setFind}
                                    shown={shownRows.length}
                                    total={rows.length}
                                />
                            ) : null}
                            <ol className="mb-3.5 flex flex-col gap-2">
                                {shownRows.map(({ r, i }) => (
                                    <VariantRowView
                                        key={r.key}
                                        row={r}
                                        index={i}
                                        title={titleOf(r)}
                                        opt={opt}
                                        values={values}
                                        takenIds={takenIds}
                                        skuDupe={
                                            !!refusedOf(r) ||
                                            rows.some(
                                                (x) =>
                                                    x.key !== r.key &&
                                                    !!skuKey(r) &&
                                                    skuKey(x) === skuKey(r),
                                            )
                                        }
                                        error={errOf(r)}
                                        currency={currency}
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
                        <EmptyState
                            data-ph-mask=""
                            size="inline"
                            className="mb-3"
                            title="No variants yet"
                            description={`It is sold as itself, at the price in Basics. Add one for each ${opt}.`}
                        />
                    )}

                    <VariantAddRow
                        opt={opt}
                        values={values}
                        takenIds={takenIds}
                        value={newValue}
                        sku={newSku}
                        suggested={suggested}
                        price={newPrice}
                        currency={currency}
                        productPrice={productPrice}
                        skuBad={dupSku || newSkuValue.length > LIMITS.sku}
                        priceBad={newPriceBad}
                        addOff={addOff}
                        locked={locked}
                        noteBad={!capNote && (dupSku || newPriceBad)}
                        noteAction={
                            capNote ? (
                                <PlanWay className="text-[11.5px] leading-[1.45]">
                                    <TextLink href={capNote.href} tone="muted">
                                        {capNote.cta}
                                    </TextLink>
                                </PlanWay>
                            ) : null
                        }
                        note={
                            capNote
                                ? capNote.text
                                : values.length === 0
                                  ? `No values for ${opt} yet. Add them above.`
                                  : allTaken
                                    ? `Every ${opt} is already a variant. Add another value above.`
                                    : dupSku
                                      ? "That SKU is already on this product."
                                      : newOverMrp
                                        ? mrpNote(newPrice, null)
                                        : newPriceBad
                                          ? "A number with at most two decimal places."
                                          : `Blank price uses the product's ${shownPrice}. Save variants to keep it.`
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
