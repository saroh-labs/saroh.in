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
import { cn } from "@saroh/ui/lib/utils";
import type { Control, FieldPath, FieldValues } from "react-hook-form";

import { CountrySelect } from "@/components/shared/country-select";
import { OptionSelect } from "@/components/shared/option-select";
import { GST_STATES } from "@/lib/invoices/gst";
import type { RegisteredAddressValues } from "@/lib/organizations/registered-address";

/** What a form holding the registered address carries. */
export type RegisteredAddressFormValues = RegisteredAddressValues & {
    gstState: string;
    country?: string;
};

/** One field's wrapper, at the width the design gives it. */
export type FieldWidth = (
    basis: string,
    grow?: boolean,
) => { className: string; style: React.CSSProperties };

export const fieldWidth: FieldWidth = (basis, grow = true) => ({
    className: cn(
        "min-w-0",
        grow ? "flex-[1_1_var(--b)]" : "flex-[0_1_var(--b)]",
    ),
    style: { "--b": basis } as React.CSSProperties,
});

const LINES = [
    ["addressLine1", "Address line 1", "100%", true, "address-line1"],
    [
        "addressLine2",
        "Address line 2 (optional)",
        "100%",
        true,
        "address-line2",
    ],
    ["city", "City", "240px", true, "address-level2"],
    ["postalCode", "PIN code", "140px", false, "postal-code"],
] as const;

/**
 * The registered address's fields (CGST rule 46): its lines, the state —
 * an Indian one, which a registered business takes from its GSTIN — and,
 * where the form offers it, the country. Settings › Business › Address and
 * the "Add your business details" step (DEC-068) both draw it, so the two
 * never ask differently. Laid out in a flex-wrap row by the caller.
 */
export function RegisteredAddressFields<T extends FieldValues>({
    control,
    registered,
    gstinState,
    inIndia,
    withCountry = false,
    at = fieldWidth,
}: {
    control: Control<T>;
    registered: boolean;
    /** The GSTIN's state code, shown in place of the choice once registered. */
    gstinState: string;
    /** India's states are the only ones there are to choose. */
    inIndia: boolean;
    withCountry?: boolean;
    at?: FieldWidth;
}) {
    const name = (key: keyof RegisteredAddressFormValues) =>
        key as unknown as FieldPath<T>;
    return (
        <>
            {LINES.map(([key, label, basis, grow, auto]) => (
                <FormField
                    key={key}
                    control={control}
                    name={name(key)}
                    render={({ field }) => (
                        <FormItem {...at(basis, grow)}>
                            <FormLabel>{label}</FormLabel>
                            <FormControl>
                                <Input
                                    {...field}
                                    value={field.value ?? ""}
                                    maxLength={key === "postalCode" ? 12 : 120}
                                    inputMode={
                                        key === "postalCode"
                                            ? "numeric"
                                            : undefined
                                    }
                                    autoComplete={auto}
                                    className={cn(
                                        key === "postalCode" && "font-mono",
                                    )}
                                />
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                    )}
                />
            ))}
            {inIndia ? (
                <FormField
                    control={control}
                    name={name("gstState")}
                    render={({ field }) => (
                        <FormItem {...at("240px")}>
                            <FormLabel>State</FormLabel>
                            <FormControl>
                                <OptionSelect
                                    // A registered business's state is its
                                    // GSTIN's: the API takes no other.
                                    value={
                                        registered
                                            ? gstinState
                                            : (field.value ?? "")
                                    }
                                    onValueChange={field.onChange}
                                    options={[
                                        { value: "", label: "Choose a state" },
                                        ...GST_STATES,
                                    ]}
                                    disabled={registered}
                                    className="w-full"
                                />
                            </FormControl>
                            <FormDescription>
                                {registered
                                    ? "Set by your GSTIN."
                                    : "Printed with the address."}
                            </FormDescription>
                            <FormMessage />
                        </FormItem>
                    )}
                />
            ) : null}
            {withCountry ? (
                <FormField
                    control={control}
                    name={name("country")}
                    render={({ field }) => (
                        <FormItem {...at("220px")}>
                            <FormLabel>Country</FormLabel>
                            <FormControl>
                                <CountrySelect
                                    value={
                                        registered ? "IN" : (field.value ?? "")
                                    }
                                    onValueChange={field.onChange}
                                    disabled={registered}
                                />
                            </FormControl>
                            <FormDescription>
                                {registered
                                    ? "GST registration is Indian."
                                    : "Where the business is registered."}
                            </FormDescription>
                            <FormMessage />
                        </FormItem>
                    )}
                />
            ) : null}
        </>
    );
}
