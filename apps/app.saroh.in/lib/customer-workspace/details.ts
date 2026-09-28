/**
 * Customer Detail's edit sheet (C8): the draft it holds, what it refuses on
 * the field before saving, what it sends, and the lines it writes. Pure, so
 * the rules and the copy are tested.
 *
 * The API is the authority (`contacts/contact-address.ts`,
 * `contact-edit.ts`); these checks say the same thing sooner.
 */
import { GST_STATES } from "@/lib/invoices/gst";
import { PIN_SHAPE } from "@/lib/organizations/registered-address";

import type { CustomerDetail } from "./detail";

export const ADDRESS_KEYS = [
    "addressLine1",
    "addressLine2",
    "city",
    "state",
    "postalCode",
    "country",
] as const;

export type AddressKey = (typeof ADDRESS_KEYS)[number];

export type DetailsKey =
    "firstName" | "lastName" | "email" | "phone" | "company" | AddressKey;

/**
 * What the sheet holds, every field as text. In India `state` is the GST
 * state's code (the select's value); elsewhere it is what was typed.
 */
export type DetailsDraft = Record<DetailsKey, string>;

/** The countries the sheet offers, India first (ISO 3166-1 alpha-2). */
export const COUNTRIES = [
    "IN",
    "AE",
    "AU",
    "BD",
    "CA",
    "DE",
    "FR",
    "GB",
    "LK",
    "MY",
    "NP",
    "NZ",
    "QA",
    "SA",
    "SG",
    "US",
] as const;

const names = new Intl.DisplayNames(["en-IN"], { type: "region" });

/** "IN" → "India"; an unknown code as it is. */
export function countryName(code: string): string {
    try {
        return names.of(code) ?? code;
    } catch {
        return code;
    }
}

/** The country options, keeping one a customer already has. */
export function countryOptions(
    current: string,
): { value: string; label: string }[] {
    const codes: string[] = [...COUNTRIES];
    if (current && !codes.includes(current)) codes.push(current);
    return codes.map((value) => ({ value, label: countryName(value) }));
}

function stateCodeOf(name: string | null | undefined): string {
    if (!name) return "";
    const t = name.trim().toLowerCase();
    return (
        GST_STATES.find(
            (s) => s.label.toLowerCase() === t || s.value === name.trim(),
        )?.value ?? ""
    );
}

/** The draft the sheet opens with. A new address starts in India. */
export function draftFrom(c: CustomerDetail["contact"]): DetailsDraft {
    const country = c.country ?? "IN";
    return {
        firstName: c.firstName ?? "",
        lastName: c.lastName ?? "",
        email: c.email,
        phone: c.phone ?? "",
        company: c.company ?? "",
        addressLine1: c.addressLine1 ?? "",
        addressLine2: c.addressLine2 ?? "",
        city: c.city ?? "",
        state: country === "IN" ? stateCodeOf(c.state) : (c.state ?? ""),
        postalCode: c.postalCode ?? "",
        country,
    };
}

const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** What the sheet refuses before saving, by field. */
export function detailsProblems(
    d: DetailsDraft,
): Partial<Record<DetailsKey, string>> {
    const out: Partial<Record<DetailsKey, string>> = {};
    if (!d.firstName.trim() && !d.lastName.trim()) {
        out.firstName = "A customer needs a name.";
    }
    if (!EMAIL_SHAPE.test(d.email.trim())) {
        out.email = "That doesn't look like an email address.";
    }
    const pin = d.postalCode.replace(/\s+/g, "");
    if (d.country === "IN" && pin && !PIN_SHAPE.test(pin)) {
        out.postalCode = "A PIN code is six digits, like 560038.";
    }
    return out;
}

/**
 * What Save sends: each changed field, trimmed. The address travels whole
 * when any line of it changed, so the API checks it as one.
 */
export function detailsPatch(
    initial: DetailsDraft,
    draft: DetailsDraft,
): Partial<DetailsDraft> {
    const out: Partial<DetailsDraft> = {};
    const value = (k: DetailsKey) =>
        k === "email" ? draft[k].trim().toLowerCase() : draft[k].trim();
    for (const k of ["firstName", "lastName", "phone", "company"] as const) {
        if (value(k) !== initial[k]) out[k] = value(k);
    }
    if (value("email") !== initial.email.trim().toLowerCase()) {
        out.email = value("email");
    }
    if (ADDRESS_KEYS.some((k) => value(k) !== initial[k])) {
        for (const k of ADDRESS_KEYS) out[k] = value(k);
    }
    return out;
}

/** "ananya@gmail.com" → "a•••@gmail.com". */
export function maskedEmail(email: string): string {
    const at = email.lastIndexOf("@");
    if (at < 1) return "•••";
    return `${email[0]}•••@${email.slice(at + 1)}`;
}

/**
 * Under the email when they sign in on the website: staff change the
 * contact's email only, never how they sign in (ADR-011, DEC-049).
 */
export function signInNote(accountEmail: string): string {
    return `They sign in with ${maskedEmail(accountEmail)}; messages about their orders go there.`;
}

/**
 * Their address as one line — "12 Hill Road, Indiranagar, Bengaluru
 * 560038, Karnataka" — or null when none is kept. The country is named
 * only outside India.
 */
export function addressLine(
    c: Pick<CustomerDetail["contact"], AddressKey>,
): string | null {
    if (!c.addressLine1?.trim() && !c.city?.trim()) return null;
    const country =
        c.country && c.country !== "IN" ? countryName(c.country) : "";
    return [
        c.addressLine1,
        c.addressLine2,
        [c.city, c.postalCode].filter((x) => x?.trim()).join(" "),
        c.state,
        country,
    ]
        .map((x) => x?.trim() ?? "")
        .filter((x) => x !== "")
        .join(", ");
}
