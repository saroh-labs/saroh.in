"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@saroh/ui/button";
import { Input } from "@saroh/ui/input";
import { Label } from "@saroh/ui/label";
import { showError, showSuccess } from "@saroh/ui/toast";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import type { FieldErrors } from "react-hook-form";
import { Controller, useFieldArray, useForm } from "react-hook-form";
import { z } from "zod";

import { OptionSelect } from "@/components/shared/option-select";
import { formatMoney } from "@/lib/format/money";
import { createOrder } from "@/lib/orders/actions";
import { orderHref } from "@/lib/orders/links";

interface ProductLite {
    id: string;
    name: string;
    price: string;
    variants?: { id: string; title: string; price: string | null }[];
    /**
     * Nothing on the shelf at this storefront (#511): it can't be ordered
     * here. The API is the one that decides — it counts what is promised to
     * other orders too, and says "Only N left" when there are fewer than
     * asked for.
     */
    soldOut?: boolean;
}

/**
 * What a line can be for. A product with variants is bought as one of them
 * — "Linen Wrap Dress · M" — at that variant's price, so each is its own
 * choice; the key carries both ids ("product:variant") to the submit.
 */
interface Sellable {
    key: string;
    productId: string;
    variantId?: string;
    label: string;
    price: string;
    soldOut: boolean;
}

function sellablesOf(products: ProductLite[]): Sellable[] {
    return products.flatMap((p) =>
        p.variants && p.variants.length > 0
            ? p.variants.map((v) => ({
                  key: `${p.id}:${v.id}`,
                  productId: p.id,
                  variantId: v.id,
                  label: `${p.name} · ${v.title}`,
                  price: v.price ?? p.price,
                  soldOut: p.soldOut ?? false,
              }))
            : [
                  {
                      key: p.id,
                      productId: p.id,
                      label: p.name,
                      price: p.price,
                      soldOut: p.soldOut ?? false,
                  },
              ],
    );
}

/** The line a new row starts on: the first thing that isn't sold out. */
function firstSellable(products: ProductLite[]): string {
    const all = sellablesOf(products);
    return (all.find((s) => !s.soldOut) ?? all.at(0))?.key ?? "";
}
/**
 * What the storefront says about checkout (Sell → Storefronts). Defaults, not
 * rules: an order keyed in by hand is the merchant's own call, so every figure
 * here can still be typed over.
 */
export interface CheckoutDefaults {
    currency: string;
    taxEnabled: boolean;
    /** A percentage, "18.00". */
    taxRate: string;
    shippingEnabled: boolean;
    freeShippingThreshold: string | null;
}

interface CustomerLite {
    id: string;
    email: string;
    firstName: string | null;
    lastName: string | null;
}

const money = (cents: number) => (cents / 100).toFixed(2);
const toCents = (s: string) => Math.round((Number(s) || 0) * 100);

/**
 * A quantity that is safe to multiply.
 *
 * `valueAsNumber` gives `NaN` for an emptied number input, and a watched row
 * can be `undefined` for a tick after one is appended. Neither is nullish, so
 * `?? 0` would let `NaN` through and turn the whole order total into `NaN`.
 */
const quantityOf = (quantity: number | undefined) =>
    quantity !== undefined && Number.isFinite(quantity) ? quantity : 0;

const formSchema = z.object({
    customerId: z.string().min(1, { message: "Pick a customer" }),
    lines: z
        .array(
            z.object({
                productId: z.string(),
                quantity: z.number(),
            }),
        )
        .refine((lines) => lines.some((l) => l.productId && l.quantity > 0), {
            message: "Add at least one product",
        }),
    tax: z.string(),
    shipping: z.string(),
    discount: z.string(),
    discountCode: z.string(),
});

type FormValues = z.infer<typeof formSchema>;

/**
 * Create-order form. Unlike the flat entity forms, this one is a line-item
 * editor: a dynamic array of product/quantity rows (react-hook-form
 * `useFieldArray`) plus a live-computed subtotal/total. Validation is still
 * zod-driven; the two top-level guards ("pick a customer", "add a product")
 * surface as toasts (preserving the original UX) via the invalid handler.
 */
