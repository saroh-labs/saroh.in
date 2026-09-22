"use client";

import { Button } from "@saroh/ui/button";
import { Input } from "@saroh/ui/input";
import { Label } from "@saroh/ui/label";
import { showError, showSuccess } from "@saroh/ui/toast";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { CategoryRow } from "@/components/shared/category-row";
import { OptionSelect } from "@/components/shared/option-select";
import {
    createCategory,
    deleteCategory,
    updateCategory,
} from "@/lib/products/actions";
import type { Category } from "@/lib/products/service";

/**
 * Category management with a one-level parent picker. Create, rename, and
 * delete behind a confirm (the api blocks deleting a category that still has
 * children, moves its products to Uncategorized, and rejects loops).
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
            showError(res.error);
            return;
        }
        setName("");
        setParentId("");
        showSuccess("Category created");
        router.refresh();
    }

    async function onRename(c: Category, next: string) {
        // The slug is kept: renaming changes what people read, not the
        // address links already point at.
        const res = await updateCategory(storeId, c.id, {
            name: next,
            slug: c.slug,
            parentId: c.parentId,
        });
        if (!res.ok) {
            showError(res.error);
            return false;
        }
        showSuccess(`Renamed to ${next}`);
        router.refresh();
        return true;
    }

    async function onDelete(c: Category) {
        const res = await deleteCategory(storeId, c.id);
        if (!res.ok) {
            showError(res.error);
            return;
        }
        showSuccess(`${c.name} deleted`);
        router.refresh();
    }

    return (
        <div className="space-y-6">
            <form
                onSubmit={onAdd}
                className="flex flex-wrap items-end gap-3 rounded-xl border p-4"
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
                    <OptionSelect
                        id="cat-parent"
                        value={parentId}
                        disabled={adding}
                        onValueChange={setParentId}
                        options={[
                            { value: "", label: "None (top level)" },
                            ...categories.map((c) => ({
                                value: c.id,
                                label: c.name,
                            })),
                        ]}
                        className="w-56"
                    />
                </div>
                <Button type="submit" className="wk-press" disabled={adding}>
                    {adding ? "Adding…" : "Add category"}
                </Button>
            </form>

            {categories.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                    No categories yet.
                </p>
            ) : (
                <ul className="divide-y rounded-xl border">
                    {categories.map((c, i) => (
                        <li
                            key={c.id}
                            style={{ "--wk-i": i } as React.CSSProperties}
                            className="wk-item"
                        >
                            <CategoryRow
                                name={c.name}
                                meta={
                                    (c.parentId
                                        ? `in ${nameById.get(c.parentId) ?? "—"} · `
                                        : "") +
                                    (c._count.products === 1
                                        ? "1 product"
                                        : `${c._count.products} products`) +
                                    (c._count.children > 0
                                        ? ` · ${c._count.children} inside it`
                                        : "")
                                }
                                deleteTitle={`Delete ${c.name}?`}
                                deleteBody={
                                    c._count.children > 0
                                        ? `It has ${c._count.children} ${c._count.children === 1 ? "category" : "categories"} inside it. Move or delete those first — the delete will be refused until then.`
                                        : c._count.products > 0
                                          ? `Its ${c._count.products === 1 ? "product becomes" : `${c._count.products} products become`} Uncategorized; nothing else about them changes. This cannot be undone.`
                                          : "Nothing is in it. This cannot be undone."
                                }
                                onRename={(next) => onRename(c, next)}
                                onDelete={() => onDelete(c)}
                            />
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}
