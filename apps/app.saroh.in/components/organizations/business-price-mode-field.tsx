"use client";

import {
    FormDescription,
    FormField,
    FormItem,
    FormLabel,
    FormMessage,
} from "@saroh/ui/form";
import type { Control } from "react-hook-form";

import type { FormValues } from "@/components/organizations/business-form";
import { RadioCards } from "@/components/shared/choice-group";
import {
    PRICE_MODE_CHOICES,
    PRICE_MODE_SMALL_PRINT,
} from "@/lib/gst/price-mode";

const OPTIONS = PRICE_MODE_CHOICES.map((choice) => ({
    value: choice.value,
    label: choice.label,
    note: choice.hint,
}));

/**
 * "GST on your prices" (12 Oct 2026): whether the prices a GST-registered
 * business types include GST or have GST added to them. Two choices, each
 * with a worked example, and under them what the choice covers and what it
 * leaves alone. Only a registered business's Tax and invoices tab has the
 * row that opens this (`business-tax-rows.tsx`); the API refuses the save
 * for any other.
 */
export function BusinessPriceModeField({
    control,
    at,
}: {
    control: Control<FormValues>;
    at: (
        basis: string,
        grow?: boolean,
    ) => { className: string; style: React.CSSProperties };
}) {
    return (
        <FormField
            control={control}
            name="priceMode"
            render={({ field, fieldState }) => (
                <FormItem {...at("100%")}>
                    <FormLabel id="business-price-mode-label">
                        How your prices carry GST
                    </FormLabel>
                    <RadioCards
                        labelledBy="business-price-mode-label"
                        describedBy="business-price-mode-note"
                        options={OPTIONS}
                        value={field.value}
                        onChange={field.onChange}
                        invalid={Boolean(fieldState.error)}
                    />
                    <FormDescription id="business-price-mode-note">
                        {PRICE_MODE_SMALL_PRINT}
                    </FormDescription>
                    <FormMessage />
                </FormItem>
            )}
        />
    );
}
