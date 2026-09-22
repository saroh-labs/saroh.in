"use client";

import { DeleteMenu } from "@/components/shared/delete-menu";
import { deleteLead } from "@/lib/leads/actions";

/** Delete a lead from its page: its timeline goes, the person stays. */
export function DeleteLeadMenu({
    leadId,
    title,
    contactName,
}: {
    leadId: string;
    title: string;
    /** Who it was with, when known — they stay in the contacts. */
    contactName: string | null;
}) {
    return (
        <DeleteMenu
            name={title}
            verb="Delete lead"
            title={`Delete “${title}”?`}
            description={`Its notes and follow-ups go with it. ${contactName ? `${contactName} stays in your contacts` : "The person stays in your contacts"}, and any form entry it came from stays on record. This cannot be undone.`}
            onDelete={() => deleteLead(leadId)}
            done={() => `“${title}” deleted`}
            then="/leads"
        />
    );
}
