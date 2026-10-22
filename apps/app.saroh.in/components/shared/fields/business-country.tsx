"use client";

import { createContext, useContext } from "react";

/**
 * The active business's country (#1036), an ISO code ("IN"), given once by
 * the app shell so every phone field starts on its calling code
 * (`PhoneInput`'s `defaultCountry`). Outside the shell, or for a business
 * that never said, it is null and the field starts on India's.
 */
const BusinessCountryContext = createContext<string | null>(null);

export function BusinessCountryProvider({
    country,
    children,
}: {
    country: string | null | undefined;
    children: React.ReactNode;
}) {
    return (
        <BusinessCountryContext.Provider value={country ?? null}>
            {children}
        </BusinessCountryContext.Provider>
    );
}

/** The active business's ISO country code, or null. */
export function useBusinessCountry(): string | null {
    return useContext(BusinessCountryContext);
}
