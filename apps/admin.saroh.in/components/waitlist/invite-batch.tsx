"use client";

import { BulkAction } from "../operations/bulk-action";

/**
 * Send the opening-day invite to everyone waiting on this page (marketing
 * U31). A dry run first says who would get one and who is skipped (already
 * invited, joined, or being invited now); sending runs as an operation, one
 * invite per person, so running it twice invites nobody twice. Anyone whose
 * email does not leave stays on the waitlist.
 */
export function InviteBatch({ ids }: { ids: string[] }) {
    return (
        <BulkAction
            kind="waitlist.invite"
            ids={ids}
            trigger={`Invite ${ids.length} on this page`}
            triggerVariant="default"
            noun={{ one: "person", other: "people" }}
        />
    );
}
