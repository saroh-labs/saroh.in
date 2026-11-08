"use client";

import { taxExampleFor } from "@saroh/edition";
import {
    FormControl,
    FormDescription,
    FormField,
    FormItem,
    FormLabel,
    FormMessage,
} from "@saroh/ui/form";
import { Input } from "@saroh/ui/input";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@saroh/ui/select";
import type { ReactNode } from "react";
import type { Control } from "react-hook-form";

import type { FormValues } from "@/components/organizations/business-settings/business-form";

/**
 * A Global business's tax line and numbering year (DEC-204). The empty
 * fields show its country's tax ("Sales tax" in the US, "VAT" and 20 in the
 * UK); the business still names its own.
 */
export function GlobalTaxFields({
    control,
    taxId,
    country,
}: {
    control: Control<FormValues>;
    taxId: ReactNode;
    /** The business's ISO country. */
    country: string | null | undefined;
}) {
    const example = taxExampleFor(country);
    return (
        <>
            <FormField
                control={control}
                name="taxName"
                render={({ field }) => (
                    <FormItem>
                        <FormLabel>What it&apos;s called</FormLabel>
                        <FormControl>
                            <Input placeholder={example.name} {...field} />
                        </FormControl>
                        <FormDescription>
                            Printed on your invoices. Leave it empty if you
                            don&apos;t charge tax.
                        </FormDescription>
                        <FormMessage />
                    </FormItem>
                )}
            />
            <FormField
                control={control}
                name="taxRate"
                render={({ field }) => (
                    <FormItem>
                        <FormLabel>Rate, in percent</FormLabel>
                        <FormControl>
                            <Input
                                inputMode="decimal"
                                placeholder={
                                    example.rate === null
                                        ? undefined
                                        : String(example.rate)
                                }
                                {...field}
                            />
                        </FormControl>
                        <FormDescription>
                            Added to each new invoice. You decide what to
                            charge. Saroh doesn&apos;t work it out for you.
                        </FormDescription>
                        <FormMessage />
                    </FormItem>
                )}
            />
            {taxId}
            <FormField
                control={control}
                name="yearStartMonth"
                render={({ field }) => (
                    <FormItem>
                        <FormLabel>Your numbering year</FormLabel>
                        <Select
                            value={field.value}
                            onValueChange={field.onChange}
                        >
                            <FormControl>
                                <SelectTrigger className="w-full">
                                    <SelectValue />
                                </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                                <SelectItem value="1">
                                    January to December
                                </SelectItem>
                                <SelectItem value="4">
                                    April to March
                                </SelectItem>
                            </SelectContent>
                        </Select>
                        <FormDescription>
                            When invoice numbers that restart each year start
                            again.
                        </FormDescription>
                        <FormMessage />
                    </FormItem>
                )}
            />
        </>
    );
}
