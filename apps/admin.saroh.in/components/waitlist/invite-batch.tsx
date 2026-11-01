"use client";

import { Button } from "@saroh/ui/button";

import { BulkAction } from "../operations/bulk-action";

/**
 * Send the opening-day invite to everyone waiting on this page (marketing
 * U31). A dry run first says who would get one and who is skipped (already
 * invited, joined, being invited now, or a free tool's email gate); sending
 * runs as an operation, one invite per person, so running it twice invites
 * nobody twice. Anyone whose email does not leave stays on the waitlist.
 *
 * While invites can't go, the button stays where it is, disabled, with the
 * reason under it (admin audit F6).
 */
export function InviteBatch({
    ids,
    blocked = null,
}: {
    ids: string[];
    /** Why invites can't go now; null when they can. */
    blocked?: string | null;
}) {
    const trigger = `Invite ${ids.length} on this page`;
    if (blocked) {
        return (
            <div className="grid justify-items-start gap-1 sm:justify-items-end">
                <Button type="button" size="sm" disabled>
                    {trigger}
                </Button>
                <p className="max-w-[44ch] text-xs text-muted-foreground sm:text-right">
                    {blocked}
                </p>
            </div>
        );
    }
    return (
        <BulkAction
            kind="waitlist.invite"
            ids={ids}
            trigger={trigger}
            triggerVariant="default"
            noun={{ one: "person", other: "people" }}
        />
    );
}
