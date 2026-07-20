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
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

import { updateStore } from "@/lib/stores/actions";

interface StoreFields {
    id: string;
    name: string;
    slug: string;
    description: string | null;
    logo: string | null;
}

const formSchema = z.object({
    name: z.string().min(1, { message: "Name is required" }),
    slug: z.string().min(1, { message: "Slug is required" }),
    description: z.string().optional(),
    logo: z.string().optional(),
});

type FormValues = z.infer<typeof formSchema>;

export function StoreSettingsForm({ store }: { store: StoreFields }) {
    const form = useForm<FormValues>({
        resolver: zodResolver(formSchema),
        defaultValues: {
            name: store.name,
            slug: store.slug,
            description: store.description ?? "",
            logo: store.logo ?? "",
        },
    });
    const { isSubmitting } = form.formState;

    async function onSubmit(values: FormValues) {
        const res = await updateStore(store.id, {
            name: values.name,
            slug: values.slug,
            description: values.description?.trim() || null,
            logo: values.logo?.trim() || null,
        });
        if (!res.ok) {
            if (
                res.field === "name" ||
                res.field === "slug" ||
                res.field === "logo"
            ) {
                form.setError(res.field, { message: res.error });
            } else {
                toast.error(res.error);
            }
            return;
        }
        toast.success("Store settings saved");
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
                            <FormLabel>Name</FormLabel>
                            <FormControl>
                                <Input disabled={isSubmitting} {...field} />
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
                                <Input disabled={isSubmitting} {...field} />
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
                            <FormLabel>Description</FormLabel>
                            <FormControl>
                                <Input disabled={isSubmitting} {...field} />
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                    )}
                />
                <FormField
                    control={form.control}
                    name="logo"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>Logo URL</FormLabel>
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
                <Button type="submit" disabled={isSubmitting}>
                    {isSubmitting ? "Saving…" : "Save changes"}
                </Button>
            </form>
        </Form>
    );
}
