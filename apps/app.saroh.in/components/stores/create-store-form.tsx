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
import { useRef } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

import { trimmedOr } from "@/lib/forms/values";
import { createStore } from "@/lib/stores/actions";
import { slugify } from "@/lib/stores/slug";

const formSchema = z.object({
    name: z.string().trim().min(1, { message: "Name is required" }),
    slug: z.string().optional(),
    description: z.string().optional(),
});

type FormValues = z.infer<typeof formSchema>;

export function CreateStoreForm() {
    const router = useRouter();
    const form = useForm<FormValues>({
        resolver: zodResolver(formSchema),
        defaultValues: {
            name: "",
            slug: "",
            description: "",
        },
    });
    const { isSubmitting } = form.formState;
    const name = form.watch("name");

    // Suggest the slug from the name until the user edits it directly.
    const slugEdited = useRef(false);

    async function onSubmit(values: FormValues) {
        const res = await createStore({
            name: values.name,
            slug: trimmedOr(values.slug, undefined),
            description: trimmedOr(values.description, undefined),
        });
        if (!res.ok) {
            if (res.field === "slug" || res.field === "name") {
                form.setError(res.field, { message: res.error });
            } else {
                toast.error(res.error);
            }
            return;
        }
        router.push(`/stores/${res.data.id}`);
    }

    return (
        <Form {...form}>
            <form
                onSubmit={form.handleSubmit(onSubmit)}
                className="grid max-w-md gap-4"
            >
                <FormField
                    control={form.control}
                    name="name"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>Store name</FormLabel>
                            <FormControl>
                                <Input
                                    placeholder="My Blog"
                                    disabled={isSubmitting}
                                    {...field}
                                    onChange={(e) => {
                                        field.onChange(e);
                                        if (!slugEdited.current) {
                                            form.setValue(
                                                "slug",
                                                slugify(e.target.value),
                                            );
                                        }
                                    }}
                                />
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                    )}
                />
                <FormField
                    control={form.control}
                    name="slug"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>Slug</FormLabel>
                            <FormControl>
                                <Input
                                    placeholder="my-blog"
                                    disabled={isSubmitting}
                                    {...field}
                                    onChange={(e) => {
                                        slugEdited.current = true;
                                        field.onChange(slugify(e.target.value));
                                    }}
                                />
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                    )}
                />
                <FormField
                    control={form.control}
                    name="description"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>Description (optional)</FormLabel>
                            <FormControl>
                                <Input disabled={isSubmitting} {...field} />
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                    )}
                />
                <Button
                    type="submit"
                    className="wk-press"
                    disabled={isSubmitting || !name.trim()}
                >
                    {isSubmitting ? "Creating…" : "Create store"}
                </Button>
            </form>
        </Form>
    );
}
