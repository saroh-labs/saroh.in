"use client";

import { Button } from "@saroh/ui/button";
import { Input } from "@saroh/ui/input";
import { Label } from "@saroh/ui/label";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import {
    createVariant,
    deleteVariant,
    setInventory,
} from "@/lib/products/actions";
import type { Inventory, Variant } from "@/lib/products/service";

/**
 * Variants (add/remove SKUs) + inventory (on-hand quantity + low-stock alert)
 * for a product. Mutations call the catalog server actions; the api enforces
 * write access (owner / EDITOR+). `reserved` is owned by Orders and read-only.
 */
export function ProductVariants({
    storeId,
    productId,
    variants,
    inventory,
}: {
    storeId: string;
    productId: string;
    variants: Variant[];
    inventory: Inventory | null;
}) {
    const router = useRouter();

    const [sku, setSku] = useState("");
    const [title, setTitle] = useState("");
    const [vprice, setVprice] = useState("");
    const [addingVariant, setAddingVariant] = useState(false);
    const [busy, setBusy] = useState<string | null>(null);

    const [quantity, setQuantity] = useState(String(inventory?.quantity ?? 0));
    const [lowStock, setLowStock] = useState(
        String(inventory?.lowStockAlert ?? 10),
    );
    const [savingStock, setSavingStock] = useState(false);

    async function onAddVariant(e: React.FormEvent) {
        e.preventDefault();
        setAddingVariant(true);
        const res = await createVariant(storeId, productId, {
            sku: sku.trim(),
            title: title.trim(),
            price: vprice.trim() || null,
        });
        setAddingVariant(false);
        if (!res.ok) {
            toast.error(res.error);
            return;
        }
        setSku("");
        setTitle("");
        setVprice("");
        toast.success("Variant added");
        router.refresh();
    }

    async function onRemoveVariant(variantId: string) {
        setBusy(variantId);
        const res = await deleteVariant(storeId, productId, variantId);
        setBusy(null);
        if (!res.ok) {
            toast.error(res.error);
            return;
        }
        toast.success("Variant removed");
        router.refresh();
    }

    async function onSaveStock(e: React.FormEvent) {
        e.preventDefault();
        setSavingStock(true);
        const res = await setInventory(storeId, productId, {
            quantity: Number(quantity),
            lowStockAlert: Number(lowStock),
        });
        setSavingStock(false);
        if (!res.ok) {
            toast.error(res.error);
            return;
        }
        toast.success("Stock updated");
        router.refresh();
    }

    return (
        <div className="space-y-8 border-t pt-8">
            <section className="space-y-3">
                <h3 className="text-sm font-medium">Inventory</h3>
                <form
                    onSubmit={onSaveStock}
                    className="flex flex-wrap items-end gap-3"
                >
                    <div className="grid gap-2">
                        <Label htmlFor="quantity">On hand</Label>
                        <Input
                            id="quantity"
                            type="number"
                            min={0}
                            value={quantity}
                            onChange={(e) => setQuantity(e.target.value)}
                            disabled={savingStock}
                            className="w-28"
                        />
                    </div>
                    <div className="grid gap-2">
                        <Label htmlFor="lowStock">Low-stock alert</Label>
                        <Input
                            id="lowStock"
                            type="number"
                            min={0}
                            value={lowStock}
                            onChange={(e) => setLowStock(e.target.value)}
                            disabled={savingStock}
                            className="w-28"
                        />
                    </div>
                    {inventory && (
                        <p className="pb-2 text-xs text-muted-foreground">
                            {inventory.reserved} reserved
                        </p>
                    )}
                    <Button
                        type="submit"
                        className="wk-press"
                        disabled={savingStock}
                    >
                        {savingStock ? "Saving…" : "Save stock"}
                    </Button>
                </form>
            </section>

            <section className="space-y-3">
                <h3 className="text-sm font-medium">Variants</h3>
                {variants.length > 0 && (
                    <ul className="divide-y rounded-xl border">
                        {variants.map((v, i) => (
                            <li
                                key={v.id}
                                style={{ "--wk-i": i } as React.CSSProperties}
                                className="wk-item flex items-center justify-between gap-3 p-3"
                            >
                                <div className="min-w-0">
                                    <p className="truncate text-sm font-medium">
                                        {v.title}
                                    </p>
                                    <p className="truncate text-xs text-muted-foreground">
                                        {v.sku}
                                        {v.price ? ` · ${v.price}` : ""}
                                    </p>
                                </div>
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    className="wk-press"
                                    disabled={busy === v.id}
                                    onClick={() => onRemoveVariant(v.id)}
                                >
                                    Remove
                                </Button>
                            </li>
                        ))}
                    </ul>
                )}

                <form
                    onSubmit={onAddVariant}
                    className="flex flex-wrap items-end gap-3 rounded-xl border p-4"
                >
                    <div className="grid gap-2">
                        <Label htmlFor="sku">SKU</Label>
                        <Input
                            id="sku"
                            value={sku}
                            onChange={(e) => setSku(e.target.value)}
                            placeholder="TS-RED-L"
                            required
                            disabled={addingVariant}
                            className="w-40"
                        />
                    </div>
                    <div className="grid gap-2">
                        <Label htmlFor="vtitle">Title</Label>
                        <Input
                            id="vtitle"
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                            placeholder="Red / Large"
                            required
                            disabled={addingVariant}
                        />
                    </div>
                    <div className="grid gap-2">
                        <Label htmlFor="vprice">Price (optional)</Label>
                        <Input
                            id="vprice"
                            inputMode="decimal"
                            value={vprice}
                            onChange={(e) => setVprice(e.target.value)}
                            placeholder="inherit"
                            disabled={addingVariant}
                            className="w-28"
                        />
                    </div>
                    <Button
                        type="submit"
                        className="wk-press"
                        disabled={addingVariant}
                    >
                        {addingVariant ? "Adding…" : "Add variant"}
                    </Button>
                </form>
            </section>
        </div>
    );
}