export function OrderForm({
    storeId,
    customers,
    products,
    checkout = null,
    gstRegistered = false,
}: {
    storeId: string;
    customers: CustomerLite[];
    products: ProductLite[];
    /** `null` when it could not be read: the form then assumes nothing. */
    checkout?: CheckoutDefaults | null;
    /**
     * A GST-registered business's prices include GST (ADR-008): the API
     * ignores the storefront's add-on tax, so the form offers none.
     */
    gstRegistered?: boolean;
}) {
    const router = useRouter();
    // Amounts as money, in the storefront's currency, for reading. Inputs keep
    // the plain decimal they are typed in.
    const show = (cents: number) =>
        formatMoney(cents, checkout?.currency) ?? money(cents);
    const form = useForm<FormValues>({
        resolver: zodResolver(formSchema),
        defaultValues: {
            customerId: "",
            lines: [{ productId: firstSellable(products), quantity: 1 }],
            tax: "0",
            shipping: "0",
            discount: "0",
            discountCode: "",
        },
    });
    const { fields, append, remove } = useFieldArray({
        control: form.control,
        name: "lines",
    });
    const { isSubmitting } = form.formState;
    // The API's refusal of a line ("Sourdough — Sold out") is about the lines
    // as they were sent: any change to them clears it, until the next save.
    const linesChanged = () => {
        if (form.formState.errors.lines?.type === "server") {
            form.clearErrors("lines");
        }
    };

    // Watch the value-bearing fields so the totals recompute as the user types.
    const watchedLines = form.watch("lines");
    const tax = form.watch("tax");
    const shipping = form.watch("shipping");
    const discount = form.watch("discount");
    const discountCode = form.watch("discountCode").trim();
    // A code and a typed amount are one or the other, as the API insists:
    // two answers to "why did this come off" would leave no way to tell.
    const typedOff = toCents(discount) > 0;

    const sellables = sellablesOf(products);
    const priceOf = (key: string) =>
        toCents(sellables.find((s) => s.key === key)?.price ?? "0");
    // No `?? []`: `lines` has a default value and RHF types the watched result
    // as the schema's array, so the fallback was unreachable.
    const subtotalCents = watchedLines.reduce(
        (sum, l) => sum + priceOf(l.productId) * quantityOf(l.quantity),
        0,
    );
    // Tax follows the storefront's rate until the merchant types their own.
    // Written into the field rather than computed beside it, so what is on
    // screen is exactly what is sent.
    const taxBasisPoints =
        checkout?.taxEnabled && !gstRegistered
            ? Math.round(Number(checkout.taxRate) * 100)
            : 0;
    const suggestedTax = money(
        Math.round((subtotalCents * taxBasisPoints) / 10_000),
    );
    const taxTouched = form.formState.dirtyFields.tax;
    useEffect(() => {
        if (taxBasisPoints > 0 && !taxTouched) {
            form.setValue("tax", suggestedTax);
        }
    }, [form, suggestedTax, taxBasisPoints, taxTouched]);

    const freeOver = checkout?.freeShippingThreshold
        ? toCents(checkout.freeShippingThreshold)
        : null;
    const qualifiesForFree = freeOver !== null && subtotalCents >= freeOver;
    const offersDelivery = checkout?.shippingEnabled ?? true;

    // The sum `orders.service.ts` saves: GST is inside a registered
    // business's prices, so nothing is added for it.
    const totalCents = Math.max(
        0,
        subtotalCents +
            (gstRegistered ? 0 : toCents(tax)) +
            toCents(shipping) -
            (discountCode ? 0 : toCents(discount)),
    );

    async function onSubmit(values: FormValues) {
        const items = values.lines
            .filter((l) => l.productId && l.quantity > 0)
            .map((l) => {
                const sellable = sellables.find((s) => s.key === l.productId);
                return {
                    productId: sellable?.productId ?? l.productId,
                    ...(sellable?.variantId
                        ? { variantId: sellable.variantId }
                        : {}),
                    quantity: l.quantity,
                };
            });
        const res = await createOrder(storeId, {
            customerId: values.customerId,
            items,
            tax: gstRegistered ? "0" : values.tax,
            shipping: values.shipping,
            ...(values.discountCode.trim()
                ? { discountCode: values.discountCode.trim().toUpperCase() }
                : { discount: values.discount }),
        });
        if (!res.ok) {
            if (res.field === "discountCode") {
                form.setError("discountCode", { message: res.error });
            } else if (res.field === "items") {
                // "Sourdough — Sold out", "… — Only 2 left at Hill Road":
                // said under the lines, where it is fixed.
                form.setError("lines", { type: "server", message: res.error });
            } else {
                showError(res.error);
            }
            return;
        }
        showSuccess("Order created");
        router.push(orderHref(storeId, res.data.id));
    }

    /** Preserve the original toast UX for the two top-level guards. */
    function onInvalid(errors: FieldErrors<FormValues>) {
        const message =
            errors.customerId?.message ??
            errors.lines?.message ??
            errors.lines?.root?.message ??
            "Please fix the highlighted fields";
        showError(String(message));
    }

    if (products.length === 0 || customers.length === 0) {
        return (
            <div className="rounded-xl border p-6 text-sm">
                <p className="text-muted-foreground">
                    You need at least one{" "}
                    {products.length === 0 ? "product" : "customer"} before
                    creating an order.
                </p>
                <div className="mt-3 flex gap-2">
                    <Button variant="outline" asChild>
                        <Link href={`/stores/${storeId}/products`}>
                            Products
                        </Link>
                    </Button>
                    <Button variant="outline" asChild>
                        <Link href={`/stores/${storeId}/customers`}>
                            Customers
                        </Link>
                    </Button>
                </div>
            </div>
        );
    }

    return (
        <form
            onSubmit={form.handleSubmit(onSubmit, onInvalid)}
            className="grid max-w-2xl gap-6"
        >
            <div className="grid gap-2">
                <Label htmlFor="customer">Customer</Label>
                <Controller
                    control={form.control}
                    name="customerId"
                    render={({ field }) => (
                        <OptionSelect
                            id="customer"
                            placeholder="Select a customer…"
                            value={field.value}
                            onValueChange={field.onChange}
                            disabled={isSubmitting}
                            options={customers.map((c) => {
                                const name = [c.firstName, c.lastName]
                                    .filter(Boolean)
                                    .join(" ");
                                return {
                                    value: c.id,
                                    label: name
                                        ? `${name} · ${c.email}`
                                        : c.email,
                                };
                            })}
                        />
                    )}
                />
            </div>

            <div className="space-y-3">
                <Label>
                    Items
                    {gstRegistered ? (
                        <span className="font-normal text-muted-foreground">
                            {" "}
                            · prices include GST
                        </span>
                    ) : null}
                </Label>
                {fields.map((line, i) => {
                    // `.at(i)` rather than `[i]`: it returns `T | undefined`,
                    // which is the truth. `fields` (from useFieldArray) and
                    // `watchedLines` update on different ticks, so just after a
                    // row is added this index really can be missing — indexing
                    // with `[i]` only *looked* safe because the project does not
                    // set `noUncheckedIndexedAccess`.
                    const watched = watchedLines.at(i);
                    return (
                        <div key={line.id} className="flex items-center gap-2">
                            <Controller
                                control={form.control}
                                name={`lines.${i}.productId`}
                                render={({ field }) => (
                                    <OptionSelect
                                        aria-label="Product"
                                        value={field.value}
                                        onValueChange={(v) => {
                                            linesChanged();
                                            field.onChange(v);
                                        }}
                                        disabled={isSubmitting}
                                        className="flex-1"
                                        options={sellables.map((s) => ({
                                            value: s.key,
                                            label: s.soldOut
                                                ? `${s.label} — Sold out`
                                                : `${s.label} — ${show(toCents(s.price))}`,
                                            disabled:
                                                s.soldOut &&
                                                s.key !== field.value,
                                        }))}
                                    />
                                )}
                            />
                            <Input
                                aria-label="Quantity"
                                type="number"
                                min={1}
                                disabled={isSubmitting}
                                className="w-20"
                                {...form.register(`lines.${i}.quantity`, {
                                    valueAsNumber: true,
                                    onChange: linesChanged,
                                })}
                            />
                            <span className="w-20 text-right text-sm tabular-nums text-muted-foreground">
                                {show(
                                    priceOf(watched?.productId ?? "") *
                                        quantityOf(watched?.quantity),
                                )}
                            </span>
                            <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                disabled={isSubmitting || fields.length === 1}
                                onClick={() => {
                                    linesChanged();
                                    remove(i);
                                }}
                            >
                                ✕
                            </Button>
                        </div>
                    );
                })}
                {form.formState.errors.lines?.type === "server" ? (
                    <p role="alert" className="text-sm text-destructive">
                        {form.formState.errors.lines.message}
                    </p>
                ) : null}
                <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                        linesChanged();
                        append({
                            productId: firstSellable(products),
                            quantity: 1,
                        });
                    }}
                    disabled={isSubmitting}
                >
                    Add item
                </Button>
            </div>

            <div
                className={
                    offersDelivery && !gstRegistered
                        ? "grid grid-cols-3 gap-4"
                        : "grid grid-cols-2 gap-4"
                }
            >
                {/* GST is already in a registered business's prices; there
                    is no tax to add on. */}
                {gstRegistered ? null : (
                    <div className="grid gap-2">
                        <Label htmlFor="tax">
                            Tax
                            {taxBasisPoints > 0
                                ? ` (${Number(checkout?.taxRate)}%)`
                                : null}
                        </Label>
                        <Input
                            id="tax"
                            inputMode="decimal"
                            disabled={isSubmitting}
                            {...form.register("tax")}
                        />
                    </div>
                )}
                {/* A storefront that does not deliver has no shipping to
                    charge; the field stays at 0 rather than inviting one. */}
                {offersDelivery ? (
                    <div className="grid gap-2">
                        <Label htmlFor="shipping">Shipping</Label>
                        <Input
                            id="shipping"
                            inputMode="decimal"
                            disabled={isSubmitting}
                            aria-describedby={
                                freeOver !== null ? "shipping-note" : undefined
                            }
                            {...form.register("shipping")}
                        />
                        {freeOver !== null ? (
                            <p
                                id="shipping-note"
                                className="text-[12px] text-muted-foreground"
                            >
                                {qualifiesForFree
                                    ? "Qualifies for free delivery."
                                    : `Free over ${show(freeOver)}.`}
                            </p>
                        ) : null}
                    </div>
                ) : null}
                <div className="grid gap-2">
                    <Label htmlFor="discount">Discount</Label>
                    <Input
                        id="discount"
                        inputMode="decimal"
                        disabled={isSubmitting || Boolean(discountCode)}
                        {...form.register("discount")}
                    />
                </div>
            </div>

            <div className="grid gap-2">
                <Label htmlFor="discountCode">Discount code</Label>
                <Input
                    id="discountCode"
                    placeholder="MARKETDAY"
                    autoCapitalize="characters"
                    spellCheck={false}
                    disabled={isSubmitting || typedOff}
                    aria-describedby="discountCode-note"
                    aria-invalid={
                        form.formState.errors.discountCode ? true : undefined
                    }
                    className="w-56 font-mono uppercase"
                    {...form.register("discountCode")}
                />
                <p
                    id="discountCode-note"
                    className={
                        form.formState.errors.discountCode
                            ? "text-[12px] font-medium text-destructive"
                            : "text-[12px] text-muted-foreground"
                    }
                    role={
                        form.formState.errors.discountCode ? "alert" : undefined
                    }
                >
                    {form.formState.errors.discountCode?.message ??
                        (typedOff
                            ? "An amount is typed above — clear it to use a code instead."
                            : discountCode
                              ? "What it takes off is worked out when the order is placed."
                              : "Instead of typing an amount off.")}
                </p>
            </div>

            <div className="flex items-center justify-between border-t pt-4">
                <div className="text-sm">
                    <p className="text-muted-foreground">
                        Subtotal {show(subtotalCents)}
                    </p>
                    <p className="text-lg font-semibold tabular-nums">
                        Total {show(totalCents)}
                    </p>
                    {gstRegistered ? (
                        <p className="text-[12px] text-muted-foreground">
                            Includes GST
                        </p>
                    ) : null}
                    {discountCode ? (
                        <p className="text-[12px] text-muted-foreground">
                            Before{" "}
                            <span className="font-mono">
                                {discountCode.toUpperCase()}
                            </span>
                        </p>
                    ) : null}
                </div>
                <Button
                    type="submit"
                    className="wk-press"
                    disabled={isSubmitting}
                >
                    {isSubmitting ? "Creating…" : "Create order"}
                </Button>
            </div>
        </form>
    );
}
