"use client";

import { closeAccessAction } from "@/lib/business-actions";

import { OperatorDialog } from "../operator-dialog";

/** End the support session now, rather than letting it lapse. */
export function CloseAccess({ organizationId }: { organizationId: string }) {
    return (
        <OperatorDialog
            trigger="Close support access"
            triggerVariant="ghost"
            title="Close support access"
            effect="You stop seeing this business's details. Opening it again needs a new reason."
            submitLabel="Close access"
            onSubmit={({ reason, idempotencyKey }) =>
                closeAccessAction(organizationId, { reason, idempotencyKey })
            }
        />
    );
}
