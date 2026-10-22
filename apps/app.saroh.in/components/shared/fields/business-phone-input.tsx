"use client";

import type { PhoneInputProps } from "@saroh/ui/phone-input";
import { PhoneInput } from "@saroh/ui/phone-input";
import { forwardRef } from "react";

import { useBusinessCountry } from "./business-country";

/**
 * The workspace's phone field (#1036): `PhoneInput`, starting on the active
 * business's calling code. The value is E.164 ("+919876543210") or "".
 */
export const BusinessPhoneInput = forwardRef<
    HTMLInputElement,
    Omit<PhoneInputProps, "defaultCountry">
>(function BusinessPhoneInput(props, ref) {
    return (
        <PhoneInput
            ref={ref}
            defaultCountry={useBusinessCountry()}
            {...props}
        />
    );
});
