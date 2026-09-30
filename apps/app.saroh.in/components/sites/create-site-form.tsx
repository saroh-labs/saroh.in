"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@saroh/ui/button";
import {
    Form,
    FormControl,
    FormDescription,
    FormField,
    FormItem,
    FormLabel,
    FormMessage,
} from "@saroh/ui/form";
import { Input } from "@saroh/ui/input";
import { cn } from "@saroh/ui/lib/utils";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@saroh/ui/select";
import { showError } from "@saroh/ui/toast";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import {
    cleanAddressInput,
    MAX_ADDRESS_LENGTH,
} from "@/lib/organizations/address";
import { createSite } from "@/lib/sites/actions";
import type { NewSiteDefaults, Template } from "@/lib/sites/service";

/** Sentinel Select value for "no template" — Radix forbids an empty item value. */
const NO_TEMPLATE = "none";

const formSchema = z.object({
    name: z.string().trim().min(1, { message: "Name is required" }),
    subdomain: z
        .string()
        .trim()
        .min(3, { message: "Choose a web address of at least 3 characters" }),
    templateId: z.string(),
});

type FormValues = z.infer<typeof formSchema>;

/**
 * Create-site form (S2-004). Client component, `@saroh/ui` primitives,
 * calls the createSite server action, maps `res.field` to a field error else
 * toasts, and routes to the new site's editor on success.
 *
 * A site is never made without a web address (DEC-069, L5). The field starts
 * from `GET …/sites/new-defaults` — the business's own address, or a free one
 * like it — so a merchant normally never meets a refusal. When the API does
 * refuse one in use, it offers a free one, shown as "Use ‹address›" under the
 * field (as the Turn on sheet's Website step does), never applied unasked.
 */
export function CreateSiteForm({
    templates,
    defaults = null,
}: {
    templates: Template[];
    /** What the API offers a new site; null starts the form empty. */
    defaults?: NewSiteDefaults | null;
}) {
    const router = useRouter();
    const form = useForm<FormValues>({
        resolver: zodResolver(formSchema),
        defaultValues: {
            name: defaults?.siteName ?? "",
            subdomain: defaults?.address ?? "",
            templateId: NO_TEMPLATE,
        },
    });
    const [suggestion, setSuggestion] = useState<string | null>(null);
    const { isSubmitting } = form.formState;
    const name = form.watch("name");
    const address = form.watch("subdomain");

    async function onSubmit(values: FormValues) {
        const template =
            values.templateId === NO_TEMPLATE
                ? undefined
                : templates.find((t) => t.id === values.templateId);
        const res = await createSite({
            name: values.name,
            subdomain: values.subdomain,
            templateId: template?.id,
            templateVersion: template?.version,
        });
        if (!res.ok) {
            setSuggestion(res.suggestion ?? null);
            if (res.field === "subdomain" || res.field === "name") {
                form.setError(res.field, { message: res.error });
            } else {
                showError(res.error);
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
                                    maxLength={120}
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
                    render={({ field, fieldState }) => (
                        <FormItem>
                            <FormLabel>Web address</FormLabel>
                            <div
                                className={cn(
                                    "flex min-w-0 items-center rounded-md border border-input bg-background focus-within:ring-2 focus-within:ring-ring",
                                    fieldState.error && "border-destructive",
                                )}
                            >
                                <FormControl>
                                    <Input
                                        {...field}
                                        onChange={(e) => {
                                            field.onChange(
                                                cleanAddressInput(
                                                    e.target.value,
                                                ),
                                            );
                                            form.clearErrors("subdomain");
                                        }}
                                        placeholder="my-business"
                                        maxLength={MAX_ADDRESS_LENGTH}
                                        autoComplete="off"
                                        spellCheck={false}
                                        inputMode="url"
                                        disabled={isSubmitting}
                                        className="min-w-0 flex-1 border-0 text-right shadow-none focus-visible:ring-0 focus-visible:ring-offset-0"
                                    />
                                </FormControl>
                                <span
                                    aria-hidden="true"
                                    className="shrink-0 pr-3 text-sm text-muted-foreground"
                                >
                                    .saroh.app
                                </span>
                            </div>
                            <FormDescription>
                                {address
                                    ? `Customers find this site at ${address}.saroh.app`
                                    : "Letters, numbers and hyphens."}
                            </FormDescription>
                            <FormMessage />
                            <UseSuggestedAddress
                                suggestion={suggestion}
                                current={address}
                                onUse={(free) => {
                                    form.setValue("subdomain", free, {
                                        shouldDirty: true,
                                    });
                                    form.clearErrors("subdomain");
                                }}
                            />
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
                <Button
                    type="submit"
                    className="wk-press"
                    disabled={isSubmitting || !name.trim()}
                >
                    {isSubmitting ? "Creating…" : "Create site"}
                </Button>
            </form>
        </Form>
    );
}

/**
 * The free address the API offered for one in use (DEC-069), as a button
 * that fills the field. Shown only while the field doesn't already say it.
 */
export function UseSuggestedAddress({
    suggestion,
    current,
    onUse,
}: {
    suggestion: string | null;
    current: string;
    onUse: (address: string) => void;
}) {
    if (!suggestion || suggestion === current) return null;
    return (
        <button
            type="button"
            onClick={() => onUse(suggestion)}
            className="w-fit cursor-pointer rounded-sm text-left text-xs font-medium text-foreground underline underline-offset-2 hover:no-underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:text-muted-foreground coarse:min-h-11"
        >
            Use {suggestion}.saroh.app
        </button>
    );
}
