"use client";

import { DeleteMenu } from "@/components/shared/delete-menu";
import { deleteContact } from "@/lib/contacts/actions";
import type { Holdings } from "@/lib/contacts/removal";
import { deletedLine, holdingsSentence } from "@/lib/contacts/removal";

const leadsWord = (n: number) => (n === 1 ? "lead" : `${n} leads`);

/**
 * Delete a person from the contacts. Their leads go with them, so the
 * question says how many; their subscriptions, class packs and course seats
 * go too — counted when the contact page read them all, said in general
 * otherwise — and the toast says what went. What they did stays on record.
 */
export function DeleteContactMenu({
    contactId,
    name,
    leadCount,
    holdings = {},
}: {
    contactId: string;
    name: string;
    leadCount: number;
    /** What the contact page's panels counted; a missing count stays general. */
    holdings?: Holdings;
}) {
    const leads =
        leadCount > 0
            ? `Their ${leadsWord(leadCount)} go${leadCount === 1 ? "es" : ""} too, with notes and follow-ups. `
            : "";
    const held = holdingsSentence(holdings);
    return (
        <DeleteMenu
            name={name}
            verb="Delete contact"
            title={`Delete ${name}?`}
            description={`${leads}${held}${held ? "Other bookings" : "Bookings"}, invoices, form entries and messages stay on record under the name they gave, and a shop customer with the same email is kept. This cannot be undone.`}
            onDelete={() => deleteContact(contactId)}
            done={(data) => deletedLine(name, data)}
            then="/contacts"
        />
    );
}
