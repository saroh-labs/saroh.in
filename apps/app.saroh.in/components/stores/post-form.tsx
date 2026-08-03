"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@saroh/ui/button";
import {
    Form,
    FormControl,
    FormField,
    FormItem,
    FormLabel,
    FormMessage,
} from "@saroh/ui/form";
import { Input } from "@saroh/ui/input";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

import { createPost, deletePost, updatePost } from "@/lib/content/actions";
import type {
    PostCategory,
    PostDetail,
    PostStatus,
} from "@/lib/content/service";
import { trimmedOr } from "@/lib/forms/values";

const STATUSES: PostStatus[] = ["DRAFT", "PUBLISHED", "ARCHIVED"];

const formSchema = z.object({
    title: z.string().min(1, { message: "Title is required" }),
    slug: z.string().optional(),
    excerpt: z.string().optional(),
    content: z.string(),
    categoryId: z.string(),
    status: z.enum(["DRAFT", "PUBLISHED", "ARCHIVED"]),
    featured: z.boolean(),
    image: z.string().optional(),
});

type FormValues = z.infer<typeof formSchema>;

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

    const form = useForm<FormValues>({
        resolver: zodResolver(formSchema),
        defaultValues: {
            title: post?.title ?? "",
            slug: post?.slug ?? "",
            excerpt: post?.excerpt ?? "",
            content: post?.content ?? "",
            categoryId: post?.categoryId ?? "",
            status: post?.status ?? "DRAFT",
            featured: post?.featured ?? false,
            image: post?.image ?? "",
        },
    });
    const { isSubmitting } = form.formState;
    const [deleting, setDeleting] = useState(false);

    async function onSubmit(values: FormValues) {
        const input = {
            title: values.title.trim(),
            excerpt: trimmedOr(values.excerpt, null),
            content: values.content,
            categoryId: values.categoryId || null,
            status: values.status,
            featured: values.featured,
            image: trimmedOr(values.image, null),
        };
        const res =
            editing && post
                ? await updatePost(storeId, post.id, {
                      ...input,
                      slug: trimmedOr(values.slug, post.slug),
                  })
                : await createPost(storeId, {
                      ...input,
                      slug: trimmedOr(values.slug, undefined),
                  });

        if (!res.ok) {
            if (res.field === "title" || res.field === "slug") {
                form.setError(res.field, { message: res.error });
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
        <Form {...form}>
            <form
                onSubmit={form.handleSubmit(onSubmit)}
                className="grid max-w-2xl gap-4"
            >
                <FormField
                    control={form.control}
                    name="title"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>Title</FormLabel>
                            <FormControl>
                                <Input disabled={isSubmitting} {...field} />
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                    )}
                />

                {editing && (
                    <FormField
                        control={form.control}
                        name="slug"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>Slug</FormLabel>
                                <FormControl>
                                    <Input disabled={isSubmitting} {...field} />
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                )}

                <FormField
                    control={form.control}
                    name="excerpt"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel htmlFor="excerpt">Excerpt</FormLabel>
                            <FormControl>
                                <textarea
                                    id="excerpt"
                                    disabled={isSubmitting}
                                    rows={2}
                                    placeholder="A short summary for listings and previews."
                                    className="rounded-md border border-input bg-background px-3 py-2 text-sm"
                                    {...field}
                                />
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                    )}
                />

                <FormField
                    control={form.control}
                    name="content"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel htmlFor="content">Content</FormLabel>
                            <FormControl>
                                <textarea
                                    id="content"
                                    disabled={isSubmitting}
                                    rows={12}
                                    placeholder="Write your post in Markdown…"
                                    className="rounded-md border border-input bg-background px-3 py-2 font-mono text-sm"
                                    {...field}
                                />
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                    )}
                />

                <div className="grid grid-cols-2 gap-4">
                    <FormField
                        control={form.control}
                        name="status"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel htmlFor="status">Status</FormLabel>
                                <FormControl>
                                    <select
                                        id="status"
                                        disabled={isSubmitting}
                                        className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                                        {...field}
                                    >
                                        {STATUSES.map((s) => (
                                            <option key={s} value={s}>
                                                {s}
                                            </option>
                                        ))}
                                    </select>
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                    <FormField
                        control={form.control}
                        name="categoryId"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel htmlFor="category">
                                    Category
                                </FormLabel>
                                <FormControl>
                                    <select
                                        id="category"
                                        disabled={isSubmitting}
                                        className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                                        {...field}
                                    >
                                        <option value="">Uncategorized</option>
                                        {categories.map((c) => (
                                            <option key={c.id} value={c.id}>
                                                {c.name}
                                            </option>
                                        ))}
                                    </select>
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                </div>

                <FormField
                    control={form.control}
                    name="image"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>Cover image URL</FormLabel>
                            <FormControl>
                                <Input
                                    placeholder="https://…"
                                    disabled={isSubmitting}
                                    {...field}
                                />
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                    )}
                />

                <FormField
                    control={form.control}
                    name="featured"
                    render={({ field }) => (
                        <label className="flex items-center gap-2 text-sm">
                            <input
                                type="checkbox"
                                name={field.name}
                                ref={field.ref}
                                checked={field.value}
                                onBlur={field.onBlur}
                                onChange={(e) =>
                                    field.onChange(e.target.checked)
                                }
                                disabled={isSubmitting}
                                className="h-4 w-4 rounded border-input"
                            />
                            Feature this post
                        </label>
                    )}
                />

                <div className="flex items-center gap-3">
                    <Button type="submit" disabled={isSubmitting}>
                        {isSubmitting
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
        </Form>
    );
}
