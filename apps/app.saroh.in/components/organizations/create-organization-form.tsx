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
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

import { createOrganization } from "@/lib/organizations/actions";
import type { OrganizationProfileInput } from "@/lib/organizations/service";

/** Allow an empty string (field left blank) or a value that passes `schema`. */
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

/** The optional business-profile fields, in render order. */
const PROFILE_FIELDS = [
    "legalName",
    "type",
    "country",
    "taxId",
    "contactEmail",
    "website",
] as const satisfies readonly (keyof OrganizationProfileInput)[];

/**
 * Onboarding form: create an organization (the tenant root). Name is required;
 * the business-profile fields are optional. On success the new org is already
 * set active by the server action, so we route into the dashboard and refresh
 * to render under it.
 *
 * Validation is schema-driven (zod + react-hook-form via the shared `@saroh/ui`
 * `Form`), so field errors, `aria-invalid`, and the disabled/submitting states
 * are handled by the form primitives rather than hand-rolled `useState`.
 */
export function CreateOrganizationForm() {
    const router = useRouter();
    const form = useForm<FormValues>({
        resolver: zodResolver(formSchema),
        defaultValues: {
            name: "",
            legalName: "",
            type: "",
            country: "",
            taxId: "",
            contactEmail: "",
            website: "",
        },
    });
    const { isSubmitting } = form.formState;

    /** Drop empty strings so the API receives only meaningful profile fields. */
    function cleanProfile(
        values: FormValues,
    ): OrganizationProfileInput | undefined {
        const entries = PROFILE_FIELDS.map(
            (key) => [key, values[key]?.trim() ?? ""] as const,
        ).filter(([, value]) => value !== "");
        return entries.length ? Object.fromEntries(entries) : undefined;
    }

    async function onSubmit(values: FormValues) {
        const res = await createOrganization({
            name: values.name.trim(),
            profile: cleanProfile(values),
        });
        if (!res.ok) {
            if (res.field === "name") {
                form.setError("name", { message: res.error });
            } else {
                toast.error(res.error);
            }
            return;
        }
        router.push("/");
        router.refresh();
    }

    return (
        <Form {...form}>
            <form
                onSubmit={form.handleSubmit(onSubmit)}
                className="grid max-w-lg gap-6"
            >
                <FormField
                    control={form.control}
                    name="name"
                    render={({ field }) => (
                        // `wk-item` staggers the form's arrival (workspace.css);
                        // `--wk-i` is the block's position, not the field's.
                        <FormItem
                            className="wk-item"
                            style={{ "--wk-i": 0 } as React.CSSProperties}
                        >
                            <FormLabel>Organization name</FormLabel>
                            <FormControl>
                                <Input
                                    placeholder="Acme Inc."
                                    disabled={isSubmitting}
                                    {...field}
                                />
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                    )}
                />

                <fieldset
                    className="wk-item grid gap-4"
                    style={{ "--wk-i": 1 } as React.CSSProperties}
                    disabled={isSubmitting}
                >
                    <legend className="text-sm font-medium text-muted-foreground">
                        Business profile (optional)
                    </legend>
                    <FormField
                        control={form.control}
                        name="legalName"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>Legal name</FormLabel>
                                <FormControl>
                                    <Input
                                        placeholder="Acme Incorporated"
                                        {...field}
                                    />
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                    <div className="grid gap-4 sm:grid-cols-2">
                        <FormField
                            control={form.control}
                            name="type"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Type</FormLabel>
                                    <FormControl>
                                        <Input placeholder="LLC" {...field} />
                                    </FormControl>
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
                                        <Input placeholder="IN" {...field} />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                        <FormField
                            control={form.control}
                            name="taxId"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Tax ID</FormLabel>
                                    <FormControl>
                                        <Input {...field} />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                        <FormField
                            control={form.control}
                            name="contactEmail"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Contact email</FormLabel>
                                    <FormControl>
                                        <Input
                                            type="email"
                                            autoComplete="email"
                                            placeholder="hello@acme.com"
                                            {...field}
                                        />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                    </div>
                    <FormField
                        control={form.control}
                        name="website"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>Website</FormLabel>
                                <FormControl>
                                    <Input
                                        type="url"
                                        placeholder="https://acme.com"
                                        {...field}
                                    />
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                </fieldset>

                <Button
                    type="submit"
                    disabled={isSubmitting}
                    style={{ "--wk-i": 2 } as React.CSSProperties}
                    className="wk-item wk-press justify-self-start"
                >
                    {isSubmitting ? "Creating…" : "Create organization"}
                </Button>
            </form>
        </Form>
    );
}
