import { listContacts } from "@/lib/contacts/service";

/**
 * Who an invoice can be for: the business's contacts, named for a picker.
 *
 * Contacts belong to CRM, which may be off or not readable by this person;
 * `listContacts` then answers with none and the form says so, rather than
 * the page failing (the same fallback the booking dialog uses).
 */
export async function contactPickerOptions(): Promise<
    { id: string; name: string; email: string }[]
> {
    const contacts = await listContacts().catch(() => []);
    return contacts.map((c) => ({
        id: c.id,
        name:
            [c.firstName, c.lastName].filter(Boolean).join(" ").trim() ||
            c.email,
        email: c.email,
    }));
}
