import type { CrmResult } from "@/lib/api/http";
import { apiFetch, destroy, mutate, orgBase } from "@/lib/api/http";

/**
 * CRM Contacts data access for app.saroh.in (S3-005). Org-scoped reads +
 * light edits, reached only through api.saroh.in (the app never touches the
 * DB). Server-only: the underlying HTTP plumbing imports next/headers.
 */

export interface Contact {
    id: string;
    email: string;
    firstName: string | null;
    lastName: string | null;
    phone: string | null;
    company: string | null;
    source: string | null;
    createdAt: string;
    updatedAt: string;
}

/**
 * A contact as the list screen receives it: the record plus the rollup that
 * decides whether it is worth calling today.
 *
 * `lastOrder*` is a READ-TIME reconciliation on the API — explicit identity
 * links (#120) plus a same-organization email match, computed per request and
 * never written back. It can under-report (someone who ordered under a
 * different address shows nothing) but never mis-attributes. See
 * `ContactsService` in api.saroh.in for why that distinction is what makes it
 * shippable while SEC-005 / ARCH-001 are open.
 */
export interface ContactListItem extends Contact {
    /** Sum of OPEN lead values in MINOR units; null when none, or none valued. */
    openLeadValue: number | null;
    openLeadCount: number;
    /** ISO start of the next confirmed booking, or null. */
    nextBookingAt: string | null;
    /** ISO instant of the most recent order, or null. */
    lastOrderAt: string | null;
    /** That order's total in MAJOR units as a decimal string, and its currency. */
    lastOrderTotal: string | null;
    lastOrderCurrency: string | null;
}

/** A lead as embedded in a contact's detail (its current stage + pipeline). */
export interface ContactLead {
    id: string;
    title: string;
    status: string;
    value: number | null;
    createdAt: string;
    stage: { id: string; name: string } | null;
    pipeline: { id: string; name: string } | null;
}

export interface ContactDetail extends Contact {
    leads: ContactLead[];
}

export interface UpdateContactInput {
    firstName?: string;
    lastName?: string;
    phone?: string;
    company?: string;
}

/** The org's contacts (newest first) with their rollup. Empty on any failure. */
export async function listContacts(): Promise<ContactListItem[]> {
    const base = await orgBase();
    if (!base) return [];
    const res = await apiFetch(`${base}/contacts`);
    if (!res.ok) return [];
    return (await res.json()) as ContactListItem[];
}

/** A contact + its leads, or null when missing / not permitted. */
export async function getContact(
    contactId: string,
): Promise<ContactDetail | null> {
    const base = await orgBase();
    if (!base) return null;
    const res = await apiFetch(`${base}/contacts/${contactId}`);
    if (!res.ok) return null;
    return (await res.json()) as ContactDetail;
}

/** Patch a contact's descriptive fields. */
export function updateContact(
    contactId: string,
    input: UpdateContactInput,
): Promise<CrmResult<Contact>> {
    return mutate<Contact>(
        `/contacts/${contactId}`,
        "PATCH",
        input,
        "Could not update the contact",
    );
}

export interface CreateContactInput {
    email: string;
    firstName?: string;
    lastName?: string;
    phone?: string;
    company?: string;
}

/** Add someone by hand. A 409 means that email is already a contact. */
export function createContact(
    input: CreateContactInput,
): Promise<CrmResult<Contact>> {
    return mutate<Contact>(
        "/contacts",
        "POST",
        input,
        "Could not add the contact",
    );
}

/** What deleting a contact took with it (the API's `ContactRemoval`). */
export interface ContactRemoval {
    id: string;
    deleted: true;
    leads: number;
    subscriptions: number;
    packs: number;
    courses: number;
    bookingsCancelled: number;
}

/**
 * Delete a person from the contacts for good. Their leads, subscriptions and
 * class packs go with them, and future bookings paid with those packs are
 * cancelled; the result says how many of each, so the toast can.
 */
export function deleteContact(
    contactId: string,
): Promise<CrmResult<ContactRemoval>> {
    return destroy(`/contacts/${contactId}`, "Could not delete the contact");
}
