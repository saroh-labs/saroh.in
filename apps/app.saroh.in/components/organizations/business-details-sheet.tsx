"use client";

import { zodResolver } from "@hookform/resolvers/zod";
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
import { Switch } from "@saroh/ui/switch";
import { useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { z } from "zod";

import { GstinGuide } from "@/components/organizations/gstin-guide";
import { RegisteredAddressFields } from "@/components/organizations/registered-address-fields";
import { registeredAddressShape } from "@/components/organizations/registered-address-shape";
import {
    FormSheet,
    FormSheetBody,
    FormSheetFoot,
} from "@/components/shared/form-sheet";
import { Refusal } from "@/components/shared/refusal";
import { GSTIN_EXAMPLE } from "@/lib/invoices/gstin";
import type {
    BusinessDetail,
    BusinessDetailsValues,
    DetailsOnFile,
} from "@/lib/organizations/business-details";
import {
    detailsInput,
    detailsOnFileOf,
    detailsProblems,
    detailsTitle,
    detailsWhy,
} from "@/lib/organizations/business-details";
import {
    readBusinessDetails,
    saveOrganizationSettings,
    saveOrganizationSettingsInPlace,
} from "@/lib/organizations/settings-actions";

const FIELDS = [
    "addressLine1",
    "addressLine2",
    "city",
    "postalCode",
    "gstState",
    "taxId",
] as const;

export type { DetailsOnFile };

/**
 * Read what is on file for the step. It is read before the sheet opens, so
 * the sheet speaks in the business's own words from its first frame ("Add
 * your details" for someone working for themselves) instead of changing
 * them once the read lands.
 */
export async function readDetailsOnFile(): Promise<DetailsOnFile> {
    return detailsOnFileOf(await readBusinessDetails());
}

/**
 * "Add your business details" (DEC-068): the small sheet a merchant meets
 * where an action needs the registered address, or a registered business's
 * GSTIN, before it can go on — Issue, Send, New order with a payment link,
 * connecting a payment provider. The address fields are Settings ›
 * Business's own (`RegisteredAddressFields`); Save writes them to the
 * business profile, and the caller carries on with what the merchant
 * started (`useBusinessDetailsStep`).
 *
 * The rule is the same for every kind (DEC-070, KTD-8); only the words
 * change: "Add your details" and "your address" for Just me and A site for
 * my work.
 */
export function BusinessDetailsSheet({
    onFile,
    missing,
    then,
    continueLabel,
    onDone,
    inPlace = false,
}: {
    /** What is on file; the sheet is open while there is something. */
    onFile: DetailsOnFile | null;
    missing: readonly BusinessDetail[];
    /** What happens once saved, for the line under the title ("issue it"). */
    then: string;
    /** The Save button, naming the action it carries on with. */
    continueLabel: string;
    /** Saved (carry on), or closed without saving. */
    onDone: (saved: boolean) => void;
    /**
     * Saved from a screen that must stay drawn (the invoice editor): the
     * save revalidates nothing (review #15).
     */
    inPlace?: boolean;
}) {
    // A role that can't read the settings can't read the kind either: it
    // reads in a business's words.
    const kind = onFile?.state === "ready" ? onFile.kind : undefined;
    return (
        <FormSheet
            open={onFile !== null}
            title={detailsTitle(kind)}
            description={detailsWhy(missing, then, kind)}
            onClose={() => onDone(false)}
        >
            {onFile ? (
                <DetailsBody
                    onFile={onFile}
                    continueLabel={continueLabel}
                    onDone={onDone}
                    inPlace={inPlace}
                />
            ) : null}
        </FormSheet>
    );
}

/**
 * The form, from what is on file — or why it couldn't be read: a role
 * without the business's settings is told who can add them.
 */
function DetailsBody({
    onFile,
    continueLabel,
    onDone,
    inPlace,
}: {
    onFile: DetailsOnFile;
    continueLabel: string;
    onDone: (saved: boolean) => void;
    inPlace: boolean;
}) {
    if (onFile.state === "ready") {
        return (
            <DetailsForm
                initial={onFile.values}
                inIndia={onFile.inIndia}
                continueLabel={continueLabel}
                onDone={onDone}
                inPlace={inPlace}
            />
        );
    }
    return (
        <>
            <FormSheetBody>
                <p role="alert" className="text-[13px] text-foreground">
                    {onFile.forbidden
                        ? "Only an owner or an admin can add these. Ask one of them to add your business's registered address in Settings › Business."
                        : onFile.message}
                </p>
            </FormSheetBody>
            <FormSheetFoot doneOnly doneLabel="Close" />
        </>
    );
}

function DetailsForm({
    initial,
    inIndia: indian,
    continueLabel,
    onDone,
    inPlace,
}: {
    initial: BusinessDetailsValues;
    inIndia: boolean;
    continueLabel: string;
    onDone: (saved: boolean) => void;
    inPlace: boolean;
}) {
    const [refusal, setRefusal] = useState<string | null>(null);
    const schema = z
        .object({
            ...registeredAddressShape,
            gstState: z.string(),
            gstRegistered: z.boolean(),
            taxId: z.string(),
        })
        .superRefine((v, ctx) => {
            for (const { path, message } of detailsProblems(v, {
                inIndia: indian,
            })) {
                ctx.addIssue({ code: "custom", path: [path], message });
            }
        });
    const form = useForm<BusinessDetailsValues>({
        resolver: zodResolver(schema),
        defaultValues: initial,
    });
    const registered = useWatch({
        control: form.control,
        name: "gstRegistered",
    });
    const taxId = useWatch({ control: form.control, name: "taxId" });
    const saving = form.formState.isSubmitting;

    async function onSubmit(values: BusinessDetailsValues) {
        setRefusal(null);
        const save = inPlace
            ? saveOrganizationSettingsInPlace
            : saveOrganizationSettings;
        const res = await save(detailsInput(values, initial));
        if (!res.ok) {
            const field = FIELDS.find((f) => f === res.field);
            if (field) {
                form.setError(field, { message: res.error });
            } else {
                setRefusal(res.error);
            }
            return;
        }
        onDone(true);
    }

    return (
        <Form {...form}>
            <>
                <FormSheetBody className="flex flex-wrap content-start gap-x-3 gap-y-3.5">
                    <RegisteredAddressFields
                        control={form.control}
                        registered={registered}
                        gstinState={taxId.trim().slice(0, 2).toUpperCase()}
                        inIndia={indian || registered}
                    />
                    <FormField
                        control={form.control}
                        name="gstRegistered"
                        render={({ field }) => (
                            <FormItem className="w-full">
                                <div className="flex items-center gap-3">
                                    <FormControl>
                                        <Switch
                                            checked={field.value}
                                            onCheckedChange={field.onChange}
                                            aria-label="GST-registered"
                                        />
                                    </FormControl>
                                    <FormLabel className="!mt-0">
                                        GST-registered
                                    </FormLabel>
                                </div>
                                <FormDescription>
                                    {field.value
                                        ? "Your invoices become tax invoices with your GSTIN."
                                        : "Your invoices are receipts, with no GST on them."}
                                </FormDescription>
                            </FormItem>
                        )}
                    />
                    {registered ? (
                        <FormField
                            control={form.control}
                            name="taxId"
                            render={({ field }) => (
                                <FormItem className="w-full">
                                    <FormLabel>GSTIN</FormLabel>
                                    <FormControl>
                                        <Input
                                            {...field}
                                            onChange={(e) =>
                                                field.onChange(
                                                    e.target.value.toUpperCase(),
                                                )
                                            }
                                            placeholder={GSTIN_EXAMPLE}
                                            maxLength={20}
                                            autoComplete="off"
                                            spellCheck={false}
                                            className="font-mono tracking-[0.04em]"
                                        />
                                    </FormControl>
                                    <GstinGuide value={field.value} />
                                    <FormDescription>
                                        15 characters. Its first two digits set
                                        your state.
                                    </FormDescription>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                    ) : null}
                </FormSheetBody>
                <FormSheetFoot
                    saveLabel={continueLabel}
                    pending={saving}
                    note={<Refusal>{refusal}</Refusal>}
                    onSubmit={(e) => form.handleSubmit(onSubmit)(e)}
                />
            </>
        </Form>
    );
}
