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
import { useRouter } from "next/navigation";
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
    return {
        price: trimMoney(p.price),
        mrp: p.mrp ? trimMoney(p.mrp) : "",
        quantity: String(own?.quantity ?? 0),
        lowStockAlert: String(own?.lowStockAlert ?? 10),
        rows: p.variants.map((v, i) => ({
            variantId: v.id,
            title: v.title,
            sku: v.sku,
            // A price equal to the product's reads as "the product's".
            price: v.price && v.price !== p.price ? trimMoney(v.price) : "",
            // Switching to a count per variant starts the first variant on
            // the product's whole count, so nothing on the shelf vanishes.
            quantity: String(
                perVariant
                    ? (v.inventory?.quantity ?? 0)
                    : i === 0
                      ? (own?.quantity ?? 0)
                      : 0,
            ),
            lowStockAlert: String(
                v.inventory?.lowStockAlert ?? own?.lowStockAlert ?? 10,
            ),
            promised: v.inventory?.reserved ?? 0,
        })),
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
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    product: ProductDetail;
    storeId: string;
}) {
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
        hasVariants &&
        product.stockMode === "product" &&
        product.inventory !== null;
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
            const was =
                variant.price && variant.price !== product.price
                    ? trimMoney(variant.price)
                    : "";
            if (row.price.trim() === was) continue;
            const res = await updateVariant(storeId, product.id, variant.id, {
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
        const stock = hasVariants
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
        onOpenChange(false);
        showSuccess("Prices and stock saved.");
    }

    return (
        <QuickSheet
            open={open}
            onOpenChange={(o) => {
                if (!o) form.reset(valuesOf(product));
                onOpenChange(o);
            }}
            productName={product.name}
            title="Edit prices and stock"
            fullEditorHref={productEditHref(
                storeId,
                product.id,
                hasVariants ? "variants" : "stock",
            )}
            dirty={isDirty || switching}
            saving={isSubmitting}
            note={
                firstError ??
                (isDirty || switching ? undefined : "No changes yet")
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
                                className="grid grid-cols-[minmax(0,1.4fr)_5.5rem_4.5rem_4.5rem] gap-2 text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground"
                            >
                                <span>{product.option?.name ?? "Variant"}</span>
                                <span>Price</span>
                                <span>On hand</span>
                                <span>Warn at</span>
                            </div>
                            {rows.fields.map((row, i) => (
                                <div
                                    key={row.id}
                                    className="flex flex-col gap-1"
                                >
                                    <div className="grid grid-cols-[minmax(0,1.4fr)_5.5rem_4.5rem_4.5rem] items-center gap-2">
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
                                        <Input
                                            {...form.register(
                                                `rows.${i}.quantity`,
                                            )}
                                            inputMode="numeric"
                                            aria-label={`${row.title} on hand`}
                                            aria-invalid={Boolean(
                                                errors.rows?.[i]?.quantity,
                                            )}
                                            className={cn(
                                                "h-9",
                                                errors.rows?.[i]?.quantity &&
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
                                    </div>
                                    <p className="font-mono text-[11px] text-muted-foreground">
                                        {row.sku} · {row.promised} promised ·{" "}
                                        {isCount(
                                            form.watch(`rows.${i}.quantity`),
                                        )
                                            ? `${Math.max(0, Number(form.watch(`rows.${i}.quantity`)) - row.promised)} can sell`
                                            : "—"}
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
                                {switching
                                    ? `Saving counts each variant on its own. The product's ${product.inventory?.quantity ?? 0} on hand start on the first variant — split them across the rest.`
                                    : `A blank price is the product's ${money(product.price)}. Promised stock comes from open orders, so it can't be changed here.`}
                            </p>
                        </div>
                    ) : (
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
                    )}
                </div>
            </Form>
        </QuickSheet>
    );
}
