"use client";

import { DeleteMenu } from "@/components/shared/delete-menu";
import { deleteContact } from "@/lib/contacts/actions";
import { deletedLine } from "@/lib/contacts/removal";

const leadsWord = (n: number) => (n === 1 ? "lead" : `${n} leads`);

/**
 * Delete a person from the contacts. Their leads go with them, so the
 * question says how many; their subscriptions and class packs go too, and
 * the toast says what went. What they did stays on record.
 */
export function DeleteContactMenu({
    contactId,
    name,
    leadCount,
}: {
    contactId: string;
    name: string;
    leadCount: number;
}) {
    const leads =
        leadCount > 0
            ? `Their ${leadsWord(leadCount)} go${leadCount === 1 ? "es" : ""} too, with notes and follow-ups. `
            : "";
    return (
        <DeleteMenu
            name={name}
            verb="Delete contact"
            title={`Delete ${name}?`}
            description={`${leads}Any subscription or class pack they hold ends, and future bookings paid with a pack are cancelled. Other bookings, invoices, form entries and messages stay on record under the name they gave, and a shop customer with the same email is kept. This cannot be undone.`}
            onDelete={() => deleteContact(contactId)}
            done={(data) => deletedLine(name, data)}
            then="/contacts"
        />
    );
}
