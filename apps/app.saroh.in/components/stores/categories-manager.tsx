"use client";

import { Button } from "@saroh/ui/button";
import { Input } from "@saroh/ui/input";
import { Label } from "@saroh/ui/label";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { createCategory, deleteCategory } from "@/lib/products/actions";
import type { Category } from "@/lib/products/service";

/**
 * Category management with a one-level parent picker. Create + delete (the api
 * blocks deleting a category that still has children, and rejects loops).
 * Write access is enforced server-side (owner / EDITOR+).
 */
export function CategoriesManager({
    storeId,
    categories,
}: {
    storeId: string;
    categories: Category[];
}) {
    const router = useRouter();
    const [name, setName] = useState("");
    const [parentId, setParentId] = useState("");
    const [adding, setAdding] = useState(false);
    const [busy, setBusy] = useState<string | null>(null);

    const nameById = new Map(categories.map((c) => [c.id, c.name]));

    async function onAdd(e: React.FormEvent) {
        e.preventDefault();
        setAdding(true);
        const res = await createCategory(storeId, {
            name: name.trim(),
            parentId: parentId || null,
        });
        setAdding(false);
        if (!res.ok) {
            toast.error(res.error);
            return;
        }
        setName("");
        setParentId("");
        toast.success("Category created");
        router.refresh();
    }

    async function onDelete(id: string) {
        setBusy(id);
        const res = await deleteCategory(storeId, id);
        setBusy(null);
        if (!res.ok) {
            toast.error(res.error);
            return;
        }
        toast.success("Category deleted");
        router.refresh();
    }

    return (
        <div className="space-y-6">
            <form
                onSubmit={onAdd}
                className="flex flex-wrap items-end gap-3 rounded-lg border p-4"
            >
                <div className="grid min-w-[180px] flex-1 gap-2">
                    <Label htmlFor="cat-name">New category</Label>
                    <Input
                        id="cat-name"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="Apparel"
                        required
                        disabled={adding}
                    />
                </div>
                <div className="grid gap-2">
                    <Label htmlFor="cat-parent">Parent</Label>
                    <select
                        id="cat-parent"
                        value={parentId}
                        onChange={(e) => setParentId(e.target.value)}
                        disabled={adding}
                        className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                    >
                        <option value="">None (top level)</option>
                        {categories.map((c) => (
                            <option key={c.id} value={c.id}>
                                {c.name}
                            </option>
                        ))}
                    </select>
                </div>
                <Button type="submit" disabled={adding}>
                    {adding ? "Adding…" : "Add category"}
                </Button>
            </form>

            {categories.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                    No categories yet.
                </p>
            ) : (
                <ul className="divide-y rounded-lg border">
                    {categories.map((c) => (
                        <li
                            key={c.id}
                            className="flex items-center justify-between gap-3 p-3"
                        >
                            <div className="min-w-0">
                                <p className="truncate text-sm font-medium">
                                    {c.name}
                                </p>
                                <p className="truncate text-xs text-muted-foreground">
                                    {c.parentId
                                        ? `in ${nameById.get(c.parentId) ?? "—"} · `
                                        : ""}
                                    {c._count.products} products
                                    {c._count.children > 0
                                        ? ` · ${c._count.children} sub`
                                        : ""}
                                </p>
                            </div>
                            <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                disabled={busy === c.id}
                                onClick={() => onDelete(c.id)}
                            >
                                Delete
                            </Button>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}
