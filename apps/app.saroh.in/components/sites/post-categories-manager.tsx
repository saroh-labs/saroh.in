"use client";

import { Button } from "@saroh/ui/button";
import { Input } from "@saroh/ui/input";
import { Label } from "@saroh/ui/label";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { createPostCategory, deletePostCategory } from "@/lib/content/actions";
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
    const [busy, setBusy] = useState<string | null>(null);

    async function onAdd(e: React.FormEvent) {
        e.preventDefault();
        setAdding(true);
        const res = await createPostCategory(siteId, { name: name.trim() });
        setAdding(false);
        if (!res.ok) {
            toast.error(res.error);
            return;
        }
        setName("");
        toast.success("Category created");
        router.refresh();
    }

    async function onDelete(id: string) {
        setBusy(id);
        const res = await deletePostCategory(siteId, id);
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
                            className="wk-item flex items-center justify-between gap-3 p-3"
                        >
                            <div className="min-w-0">
                                <p className="truncate text-sm font-medium">
                                    {c.name}
                                </p>
                                <p className="truncate text-xs text-muted-foreground">
                                    {c._count.posts} posts
                                </p>
                            </div>
                            <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="wk-press"
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
