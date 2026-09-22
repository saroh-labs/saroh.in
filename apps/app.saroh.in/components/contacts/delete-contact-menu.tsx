"use client";

import { DeleteMenu } from "@/components/shared/delete-menu";
import { deleteContact } from "@/lib/contacts/actions";

const leadsWord = (n: number) => (n === 1 ? "lead" : `${n} leads`);

/**
 * Delete a person from the contacts. Their leads go with them, so the
 * question says how many; what they did stays on record.
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
            description={`${leads}Bookings, form entries and messages stay on record under the name they gave, and a shop customer with the same email is kept. This cannot be undone.`}
            onDelete={() => deleteContact(contactId)}
            done={(data) =>
                data.leads > 0
                    ? `${name} deleted, with their ${leadsWord(data.leads)}`
                    : `${name} deleted`
            }
            then="/contacts"
        />
    );
}
