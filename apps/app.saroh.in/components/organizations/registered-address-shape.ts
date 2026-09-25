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
