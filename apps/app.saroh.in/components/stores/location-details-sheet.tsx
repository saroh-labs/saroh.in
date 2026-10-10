"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import {
    Form,
    FormControl,
    FormField,
    FormItem,
    FormLabel,
    FormMessage,
} from "@saroh/ui/form";
import { Input } from "@saroh/ui/input";
import { showError, showSuccess } from "@saroh/ui/toast";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { trimmedOr } from "@/lib/forms/values";
import { updateStore } from "@/lib/stores/actions";
import type { LocationDetails } from "@/lib/stores/location-details";

import { PlaceSheetFrame } from "./place-sheets";

const formSchema = z.object({
    description: z.string().optional(),
    logo: z.string().optional(),
});

type FormValues = z.infer<typeof formSchema>;

/**
 * A location's description and logo, edited in a sheet from their row in
 * The place (owner, 10 Oct; a page of their own before, whose address
 * still lands here). The two fields that page had beside the name, which
 * has its own row, saved through the same action.
 *
 * A refusal keeps the sheet open with what was typed: under the logo when
 * the API names it, else in a toast.
 */
export function LocationDetailsSheet({
    storeId,
    name,
    details,
    open,
    onClose,
    onSaved,
}: {
    storeId: string;
    /** The older route saves the name with them; it is sent back as it is. */
    name: string;
    details: LocationDetails;
    open: boolean;
    onClose: () => void;
    /** What the row says from now on. */
    onSaved: (details: LocationDetails) => void;
}) {
    const form = useForm<FormValues>({
        resolver: zodResolver(formSchema),
        defaultValues: {
            description: details.description ?? "",
            logo: details.logo ?? "",
        },
    });
    const { isSubmitting } = form.formState;

    async function onSubmit(values: FormValues) {
        const next: LocationDetails = {
            description: trimmedOr(values.description, null),
            logo: trimmedOr(values.logo, null),
        };
        if (
            next.description === trimmedOr(details.description, null) &&
            next.logo === trimmedOr(details.logo, null)
        ) {
            onClose();
            return;
        }
        const res = await updateStore(storeId, { name, ...next });
        if (!res.ok) {
            if (res.field === "logo") {
                form.setError("logo", { message: res.error });
            } else {
                showError(res.error);
            }
            return;
        }
        showSuccess("Details saved");
        onSaved(next);
        onClose();
    }

    return (
        <Form {...form}>
            <PlaceSheetFrame
                sheet="details"
                title="Description and logo"
                description="What this location says about itself."
                open={open}
                pending={isSubmitting}
                onClose={onClose}
                onSubmit={(e) => void form.handleSubmit(onSubmit)(e)}
            >
                <div className="grid gap-4">
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
                                <FormLabel>Logo address</FormLabel>
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
                </div>
            </PlaceSheetFrame>
        </Form>
    );
}
