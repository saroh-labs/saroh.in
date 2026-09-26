"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import {
    Form,
    FormControl,
    FormField,
    FormItem,
    FormLabel,
    FormMessage,
} from "@saroh/ui/form";
import { Input } from "@saroh/ui/input";
import { cn } from "@saroh/ui/lib/utils";
import { showError, showSuccess } from "@saroh/ui/toast";
import { Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useFieldArray, useForm } from "react-hook-form";
import { z } from "zod";

import { formatMoneyMajor } from "@/lib/format/money";
import {
    patchProduct,
    setInventory,
    setVariantStock,
    updateVariant,
} from "@/lib/products/actions";
import {
    isCount,
    isMoney,
    MONEY_MESSAGE,
    paise,
    trimMoney,
} from "@/lib/products/editor-sections";
import { productEditHref } from "@/lib/products/links";
import type { ProductDetail } from "@/lib/products/service";
import { untrackedShort } from "@/lib/products/tracking";

import { QuickSheet } from "../quick-sheet";

const count = z.string().trim().refine(isCount, "Whole numbers, zero or more.");
const optionalMoney = z
    .string()
    .trim()
    .refine((v) => v === "" || isMoney(v), MONEY_MESSAGE);

const schema = z
    .object({
        price: z.string().trim().refine(isMoney, MONEY_MESSAGE),
        mrp: optionalMoney,
        quantity: count,
        lowStockAlert: count,
        rows: z.array(
            z.object({
                variantId: z.string(),
                title: z.string(),
                sku: z.string(),
                price: optionalMoney,
                quantity: count,
                lowStockAlert: count,
                promised: z.number(),
            }),
        ),
    })
    .refine(
        (v) =>
            v.mrp === "" || !isMoney(v.price) || paise(v.mrp) >= paise(v.price),
        {
            path: ["mrp"],
            message: "MRP can't be lower than the price it sells for.",
        },
    )
    .superRefine((v, ctx) => {
        v.rows.forEach((r, i) => {
            if (isCount(r.quantity) && Number(r.quantity) < r.promised) {
                ctx.addIssue({
                    code: "custom",
                    path: ["rows", i, "quantity"],
                    message: `${r.promised} promised to open orders — on hand can't go below that.`,
                });
            }
        });
    });
type Values = z.infer<typeof schema>;

function valuesOf(p: ProductDetail): Values {
    const perVariant = p.stockMode === "variant";
    const own = p.inventory;
    // As the editor's Stock section seeds it: open orders' promises move
    // onto the variant they name, so each starts at what it promises and
    // the first also at what was free to sell — every unit counted once.
    const free = Math.max(0, (own?.quantity ?? 0) - (own?.reserved ?? 0));
    return {
        price: trimMoney(p.price),
        mrp: p.mrp ? trimMoney(p.mrp) : "",
        quantity: String(own?.quantity ?? 0),
        lowStockAlert: String(own?.lowStockAlert ?? 10),
        rows: p.variants.map((v, i) => {
            const promised = perVariant
                ? (v.inventory?.reserved ?? 0)
                : (p.variantPromises[v.id] ?? 0);
            return {
                variantId: v.id,
                title: v.title,
                sku: v.sku,
                // Blank only when it has no price of its own; one set equal
                // to the product's is still its own.
                price: v.price ? trimMoney(v.price) : "",
                quantity: String(
                    perVariant
                        ? (v.inventory?.quantity ?? 0)
                        : promised + (i === 0 ? free : 0),
                ),
                lowStockAlert: String(
                    v.inventory?.lowStockAlert ?? own?.lowStockAlert ?? 10,
                ),
                promised,
            };
        }),
    };
}

/**
 * The product page's "Edit prices and stock": the product's price and MRP,
 * and — per variant — its own price, what is on hand and when to warn.
 * Promised stock comes from open orders, so it is shown and never edited.
 * With variants, saving counts each variant on its own.
 */
