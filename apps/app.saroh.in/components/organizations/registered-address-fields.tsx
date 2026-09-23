"use client";

import {
    FormControl,
    FormField,
    FormItem,
    FormLabel,
    FormMessage,
} from "@saroh/ui/form";
import { Input } from "@saroh/ui/input";
import { useFormContext, useWatch } from "react-hook-form";
import { z } from "zod";

import type { RegisteredAddressValues } from "@/lib/organizations/registered-address";

/** The address lines as the settings form holds them. */
export const registeredAddressShape: Record<
    keyof RegisteredAddressValues,
    z.ZodString
> = {
    addressLine1: z.string().trim().max(120),
    addressLine2: z.string().trim().max(120),
    city: z.string().trim().max(60),
    postalCode: z.string().trim().max(12),
};

export const ADDRESS_KEYS = [
    "addressLine1",
    "addressLine2",
    "city",
    "postalCode",
] as const;

/** Which key the API's `registeredAddress` names each line by. */
export const ADDRESS_API_KEY = {
    addressLine1: "line1",
    addressLine2: "line2",
    city: "city",
    postalCode: "postalCode",
} as const;

/**
 * The registered address, in the GST card on Workspace → Business. A tax
 * invoice prints it under the legal name (CGST rule 46), frozen at issue.
 * Its state is the card's State field — one field for both.
 */
export function RegisteredAddressFields({ canEdit }: { canEdit: boolean }) {
    const { control } = useFormContext<
        RegisteredAddressValues & { country?: string; gstRegistered: boolean }
    >();
    const [country, registered] = useWatch({
        control,
        name: ["country", "gstRegistered"],
    });
    const india = registered || (country ?? "").toUpperCase() === "IN";
    return (
        <fieldset
            className="grid gap-3"
            aria-describedby="registered-address-note"
        >
            <legend className="mb-1 text-[12.5px] font-medium">
                Registered address
            </legend>
            <FormField
                control={control}
                name="addressLine1"
                render={({ field }) => (
                    <FormItem>
                        <FormLabel>Address line 1</FormLabel>
                        <FormControl>
                            <Input
                                {...field}
                                maxLength={120}
                                readOnly={!canEdit}
                                autoComplete="address-line1"
                            />
                        </FormControl>
                        <FormMessage />
                    </FormItem>
                )}
            />
            <FormField
                control={control}
                name="addressLine2"
                render={({ field }) => (
                    <FormItem>
                        <FormLabel>Address line 2 (optional)</FormLabel>
                        <FormControl>
                            <Input
                                {...field}
                                maxLength={120}
                                readOnly={!canEdit}
                                autoComplete="address-line2"
                            />
                        </FormControl>
                        <FormMessage />
                    </FormItem>
                )}
            />
            <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_9rem]">
                <FormField
                    control={control}
                    name="city"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>City</FormLabel>
                            <FormControl>
                                <Input
                                    {...field}
                                    maxLength={60}
                                    readOnly={!canEdit}
                                    autoComplete="address-level2"
                                />
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                    )}
                />
                <FormField
                    control={control}
                    name="postalCode"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>
                                {india ? "PIN code" : "Postal code"}
                            </FormLabel>
                            <FormControl>
                                <Input
                                    {...field}
                                    inputMode={india ? "numeric" : "text"}
                                    maxLength={12}
                                    readOnly={!canEdit}
                                    autoComplete="postal-code"
                                    className="font-mono"
                                />
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                    )}
                />
            </div>
            <p
                id="registered-address-note"
                className="text-[11.5px] leading-[1.5] text-muted-foreground"
            >
                Printed under your legal name on every invoice and receipt.
                Needed once you are GST-registered. Invoices already issued keep
                the address they went out with.
            </p>
        </fieldset>
    );
}
