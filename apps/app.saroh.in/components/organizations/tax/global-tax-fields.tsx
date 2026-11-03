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

/** A Global business's tax line and numbering year (DEC-204). */
export function GlobalTaxFields({
    control,
    taxId,
}: {
    control: Control<FormValues>;
    taxId: ReactNode;
}) {
    return (
        <>
            <FormField
                control={control}
                name="taxName"
                render={({ field }) => (
                    <FormItem>
                        <FormLabel>What it&apos;s called</FormLabel>
                        <FormControl>
                            <Input placeholder="VAT" {...field} />
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
                                placeholder="20"
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
