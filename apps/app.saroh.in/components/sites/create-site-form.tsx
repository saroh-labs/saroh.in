"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@saroh/ui/button";
import { PartialNotice } from "@saroh/ui/data-state";
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
import type { ModuleStates } from "@/lib/sites/template-picker";

import { TemplatePicker } from "./template-picker";

/**
 * Sentinel for "none picked": the API then starts the site from the kind's
 * template. Only when no template could be listed (the picker is hidden).
 */
const NO_TEMPLATE = "none";

/**
 * The template the picker starts on: the kind's (DEC-070, K15) when it is
 * listed, else the first listed. There is no blank site: a site always
 * starts from a template, the kind's when none is sent.
 */
export function initialTemplateId(
    templates: readonly Pick<Template, "id">[],
    preferred: string | null | undefined,
): string {
    if (preferred && templates.some((t) => t.id === preferred)) {
        return preferred;
    }
    return templates[0]?.id ?? NO_TEMPLATE;
}

const formSchema = z.object({
    name: z.string().trim().min(1, { message: "Name is required" }),
    subdomain: z
        .string()
        .trim()
        .min(3, { message: "Choose a web address of at least 3 characters" }),
    templateId: z.string(),
    /** The chosen colourway; empty for the template's first. */
    styleId: z.string(),
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
 *
 * The template starts on the one for what is being set up (DEC-070, K15):
 * Portfolio for "A site for my work", Personal for "Just me", the starter
 * for a business; or the one the address names (`?template=`, the gallery's
 * link). The picker (U12) shows the templates suggested for the business
 * first and every one under "All"; any can be picked, with one of its
 * colourways, and the choice is always sent.
 */
export function CreateSiteForm({
    templates,
    defaults = null,
    defaultTemplateId = null,
    startTemplateId = null,
    suggested = [],
    modules = null,
}: {
    /** The catalogue; null when it could not be read (said, not hidden). */
    templates: Template[] | null;
    /** What the API offers a new site; null starts the form empty. */
    defaults?: NewSiteDefaults | null;
    /** The kind's template (`kindDefaults(kind).starterTemplate`). */
    defaultTemplateId?: string | null;
    /** The one to start on (`?template=`, else the kind's); else the first. */
    startTemplateId?: string | null;
    /** The ids suggested for this business (`suggestedTemplates`). */
    suggested?: readonly string[];
    /** The business's modules, for "shows once Sell is on". */
    modules?: ModuleStates | null;
}) {
    const router = useRouter();
    const listed = templates ?? [];
    const form = useForm<FormValues>({
        resolver: zodResolver(formSchema),
        defaultValues: {
            name: defaults?.siteName ?? "",
            subdomain: defaults?.address ?? "",
            templateId: initialTemplateId(
                listed,
                startTemplateId ?? defaultTemplateId,
            ),
            styleId: "",
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
                : listed.find((t) => t.id === values.templateId);
        // A colourway only of the template chosen; none sends its first.
        const styleId = template?.colourways?.some(
            (c) => c.id === values.styleId,
        )
            ? values.styleId
            : undefined;
        const res = await createSite({
            name: values.name,
            subdomain: values.subdomain,
            templateId: template?.id,
            templateVersion: template?.version,
            ...(styleId ? { styleId } : {}),
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
                className="grid min-w-0 max-w-2xl gap-5"
            >
                <div className="grid min-w-0 max-w-md gap-4">
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
                                        fieldState.error &&
                                            "border-destructive",
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
                                <FormDescription data-ph-mask="">
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
                </div>
                {listed.length > 0 ? (
                    <FormField
                        control={form.control}
                        name="templateId"
                        render={({ field }) => (
                            <FormItem className="min-w-0">
                                <TemplatePicker
                                    templates={listed}
                                    suggested={suggested}
                                    value={field.value}
                                    onChange={field.onChange}
                                    styleId={form.watch("styleId")}
                                    onStyleChange={(id) =>
                                        form.setValue("styleId", id)
                                    }
                                    modules={modules}
                                    disabled={isSubmitting}
                                />
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                ) : (
                    <NoTemplates
                        failed={templates === null}
                        onRetry={() => router.refresh()}
                    />
                )}
                <Button
                    type="submit"
                    className="wk-press w-fit"
                    disabled={isSubmitting || !name.trim()}
                >
                    {isSubmitting ? "Creating…" : "Create site"}
                </Button>
            </form>
        </Form>
    );
}

/**
 * No catalogue to choose from. Failed: said, with a retry, and the site
 * can still be made (the API starts it from the kind's template). Empty:
 * the same start, said plainly.
 */
export function NoTemplates({
    failed,
    onRetry,
}: {
    failed: boolean;
    onRetry: () => void;
}) {
    if (failed) {
        return (
            <PartialNotice
                action={
                    <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={onRetry}
                    >
                        Try again
                    </Button>
                }
            >
                The templates couldn&apos;t be loaded. You can still create the
                site: it starts from the template for what you&apos;re setting
                up.
            </PartialNotice>
        );
    }
    return (
        <p className="text-sm text-muted-foreground">
            The site starts from the template for what you&apos;re setting up.
            Every page it starts with can be changed or removed.
        </p>
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
