"use client";

import { Button } from "@saroh/ui/button";
import { Input } from "@saroh/ui/input";
import { Label } from "@saroh/ui/label";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import {
    createProduct,
    deleteProduct,
    updateProduct,
} from "@/lib/products/actions";
import type {
    Category,
    ProductDetail,
    ProductStatus,
} from "@/lib/products/service";

const STATUSES: ProductStatus[] = ["DRAFT", "PUBLISHED", "ARCHIVED"];
type FieldErrors = Partial<Record<"name" | "slug" | "price", string>>;

export function ProductForm({
    storeId,
    categories,
    product,
}: {
    storeId: string;
    categories: Category[];
    product?: ProductDetail;
}) {
    const router = useRouter();
    const editing = Boolean(product);

    const [name, setName] = useState(product?.name ?? "");
    const [slug, setSlug] = useState(product?.slug ?? "");
    const [price, setPrice] = useState(product?.price ?? "");
    const [currency, setCurrency] = useState(product?.currency ?? "USD");
    const [status, setStatus] = useState<ProductStatus>(
        product?.status ?? "DRAFT",
    );
    const [categoryId, setCategoryId] = useState(product?.categoryId ?? "");
    const [description, setDescription] = useState(product?.description ?? "");
    const [errors, setErrors] = useState<FieldErrors>({});
    const [saving, setSaving] = useState(false);
    const [deleting, setDeleting] = useState(false);

    async function onSubmit(e: React.FormEvent) {
        e.preventDefault();
        setErrors({});
        setSaving(true);
        const input = {
            name,
            slug: slug.trim() || undefined,
            price: price.trim(),
            currency,
            status,
            categoryId: categoryId || null,
            description: description.trim() || null,
        };
        const res =
            editing && product
                ? await updateProduct(storeId, product.id, {
                      ...input,
                      slug: slug.trim() || product.slug,
                  })
                : await createProduct(storeId, input);
        setSaving(false);

        if (!res.ok) {
            if (
                res.field === "name" ||
                res.field === "slug" ||
                res.field === "price"
            ) {
                setErrors({ [res.field]: res.error });
            } else {
                toast.error(res.error);
            }
            return;
        }
        toast.success(editing ? "Product saved" : "Product created");
        if (editing) {
            router.refresh();
        } else {
            const id = (res.data as { id: string }).id;
            router.push(`/stores/${storeId}/products/${id}`);
        }
    }

    async function onDelete() {
        if (!product) return;
        setDeleting(true);
        const res = await deleteProduct(storeId, product.id);
        setDeleting(false);
        if (!res.ok) {
            toast.error(res.error);
            return;
        }
        toast.success("Product deleted");
        router.push(`/stores/${storeId}/products`);
    }

    return (
        <form onSubmit={onSubmit} className="grid max-w-lg gap-4">
            <div className="grid gap-2">
                <Label htmlFor="name">Name</Label>
                <Input
                    id="name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                    disabled={saving}
                />
                {errors.name && (
                    <p className="text-sm text-destructive">{errors.name}</p>
                )}
            </div>

            {editing && (
                <div className="grid gap-2">
                    <Label htmlFor="slug">Slug</Label>
                    <Input
                        id="slug"
                        value={slug}
                        onChange={(e) => setSlug(e.target.value)}
                        disabled={saving}
                    />
                    {errors.slug && (
                        <p className="text-sm text-destructive">
                            {errors.slug}
                        </p>
                    )}
                </div>
            )}

            <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                    <Label htmlFor="price">Price</Label>
                    <Input
                        id="price"
                        inputMode="decimal"
                        placeholder="19.99"
                        value={price}
                        onChange={(e) => setPrice(e.target.value)}
                        required
                        disabled={saving}
                    />
                    {errors.price && (
                        <p className="text-sm text-destructive">
                            {errors.price}
                        </p>
                    )}
                </div>
                <div className="grid gap-2">
                    <Label htmlFor="currency">Currency</Label>
                    <Input
                        id="currency"
                        value={currency}
                        onChange={(e) =>
                            setCurrency(e.target.value.toUpperCase())
                        }
                        maxLength={3}
                        disabled={saving}
                    />
                </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                    <Label htmlFor="status">Status</Label>
                    <select
                        id="status"
                        value={status}
                        onChange={(e) =>
                            setStatus(e.target.value as ProductStatus)
                        }
                        disabled={saving}
                        className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                    >
                        {STATUSES.map((s) => (
                            <option key={s} value={s}>
                                {s}
                            </option>
                        ))}
                    </select>
                </div>
                <div className="grid gap-2">
                    <Label htmlFor="category">Category</Label>
                    <select
                        id="category"
                        value={categoryId}
                        onChange={(e) => setCategoryId(e.target.value)}
                        disabled={saving}
                        className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                    >
                        <option value="">Uncategorized</option>
                        {categories.map((c) => (
                            <option key={c.id} value={c.id}>
                                {c.name}
                            </option>
                        ))}
                    </select>
                </div>
            </div>

            <div className="grid gap-2">
                <Label htmlFor="description">Description</Label>
                <textarea
                    id="description"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    disabled={saving}
                    rows={3}
                    className="rounded-md border border-input bg-background px-3 py-2 text-sm"
                />
            </div>

            <div className="flex items-center gap-3">
                <Button type="submit" disabled={saving}>
                    {saving
                        ? "Saving…"
                        : editing
                          ? "Save changes"
                          : "Create product"}
                </Button>
                {editing && (
                    <Button
                        type="button"
                        variant="ghost"
                        disabled={deleting}
                        onClick={onDelete}
                        className="text-destructive"
                    >
                        {deleting ? "Deleting…" : "Delete"}
                    </Button>
                )}
            </div>
        </form>
    );
}
