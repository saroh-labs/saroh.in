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
import { Textarea } from "@saroh/ui/textarea";
import { showError, showSuccess } from "@saroh/ui/toast";
import { useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { z } from "zod";

import { LogoUpload } from "@/components/shared/logo-upload";
import { trimmedOr } from "@/lib/forms/values";
import { updateStore } from "@/lib/stores/actions";
import type {
    LocationDetails,
    LocationLogo,
    LogoSource,
} from "@/lib/stores/location-details";
import {
    DESCRIPTION_MAX,
    LOGO_STATE,
    logoSource,
} from "@/lib/stores/location-details";

import { PlaceSheetFrame } from "./place-sheets";

const formSchema = z.object({
    description: z
        .string()
        .max(
            DESCRIPTION_MAX,
            `Keep it to ${DESCRIPTION_MAX} characters or fewer`,
        )
        .optional(),
});

type FormValues = z.infer<typeof formSchema>;

const UPLOAD_RULE = "Square, under 1 MB. PNG, JPG or WebP.";

/** What sits under the logo's buttons, by the logo in the draft. */
const LOGO_HINT: Record<LogoSource, string> = {
    own: UPLOAD_RULE,
    business: `Upload one to give this location its own. ${UPLOAD_RULE}`,
    none: `${UPLOAD_RULE} A logo added in Settings › Business shows here too.`,
};

/**
 * A location's description and logo, edited in a sheet from their row in
 * The place (owner, 10 Oct; a page of their own before, whose address
 * still lands here), saved through the same action as the name, which has
 * its own row.
 *
 * The logo is the business's until the location has its own (DEC-120): the
 * sheet says which, and an own logo is uploaded, replaced and given up
 * right here (`LogoUpload`), never on another page. Nothing changes until
 * Save, which waits for an upload; a picture uploaded and then cancelled
 * stays in the library, unused.
 *
 * A refusal keeps the sheet open with what was typed and picked: under
 * the logo when the API names it, else in a toast.
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
        defaultValues: { description: details.description ?? "" },
    });
    const { isSubmitting } = form.formState;
    // The location's own logo in the draft; `null` is the business's.
    const [logo, setLogo] = useState<LocationLogo | null>(details.logo);
    const [uploading, setUploading] = useState(false);
    const [refusal, setRefusal] = useState<string | null>(null);
    const source = logoSource({ logo, businessLogo: details.businessLogo });
    const typed =
        useWatch({ control: form.control, name: "description" })?.length ?? 0;

    async function onSubmit(values: FormValues) {
        const description = trimmedOr(values.description, null);
        const logoChanged = (logo?.url ?? null) !== (details.logo?.url ?? null);
        if (
            description === trimmedOr(details.description, null) &&
            !logoChanged
        ) {
            onClose();
            return;
        }
        setRefusal(null);
        const res = await updateStore(storeId, {
            name,
            description,
            // Only a changed logo is sent: an upload's image, or `null`
            // for the business logo.
            ...(logoChanged ? { logoMediaId: logo?.mediaId ?? null } : {}),
        });
        if (!res.ok) {
            if (res.field === "logo") {
                setRefusal(res.error);
            } else {
                showError(res.error);
            }
            return;
        }
        showSuccess("Details saved");
        onSaved({ ...details, description, logo });
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
                saveOff={uploading}
                onClose={onClose}
                onSubmit={(e) => void form.handleSubmit(onSubmit)(e)}
            >
                <div className="grid gap-5">
                    <FormField
                        control={form.control}
                        name="description"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>Description</FormLabel>
                                <FormControl>
                                    <Textarea
                                        rows={4}
                                        maxLength={DESCRIPTION_MAX}
                                        disabled={isSubmitting}
                                        {...field}
                                    />
                                </FormControl>
                                <p className="text-right text-[12px] tabular-nums text-muted-foreground">
                                    {typed} of {DESCRIPTION_MAX}
                                </p>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                    <div
                        role="group"
                        aria-labelledby="location-logo-label"
                        className="grid gap-2"
                    >
                        <div className="grid gap-0.5">
                            <p
                                id="location-logo-label"
                                className="text-sm font-medium leading-none"
                            >
                                Logo
                            </p>
                            <p
                                data-testid="location-logo-state"
                                aria-live="polite"
                                className="text-[13px] text-muted-foreground"
                            >
                                {LOGO_STATE[source]}
                            </p>
                        </div>
                        <LogoUpload
                            value={logo}
                            onChange={(next) => {
                                setRefusal(null);
                                setLogo(next);
                            }}
                            name={name}
                            disabled={isSubmitting}
                            onBusy={setUploading}
                            hint={LOGO_HINT[source]}
                            standIn={
                                details.businessLogo
                                    ? {
                                          url: details.businessLogo,
                                          alt: "Your business logo",
                                      }
                                    : null
                            }
                            removeLabel={
                                details.businessLogo
                                    ? "Use your business logo"
                                    : "Remove"
                            }
                        />
                        {refusal ? (
                            <p
                                role="alert"
                                className="text-pretty text-[12.5px] font-medium leading-[1.5] text-destructive-subtle-foreground"
                            >
                                {refusal}
                            </p>
                        ) : null}
                    </div>
                </div>
            </PlaceSheetFrame>
        </Form>
    );
}
