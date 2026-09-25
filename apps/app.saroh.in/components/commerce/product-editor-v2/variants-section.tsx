"use client";

import { cn } from "@saroh/ui/lib/utils";
import { showError, showUndo } from "@saroh/ui/toast";
import { Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRef, useState } from "react";

import { OptionSelect } from "@/components/shared/option-select";
import {
    createVariant,
    deleteVariant,
    patchProduct,
    reorderVariants,
    updateVariant,
} from "@/lib/products/actions";
import { isMoney, LIMITS, trimMoney } from "@/lib/products/editor-sections";
import { productSettingsHref } from "@/lib/products/links";
import type {
    ProductDetail,
    ProductOptionView,
    Variant,
} from "@/lib/products/service";
import { skuFrom } from "@/lib/products/sku-pattern";

import { useEditor, useSection } from "./editor-state";
import { boxClass, FieldHelp, MoneyBox } from "./fields";
import { SectionCard } from "./section-card";

/** One variant as the list stages it; `id` once it is saved. */
interface Row {
    key: string;
    id?: string;
    valueId: string;
    /** A saved variant's title when it has no value from Settings → Options. */
    legacyTitle: string;
    sku: string;
    price: string;
    /** Carried through unchanged: the list does not edit them. */
    mrp: string | null;
    image: string | null;
    imageId: string;
}

function rowsFrom(
    variants: Variant[],
    option: ProductOptionView | null,
): Row[] {
    return [...variants]
        .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
        .map((v) => {
            const byTitle = option?.values.find((x) => x.value === v.title);
            const valueId = v.optionValueId ?? byTitle?.id ?? "";
            return {
                key: v.id,
                id: v.id,
                valueId,
                legacyTitle: valueId ? "" : v.title,
                sku: v.sku,
                price: v.price ? trimMoney(v.price) : "",
                mrp: v.mrp ?? null,
                image: v.image,
                imageId: v.imageId ?? "",
            };
        });
}

/** A save that never reached the API, as opposed to one it refused. */
const DROPPED =
    "Couldn't save variants — the connection dropped. The product itself is saved.";

const sameRows = (a: Row[], b: Row[]) =>
    a.length === b.length &&
    a.every((r, i) => {
        const o = b.at(i);
        return (
            !!o &&
            r.key === o.key &&
            r.valueId === o.valueId &&
            r.legacyTitle === o.legacyTitle &&
            r.sku === o.sku &&
            r.price === o.price &&
            r.imageId === o.imageId
        );
    });

/**
 * Variants: one per size, shade or colour — the same product, the same
 * description and category. A variant's value comes from Settings → Options,
 * so a size is spelled one way everywhere; its SKU, price and photo can
 * differ. Rows are staged and edited in place, and saved together.
 */
