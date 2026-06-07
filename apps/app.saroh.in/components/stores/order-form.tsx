"use client";

import { Button } from "@saroh/ui/button";
import { Input } from "@saroh/ui/input";
import { Label } from "@saroh/ui/label";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

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
    const [customerId, setCustomerId] = useState("");
    const [lines, setLines] = useState<
        { productId: string; quantity: number }[]
    >([{ productId: products[0]?.id ?? "", quantity: 1 }]);
    const [tax, setTax] = useState("0");
    const [shipping, setShipping] = useState("0");
    const [discount, setDiscount] = useState("0");
    const [saving, setSaving] = useState(false);

    const priceOf = (id: string) =>
        toCents(products.find((p) => p.id === id)?.price ?? "0");
    const subtotalCents = lines.reduce(
        (sum, l) => sum + priceOf(l.productId) * (l.quantity || 0),
        0,
    );
    const totalCents = Math.max(
        0,
        subtotalCents + toCents(tax) + toCents(shipping) - toCents(discount),
    );

    function setLine(i: number, patch: Partial<(typeof lines)[number]>) {
        setLines((ls) =>
            ls.map((l, idx) => (idx === i ? { ...l, ...patch } : l)),
        );
    }
    const addLine = () =>
        setLines((ls) => [
            ...ls,
            { productId: products[0]?.id ?? "", quantity: 1 },
        ]);
    const removeLine = (i: number) =>
        setLines((ls) => ls.filter((_, idx) => idx !== i));

    async function onSubmit(e: React.FormEvent) {
        e.preventDefault();
        if (!customerId) {
            toast.error("Pick a customer");
            return;
        }
        const items = lines
            .filter((l) => l.productId && l.quantity > 0)
            .map((l) => ({ productId: l.productId, quantity: l.quantity }));
        if (items.length === 0) {
            toast.error("Add at least one product");
            return;
        }
        setSaving(true);
        const res = await createOrder(storeId, {
            customerId,
            items,
            tax,
            shipping,
            discount,
        });
        setSaving(false);
        if (!res.ok) {
            toast.error(res.error);
            return;
        }
        toast.success("Order created");
        router.push(`/stores/${storeId}/orders/${res.data.id}`);
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
        <form onSubmit={onSubmit} className="grid max-w-2xl gap-6">
            <div className="grid gap-2">
                <Label htmlFor="customer">Customer</Label>
                <select
                    id="customer"
                    value={customerId}
                    onChange={(e) => setCustomerId(e.target.value)}
                    disabled={saving}
                    className="h-9 rounded-md border border-input bg-background px-3 text-sm"
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
                {lines.map((line, i) => (
                    <div key={i} className="flex items-center gap-2">
                        <select
                            aria-label="Product"
                            value={line.productId}
                            onChange={(e) =>
                                setLine(i, { productId: e.target.value })
                            }
                            disabled={saving}
                            className="h-9 flex-1 rounded-md border border-input bg-background px-3 text-sm"
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
                            value={line.quantity}
                            onChange={(e) =>
                                setLine(i, {
                                    quantity: Number(e.target.value),
                                })
                            }
                            disabled={saving}
                            className="w-20"
                        />
                        <span className="w-20 text-right text-sm tabular-nums text-muted-foreground">
                            {money(
                                priceOf(line.productId) * (line.quantity || 0),
                            )}
                        </span>
                        <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            disabled={saving || lines.length === 1}
                            onClick={() => removeLine(i)}
                        >
                            ✕
                        </Button>
                    </div>
                ))}
                <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={addLine}
                    disabled={saving}
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
                        value={tax}
                        onChange={(e) => setTax(e.target.value)}
                        disabled={saving}
                    />
                </div>
                <div className="grid gap-2">
                    <Label htmlFor="shipping">Shipping</Label>
                    <Input
                        id="shipping"
                        inputMode="decimal"
                        value={shipping}
                        onChange={(e) => setShipping(e.target.value)}
                        disabled={saving}
                    />
                </div>
                <div className="grid gap-2">
                    <Label htmlFor="discount">Discount</Label>
                    <Input
                        id="discount"
                        inputMode="decimal"
                        value={discount}
                        onChange={(e) => setDiscount(e.target.value)}
                        disabled={saving}
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
                <Button type="submit" disabled={saving}>
                    {saving ? "Creating…" : "Create order"}
                </Button>
            </div>
        </form>
    );
}
