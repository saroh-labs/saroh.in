"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Badge } from "@saroh/ui/badge";
import { Button } from "@saroh/ui/button";
import {
    Form,
    FormCard,
    FormControl,
    FormDescription,
    FormField,
    FormItem,
    FormLabel,
    FormMessage,
} from "@saroh/ui/form";
import { Input } from "@saroh/ui/input";
import { showError, showSuccess } from "@saroh/ui/toast";
import { Lock } from "lucide-react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { CountrySelect } from "@/components/shared/country-select";
import { OptionSelect } from "@/components/shared/option-select";
import { saveOrganizationSettings } from "@/lib/organizations/settings-actions";
import type { OrganizationSettings } from "@/lib/organizations/settings-service";

/** Allow an empty string (field left blank / cleared) or a valid value. */
const optionalText = (schema: z.ZodString) =>
    z.union([z.literal(""), schema]).optional();

const formSchema = z.object({
    name: z.string().trim().min(1, { message: "Name is required" }),
    legalName: z.string().optional(),
    type: z.enum(["", "individual", "company"]).optional(),
    country: z.string().optional(),
    taxId: z.string().optional(),
    contactEmail: optionalText(z.string().email("Enter a valid email")),
    website: optionalText(z.string().url("Enter a valid URL")),
});

type FormValues = z.infer<typeof formSchema>;

const PROFILE_KEYS = [
    "legalName",
    "type",
    "country",
    "taxId",
    "contactEmail",
    "website",
] as const;

/** The same vocabulary the API validates (`BUSINESS_TYPES`). */
const TYPES = [
    { value: "", label: "Not set" },
    { value: "individual", label: "Individual" },
    { value: "company", label: "Company" },
] as const;

/** Plain text fields, each with the note the design gives every field. */
const TEXT_FIELDS = [
    {
        key: "legalName",
        label: "Legal name",
        note: "The registered name, if it differs from the one above. It appears on published sites.",
    },
    {
        key: "taxId",
        label: "Tax ID",
        note: "Your GST, VAT or other tax registration number.",
    },
    {
        key: "contactEmail",
        label: "Contact email",
        note: "Where customers can reach the business.",
    },
    {
        key: "website",
        label: "Website",
        note: "A site the business has outside Saroh, if any.",
    },
] as const;

function valuesOf(settings: OrganizationSettings): FormValues {
    const type = settings.profile?.type;
    return {
        name: settings.name,
        legalName: settings.profile?.legalName ?? "",
        type: type === "individual" || type === "company" ? type : "",
        country: settings.profile?.country ?? "",
        taxId: settings.profile?.taxId ?? "",
        contactEmail: settings.profile?.contactEmail ?? "",
        website: settings.profile?.website ?? "",
    };
}

/**
 * Workspace → Business: the business's own identity, as the workspace design
 * draws it — one card, a note under every field.
 *
 * Type and country are pickers, not text: the API accepts only "individual"
 * or "company" and a two-letter country code, and a text box let a merchant
 * type anything and meet a validation error for it.
 *
 * Empty strings are SENT rather than dropped: a cleared field means "remove
 * this value". Untouched fields are omitted, so a rename never disturbs the
 * profile.
 */
