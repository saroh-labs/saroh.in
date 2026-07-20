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

const formSchema = z.object({
    name: z.string().min(1, { message: "Name is required" }),
    slug: z.string().optional(),
    price: z.string().min(1, { message: "Price is required" }),
    currency: z.string(),
    status: z.enum(["DRAFT", "PUBLISHED", "ARCHIVED"]),
    categoryId: z.string(),
    description: z.string().optional(),
});

type FormValues = z.infer<typeof formSchema>;

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

    const form = useForm<FormValues>({
        resolver: zodResolver(formSchema),
        defaultValues: {
            name: product?.name ?? "",
            slug: product?.slug ?? "",
            price: product?.price ?? "",
            currency: product?.currency ?? "USD",
            status: product?.status ?? "DRAFT",
            categoryId: product?.categoryId ?? "",
            description: product?.description ?? "",
        },
    });
    const { isSubmitting } = form.formState;
    const [deleting, setDeleting] = useState(false);

    async function onSubmit(values: FormValues) {
        const input = {
            name: values.name,
            slug: values.slug?.trim() || undefined,
            price: values.price.trim(),
            currency: values.currency,
            status: values.status,
            categoryId: values.categoryId || null,
            description: values.description?.trim() || null,
        };
        const res =
            editing && product
                ? await updateProduct(storeId, product.id, {
                      ...input,
                      slug: values.slug?.trim() || product.slug,
                  })
                : await createProduct(storeId, input);

        if (!res.ok) {
            if (
                res.field === "name" ||
                res.field === "slug" ||
                res.field === "price"
            ) {
                form.setError(res.field, { message: res.error });
            } else {
                toast.error(res.error);
            }
            return;
        }
        toast.success(editing ? "Product saved" : "Product created");
        if (editing) {
            router.refresh();
        } else {
            const id = res.data.id;
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
        <Form {...form}>
            <form
                onSubmit={form.handleSubmit(onSubmit)}
                className="grid max-w-lg gap-4"
            >
                <FormField
                    control={form.control}
                    name="name"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>Name</FormLabel>
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

                <div className="grid grid-cols-2 gap-4">
                    <FormField
                        control={form.control}
                        name="price"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>Price</FormLabel>
                                <FormControl>
                                    <Input
                                        inputMode="decimal"
                                        placeholder="19.99"
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
                        name="currency"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>Currency</FormLabel>
                                <FormControl>
                                    <Input
                                        maxLength={3}
                                        disabled={isSubmitting}
                                        {...field}
                                        onChange={(e) =>
                                            field.onChange(
                                                e.target.value.toUpperCase(),
                                            )
                                        }
                                    />
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                </div>

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
                    name="description"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel htmlFor="description">
                                Description
                            </FormLabel>
                            <FormControl>
                                <textarea
                                    id="description"
                                    disabled={isSubmitting}
                                    rows={3}
                                    className="rounded-md border border-input bg-background px-3 py-2 text-sm"
                                    {...field}
                                />
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                    )}
                />

                <div className="flex items-center gap-3">
                    <Button type="submit" disabled={isSubmitting}>
                        {isSubmitting
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
        </Form>
    );
}
