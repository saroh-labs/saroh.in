"use client";

import { closeAccessAction } from "@/lib/business-actions";
import { sessionTime, sessionUntil } from "@/lib/business-words";

import { OperatorDialog } from "../operator-dialog";

/**
 * End the support session now, rather than letting it lapse, with when it
 * would lapse beside it: "Open until 14:30" (admin plan U6, R16).
 */
export function CloseAccess({
    organizationId,
    until = null,
}: {
    organizationId: string;
    /** When the session lapses; null when unknown. */
    until?: string | null;
}) {
    const open = sessionUntil(until);
    const time = sessionTime(until);
    return (
        <div className="inline-flex flex-wrap items-center gap-2">
            {open && (
                <span
                    className="text-[13px] text-muted-foreground"
                    data-session-until
                >
                    {open}
                </span>
            )}
            <OperatorDialog
                trigger="Close support access"
                triggerVariant="ghost"
                title="Close support access"
                effect={
                    time
                        ? `It would close by itself at ${time}. Closing it now, you stop seeing this business's own details, and opening it again needs a new reason.`
                        : "You stop seeing this business's own details. Opening it again needs a new reason."
                }
                submitLabel="Close access"
                onSubmit={({ reason, idempotencyKey }) =>
                    closeAccessAction(organizationId, {
                        reason,
                        idempotencyKey,
                    })
                }
            />
        </div>
    );
}
