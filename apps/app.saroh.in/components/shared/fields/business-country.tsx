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

/**
 * Whether a delivery follows India's rule (a GST state and a PIN code), by the
 * active business's country, which set its edition (DEC-204). The demo seeds
 * store "India" in full. The API decides; this only words the form.
 */
export function useIndiaAddress(): boolean {
    const country = useBusinessCountry();
    return !country || !/^[A-Za-z]{2}$/.test(country) || /^in$/i.test(country);
}

/** What a Global business chose at setup, given by the shell; else null. */
const BusinessCurrencyContext = createContext<string | null>(null);

export const BusinessCurrencyProvider = BusinessCurrencyContext.Provider;

/**
 * The currency for money that records none of its own: a new price, a zero
 * total, an icon. What a Global business chose, else India's rupee.
 */
export function useStartingCurrency(): string {
    return useContext(BusinessCurrencyContext) ?? "INR";
}

/** The active business's ISO country code, or null. */
export function useBusinessCountry(): string | null {
    return useContext(BusinessCountryContext);
}
