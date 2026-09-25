"use client";

import {
    FormControl,
    FormDescription,
    FormField,
    FormItem,
    FormLabel,
    FormMessage,
} from "@saroh/ui/form";
import { Input } from "@saroh/ui/input";
import { useFormContext } from "react-hook-form";
import { z } from "zod";

import { OptionSelect } from "@/components/shared/option-select";
import type { GstRateValue } from "@/lib/invoices/gst";
import { GST_RATE_OPTIONS, isHsnSac, rateOption } from "@/lib/invoices/gst";

/** The two GST fields both service forms add to their schema (ADR-008). */
export const gstFields = {
    gstRate: z.string(),
    sacCode: z
        .string()
        .trim()
        .refine((v) => v === "" || isHsnSac(v), "A SAC code is 4 to 8 digits."),
};

export interface GstValues {
    gstRate: string;
    sacCode: string;
}

/** A saved service's GST as the form's values. */
export function gstDefaults(service?: {
    gstRate?: string | null;
    sacCode?: string | null;
}): GstValues {
    return {
        gstRate: rateOption(service?.gstRate),
        sacCode: service?.sacCode ?? "",
    };
}

/** What the API is sent: null clears either. */
export function gstPayload(values: GstValues): {
    gstRate: string | null;
    sacCode: string | null;
} {
    const sac = values.sacCode.replace(/\s+/g, "");
    return { gstRate: values.gstRate || null, sacCode: sac || null };
}

/**
 * GST on a service: the rate its price includes and its SAC code, printed on
 * a GST-registered business's tax invoice. A business that is not
 * registered can leave both empty.
 */
export function ServiceGstFields({
    disabled,
    index,
}: {
    disabled?: boolean;
    /** The block's position in the form's arrival stagger. */
    index: number;
}) {
    const form = useFormContext<GstValues>();
    return (
        <div
            className="wk-item grid gap-4 sm:grid-cols-2"
            style={{ "--wk-i": index } as React.CSSProperties}
        >
            <FormField
                control={form.control}
                name="gstRate"
                render={({ field }) => (
                    <FormItem>
                        <FormLabel>GST rate</FormLabel>
                        <FormControl>
                            <OptionSelect
                                value={field.value as GstRateValue}
                                onValueChange={field.onChange}
                                options={GST_RATE_OPTIONS}
                                disabled={disabled}
                            />
                        </FormControl>
                        <FormDescription>
                            Included in the price, on a GST invoice.
                        </FormDescription>
                        <FormMessage />
                    </FormItem>
                )}
            />
            <FormField
                control={form.control}
                name="sacCode"
                render={({ field }) => (
                    <FormItem>
                        <FormLabel>SAC code</FormLabel>
                        <FormControl>
                            <Input
                                inputMode="numeric"
                                maxLength={10}
                                placeholder="999723"
                                className="font-mono"
                                disabled={disabled}
                                {...field}
                            />
                        </FormControl>
                        <FormDescription>
                            The service code printed on tax invoices.
                        </FormDescription>
                        <FormMessage />
                    </FormItem>
                )}
            />
        </div>
    );
}
