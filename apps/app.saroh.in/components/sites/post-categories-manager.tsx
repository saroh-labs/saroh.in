"use client";

import { Button } from "@saroh/ui/button";
import { Input } from "@saroh/ui/input";
import { Label } from "@saroh/ui/label";
import { showError, showSuccess } from "@saroh/ui/toast";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { CategoryRow } from "@/components/shared/category-row";
import {
    createPostCategory,
    deletePostCategory,
    updatePostCategory,
} from "@/lib/content/actions";
import type { PostCategory } from "@/lib/content/service";

/**
 * Post category management — a flat list (no hierarchy). Create + delete;
 * deleting a category detaches its posts server-side. Write access is enforced
 * by the api (owner / EDITOR+).
 */
export function PostCategoriesManager({
    siteId,
    categories,
}: {
    siteId: string;
    categories: PostCategory[];
}) {
    const router = useRouter();
    const [name, setName] = useState("");
    const [adding, setAdding] = useState(false);

    async function onAdd(e: React.FormEvent) {
        e.preventDefault();
        setAdding(true);
        const res = await createPostCategory(siteId, { name: name.trim() });
        setAdding(false);
        if (!res.ok) {
            showError(res.error);
            return;
        }
        setName("");
        showSuccess("Category created");
        router.refresh();
    }

    async function onRename(c: PostCategory, next: string) {
        // The slug is kept: renaming changes what people read, not the
        // address links already point at.
        const res = await updatePostCategory(siteId, c.id, {
            name: next,
            slug: c.slug,
        });
        if (!res.ok) {
            showError(res.error);
            return false;
        }
        showSuccess(`Renamed to ${next}`);
        router.refresh();
        return true;
    }

    async function onDelete(c: PostCategory) {
        const res = await deletePostCategory(siteId, c.id);
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
                        placeholder="Announcements"
                        required
                        disabled={adding}
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
                                    c._count.posts === 1
                                        ? "1 post"
                                        : `${c._count.posts} posts`
                                }
                                deleteTitle={`Delete ${c.name}?`}
                                deleteBody={
                                    c._count.posts > 0
                                        ? `Its ${c._count.posts === 1 ? "post becomes" : `${c._count.posts} posts become`} Uncategorized and stays where it is on the site. This cannot be undone.`
                                        : "No posts are in it. This cannot be undone."
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
