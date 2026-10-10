import { isRemovedContact, shownEmail } from "@/lib/crm/format";

import type { CustomerPick } from "./picker";

/**
 * Arriving at New order or New booking with the customer already chosen
 * (#247): the person page links to `?new=1&contactId=<id>`, and the page it
 * lands on reads that person and hands the flow a picked customer, so the
 * merchant never searches for them again. Pure, so the rules are tested;
 * the read is `prefill-read.ts`.
 */

type Params = Record<string, string | string[] | undefined>;

/** The first value of a query parameter, trimmed; null when absent or blank. */
function one(params: Params, key: string): string | null {
    const raw = params[key];
    const value = (Array.isArray(raw) ? raw[0] : raw)?.trim() ?? "";
    return value.length > 0 ? value : null;
}

/**
 * The person a flow opens for: `contactId` alongside `new=1`, and only
 * then — a `contactId` on its own opens nothing.
 */
export function arrivalContactId(params: Params): string | null {
    return one(params, "new") === "1" ? one(params, "contactId") : null;
}

/** What the person read must hold to become a pick. */
export interface PrefillSource {
    contact: {
        id: string;
        name: string;
        email: string;
        phone: string | null;
        removedAt?: string | null;
    };
    siteAccount?: { email: string } | null;
}

/**
 * The picker's answer for someone the business already knows. Null — the
 * picker then starts empty, as it always did — for a record whose details
 * were removed for a privacy request (C11), which no order or booking may
 * be made for. Never a site account's placeholder email (DEC-049).
 */
export function pickFromPerson(
    person: PrefillSource,
): Extract<CustomerPick, { kind: "contact" }> | null {
    const { contact } = person;
    if (isRemovedContact(contact)) return null;
    const name = contact.name.trim();
    const phone = contact.phone?.trim();
    return {
        kind: "contact",
        id: contact.id,
        name: name.length > 0 ? name : null,
        email: shownEmail({
            email: contact.email,
            accountEmail: person.siteAccount?.email ?? null,
        }),
        phone: phone?.length ? phone : null,
    };
}

/**
 * Whether the picker still holds who the flow opened with: no one, or the
 * same person. A flow that is otherwise untouched has nothing to lose, so
 * closing it asks nothing.
 */
export function isOpeningPick(
    pick: CustomerPick | null,
    opening: CustomerPick | null,
): boolean {
    if (!pick || !opening) return pick === opening;
    return (
        pick.kind === "contact" &&
        opening.kind === "contact" &&
        pick.id === opening.id
    );
}

/** The address without the arrival's `new` and `contactId`, kept otherwise. */
export function withoutArrival(pathname: string, search: string): string {
    const q = new URLSearchParams(search);
    q.delete("new");
    q.delete("contactId");
    const rest = q.toString();
    return rest ? `${pathname}?${rest}` : pathname;
}