export function OrganizationSettingsForm({
    settings,
    canEdit,
}: {
    settings: OrganizationSettings;
    canEdit: boolean;
}) {
    const router = useRouter();
    const form = useForm<FormValues>({
        resolver: zodResolver(formSchema),
        defaultValues: valuesOf(settings),
    });
    const { isSubmitting, dirtyFields, isDirty } = form.formState;

    async function onSubmit(values: FormValues) {
        const profile = Object.fromEntries(
            PROFILE_KEYS.filter((key) => dirtyFields[key]).map((key) => [
                key,
                values[key]?.trim() ?? "",
            ]),
        );

        const result = await saveOrganizationSettings({
            ...(dirtyFields.name ? { name: values.name.trim() } : {}),
            ...(Object.keys(profile).length > 0 ? { profile } : {}),
        });

        if (!result.ok) {
            showError(result.error);
            return;
        }

        showSuccess("Business saved");
        form.reset(valuesOf(result.data));
        // The header switcher renders the name — refresh so a rename shows.
        router.refresh();
    }

    const tradingSince = settings.tradingSince
        ? new Date(settings.tradingSince).getUTCFullYear().toString()
        : null;

    return (
        <Form {...form}>
            <form
                onSubmit={form.handleSubmit(onSubmit)}
                className="grid max-w-[620px] gap-5"
            >
                <FormCard>
                    <FormField
                        control={form.control}
                        name="name"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>Business name</FormLabel>
                                <FormControl>
                                    <Input
                                        {...field}
                                        maxLength={120}
                                        readOnly={!canEdit}
                                    />
                                </FormControl>
                                <FormDescription>
                                    Shown to customers on receipts and in the
                                    switcher above. The workspace address (
                                    <span className="font-mono">
                                        {settings.slug}
                                    </span>
                                    ) stays the same.
                                </FormDescription>
                                <FormMessage />
                            </FormItem>
                        )}
                    />

                    {/* Derived, so it is a fact shown, not a field offered. */}
                    <div className="grid gap-2">
                        <span className="text-[12.5px] font-medium">
                            Trading since
                        </span>
                        <div className="flex flex-wrap items-center gap-[9px]">
                            <span className="font-mono text-[13.5px]">
                                {tradingSince ?? "No orders yet"}
                            </span>
                            <Badge variant="neutral" className="gap-1">
                                <Lock aria-hidden className="size-3" />
                                From your first order
                            </Badge>
                        </div>
                        <p className="text-[11.5px] leading-[1.5] text-muted-foreground">
                            Derived, not typed — it is the date of the earliest
                            order on record.
                        </p>
                    </div>

                    <FormField
                        control={form.control}
                        name="legalName"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>{TEXT_FIELDS[0].label}</FormLabel>
                                <FormControl>
                                    <Input {...field} readOnly={!canEdit} />
                                </FormControl>
                                <FormDescription>
                                    {TEXT_FIELDS[0].note}
                                </FormDescription>
                                <FormMessage />
                            </FormItem>
                        )}
                    />

                    <FormField
                        control={form.control}
                        name="type"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>Type</FormLabel>
                                <FormControl>
                                    <OptionSelect
                                        value={field.value ?? ""}
                                        onValueChange={field.onChange}
                                        options={TYPES}
                                        disabled={!canEdit}
                                        className="w-44"
                                    />
                                </FormControl>
                                <FormDescription>
                                    An individual trades in their own name; a
                                    company is registered as one.
                                </FormDescription>
                                <FormMessage />
                            </FormItem>
                        )}
                    />

                    <FormField
                        control={form.control}
                        name="country"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>Country</FormLabel>
                                <FormControl>
                                    <CountrySelect
                                        value={field.value ?? ""}
                                        onValueChange={field.onChange}
                                        disabled={!canEdit}
                                    />
                                </FormControl>
                                <FormDescription>
                                    Where the business is registered.
                                </FormDescription>
                                <FormMessage />
                            </FormItem>
                        )}
                    />

                    {TEXT_FIELDS.slice(1).map(({ key, label, note }) => (
                        <FormField
                            key={key}
                            control={form.control}
                            name={key}
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>{label}</FormLabel>
                                    <FormControl>
                                        <Input
                                            {...field}
                                            readOnly={!canEdit}
                                            type={
                                                key === "contactEmail"
                                                    ? "email"
                                                    : key === "website"
                                                      ? "url"
                                                      : "text"
                                            }
                                        />
                                    </FormControl>
                                    <FormDescription>{note}</FormDescription>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                    ))}
                </FormCard>

                {canEdit ? (
                    <Button
                        type="submit"
                        disabled={isSubmitting || !isDirty}
                        className="wk-press w-fit"
                    >
                        {isSubmitting ? "Saving…" : "Save changes"}
                    </Button>
                ) : (
                    <p className="text-[11.5px] text-muted-foreground">
                        Your role can see the business details but not change
                        them.
                    </p>
                )}
            </form>
        </Form>
    );
}