export function StockSheet({
    open,
    onOpenChange,
    product,
    storeId,
    counts: countsProp,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    product: ProductDetail;
    storeId: string;
    /**
     * The product counts stock (Track stock, #515). Untracked, the sheet
     * edits prices only: a count saved here would quietly start tracking.
     */
    counts?: boolean;
}) {
    const counts = countsProp ?? product.stockTracked;
    const router = useRouter();
    const form = useForm<Values>({
        resolver: zodResolver(schema),
        values: valuesOf(product),
    });
    const rows = useFieldArray({ control: form.control, name: "rows" });
    const { isSubmitting, isDirty, errors } = form.formState;
    const money = (a: string) => formatMoneyMajor(a, product.currency) ?? a;
    const hasVariants = product.variants.length > 0;
    const switching =
        counts &&
        hasVariants &&
        product.stockMode === "product" &&
        product.inventory !== null;
    // No count yet: a price edit must not start one at 0 (the shop would
    // say sold out). Counting starts only when asked, as in the editor.
    const counted =
        counts &&
        (product.stockMode === "variant" || product.inventory !== null);
    const [adding, setAdding] = useState(false);
    const showStock = counted || adding;
    const rowGrid = cn(
        "grid gap-2",
        showStock
            ? "grid-cols-[minmax(0,1.4fr)_5.5rem_4.5rem_4.5rem]"
            : "grid-cols-[minmax(0,1.4fr)_5.5rem]",
    );
    const firstError =
        errors.price?.message ??
        errors.mrp?.message ??
        errors.quantity?.message ??
        errors.rows?.find?.((r) => r)?.quantity?.message;

    async function save(v: Values) {
        const failures: string[] = [];
        const price = v.price.trim();
        const mrp = v.mrp.trim() || null;
        if (
            price !== trimMoney(product.price) ||
            mrp !== (product.mrp ? trimMoney(product.mrp) : null)
        ) {
            const res = await patchProduct(storeId, product.id, { price, mrp });
            if (!res.ok) {
                form.setError(res.field === "mrp" ? "mrp" : "price", {
                    message: res.error,
                });
                return;
            }
        }
        for (const row of v.rows) {
            const variant = product.variants.find(
                (x) => x.id === row.variantId,
            );
            if (!variant) continue;
            const was = variant.price ? trimMoney(variant.price) : "";
            if (row.price.trim() === was) continue;
            const res = await updateVariant(product.id, variant.id, {
                sku: variant.sku,
                title: variant.title,
                price: row.price.trim() || null,
                mrp: variant.mrp ?? null,
                // The API's PUT replaces the variant: an omitted image is cleared.
                image: variant.image ?? null,
                optionValueId: variant.optionValueId ?? null,
                imageId: variant.imageId ?? null,
            });
            if (!res.ok) failures.push(`${variant.title}'s price`);
        }
        const stock = !showStock
            ? { ok: true as const }
            : hasVariants
              ? await setVariantStock(
                    storeId,
                    product.id,
                    v.rows.map((r) => ({
                        variantId: r.variantId,
                        quantity: Number(r.quantity),
                        lowStockAlert: Number(r.lowStockAlert),
                    })),
                )
              : await setInventory(storeId, product.id, {
                    quantity: Number(v.quantity),
                    lowStockAlert: Number(v.lowStockAlert),
                });
        if (!stock.ok) failures.push("the stock counts");

        router.refresh();
        if (failures.length > 0) {
            showError(
                `Saved, except ${failures.join(" and ")}. Try those again.`,
            );
            return;
        }
        changeOpen(false);
        showSuccess(counts ? "Prices and stock saved." : "Prices saved.");
    }

    function changeOpen(o: boolean) {
        if (!o) {
            form.reset(valuesOf(product));
            setAdding(false);
        }
        onOpenChange(o);
    }

    return (
        <QuickSheet
            open={open}
            onOpenChange={changeOpen}
            productName={product.name}
            title={counts ? "Edit prices and stock" : "Edit prices"}
            fullEditorHref={productEditHref(
                storeId,
                product.id,
                hasVariants ? "variants" : "stock",
            )}
            dirty={isDirty || switching || adding}
            saving={isSubmitting}
            note={
                firstError ??
                (isDirty || switching || adding ? undefined : "No changes yet")
            }
            onSave={() => void form.handleSubmit(save)()}
        >
            <Form {...form}>
                <div className="flex flex-col gap-4">
                    <div className="grid grid-cols-2 gap-3">
                        <FormField
                            control={form.control}
                            name="price"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Price</FormLabel>
                                    <FormControl>
                                        <Input
                                            {...field}
                                            inputMode="decimal"
                                            aria-label="Price in rupees"
                                        />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                        <FormField
                            control={form.control}
                            name="mrp"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>MRP</FormLabel>
                                    <FormControl>
                                        <Input
                                            {...field}
                                            inputMode="decimal"
                                            placeholder="Optional"
                                        />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                    </div>

                    {hasVariants ? (
                        <div className="flex flex-col gap-2">
                            <p className="text-sm font-medium">Each variant</p>
                            <div
                                aria-hidden
                                className={cn(
                                    rowGrid,
                                    "text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground",
                                )}
                            >
                                <span>{product.option?.name ?? "Variant"}</span>
                                <span>Price</span>
                                {showStock ? (
                                    <>
                                        <span>On hand</span>
                                        <span>Warn at</span>
                                    </>
                                ) : null}
                            </div>
                            {rows.fields.map((row, i) => (
                                <div
                                    key={row.id}
                                    className="flex flex-col gap-1"
                                >
                                    <div
                                        className={cn(rowGrid, "items-center")}
                                    >
                                        <span className="truncate text-[13.5px] font-medium">
                                            {row.title}
                                        </span>
                                        <Input
                                            {...form.register(
                                                `rows.${i}.price`,
                                            )}
                                            inputMode="decimal"
                                            placeholder={trimMoney(
                                                form.watch("price"),
                                            )}
                                            aria-label={`${row.title} price, blank for the product's`}
                                            className="h-9"
                                        />
                                        {showStock ? (
                                            <>
                                                <Input
                                                    {...form.register(
                                                        `rows.${i}.quantity`,
                                                    )}
                                                    inputMode="numeric"
                                                    aria-label={`${row.title} on hand`}
                                                    aria-invalid={Boolean(
                                                        errors.rows?.[i]
                                                            ?.quantity,
                                                    )}
                                                    className={cn(
                                                        "h-9",
                                                        errors.rows?.[i]
                                                            ?.quantity &&
                                                            "border-destructive",
                                                    )}
                                                />
                                                <Input
                                                    {...form.register(
                                                        `rows.${i}.lowStockAlert`,
                                                    )}
                                                    inputMode="numeric"
                                                    aria-label={`${row.title} warn at`}
                                                    className="h-9"
                                                />
                                            </>
                                        ) : null}
                                    </div>
                                    <p className="font-mono text-[11px] text-muted-foreground">
                                        {row.sku}
                                        {showStock
                                            ? ` · ${row.promised} promised · ${
                                                  isCount(
                                                      form.watch(
                                                          `rows.${i}.quantity`,
                                                      ),
                                                  )
                                                      ? `${Math.max(0, Number(form.watch(`rows.${i}.quantity`)) - row.promised)} can sell`
                                                      : "—"
                                              }`
                                            : ""}
                                    </p>
                                    {(() => {
                                        const message =
                                            errors.rows?.[i]?.quantity?.message;
                                        return message ? (
                                            <p
                                                role="alert"
                                                className="text-[12px] text-destructive"
                                            >
                                                {message}
                                            </p>
                                        ) : null;
                                    })()}
                                </div>
                            ))}
                            <p className="text-[12px] text-muted-foreground">
                                {switching && showStock
                                    ? "Saving counts each variant on its own. Each starts at what its open orders hold, and the first also at what was free to sell — split them across the rest."
                                    : `A blank price is the product's ${money(product.price)}. Promised stock comes from open orders, so it can't be changed here.`}
                            </p>
                        </div>
                    ) : showStock ? (
                        <div className="grid grid-cols-2 gap-3">
                            <FormField
                                control={form.control}
                                name="quantity"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>On hand</FormLabel>
                                        <FormControl>
                                            <Input
                                                {...field}
                                                inputMode="numeric"
                                            />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                            <FormField
                                control={form.control}
                                name="lowStockAlert"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Warn at</FormLabel>
                                        <FormControl>
                                            <Input
                                                {...field}
                                                inputMode="numeric"
                                            />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                            <p className="col-span-2 text-[12px] text-muted-foreground">
                                {product.inventory?.reserved ?? 0} promised to
                                open orders — set by Orders, so it can&apos;t be
                                changed here.
                            </p>
                        </div>
                    ) : null}
                    {!counts ? (
                        <p className="text-pretty text-[12.5px] leading-[1.55] text-foreground/75">
                            {untrackedShort(product.storefronts ?? [])} Track
                            stock is in the editor&apos;s Stock section.
                        </p>
                    ) : !showStock ? (
                        <div className="flex flex-col items-start gap-2.5">
                            <p className="text-pretty text-[12.5px] leading-[1.55] text-foreground/75">
                                {hasVariants
                                    ? `No stock count yet. Each of the ${product.variants.length} variants gets its own, so a small one can run out before a large one.`
                                    : "No stock count yet. Add one to see how many you have and get a warning when it runs low."}
                            </p>
                            <button
                                type="button"
                                onClick={() => setAdding(true)}
                                className="inline-flex h-[34px] items-center gap-[7px] rounded-[9px] border border-border bg-card px-[13px] text-[12.5px] font-semibold hover:bg-muted/50 coarse:h-11"
                            >
                                <Plus
                                    aria-hidden
                                    className="size-3.5"
                                    strokeWidth={2.2}
                                />
                                Add stock
                            </button>
                        </div>
                    ) : null}
                </div>
            </Form>
        </QuickSheet>
    );
}
