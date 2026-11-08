"use client";

import { phoneExample, splitPhone } from "@saroh/block-contract";
import type { PhoneInputProps } from "@saroh/ui/phone-input";
import { PhoneInput } from "@saroh/ui/phone-input";
import { forwardRef } from "react";

import { useBusinessCountry } from "./business-country";

/**
 * The workspace's phone field (#1036): `PhoneInput`, starting on the active
 * business's calling code, its placeholder that country's own example
 * ("98450 12345" in India, "202 555 0123" in the US; none where the country
 * has no example). The value is E.164 ("+919876543210") or "".
 */
export const BusinessPhoneInput = forwardRef<
    HTMLInputElement,
    Omit<PhoneInputProps, "defaultCountry">
>(function BusinessPhoneInput(props, ref) {
    const country = useBusinessCountry();
    return (
        <PhoneInput
            ref={ref}
            defaultCountry={country}
            placeholder={examplePlaceholder(country)}
            {...props}
        />
    );
});

/** The country's example without its code, or none it hasn't one. */
export function examplePlaceholder(country: string | null): string | undefined {
    const home = (country ?? "IN").toUpperCase();
    const parts = splitPhone(phoneExample(home), home);
    return parts.country === home ? parts.national : undefined;
}
