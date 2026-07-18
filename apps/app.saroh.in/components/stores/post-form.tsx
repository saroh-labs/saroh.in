"use client";

import { Button } from "@saroh/ui/button";
import { Input } from "@saroh/ui/input";
import { Label } from "@saroh/ui/label";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { createPost, deletePost, updatePost } from "@/lib/content/actions";
import type {
    PostCategory,
    PostDetail,
    PostStatus,
} from "@/lib/content/service";

const STATUSES: PostStatus[] = ["DRAFT", "PUBLISHED", "ARCHIVED"];
type FieldErrors = Partial<Record<"title" | "slug", string>>;

export function PostForm({
    storeId,
    categories,
    post,
}: {
    storeId: string;
    categories: PostCategory[];
    post?: PostDetail;
}) {
    const router = useRouter();
    const editing = Boolean(post);

    const [title, setTitle] = useState(post?.title ?? "");
    const [slug, setSlug] = useState(post?.slug ?? "");
    const [excerpt, setExcerpt] = useState(post?.excerpt ?? "");
    const [content, setContent] = useState(post?.content ?? "");
    const [categoryId, setCategoryId] = useState(post?.categoryId ?? "");
    const [status, setStatus] = useState<PostStatus>(post?.status ?? "DRAFT");
    const [featured, setFeatured] = useState(post?.featured ?? false);
    const [image, setImage] = useState(post?.image ?? "");
    const [errors, setErrors] = useState<FieldErrors>({});
    const [saving, setSaving] = useState(false);
    const [deleting, setDeleting] = useState(false);

    async function onSubmit(e: React.FormEvent) {
        e.preventDefault();
        setErrors({});
        setSaving(true);
        const input = {
            title: title.trim(),
            excerpt: excerpt.trim() || null,
            content,
            categoryId: categoryId || null,
            status,
            featured,
            image: image.trim() || null,
        };
        const res =
            editing && post
                ? await updatePost(storeId, post.id, {
                      ...input,
                      slug: slug.trim() || post.slug,
                  })
                : await createPost(storeId, {
                      ...input,
                      slug: slug.trim() || undefined,
                  });
        setSaving(false);

        if (!res.ok) {
            if (res.field === "title" || res.field === "slug") {
                setErrors({ [res.field]: res.error });
            } else {
                toast.error(res.error);
            }
            return;
        }
        toast.success(editing ? "Post saved" : "Post created");
        if (editing) {
            router.refresh();
        } else {
            const id = res.data.id;
            router.push(`/stores/${storeId}/content/${id}`);
        }
    }

    async function onDelete() {
        if (!post) return;
        setDeleting(true);
        const res = await deletePost(storeId, post.id);
        setDeleting(false);
        if (!res.ok) {
            toast.error(res.error);
            return;
        }
        toast.success("Post deleted");
        router.push(`/stores/${storeId}/content`);
    }

    return (
        <form onSubmit={onSubmit} className="grid max-w-2xl gap-4">
            <div className="grid gap-2">
                <Label htmlFor="title">Title</Label>
                <Input
                    id="title"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    required
                    disabled={saving}
                />
                {errors.title && (
                    <p className="text-sm text-destructive">{errors.title}</p>
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

            <div className="grid gap-2">
                <Label htmlFor="excerpt">Excerpt</Label>
                <textarea
                    id="excerpt"
                    value={excerpt}
                    onChange={(e) => setExcerpt(e.target.value)}
                    disabled={saving}
                    rows={2}
                    placeholder="A short summary for listings and previews."
                    className="rounded-md border border-input bg-background px-3 py-2 text-sm"
                />
            </div>

            <div className="grid gap-2">
                <Label htmlFor="content">Content</Label>
                <textarea
                    id="content"
                    value={content}
                    onChange={(e) => setContent(e.target.value)}
                    disabled={saving}
                    rows={12}
                    placeholder="Write your post in Markdown…"
                    className="rounded-md border border-input bg-background px-3 py-2 font-mono text-sm"
                />
            </div>

            <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                    <Label htmlFor="status">Status</Label>
                    <select
                        id="status"
                        value={status}
                        onChange={(e) =>
                            setStatus(e.target.value as PostStatus)
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
                <Label htmlFor="image">Cover image URL</Label>
                <Input
                    id="image"
                    value={image}
                    onChange={(e) => setImage(e.target.value)}
                    placeholder="https://…"
                    disabled={saving}
                />
            </div>

            <label className="flex items-center gap-2 text-sm">
                <input
                    type="checkbox"
                    checked={featured}
                    onChange={(e) => setFeatured(e.target.checked)}
                    disabled={saving}
                    className="h-4 w-4 rounded border-input"
                />
                Feature this post
            </label>

            <div className="flex items-center gap-3">
                <Button type="submit" disabled={saving}>
                    {saving
                        ? "Saving…"
                        : editing
                          ? "Save changes"
                          : "Create post"}
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
