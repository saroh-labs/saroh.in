import {
    INDIAN_E164,
    INDIAN_MOBILE_E164,
    phoneNumberProblem,
} from "@saroh/ui/lib/phone";

/**
 * India only, everywhere in accounts (DEC-199, the API's DEC-198 rules),
 * checked in the browser before anything is sent, so a wrong number never
 * spends the person's Turnstile check or a code.
 *
 * - A phone that signs in to Saroh is an Indian MOBILE: +91, then 6-9, then
 *   nine digits.
 * - A billing profile's phone is any Indian number: +91 and ten digits, the
 *   first not 0. It is optional.
 */

export const NO_PHONE = "Enter your mobile number.";
export const NOT_A_MOBILE =
    "Enter an Indian mobile number: 10 digits starting with 6, 7, 8 or 9, like 98450 12345.";
/** The API's own words for a foreign billing phone (DEC-198). */
export const NOT_INDIAN =
    "Use an Indian number: +91 and then 10 digits, like +91 98450 12345.";

/** What is wrong with a phone someone will sign in with, or null. */
export function signInPhoneProblem(phone: string): string | null {
    if (!phone.trim()) return NO_PHONE;
    if (INDIAN_MOBILE_E164.test(phone)) return null;
    return phoneNumberProblem(phone) ?? NOT_A_MOBILE;
}

/** What is wrong with a billing profile's (optional) phone, or null. */
export function billingPhoneProblem(phone: string): string | null {
    if (!phone.trim()) return null;
    if (INDIAN_E164.test(phone)) return null;
    return phoneNumberProblem(phone) ?? NOT_INDIAN;
}
