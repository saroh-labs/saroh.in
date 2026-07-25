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
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

import { saveOrganizationSettings } from "@/lib/organizations/settings-actions";
import type { OrganizationSettings } from "@/lib/organizations/settings-service";

/** Allow an empty string (field left blank / cleared) or a valid value. */
const optionalText = (schema: z.ZodString) =>
    z.union([z.literal(""), schema]).optional();

const formSchema = z.object({
    name: z.string().trim().min(1, { message: "Name is required" }),
    legalName: z.string().optional(),
    type: z.string().optional(),
    country: z.string().optional(),
    taxId: z.string().optional(),
    contactEmail: optionalText(z.string().email("Enter a valid email")),
    website: optionalText(z.string().url("Enter a valid URL")),
});

type FormValues = z.infer<typeof formSchema>;

const PROFILE_FIELDS = [
    { key: "legalName", label: "Legal name" },
    { key: "type", label: "Type" },
    { key: "country", label: "Country" },
    { key: "taxId", label: "Tax ID" },
    { key: "contactEmail", label: "Contact email" },
    { key: "website", label: "Website" },
] as const;

/**
 * Edit the organization's identity — mirrors the onboarding form so the fields
 * captured at signup are the fields you can correct later.
 *
 * Unlike onboarding, empty strings are SENT rather than dropped: here a cleared
 * field means "remove this value", and silently ignoring it would make fields
 * impossible to unset. Untouched fields are omitted entirely, so saving a rename
 * never disturbs the profile.
 */
export function OrganizationSettingsForm({
    settings,
}: {
    settings: OrganizationSettings;
}) {
    const router = useRouter();
    const form = useForm<FormValues>({
        resolver: zodResolver(formSchema),
        defaultValues: {
            name: settings.name,
            legalName: settings.profile?.legalName ?? "",
            type: settings.profile?.type ?? "",
            country: settings.profile?.country ?? "",
            taxId: settings.profile?.taxId ?? "",
            contactEmail: settings.profile?.contactEmail ?? "",
            website: settings.profile?.website ?? "",
        },
    });
    const { isSubmitting, dirtyFields } = form.formState;

    async function onSubmit(values: FormValues) {
        // Send only what the user actually touched (PATCH semantics).
        const profile = Object.fromEntries(
            PROFILE_FIELDS.filter(({ key }) => dirtyFields[key]).map(
                ({ key }) => [key, values[key]?.trim() ?? ""],
            ),
        );

        const result = await saveOrganizationSettings({
            ...(dirtyFields.name ? { name: values.name.trim() } : {}),
            ...(Object.keys(profile).length > 0 ? { profile } : {}),
        });

        if (!result.ok) {
            toast.error(result.error);
            return;
        }

        toast.success("Organization saved");
        form.reset({
            name: result.data.name,
            legalName: result.data.profile?.legalName ?? "",
            type: result.data.profile?.type ?? "",
            country: result.data.profile?.country ?? "",
            taxId: result.data.profile?.taxId ?? "",
            contactEmail: result.data.profile?.contactEmail ?? "",
            website: result.data.profile?.website ?? "",
        });
        // The header switcher renders the org name — refresh so a rename shows.
        router.refresh();
    }

    return (
        <Form {...form}>
            <form
                onSubmit={form.handleSubmit(onSubmit)}
                className="grid max-w-xl gap-6"
            >
                <FormField
                    control={form.control}
                    name="name"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>Organization name</FormLabel>
                            <FormControl>
                                <Input {...field} maxLength={120} />
                            </FormControl>
                            <FormDescription>
                                Your workspace URL ({settings.slug}) stays the
                                same — it is used in links that may already be
                                shared.
                            </FormDescription>
                            <FormMessage />
                        </FormItem>
                    )}
                />

                <div className="grid gap-4">
                    <h2 className="text-sm font-medium">Business profile</h2>
                    {PROFILE_FIELDS.map(({ key, label }) => (
                        <FormField
                            key={key}
                            control={form.control}
                            name={key}
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>{label}</FormLabel>
                                    <FormControl>
                                        <Input {...field} />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                    ))}
                    <p className="text-sm text-muted-foreground">
                        Your legal name appears on published sites, so
                        correcting it here updates what customers see.
                    </p>
                </div>

                <Button type="submit" disabled={isSubmitting} className="w-fit">
                    {isSubmitting ? "Saving…" : "Save changes"}
                </Button>
            </form>
        </Form>
    );
}
