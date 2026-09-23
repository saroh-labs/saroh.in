"use client";

import { useState } from "react";

import { inviteWaitlistAction } from "@/lib/waitlist-actions";

import { OperatorDialog } from "../operator-dialog";

/**
 * Invite everyone waiting on this page. Each gets an email with a link to
 * create their account; anyone already invited is skipped, and anyone whose
 * email does not leave stays on the waitlist.
 */
export function InviteBatch({ ids }: { ids: string[] }) {
    const [outcome, setOutcome] = useState<string | null>(null);
    return (
        <div className="flex flex-wrap items-center gap-3">
            <OperatorDialog
                trigger={`Invite ${ids.length} on this page`}
                triggerVariant="default"
                title={`Invite ${ids.length} ${ids.length === 1 ? "person" : "people"}`}
                effect="Each gets an email with a link to create their account, and is marked invited once it has left. Anyone already invited is skipped."
                submitLabel="Send invitations"
                disabled={ids.length === 0}
                onSubmit={async ({ reason, idempotencyKey }) => {
                    const result = await inviteWaitlistAction({
                        ids,
                        reason,
                        idempotencyKey,
                    });
                    if (result.ok) {
                        const { sent, alreadyInvited, failed } = result.data;
                        setOutcome(
                            `${sent} sent${alreadyInvited ? `, ${alreadyInvited} already invited` : ""}${failed ? `, ${failed} could not be sent and are still waiting` : ""}.`,
                        );
                    }
                    return result;
                }}
            />
            {outcome && (
                <p role="status" className="text-sm text-muted-foreground">
                    {outcome}
                </p>
            )}
        </div>
    );
}
