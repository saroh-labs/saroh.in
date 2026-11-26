import type { ContactOption } from "@/components/shared/fields/contact-picker";
import { PICKER_RECENT } from "@/lib/contacts/queries";
import { readCustomerPick } from "@/lib/customers/prefill-read";
import { searchCustomers } from "@/lib/customers/search";

/**
 * Who an invoice, a subscription, a course place, a pack or a lead can be
 * for: the most recent contacts, or those `query` finds by name, email or
 * phone, through the API's contact search (never the whole list). The
 * picker searches again as someone types (`contactSearchRead`).
 *
 * A person who may not read contacts gets none and the form says so,
 * rather than the page failing (the same fallback the booking dialog uses).
 */
export async function contactPickerOptions(
    query = "",
): Promise<ContactOption[]> {
    const found = await searchCustomers(query, PICKER_RECENT);
    return found.ok ? found.results.map(optionOf) : [];
}

/** One contact as a picker names them, or null: for a form already holding them. */
export async function contactPickerOption(
    contactId: string,
): Promise<ContactOption | null> {
    const pick = await readCustomerPick(contactId);
    return pick?.kind === "contact" ? optionOf(pick) : null;
}

function optionOf(c: {
    id: string;
    name: string | null;
    email: string | null;
    phone: string | null;
}): ContactOption {
    return {
        id: c.id,
        name: c.name ?? c.email ?? c.phone ?? "",
        email: c.email ?? "",
    };
}
