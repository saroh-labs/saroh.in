"use client";

import { DeleteMenu } from "@/components/shared/confirm/delete-menu";
import { deleteLead } from "@/lib/leads/actions";
import { useLeadsSave } from "@/lib/leads/use-leads";

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
    const save = useLeadsSave();
    return (
        <DeleteMenu
            name={title}
            verb="Delete lead"
            keep="Keep lead"
            title={`Delete “${title}”?`}
            description={`Its notes and follow-ups go with it. ${contactName ? `${contactName} stays in your contacts` : "The person stays in your contacts"}, and any form entry it came from stays on record. This cannot be undone.`}
            onDelete={async () => {
                const res = await deleteLead(leadId, save.orgId);
                // Its page is being left: everything is read on next sight.
                if (res.ok) await save.left();
                return res;
            }}
            done={() => `“${title}” deleted`}
            then="/leads"
        />
    );
}
