import type { CrmResult } from "@/lib/crm/http";
import { apiFetch, mutate, orgBase } from "@/lib/crm/http";

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

/** The org's contacts (newest first). Empty on any failure. */
export async function listContacts(): Promise<Contact[]> {
    const base = await orgBase();
    if (!base) return [];
    const res = await apiFetch(`${base}/contacts`);
    if (!res.ok) return [];
    return (await res.json()) as Contact[];
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
