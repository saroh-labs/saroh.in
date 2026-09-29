import { BadRequestException } from "@nestjs/common";

import { stateCode, stateName } from "../invoices/gst-states";

/**
 * A customer's postal address on their contact (C8, R10): line 1, line 2,
 * city, state, PIN and country. Staff keep it on Customer Detail's edit
 * sheet. It is never copied into orders already placed.
 *
 * In India the state is one of the GST states (`invoices/gst-states.ts`),
 * stored by its name, and the PIN is six digits not starting with 0
 * (DEC-029's rule for the registered address). Elsewhere both are text.
 */
export const ADDRESS_FIELDS = [
    "addressLine1",
    "addressLine2",
    "city",
    "state",
    "postalCode",
    "country",
] as const;

export type AddressField = (typeof ADDRESS_FIELDS)[number];

export type ContactAddress = Record<AddressField, string | null>;

/** What a PATCH sent: an absent field is left alone, "" clears it. */
export type AddressPatch = Partial<Record<AddressField, string>>;

/** An Indian PIN code: six digits, never starting with 0. */
const PIN_SHAPE = /^[1-9][0-9]{5}$/;

function refuse(message: string, field: AddressField): never {
    throw new BadRequestException({ message, details: { field } });
}

/** True when the patch names any address field. */
export function touchesAddress(patch: AddressPatch): boolean {
    return ADDRESS_FIELDS.some((f) => patch[f] !== undefined);
}

/** True when nothing but (at most) a country is held. */
export function isEmptyAddress(a: ContactAddress): boolean {
    return ADDRESS_FIELDS.every((f) => f === "country" || !a[f]?.trim());
}

/**
 * The address to store after `patch` lands on `current`, checked as a
 * whole: the patch is read against what is already there, so changing only
 * the country to India re-checks the PIN already held.
 *
 * - A blank field is stored as nothing.
 * - A country alone is no address: it is cleared with the rest.
 * - India: the state must be a GST state (a code or a name, stored as the
 *   name) and the PIN six digits ("560 038" is read as 560038).
 *
 * Throws a 400 naming the field it is about.
 */
export function nextAddress(
    current: ContactAddress,
    patch: AddressPatch,
): ContactAddress {
    const next = { ...current };
    for (const field of ADDRESS_FIELDS) {
        const value = patch[field];
        if (value === undefined) continue;
        const t = value.trim();
        next[field] = t === "" ? null : t;
    }

    if (next.country) {
        const country = next.country.toUpperCase();
        if (!/^[A-Z]{2}$/.test(country)) {
            refuse("Pick a country from the list.", "country");
        }
        next.country = country;
    }
    if (isEmptyAddress(next)) {
        return Object.fromEntries(
            ADDRESS_FIELDS.map((f) => [f, null]),
        ) as ContactAddress;
    }

    if (next.country === "IN") {
        if (next.state) {
            const code = stateCode(next.state);
            if (!code) refuse("Pick a state from the list.", "state");
            next.state = stateName(code);
        }
        if (next.postalCode) {
            const pin = next.postalCode.replace(/\s+/g, "");
            if (!PIN_SHAPE.test(pin)) {
                refuse("A PIN code is six digits, like 560038.", "postalCode");
            }
            next.postalCode = pin;
        }
    }
    return next;
}

/** The fields whose stored value changes. */
export function changedAddressFields(
    before: ContactAddress,
    after: ContactAddress,
): AddressField[] {
    return ADDRESS_FIELDS.filter((f) => (before[f] ?? null) !== after[f]);
}