export function VariantsSection({
    product,
    storeId,
    symbol,
    options,
    sku,
}: {
    product: ProductDetail;
    storeId: string;
    symbol: string;
    options: ProductOptionView[];
    /** Settings → SKUs, and this product's number for {N}. */
    sku: { pattern: string; suggest: boolean; n: number };
}) {
    const { canWrite, saving } = useEditor();
    // While its save runs, the list is what is being sent: typing into it
    // then would be overwritten by what comes back.
    const busy = saving.includes("variants");
    const ro = !canWrite;
    const locked = ro || busy;
    const savedOptionId = product.optionId ?? options.at(0)?.id ?? "";
    const savedOption = options.find((o) => o.id === savedOptionId) ?? null;
    const fromProduct = rowsFrom(product.variants, savedOption);
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
    ]);
    const [base, setBase] = useState<Row[]>(fromProduct);
    const [rows, setRows] = useState<Row[]>(fromProduct);
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
    const titleOf = (r: Row) =>
        values.find((x) => x.id === r.valueId)?.value ?? r.legacyTitle;
    const takenIds = rows.map((r) => r.valueId).filter(Boolean);
    const productPrice = isMoney(product.price) ? trimMoney(product.price) : "";
    const cents = (m: string) => Math.round(Number(m) * 100);
    // The API refuses a price over the MRP customers see struck through;
    // said here first, beside the price, rather than after a Save.
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
    const mrpNote = (mrp: string | null) =>
        `Above the MRP of ${symbol}${trimMoney(mrp ?? product.mrp ?? "")}. Lower it, or raise the MRP in Basics.`;
    // A variant shows a photo of its own, never a video.
    const photos = product.images.filter((i) => i.kind !== "video");

    const skuCount: Record<string, number> = {};
    for (const r of rows) {
        const k = r.sku.trim().toLowerCase();
        if (k) skuCount[k] = (skuCount[k] ?? 0) + 1;
    }
    const errOf = (r: Row): string => {
        const title = titleOf(r);
        if (!r.valueId && !title) return `Pick a ${opt}.`;
        if (!r.valueId)
            return `“${title}” is not a ${opt} in Settings → Options. Pick one, or add it there.`;
        if (rows.filter((x) => x.valueId === r.valueId).length > 1)
            return `Two variants are both ${title}.`;
        if (!r.sku.trim()) return "Needs a SKU.";
        if (r.sku.length > LIMITS.sku)
            return `A SKU is at most ${LIMITS.sku} characters.`;
        if ((skuCount[r.sku.trim().toLowerCase()] ?? 0) > 1)
            return "Another variant already has this SKU.";
        if (r.price.trim() && !isMoney(r.price))
            return "Price: a number with at most two decimals, or blank to use the product's.";
        if (overMrp(r.price, r.mrp)) return `Price: ${mrpNote(r.mrp)}`;
        return "";
    };
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
        rows.some(
            (r) => r.sku.trim().toLowerCase() === newSkuValue.toLowerCase(),
        );
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
        // The first refusal names what stopped the save; the rest still run.
        let why: string | null = null;
        let next = rows;
        // What the server holds after each call that worked, so a retry
        // after a partial failure resends only what is still different.
        let saved = base;
        const replace = (key: string, patch: Partial<Row>) => {
            next = next.map((r) => (r.key === key ? { ...r, ...patch } : r));
        };
        try {
            // Removed first: a value or SKU freed by a removal can be taken
            // by a new row, and a product left with none can change option.
            const goneIds = base
                .map((b) => b.id)
                .filter(
                    (id): id is string =>
                        !!id && !rows.some((r) => r.id === id),
                );
            for (const goneId of goneIds) {
                const res = await deleteVariant(product.id, goneId);
                if (res.ok) saved = saved.filter((b) => b.id !== goneId);
                else why ??= res.error;
            }
            // A refused removal says why; changing option would only be
            // refused next for the variant still there.
            if (why) {
                setBase(saved);
                setFailed(why);
                return false;
            }
            if (optionId !== (product.optionId ?? "")) {
                const res = await patchProduct(storeId, product.id, {
                    optionId: optionId || null,
                });
                if (!res.ok) {
                    setBase(saved);
                    showError(res.error);
                    return false;
                }
            }
            for (const r of rows) {
                const input = {
                    sku: r.sku.trim(),
                    title: titleOf(r),
                    price: r.price.trim() || null,
                    mrp: r.mrp,
                    image: r.image,
                    optionValueId: r.valueId || null,
                    imageId: r.imageId || null,
                };
                const was = base.find((b) => b.id && b.id === r.id);
                if (!r.id) {
                    const res = await createVariant(product.id, input);
                    if (!res.ok) {
                        why ??= res.error;
                        continue;
                    }
                    // Saved: a retry must update it, not make it twice.
                    replace(r.key, { id: res.data.id });
                    saved = [...saved, { ...r, id: res.data.id }];
                } else if (was && !sameRows([r], [was])) {
                    const res = await updateVariant(product.id, r.id, input);
                    if (res.ok)
                        saved = saved.map((b) => (b.id === r.id ? r : b));
                    else why ??= res.error;
                }
            }
            const ids = next
                .map((r) => r.id)
                .filter((id): id is string => !!id);
            const savedOrder = base
                .map((b) => b.id)
                .filter((id): id is string => !!id);
            if (
                !why &&
                ids.length > 1 &&
                JSON.stringify(ids) !==
                    JSON.stringify(savedOrder.filter((id) => ids.includes(id)))
            ) {
                const res = await reorderVariants(storeId, product.id, ids);
                if (!res.ok) why ??= res.error;
            }
        } catch {
            why ??= DROPPED;
        }
        setRows(next);
        // On success the rows as saved are the baseline, so the section is
        // clean at once; on a failure it is what did save, so the retry
        // skips it.
        setBase(why ? saved : next);
        setFailed(why);
        return !why;
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
            },
        ]);
        setNewValue("");
        setNewSku("");
        setNewPrice("");
    }

    function remove(r: Row) {
        const kept = rows;
        setRows(rows.filter((x) => x.key !== r.key));
        showUndo(`${titleOf(r) || "Variant"} removed from the list`, () =>
            setRows(kept),
        );
    }

    const set = (key: string, patch: Partial<Row>) =>
        setRows(rows.map((r) => (r.key === key ? { ...r, ...patch } : r)));

    const collapsed = rows.length === 0 && !adding && !dirty;
    const grid =
        "grid grid-cols-[minmax(0,2fr)_minmax(0,1.4fr)_minmax(0,1fr)_30px] gap-1.5";

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
                        className="inline-flex h-[34px] items-center gap-[7px] rounded-[9px] border border-border bg-card px-[13px] text-[12.5px] font-semibold hover:bg-muted/50 disabled:cursor-not-allowed disabled:opacity-60 coarse:h-11"
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
                    <div className="mb-2.5 flex flex-wrap items-center gap-2">
                        <span className="text-[12px] font-medium">
                            Customers choose by
                        </span>
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
                                            if (on) return;
                                            // Values belong to one option;
                                            // switching would orphan them all.
                                            if (rows.length > 0) {
                                                showError(
                                                    `Remove the variants first to sell it by ${o.name.toLowerCase()} instead.`,
                                                );
                                                return;
                                            }
                                            setOptionId(o.id);
                                            setNewValue("");
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

                    {rows.length > 0 ? (
                        <>
                            <div
                                className={cn(
                                    grid,
                                    "pb-[5px] text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground/80",
                                )}
                            >
                                <span>{optName}</span>
                                <span>SKU</span>
                                <span>Price</span>
                                <span />
                            </div>
                            <ol className="mb-3.5 flex flex-col gap-2">
                                {rows.map((r, i) => {
                                    const title = titleOf(r);
                                    const err = errOf(r);
                                    const photo = photos.find(
                                        (p) => p.id === r.imageId,
                                    );
                                    const isOpen = open === r.key;
                                    const dupe =
                                        (skuCount[r.sku.trim().toLowerCase()] ??
                                            0) > 1;
                                    return (
                                        <li key={r.key}>
                                            <div
                                                className={cn(
                                                    grid,
                                                    "items-center",
                                                )}
                                            >
                                                <OptionSelect
                                                    value={r.valueId}
                                                    onValueChange={(id) =>
                                                        set(r.key, {
                                                            valueId: id,
                                                            legacyTitle: "",
                                                        })
                                                    }
                                                    options={values.map(
                                                        (x) => ({
                                                            value: x.id,
                                                            label: x.value,
                                                            disabled:
                                                                x.id !==
                                                                    r.valueId &&
                                                                takenIds.includes(
                                                                    x.id,
                                                                ),
                                                        }),
                                                    )}
                                                    placeholder={
                                                        title || `Pick a ${opt}`
                                                    }
                                                    disabled={locked}
                                                    aria-label={`Variant ${i + 1} ${opt}`}
                                                    className={cn(
                                                        "h-8 rounded-[8px] text-[13px]",
                                                        !r.valueId &&
                                                            "border-destructive",
                                                    )}
                                                />
                                                <input
                                                    value={r.sku}
                                                    onChange={(e) =>
                                                        set(r.key, {
                                                            sku: e.target.value,
                                                        })
                                                    }
                                                    disabled={locked}
                                                    aria-label={`Variant ${i + 1} SKU`}
                                                    className={boxClass({
                                                        small: true,
                                                        mono: true,
                                                        bad:
                                                            !r.sku.trim() ||
                                                            dupe,
                                                    })}
                                                />
                                                <MoneyBox symbol={symbol} small>
                                                    <input
                                                        value={r.price}
                                                        onChange={(e) =>
                                                            set(r.key, {
                                                                price: e.target
                                                                    .value,
                                                            })
                                                        }
                                                        inputMode="decimal"
                                                        disabled={locked}
                                                        placeholder={
                                                            productPrice
                                                        }
                                                        aria-label={`Variant ${i + 1} price, blank uses the product's`}
                                                        className={cn(
                                                            boxClass({
                                                                small: true,
                                                                bad:
                                                                    r.price.trim() !==
                                                                        "" &&
                                                                    !isMoney(
                                                                        r.price,
                                                                    ),
                                                            }),
                                                            "pl-[22px]",
                                                        )}
                                                    />
                                                </MoneyBox>
                                                <button
                                                    type="button"
                                                    disabled={locked}
                                                    onClick={() => remove(r)}
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
                                                    aria-expanded={isOpen}
                                                    onClick={() =>
                                                        setOpen(
                                                            isOpen
                                                                ? null
                                                                : r.key,
                                                        )
                                                    }
                                                    className="text-[12px] font-semibold text-brand hover:text-foreground coarse:min-h-11"
                                                >
                                                    {isOpen ? "Less" : "More"}
                                                </button>
                                                <span className="min-w-0 text-pretty text-[11.5px] text-muted-foreground">
                                                    {photo
                                                        ? `Shows photo ${photos.indexOf(photo) + 1}`
                                                        : "Shows the cover"}
                                                </span>
                                            </div>
                                            {isOpen ? (
                                                <div className="mt-[7px] rounded-[9px] bg-muted/50 px-3 py-[11px]">
                                                    <p className="mb-[7px] text-[12px] font-semibold">
                                                        Photo shown when someone
                                                        picks it
                                                    </p>
                                                    <div
                                                        role="radiogroup"
                                                        aria-label={`Photo for ${title || "this variant"}`}
                                                        className="flex flex-wrap gap-1.5"
                                                    >
                                                        {[
                                                            {
                                                                id: "",
                                                                url:
                                                                    photos[0]
                                                                        ?.url ??
                                                                    "",
                                                                label: "The cover",
                                                            },
                                                            ...photos
                                                                .slice(1)
                                                                .map(
                                                                    (p, j) => ({
                                                                        id: p.id,
                                                                        url: p.url,
                                                                        label: `Photo ${j + 2}`,
                                                                    }),
                                                                ),
                                                        ].map((p) => {
                                                            const on =
                                                                r.imageId ===
                                                                p.id;
                                                            return (
                                                                <button
                                                                    key={
                                                                        p.id ||
                                                                        "cover"
                                                                    }
                                                                    type="button"
                                                                    role="radio"
                                                                    aria-checked={
                                                                        on
                                                                    }
                                                                    disabled={
                                                                        locked
                                                                    }
                                                                    onClick={() =>
                                                                        set(
                                                                            r.key,
                                                                            {
                                                                                imageId:
                                                                                    p.id,
                                                                            },
                                                                        )
                                                                    }
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
                                                                            src={
                                                                                p.url
                                                                            }
                                                                            alt=""
                                                                            className="h-[22px] w-[30px] shrink-0 rounded-[5px] object-cover"
                                                                        />
                                                                    ) : (
                                                                        <span className="h-[22px] w-[30px] shrink-0 rounded-[5px] bg-muted" />
                                                                    )}
                                                                    <span className="max-w-[110px] truncate text-[11.5px]">
                                                                        {
                                                                            p.label
                                                                        }
                                                                    </span>
                                                                </button>
                                                            );
                                                        })}
                                                    </div>
                                                    <FieldHelp className="mt-1.5">
                                                        Chosen from this
                                                        product&apos;s photos —
                                                        nothing new to upload.
                                                    </FieldHelp>
                                                </div>
                                            ) : null}
                                            {err ? (
                                                <p
                                                    role="alert"
                                                    className="mt-1 text-[11.5px] leading-[1.45] text-destructive"
                                                >
                                                    {err}
                                                </p>
                                            ) : null}
                                        </li>
                                    );
                                })}
                            </ol>
                        </>
                    ) : (
                        <div className="mb-3 text-pretty rounded-[10px] border border-dashed border-border-strong p-3.5 text-[12px] leading-[1.5] text-foreground/75">
                            No variants. It is sold as itself, at the price in
                            Basics. Add one for each {opt}.
                        </div>
                    )}

                    <div className="rounded-[10px] bg-muted/50 px-[13px] py-3">
                        <p className="mb-2 text-[12px] font-semibold">
                            Add a variant
                        </p>
                        <div className="grid grid-cols-[minmax(0,2fr)_minmax(0,1.4fr)_minmax(0,1fr)] gap-1.5">
                            <OptionSelect
                                value={newValue}
                                onValueChange={setNewValue}
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
                                value={newSku}
                                onChange={(e) => setNewSku(e.target.value)}
                                disabled={locked}
                                aria-label="New variant SKU"
                                placeholder={suggested || "SKU"}
                                className={boxClass({
                                    small: true,
                                    mono: true,
                                    bad:
                                        dupSku ||
                                        newSkuValue.length > LIMITS.sku,
                                })}
                            />
                            <MoneyBox symbol={symbol} small>
                                <input
                                    value={newPrice}
                                    onChange={(e) =>
                                        setNewPrice(e.target.value)
                                    }
                                    inputMode="decimal"
                                    disabled={locked}
                                    placeholder={productPrice}
                                    aria-label="New variant price, blank uses the product's"
                                    className={cn(
                                        boxClass({
                                            small: true,
                                            bad: newPriceBad,
                                        }),
                                        "pl-[22px]",
                                    )}
                                />
                            </MoneyBox>
                        </div>
                        <div className="mt-[9px] flex flex-wrap items-center gap-2.5">
                            <button
                                type="button"
                                disabled={addOff}
                                onClick={add}
                                className="h-8 shrink-0 rounded-[8px] bg-foreground px-[13px] text-[12.5px] font-semibold text-background hover:bg-foreground/90 disabled:bg-muted disabled:text-muted-foreground coarse:h-11"
                            >
                                Add to list
                            </button>
                            <span
                                className={cn(
                                    "min-w-0 flex-1 text-pretty text-[11.5px] leading-[1.45]",
                                    dupSku || newPriceBad
                                        ? "text-destructive"
                                        : "text-muted-foreground",
                                )}
                            >
                                {values.length === 0
                                    ? `No values for ${opt} yet — add them in Settings → Options.`
                                    : allTaken
                                      ? `Every ${opt} is already a variant. Add another value in Settings → Options.`
                                      : dupSku
                                        ? "That SKU is already on this product."
                                        : newOverMrp
                                          ? mrpNote(null)
                                          : newPriceBad
                                            ? "A number with at most two decimal places."
                                            : `Blank price uses the product's ${symbol}${productPrice}. Save variants to keep it.`}
                            </span>
                        </div>
                    </div>
                </>
            )}
        </SectionCard>
    );
}
