import { checkPostcode, checkRegion } from "@saroh/edition";

import { PROFILE } from "@/lib/edition";

import type { RegisteredAddress } from "./settings-service";

/**
 * Whether India's address rules apply: an address outside India has no
 * Indian state to choose. A blank country reads as the edition's: India's in
 * India, never India on Global.
 */
export function inIndia(country: string | null | undefined): boolean {
    const c = (country ?? "").trim().toUpperCase();
    if (c === "") return PROFILE.address === "indian-state-and-pin";
    return c === "IN" || c === "INDIA";
}

/** An Indian PIN code: six digits, never starting with 0. */
export const PIN_SHAPE = /^[1-9][0-9]{5}$/;

/**
 * The registered address as one printed line — "3 Hill Road, Indiranagar,
 * Bengaluru 560038, Karnataka" — the same shape the API freezes onto an
 * invoice at issue. Null without a first line.
 */
export function printedAddress(
    a: RegisteredAddress | null | undefined,
): string | null {
    if (!a?.line1?.trim()) return null;
    return [
        a.line1,
        a.line2,
        [a.city, a.postalCode].filter((x) => x?.trim()).join(" "),
        a.stateName,
    ]
        .map((x) => x?.trim() ?? "")
        .filter((x) => x !== "")
        .join(", ");
}

/** The address lines as the settings form holds them. */
export interface RegisteredAddressValues {
    addressLine1: string;
    addressLine2: string;
    city: string;
    postalCode: string;
    /** Global's state, province or region (DEC-204); unused in India. */
    region: string;
}

/**
 * Whether the address is read by its country's rules (KTD-A): the edition
 * writes addresses as a country and region, and this one isn't India's.
 */
export function byCountry(
    country: string | null | undefined,
    gstRegistered = false,
): boolean {
    return (
        PROFILE.address === "country-and-region" &&
        !gstRegistered &&
        !inIndia(country)
    );
}

/**
 * A Global address's postcode and region against its country, as the API
 * checks them: each in its shape, and there where the country needs one.
 * `required` false asks neither (an address left blank); unset, the
 * country's rule.
 */
export function countryAddressProblems(
    country: string | null | undefined,
    v: { postalCode: string; region?: string },
    required?: boolean,
): { path: "postalCode" | "region"; message: string }[] {
    const problems: { path: "postalCode" | "region"; message: string }[] = [];
    const postcode = checkPostcode(country, v.postalCode, required);
    if ("problem" in postcode) {
        problems.push({ path: "postalCode", message: postcode.problem });
    }
    const region = checkRegion(country, v.region, required);
    if ("problem" in region) {
        problems.push({ path: "region", message: region.problem });
    }
    return problems;
}

/**
 * What the API will refuse, said on the field first: a GST-registered
 * business needs a first line, a city and a PIN; an Indian PIN is six
 * digits ("560 038" is read as 560038).
 */
export function addressProblems(v: {
    gstRegistered: boolean;
    country?: string;
    addressLine1: string;
    city: string;
    postalCode: string;
    region?: string;
}): { path: keyof RegisteredAddressValues; message: string }[] {
    const problems: {
        path: keyof RegisteredAddressValues;
        message: string;
    }[] = [];
    // Global: by the country's rules, once any of the address is typed.
    if (byCountry(v.country, v.gstRegistered)) {
        const typed = [
            v.addressLine1,
            v.city,
            v.postalCode,
            v.region ?? "",
        ].some((x) => x.trim() !== "");
        return countryAddressProblems(v.country, v, typed ? undefined : false);
    }
    const india = v.gstRegistered || (v.country ?? "").toUpperCase() === "IN";
    const pin = v.postalCode.replace(/\s+/g, "");
    if (pin && india && !PIN_SHAPE.test(pin)) {
        problems.push({
            path: "postalCode",
            message: "A PIN code is six digits, like 560038.",
        });
    }
    if (v.gstRegistered) {
        const needed = [
            ["addressLine1", "The first line of the registered address."],
            ["city", "The city it is in."],
            ["postalCode", "Its PIN code."],
        ] as const;
        for (const [path, message] of needed) {
            if (!v[path].trim()) {
                problems.push({
                    path,
                    message: `${message} A tax invoice prints it.`,
                });
            }
        }
    }
    return problems;
}

/**
 * An Indian address saved without its state (UX-018): every invoice and the
 * readiness rule (DEC-068) need it, and so does connecting payments, so the
 * address card asks before it saves rather than letting the checklist ask
 * again. Only for an address being filled in (any line typed) and only in
 * India (IN, or unsaid in India's edition); a GST-registered business's state is its
 * GSTIN's, set for it. Null when nothing is missing.
 */
export function stateProblem(v: {
    gstRegistered: boolean;
    country?: string;
    gstState: string;
    addressLine1: string;
    city: string;
    postalCode: string;
}): string | null {
    if (v.gstRegistered) return null;
    if (!inIndia(v.country)) return null;
    const typed = [v.addressLine1, v.city, v.postalCode].some(
        (x) => x.trim() !== "",
    );
    if (!typed || v.gstState.trim() !== "") return null;
    return "Choose your state. It's printed on your invoices, and GST depends on it.";
}
