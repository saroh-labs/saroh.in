"use client";

import { currencyForCountry, GLOBAL_CURRENCIES } from "@saroh/edition";
import {
    FormControl,
    FormDescription,
    FormField,
    FormItem,
    FormLabel,
    FormMessage,
} from "@saroh/ui/form";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@saroh/ui/select";
import { useFormContext } from "react-hook-form";

import { CountrySelect } from "@/components/organizations/business-details/country-select";
import type { SetupValues } from "@/lib/organizations/setup-steps";

/**
 * Where a Global business is, and the one currency it sells in (DEC-204).
 * Choosing the country suggests its currency, until one is picked by hand.
 */
export function SetupCountryFields() {
    const form = useFormContext<SetupValues>();
    return (
        <>
            <FormField
                control={form.control}
                name="country"
                render={({ field }) => (
                    <FormItem>
                        <FormLabel>Where is your business?</FormLabel>
                        <FormControl>
                            <CountrySelect
                                value={field.value}
                                onValueChange={(code) => {
                                    field.onChange(code);
                                    // India is refused here, so has none to suggest.
                                    if (
                                        code !== "IN" &&
                                        !form.getFieldState("currency").isDirty
                                    ) {
                                        form.setValue(
                                            "currency",
                                            currencyForCountry(code),
                                        );
                                    }
                                }}
                            />
                        </FormControl>
                        <FormDescription>
                            You can&apos;t change this later without asking us.
                        </FormDescription>
                        <FormMessage />
                    </FormItem>
                )}
            />
            <FormField
                control={form.control}
                name="currency"
                render={({ field }) => (
                    <FormItem>
                        <FormLabel>Currency</FormLabel>
                        <Select
                            value={field.value ?? ""}
                            onValueChange={(code) =>
                                form.setValue("currency", code, {
                                    shouldDirty: true,
                                })
                            }
                        >
                            <FormControl>
                                <SelectTrigger className="w-full max-w-[380px]">
                                    {/* The value by hand: one set while the
                                        list is shut wouldn't otherwise show. */}
                                    <SelectValue placeholder="Choose a currency">
                                        {field.value === ""
                                            ? undefined
                                            : field.value}
                                    </SelectValue>
                                </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                                {GLOBAL_CURRENCIES.map((code) => (
                                    <SelectItem key={code} value={code}>
                                        {code}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        <FormDescription>
                            One currency for everything your business sells.
                        </FormDescription>
                        <FormMessage />
                    </FormItem>
                )}
            />
        </>
    );
}
