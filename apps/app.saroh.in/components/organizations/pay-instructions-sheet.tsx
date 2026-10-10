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
import { cn } from "@saroh/ui/lib/utils";
import { Textarea } from "@saroh/ui/textarea";
import { showError } from "@saroh/ui/toast";
import { useForm, useWatch } from "react-hook-form";

import { PayPreview } from "@/components/organizations/pay-preview";
import { SettingsSheetFrame } from "@/components/shared/settings-sheet-frame";
import { BUSINESS_ROW_ID } from "@/lib/organizations/business-rows";
import { sheetWords } from "@/lib/organizations/business-sheet-words";
import type {
    PayField,
    PayInstructionsSettings,
    PayValues,
} from "@/lib/organizations/pay-instructions";
import {
    IFSC_EXAMPLE,
    MAX_PAY_NOTE,
    PAY_FIELDS,
    payInputOf,
    payInstructionsSchema,
    payPreviewOf,
    payValuesOf,
    UPI_EXAMPLE,
} from "@/lib/organizations/pay-instructions";
import { saveOrganizationSettings } from "@/lib/organizations/settings-actions";
import type { OrganizationSettings } from "@/lib/organizations/settings-service";

/** The fields, in the order the customer's card reads them. */
const FIELDS: {
    name: PayField;
    label: string;
    hint?: string;
    placeholder?: string;
    width: string;
    inputMode?: "text" | "numeric" | "email";
    autoCapitalize?: "none" | "characters" | "words";
    mono?: boolean;
}[] = [
    {
        name: "upiId",
        label: "UPI ID",
        hint: "Customers scan it as a QR code, or copy it into their UPI app.",
        placeholder: UPI_EXAMPLE,
        width: "basis-full",
        inputMode: "email",
        autoCapitalize: "none",
    },
    {
        name: "bankAccountName",
        label: "Name on the account",
        width: "basis-full",
        autoCapitalize: "words",
    },
    {
        name: "bankAccountNumber",
        label: "Account number",
        width: "min-w-0 flex-[1_1_200px]",
        inputMode: "numeric",
        mono: true,
    },
    {
        name: "bankIfsc",
        label: "IFSC",
        placeholder: IFSC_EXAMPLE,
        width: "min-w-0 flex-[1_1_140px]",
        autoCapitalize: "characters",
        mono: true,
    },
    {
        name: "bankName",
        label: "Bank",
        hint: "Optional.",
        width: "basis-full",
        autoCapitalize: "words",
    },
];

const WORDS = sheetWords("pay", { kind: undefined, registered: false });

/**
 * How to pay us (R32), edited in a side sheet: the UPI ID, the bank
 * details and the note together, since a customer reads them as one card
 * and the bank details are checked as one. What the customer will see is
 * under the fields, live as they are typed.
 *
 * Save sends only what changed, through the settings PATCH. A refusal the
 * API puts on a field shows there; any other is a toast, and the sheet
 * stays open either way.
 */
export function PayInstructionsSheet({
    saved,
    businessName,
    open,
    returnTo,
    onClose,
    onSaved,
}: {
    /** The settings read's `payInstructions`; absent from an older API. */
    saved: PayInstructionsSettings | undefined;
    businessName: string;
    open: boolean;
    returnTo: string;
    onClose: () => void;
    /** The settings as the save answered. */
    onSaved: (next: OrganizationSettings) => void;
}) {
    const values = payValuesOf(saved);
    const form = useForm<PayValues>({
        resolver: zodResolver(payInstructionsSchema),
        defaultValues: values,
    });
    const { isDirty, isSubmitting } = form.formState;
    const live = useWatch({ control: form.control }) as PayValues;

    async function onSubmit(next: PayValues) {
        const input = payInputOf(next, saved);
        if (Object.keys(input).length === 0) {
            onClose();
            return;
        }
        const res = await saveOrganizationSettings({ payInstructions: input });
        if (!res.ok) {
            if (
                res.field &&
                (PAY_FIELDS as readonly string[]).includes(res.field)
            ) {
                form.setError(res.field as PayField, { message: res.error });
            } else {
                showError(res.error);
            }
            return;
        }
        onSaved(res.data);
        onClose();
    }

    return (
        <Form {...form}>
            <SettingsSheetFrame
                id={`${BUSINESS_ROW_ID.pay}-panel`}
                returnFocusTo={returnTo}
                title={WORDS.title}
                description={WORDS.description}
                open={open}
                pending={isSubmitting}
                onClose={onClose}
                onSubmit={(e) => void form.handleSubmit(onSubmit)(e)}
            >
                <div
                    className={cn(
                        "flex flex-wrap gap-4",
                        "[&_label]:text-[12.5px] [&_label]:font-medium",
                        "[&_[data-slot=form-description]]:text-[11.5px] [&_[data-slot=form-description]]:leading-[1.5]",
                    )}
                >
                    {FIELDS.map((f) => (
                        <FormField
                            key={f.name}
                            control={form.control}
                            name={f.name}
                            render={({ field }) => (
                                <FormItem className={f.width}>
                                    <FormLabel>{f.label}</FormLabel>
                                    <FormControl>
                                        <Input
                                            {...field}
                                            autoComplete="off"
                                            spellCheck={false}
                                            inputMode={f.inputMode}
                                            autoCapitalize={f.autoCapitalize}
                                            placeholder={f.placeholder}
                                            className={cn(
                                                f.mono && "font-mono",
                                            )}
                                        />
                                    </FormControl>
                                    {f.hint ? (
                                        <FormDescription>
                                            {f.hint}
                                        </FormDescription>
                                    ) : null}
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                    ))}
                    <FormField
                        control={form.control}
                        name="note"
                        render={({ field }) => (
                            <FormItem className="basis-full">
                                <FormLabel>Note</FormLabel>
                                <FormControl>
                                    <Textarea
                                        {...field}
                                        rows={2}
                                        maxLength={MAX_PAY_NOTE}
                                        placeholder="Send a screenshot to us on WhatsApp once you've paid."
                                    />
                                </FormControl>
                                <FormDescription>
                                    A line under the details, up to{" "}
                                    {MAX_PAY_NOTE} characters.
                                </FormDescription>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                </div>
                <PayPreview
                    inSheet
                    live={isDirty}
                    businessName={businessName}
                    preview={payPreviewOf(live)}
                />
            </SettingsSheetFrame>
        </Form>
    );
}
