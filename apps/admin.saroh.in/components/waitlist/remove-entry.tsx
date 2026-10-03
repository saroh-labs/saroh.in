"use client";

import { removeFromWaitlistAction } from "@/lib/waitlist-actions";

import { OperatorDialog } from "../operator-dialog";

/**
 * Take one person off the waitlist because they asked (plan KTD-17). The
 * entry is deleted, not hidden; anyone they referred stays on the list.
 */
export function RemoveEntry({ id, label }: { id: string; label: string }) {
    return (
        <OperatorDialog
            trigger="Remove"
            triggerVariant="ghost"
            title={`Remove ${label}`}
            effect="Their entry is deleted from the waitlist at once and cannot be brought back. Anyone who joined through their link stays on the list."
            submitLabel="Remove from waitlist"
            destructive
            onSubmit={({ reason, idempotencyKey }) =>
                removeFromWaitlistAction({ id, reason, idempotencyKey })
            }
        />
    );
}
