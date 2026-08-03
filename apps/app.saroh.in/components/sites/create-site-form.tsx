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
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@saroh/ui/select";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

import { trimmedOr } from "@/lib/forms/values";
import { createSite } from "@/lib/sites/actions";
import type { Template } from "@/lib/sites/service";

/** Sentinel Select value for "no template" — Radix forbids an empty item value. */
const NO_TEMPLATE = "none";

const formSchema = z.object({
    name: z.string().trim().min(1, { message: "Name is required" }),
    subdomain: z.string().optional(),
    templateId: z.string(),
});

type FormValues = z.infer<typeof formSchema>;

/**
 * Create-site form (S2-004). Follows create-store-form.tsx precisely: client
 * component, `@saroh/ui` primitives, `sonner` toasts, calls the createSite
 * server action, maps `res.field` to a field error else toasts, and routes to
 * the new site's editor on success. Adds an optional template picker seeded
 * from the templates fetched by the server page.
 *
 * Validation is schema-driven (zod + react-hook-form via the shared `@saroh/ui`
 * `Form`), so field errors, `aria-invalid`, and the disabled/submitting states
 * are handled by the form primitives rather than hand-rolled `useState`.
 */
export function CreateSiteForm({ templates }: { templates: Template[] }) {
    const router = useRouter();
    const form = useForm<FormValues>({
        resolver: zodResolver(formSchema),
        defaultValues: {
            name: "",
            subdomain: "",
            templateId: NO_TEMPLATE,
        },
    });
    const { isSubmitting } = form.formState;
    const name = form.watch("name");

    async function onSubmit(values: FormValues) {
        const template =
            values.templateId === NO_TEMPLATE
                ? undefined
                : templates.find((t) => t.id === values.templateId);
        const res = await createSite({
            name: values.name,
            subdomain: trimmedOr(values.subdomain, undefined),
            templateId: template?.id,
            templateVersion: template?.version,
        });
        if (!res.ok) {
            if (res.field === "subdomain" || res.field === "name") {
                form.setError(res.field, { message: res.error });
            } else {
                toast.error(res.error);
            }
            return;
        }
        router.push(`/sites/${res.data.siteId}`);
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
                            <FormLabel>Site name</FormLabel>
                            <FormControl>
                                <Input
                                    placeholder="My Site"
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
                    name="subdomain"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>Subdomain (optional)</FormLabel>
                            <FormControl>
                                <Input
                                    placeholder="my-site"
                                    disabled={isSubmitting}
                                    {...field}
                                />
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                    )}
                />
                {templates.length > 0 && (
                    <FormField
                        control={form.control}
                        name="templateId"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>Template (optional)</FormLabel>
                                <Select
                                    value={field.value}
                                    onValueChange={field.onChange}
                                    disabled={isSubmitting}
                                >
                                    <FormControl>
                                        <SelectTrigger>
                                            <SelectValue placeholder="Blank site" />
                                        </SelectTrigger>
                                    </FormControl>
                                    <SelectContent>
                                        <SelectItem value={NO_TEMPLATE}>
                                            Blank site
                                        </SelectItem>
                                        {templates.map((t) => (
                                            <SelectItem key={t.id} value={t.id}>
                                                {t.name} (v{t.version})
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                )}
                <Button type="submit" disabled={isSubmitting || !name.trim()}>
                    {isSubmitting ? "Creating…" : "Create site"}
                </Button>
            </form>
        </Form>
    );
}
