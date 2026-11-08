"use client";

import {
    currencyForCountry,
    GLOBAL_CURRENCIES,
    zonesOfCountry,
} from "@saroh/edition";
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
import { useFormContext, useWatch } from "react-hook-form";

import { CountrySelect } from "@/components/organizations/business-details/country-select";
import { TimeZoneSelect } from "@/components/organizations/business-details/time-zone-select";
import type { SetupValues } from "@/lib/organizations/setup-steps";
import { browserZoneIn, zoneAsked } from "@/lib/organizations/time-zones";

/**
 * Where a Global business is, and the one currency it sells in (DEC-204).
 * Choosing the country suggests its currency, until one is picked by hand.
 */
export function SetupCountryFields() {
    const form = useFormContext<SetupValues>();
    const country = useWatch({ control: form.control, name: "country" });
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
                                    // A country that keeps several zones is
                                    // asked; the browser's is offered only
                                    // when it is one of them (KTD-C).
                                    form.setValue(
                                        "timezone",
                                        browserZoneIn(code),
                                    );
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
            {zoneAsked(country) ? (
                <FormField
                    control={form.control}
                    name="timezone"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>Time zone</FormLabel>
                            <FormControl>
                                <TimeZoneSelect
                                    value={field.value ?? ""}
                                    onValueChange={field.onChange}
                                    only={zonesOfCountry(country)}
                                />
                            </FormControl>
                            <FormDescription>
                                Invoice numbers, bookings and the calendar use
                                this time. You can change it in Settings.
                            </FormDescription>
                            <FormMessage />
                        </FormItem>
                    )}
                />
            ) : null}
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
