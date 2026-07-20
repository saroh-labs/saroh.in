"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@saroh/ui/button";
import { Input } from "@saroh/ui/input";
import { Label } from "@saroh/ui/label";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FieldErrors, useFieldArray, useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

import { createOrder } from "@/lib/orders/actions";

interface ProductLite {
    id: string;
    name: string;
    price: string;
}
interface CustomerLite {
    id: string;
    email: string;
    firstName: string | null;
    lastName: string | null;
}

const money = (cents: number) => (cents / 100).toFixed(2);
const toCents = (s: string) => Math.round((Number(s) || 0) * 100);

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
}: {
    storeId: string;
    customers: CustomerLite[];
    products: ProductLite[];
}) {
    const router = useRouter();
    const form = useForm<FormValues>({
        resolver: zodResolver(formSchema),
        defaultValues: {
            customerId: "",
            lines: [{ productId: products[0]?.id ?? "", quantity: 1 }],
            tax: "0",
            shipping: "0",
            discount: "0",
        },
    });
    const { fields, append, remove } = useFieldArray({
        control: form.control,
        name: "lines",
    });
    const { isSubmitting } = form.formState;

    // Watch the value-bearing fields so the totals recompute as the user types.
    const watchedLines = form.watch("lines");
    const tax = form.watch("tax");
    const shipping = form.watch("shipping");
    const discount = form.watch("discount");

    const priceOf = (id: string) =>
        toCents(products.find((p) => p.id === id)?.price ?? "0");
    const subtotalCents = (watchedLines ?? []).reduce(
        (sum, l) => sum + priceOf(l.productId) * (l.quantity || 0),
        0,
    );
    const totalCents = Math.max(
        0,
        subtotalCents + toCents(tax) + toCents(shipping) - toCents(discount),
    );

    async function onSubmit(values: FormValues) {
        const items = values.lines
            .filter((l) => l.productId && l.quantity > 0)
            .map((l) => ({ productId: l.productId, quantity: l.quantity }));
        const res = await createOrder(storeId, {
            customerId: values.customerId,
            items,
            tax: values.tax,
            shipping: values.shipping,
            discount: values.discount,
        });
        if (!res.ok) {
            toast.error(res.error);
            return;
        }
        toast.success("Order created");
        router.push(`/stores/${storeId}/orders/${res.data.id}`);
    }

    /** Preserve the original toast UX for the two top-level guards. */
    function onInvalid(errors: FieldErrors<FormValues>) {
        const message =
            errors.customerId?.message ??
            errors.lines?.message ??
            errors.lines?.root?.message ??
            "Please fix the highlighted fields";
        toast.error(String(message));
    }

    if (products.length === 0 || customers.length === 0) {
        return (
            <div className="rounded-lg border p-6 text-sm">
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
                <select
                    id="customer"
                    disabled={isSubmitting}
                    className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                    {...form.register("customerId")}
                >
                    <option value="">Select a customer…</option>
                    {customers.map((c) => (
                        <option key={c.id} value={c.id}>
                            {[c.firstName, c.lastName]
                                .filter(Boolean)
                                .join(" ")}
                            {c.firstName ? ` · ${c.email}` : c.email}
                        </option>
                    ))}
                </select>
            </div>

            <div className="space-y-3">
                <Label>Items</Label>
                {fields.map((line, i) => (
                    <div key={line.id} className="flex items-center gap-2">
                        <select
                            aria-label="Product"
                            disabled={isSubmitting}
                            className="h-9 flex-1 rounded-md border border-input bg-background px-3 text-sm"
                            {...form.register(`lines.${i}.productId`)}
                        >
                            {products.map((p) => (
                                <option key={p.id} value={p.id}>
                                    {p.name} — {p.price}
                                </option>
                            ))}
                        </select>
                        <Input
                            aria-label="Quantity"
                            type="number"
                            min={1}
                            disabled={isSubmitting}
                            className="w-20"
                            {...form.register(`lines.${i}.quantity`, {
                                valueAsNumber: true,
                            })}
                        />
                        <span className="w-20 text-right text-sm tabular-nums text-muted-foreground">
                            {money(
                                priceOf(watchedLines?.[i]?.productId ?? "") *
                                    (watchedLines?.[i]?.quantity || 0),
                            )}
                        </span>
                        <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            disabled={isSubmitting || fields.length === 1}
                            onClick={() => remove(i)}
                        >
                            ✕
                        </Button>
                    </div>
                ))}
                <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() =>
                        append({
                            productId: products[0]?.id ?? "",
                            quantity: 1,
                        })
                    }
                    disabled={isSubmitting}
                >
                    Add item
                </Button>
            </div>

            <div className="grid grid-cols-3 gap-4">
                <div className="grid gap-2">
                    <Label htmlFor="tax">Tax</Label>
                    <Input
                        id="tax"
                        inputMode="decimal"
                        disabled={isSubmitting}
                        {...form.register("tax")}
                    />
                </div>
                <div className="grid gap-2">
                    <Label htmlFor="shipping">Shipping</Label>
                    <Input
                        id="shipping"
                        inputMode="decimal"
                        disabled={isSubmitting}
                        {...form.register("shipping")}
                    />
                </div>
                <div className="grid gap-2">
                    <Label htmlFor="discount">Discount</Label>
                    <Input
                        id="discount"
                        inputMode="decimal"
                        disabled={isSubmitting}
                        {...form.register("discount")}
                    />
                </div>
            </div>

            <div className="flex items-center justify-between border-t pt-4">
                <div className="text-sm">
                    <p className="text-muted-foreground">
                        Subtotal {money(subtotalCents)}
                    </p>
                    <p className="text-lg font-semibold tabular-nums">
                        Total {money(totalCents)}
                    </p>
                </div>
                <Button type="submit" disabled={isSubmitting}>
                    {isSubmitting ? "Creating…" : "Create order"}
                </Button>
            </div>
        </form>
    );
}
